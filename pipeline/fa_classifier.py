"""False-alarm classifier: separates signals of the real search (astrophysical signals mixed with false
alarms) from signals found in inverted light curves (false alarms only), using search, vetting, LEO-Vetter
and stellar features. Inverted signals are weighted by the ratio of stars searched, so the weighted classes
estimate the expected counts in the real search. Scores are out of fold (repeated 5-fold cross-validation).

By default, folds are grouped by TIC and all rows belonging to second-sample TICs are held out
from training. --split signal reproduces the released row-split analysis; that legacy holdout is not
strictly independent at star level. Retention is reported both pooled over pixel classes and conditioned
on clean pixels, with conditional Wilson intervals.

Usage: python fa_classifier.py TABLE.csv.gz --stars-real N --stars-inv N1 N2 [--split star|signal] [--out scored.csv.gz]
TABLE is validation/false_alarm_classifier_table.csv.gz (one row per signal passing LEO-Vetter and the cuts;
label real/inverted, inv_set 1 or 2 for inverted signals, band hi (SNR >= 9) or low (7.5-9), pixel-check
class cls).
"""
import argparse
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

FEATURES = ["bls_snr", "MES", "sde", "coarse_frac", "log_period", "log_depth", "dur_ratio", "n_good_events",
            "max_ses_frac", "frac_neg_events", "odd_even_sigma", "sec_sig", "chi2_sec", "n_sectors", "span", "noise_ppm",
            "rho", "snr_split", "CHI", "DMM", "Fred", "SHP", "maxses_mes", "mean_chases", "newmes_frac", "q", "sig_pri",
            "sig_sec", "sig_ter", "sine_sig", "transit_b", "transit_aRs", "transit_RpRs", "Tmag", "contratio", "rad", "Teff"]
# Not used: centroid_z and sig_pos, whose values could differ between real and inverted light curves for reasons
# other than the signal being noise (the flux-weighted centroids are not inverted; real dips become positive events).


def features(t):
    t = t.copy()
    t["log_period"] = np.log10(t["period"])
    t["log_depth"] = np.log10(t["depth_ppm"].clip(lower=1))
    t["dur_ratio"] = t["duration_h"] / t["exp_duration_h"]
    t["sec_sig"] = t["secondary"] / t["secondary_err"]
    t["coarse_frac"] = t["coarse_snr"] / t["bls_snr"]
    t["maxses_mes"] = t["max_SES"] / t["MES"]
    t["newmes_frac"] = t["new_MES"] / t["MES"]
    t["snr_split"] = (t["snr_new"] - t["snr_old"]) / (t["snr_new"].abs() + t["snr_old"].abs() + 1)
    return t


def holdout_masks(t, split="star"):
    """Reserve every signal on an inv_set 2 star in star mode."""
    if split not in ("star", "signal"):
        raise ValueError("split must be star or signal")
    inv1 = (t["label"] == "inverted") & (t["inv_set"] == 1)
    inv2 = (t["label"] == "inverted") & (t["inv_set"] == 2)
    train = (t["label"] == "real") | inv1
    extra = inv2.copy()
    if split == "star":
        if t["tic"].isna().any():
            raise ValueError("star splitting requires a TIC for every row")
        extra = t["tic"].isin(t.loc[inv2, "tic"])
        train &= ~extra
    if (train & extra).any() or not (train | extra).all():
        raise ValueError("training and holdout masks must partition all rows")
    return train, extra


def cv_folds(X, y, groups, rep, split="star"):
    """Yield folds, defending the star-level disjointness invariant."""
    if split == "star":
        if pd.isna(groups).any():
            raise ValueError("star splitting requires a TIC for every row")
        folds = StratifiedGroupKFold(5, shuffle=True, random_state=rep).split(X, y, groups)
    elif split == "signal":
        folds = StratifiedKFold(5, shuffle=True, random_state=rep).split(X, y)
    else:
        raise ValueError("split must be star or signal")
    for tr, te in folds:
        if split == "star" and set(groups[tr]) & set(groups[te]):
            raise ValueError("a TIC appears in both training and validation")
        yield tr, te


