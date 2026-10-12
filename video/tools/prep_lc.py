"""Light curves for the film, from the repo's stored light curves (data/lc/*/tic*.npz).

Writes public/data/lc.json:
  rabtsevich: TIC 4206066, per sector detrended flux in 30-minute bins, and both signals' ephemerides
  controls:   TOI-700 and L 98-59 (and TIC 4206066), each recovered signal's folded profile
  l9859:      a 12-day stretch of L 98-59 (30-minute bins) for the flip
  inverted:   TIC 37904598's inverted light curve and the false alarm the pipeline found in it
  eb:         an eclipsing binary from the K/M-dwarf search, folded (primary and secondary eclipse)
usage: prep_lc.py
"""
import glob
import json
import pathlib

import numpy as np
from wotan import flatten

REPO = pathlib.Path(__file__).resolve().parents[2]      # the repository root, which video/ sits in
ROOT = pathlib.Path(__file__).parent.parent


def load(tic):
    path = glob.glob(str(REPO / f"data/lc/*/tic{tic}.npz"))[0]
    d = np.load(path)
    out = {}
    for s in d["sectors"]:
        t, f = d[f"s{s}_time"], d[f"s{s}_flux"].astype(float)
        ok = np.isfinite(t) & np.isfinite(f)
        out[int(s)] = (t[ok], f[ok] / np.nanmedian(f[ok]))
    return out


def detrend(t, f, window=0.75):
    flat = flatten(t, f, method="biweight", window_length=window)
    ok = np.isfinite(flat)
    t, flat = t[ok], flat[ok]
    # clip high outliers (flares, scattered light) only, so dips survive
    resid = flat - 1
    mad = 1.4826 * np.median(np.abs(resid - np.median(resid)))
    keep = resid < 5 * mad
    return t[keep], flat[keep]


def binned(t, f, width_d):
    edges = np.arange(t.min(), t.max() + width_d, width_d)
    idx = np.digitize(t, edges)
    tb, fb, nb = [], [], []
    for k in np.unique(idx):
        m = idx == k
        if m.sum() >= max(1, 0.3 * width_d / np.median(np.diff(t))):
            tb.append(t[m].mean()); fb.append(f[m].mean()); nb.append(int(m.sum()))
    return np.array(tb), np.array(fb), np.array(nb)


def fold(t, f, period, t0, half_width_d, nbins):
    ph = ((t - t0) / period + 0.5) % 1 - 0.5
    x = ph * period
    m = np.abs(x) < half_width_d
    edges = np.linspace(-half_width_d, half_width_d, nbins + 1)
    idx = np.digitize(x[m], edges) - 1
    prof = np.array([np.mean(f[m][idx == k]) if (idx == k).any() else np.nan for k in range(nbins)])
    return ((edges[:-1] + edges[1:]) / 2 * 24).round(3).tolist(), np.round((prof - 1) * 1e6, 1).tolist()


def ctrl(name):
    return json.load(open(REPO / "validation" / f"control_{name}.json"))


out = {}

# Rabtsevich's star
lc = load(4206066)
years = {6: 2018, 32: 2020, 98: 2025}
secs = []
for s, (t, f) in sorted(lc.items()):
    td, fd = detrend(t, f)
    tb, fb, _ = binned(td, fd, 0.5 / 24)
    secs.append({"sector": s, "year": years[s], "t": np.round(tb, 4).tolist(), "f": np.round((fb - 1) * 1e6, 1).tolist()})
    print(f"TIC 4206066 S{s}: {len(tb)} bins, scatter {np.std(fb) * 1e6:.0f} ppm per 30 min")
planets = []
for k in (1, 2):
    c = ctrl(f"tic4206066_{k}")
    planets.append({"P": c["period"], "t0": c["t0"], "depth_ppm": c["depth_ppm"], "dur_h": c["duration_h"],
                    "rp": c["rp_earth"], "snr": c["snr"]})
allt = np.concatenate([detrend(*lc[s])[0] for s in sorted(lc)])
allf = np.concatenate([detrend(*lc[s])[1] for s in sorted(lc)])
for p in planets:
    p["fold_x_h"], p["fold_ppm"] = fold(allt, allf, p["P"], p["t0"], 0.25, 40)
out["rabtsevich"] = {"tic": 4206066, "sectors": secs, "planets": planets}