def oof_scores(t, train, weight_inv, extra=None, repeats=3, split="star"):
    """Out-of-fold training scores; extra rows are scored by every fold's model."""
    if repeats < 1:
        raise ValueError("repeats must be positive")
    if extra is not None:
        if (train & extra).any():
            raise ValueError("training and extra rows overlap")
        if split == "star" and set(t.loc[train, "tic"]) & set(t.loc[extra, "tic"]):
            raise ValueError("a held-out TIC appears in training")
    d = t[train]
    X, y = d[FEATURES].astype(float).values, (d["label"] == "real").astype(int).values
    groups = d["tic"].values
    w = np.where(y == 0, weight_inv, 1.0)
    s = np.zeros(len(d))
    e = np.zeros(int(extra.sum())) if extra is not None else None
    for rep in range(repeats):
        seen = np.zeros(len(d), dtype=int)
        for tr, te in cv_folds(X, y, groups, rep, split):
            seen[te] += 1
            m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40,
                                               l2_regularization=1.0, random_state=rep)
            m.fit(X[tr], y[tr], sample_weight=w[tr])
            s[te] += m.predict_proba(X[te])[:, 1] / repeats
            if e is not None and len(e):
                e += m.predict_proba(t.loc[extra, FEATURES].astype(float).values)[:, 1] / (5 * repeats)
        if not np.all(seen == 1):
            raise ValueError("each training row must be scored exactly once per repeat")
    out = pd.Series(np.nan, index=t.index)
    out[d.index] = s
    if e is not None:
        out[t.index[extra]] = e
    return out


def wilson_interval(k, n, z=1.959963984540054):
    """95% Wilson score interval for a binomial retention fraction (default z)."""
    if n == 0:
        return float("nan"), float("nan")
    p = k / n
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return max(0.0, center - half), min(1.0, center + half)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("table")
    ap.add_argument("--stars-real", type=int, required=True)
    ap.add_argument("--stars-inv", type=int, nargs=2, required=True)
    ap.add_argument("--out")
    ap.add_argument("--split", choices=("star", "signal"), default="star",
                    help="star: TIC-disjoint validation (default); signal: legacy released analysis")
    a = ap.parse_args()
    n1, n2 = a.stars_inv
    t = features(pd.read_csv(a.table))
    inv2 = (t["label"] == "inverted") & (t["inv_set"] == 2)
    train, extra = holdout_masks(t, a.split)
    print("Validation: " + ("TIC-grouped folds and TIC-disjoint holdout" if a.split == "star" else
                            "legacy signal folds; holdout is not independent at star level"))
    t["score_h"] = oof_scores(t, train, a.stars_real / n1, extra=extra, split=a.split)
    lo = t[t["band"] == "low"]
    real_c = lo[(lo["label"] == "real") & (lo["cls"] == "clean")]
    i2 = lo[inv2.loc[lo.index]]
    n_fa = ((lo["label"] == "inverted") & (lo["cls"] == "clean")).sum() * a.stars_real / (n1 + n2)
    print(f"SNR 7.5-9 clean signals: {len(real_c)} real, {n_fa:.0f} expected false alarms")
    clean_i2 = i2[i2["cls"] == "clean"]
    print("Retention: pooled pixel classes versus clean-conditioned sensitivity")
    print("95% Wilson binomial intervals, conditional on the baseline expected FA count; "
          "ignore baseline uncertainty, star dependence, model and cut-selection uncertainty.")
    print("cut    selected  expected false alarms  purity  pooled k/n expected FA [95% CI]  "
          "clean k/n expected FA [95% CI]")
    for cut in (0.7, 0.75, 0.8, 0.85, 0.9):
        n = int((real_c["score_h"] >= cut).sum())
        fa = n_fa * (i2["score_h"] >= cut).mean()
        details = []
        for sample in (i2, clean_i2):
            k = int((sample["score_h"] >= cut).sum())
            lower, upper = wilson_interval(k, len(sample))
            point = n_fa * k / len(sample) if len(sample) else float("nan")
            details.append(f"{k}/{len(sample)} {point:.1f} [{n_fa * lower:.1f}, {n_fa * upper:.1f}]")
        print(f"{cut:4.2f}  {n:8d}  {fa:21.1f}  {1 - fa / n if n else float('nan'):.2f}  "
              + "  ".join(details))
    t["score"] = oof_scores(t, t.index == t.index, a.stars_real / (n1 + n2), split=a.split)
    if a.out:
        t[["tic", "rank", "label", "inv_set", "band", "cls", "score", "score_h"]].to_csv(a.out, index=False)


if __name__ == "__main__":
    main()