# Controls: each recovered signal's folded profile
controls = []
for star, tic, names in [("TOI-700", 150428135, {1: "c", 2: "b"}), ("L 98-59", 307210830, {1: "c", 2: "d", 3: "b"}),
                         ("TIC 4206066", 4206066, {1: "1", 2: "2"})]:
    lc = load(tic)
    tt, ff = [], []
    for s in sorted(lc):
        a, b = detrend(*lc[s])
        tt.append(a); ff.append(b)
    tt, ff = np.concatenate(tt), np.concatenate(ff)
    sigs = []
    for k, letter in names.items():
        c = ctrl(f"tic{tic}_{k}")
        hw = max(3 * c["duration_h"] / 24, 0.12)
        x, y = fold(tt, ff, c["period"], c["t0"], hw, 48)
        sigs.append({"name": letter, "P": round(c["period"], 4), "depth_ppm": round(c["depth_ppm"]), "snr": round(c["snr"], 1),
                     "x_h": x, "ppm": y})
        print(f"{star} {letter}: P {c['period']:.4f} d, depth {c['depth_ppm']:.0f} ppm, SNR {c['snr']:.1f}")
    controls.append({"star": star, "tic": tic, "sectors": len(lc), "signals": sorted(sigs, key=lambda s: s["P"])})
out["controls"] = controls

# L 98-59, 12 days of Sector 2, for the flip
lc = load(307210830)
t, f = detrend(*lc[2], window=0.5)
m = t < t.min() + 12
tb, fb, _ = binned(t[m], f[m], 0.5 / 24)
eph = [{"name": n, "P": ctrl(f"tic307210830_{k}")["period"], "t0": ctrl(f"tic307210830_{k}")["t0"]} for k, n in [(3, "b"), (1, "c"), (2, "d")]]
out["l9859"] = {"sector": 2, "t": np.round(tb, 4).tolist(), "f": np.round((fb - 1) * 1e6, 1).tolist(), "planets": eph}
print(f"L 98-59 S2: {len(tb)} bins, scatter {np.std(fb) * 1e6:.0f} ppm")

# An inverted light curve and the false alarm found in it (passed every LEO-Vetter test)
import pandas as pd
inv = pd.read_csv(REPO / "validation/inverted_lightcurves_vetted.csv")
fa = inv[inv.tic == 37904598].iloc[0]
lc = load(37904598)
tt, ff = [], []
for s in sorted(lc):
    a, b = lc[s]
    a, b = detrend(a, 2 - b)          # inverted: dips become bumps and bumps become dips
    tt.append(a); ff.append(b)
tt, ff = np.concatenate(tt), np.concatenate(ff)
x, y = fold(tt, ff, fa.period, fa.t0, 3 * fa.duration_h / 24, 40)
n0 = np.ceil((tt.min() - fa.t0) / fa.period)
events = [fa.t0 + k * fa.period for k in np.arange(n0, n0 + 200) if ((tt > fa.t0 + k * fa.period - 0.1) & (tt < fa.t0 + k * fa.period + 0.1)).any()]
first = [s for s in sorted(lc)]
# the sector holding the first false-alarm event, in 30-minute bins
ev_sector = None
for s in sorted(lc):
    a = lc[s][0]
    if any(a.min() <= e <= a.max() for e in events):
        ev_sector = s
        break
a, b = detrend(lc[ev_sector][0], 2 - lc[ev_sector][1])
tb, fb, _ = binned(a, b, 0.5 / 24)
out["inverted"] = {"tic": 37904598, "P": fa.period, "t0": fa.t0, "MES": fa.MES, "depth_ppm": fa.depth_ppm, "dur_h": fa.duration_h,
                   "events": [round(e, 4) for e in events], "sector": int(ev_sector),
                   "t": np.round(tb, 4).tolist(), "f": np.round((fb - 1) * 1e6, 1).tolist(), "fold_x_h": x, "fold_ppm": y}
print(f"inverted TIC 37904598: P {fa.period:.3f} d, MES {fa.MES:.1f}, {len(events)} events, shown sector {ev_sector}")

# Eclipsing binaries: folded over the full phase, so both eclipses show
ebs = []
vs = pd.read_csv(REPO / "results_public/vetted_signals.csv.gz")
for tic in (382523691, 348773952):
    r = vs[vs.tic == tic].sort_values("snr", ascending=False).iloc[0]
    lc = load(tic)
    tt, ff = [], []
    for s in sorted(lc):
        a, b = lc[s]
        flat = flatten(a, b, method="biweight", window_length=3 * r.period if r.period < 1 else 1.5)
        ok = np.isfinite(flat)
        tt.append(a[ok]); ff.append(flat[ok])
    tt, ff = np.concatenate(tt), np.concatenate(ff)
    x, y = fold(tt, ff, r.period, r.t0 - 0.25 * r.period, r.period / 2, 200)    # primary at phase 0.25
    ebs.append({"tic": int(tic), "P": r.period, "depth_ppm": r.depth_ppm, "x_h": x, "ppm": y})
    print(f"EB TIC {tic}: P {r.period:.3f} d, depth {r.depth_ppm:.0f} ppm, min of fold {np.nanmin(y):.0f} ppm")
out["eb"] = ebs

json.dump(out, open(ROOT / "public" / "data" / "lc.json", "w"))
