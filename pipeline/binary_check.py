"""Binary and variable-star checks for candidates by position, one CDS XMatch query per catalog:
Gaia DR3 RUWE of the target; Gaia DR3 eclipsing binaries (Mowlavi et al. 2023) and non-single-star
orbits (SB1, SB2, eclipsing, astrometric); the TESS eclipsing-binary catalog (Prsa et al. 2022);
APOGEE binaries (Kounkel et al. 2021); and VSX. A binary at the target's position, or an eclipsing
binary within 60" whose period matches the candidate's (ratios 1/3-3), explains the signal.

TIC positions are epoch J2000 and Gaia DR3 positions (including its eclipsing-binary and non-single-star
tables) are epoch 2016.0, so the TIC position is moved to 2016.0 with the TIC proper motion before the
Gaia matches. Without that, a star moving faster than about 190 mas/yr drifts beyond AT_TARGET and has
no Gaia match (RUWE NaN, Gaia binary flags blind). The other catalogues are matched at the TIC position:
their epochs are not uniformly known (VSX and the TESS EB catalog mix sources; the APOGEE table gives none).

Usage: python binary_check.py CANDIDATES.csv OUT.csv     (columns TIC and P_d; ra/dec looked up
                                                           in the TIC when missing)
"""
import sys
import time

import astropy.units as u
import numpy as np
import pandas as pd
from astropy.table import Table

# name: (XMatch table, radius in arcsec, period column or None, frequency column or None)
CATS = {"gaia": ("vizier:I/355/gaiadr3", 5, None, None),
        "gaia_eb": ("vizier:I/358/veb", 60, None, "Freq"),
        "tess_eb": ("vizier:J/ApJS/258/16/tess-ebs", 60, "Per", None),
        "vsx": ("vizier:B/vsx/vsx", 60, "Period", None),
        "apogee_binary": ("vizier:J/AJ/162/184/table1", 3, None, None),
        "gaia_sb1": ("vizier:I/357/tboasb1c", 3, "Per", None),
        "gaia_sb2": ("vizier:I/357/tbosb2", 3, "Per", None),
        "gaia_eb_orbit": ("vizier:I/357/tboeb", 3, "Per", None),
        "gaia_orbit": ("vizier:I/357/tbooc", 3, "Per", None)}
GAIA_CATS = {"gaia", "gaia_eb", "gaia_sb1", "gaia_sb2", "gaia_eb_orbit", "gaia_orbit"}   # Gaia DR3, epoch 2016.0
TIC_EPOCH, GAIA_EPOCH = 2000.0, 2016.0
AT_TARGET = 3.0          # arcsec: the same star
RATIOS = (1 / 3, 1 / 2, 2 / 3, 1, 3 / 2, 2, 3)


def positions(tics):
    from astroquery.mast import Catalogs

    rows = []
    for i in range(0, len(tics), 100):
        t = Catalogs.query_criteria(catalog="TIC", ID=[int(x) for x in tics[i:i + 100]])
        rows += [(int(r["ID"]), float(r["ra"]), float(r["dec"]), float(r["Tmag"]),
                  float(r["pmRA"]), float(r["pmDEC"])) for r in t]       # pmRA is mu_alpha*cos(dec); masked -> NaN
    return pd.DataFrame(rows, columns=["TIC", "ra", "dec", "Tmag", "pmRA", "pmDEC"])


def propagate(ra, dec, pmra, pmdec, dt_yr):
    """Move positions (deg) by proper motion (mas/yr; pmra already includes cos(dec)) over dt_yr years.
    A NaN proper motion leaves the position unchanged."""
    ra, dec = np.asarray(ra, float), np.asarray(dec, float)
    pmra = np.nan_to_num(np.asarray(pmra, float))
    pmdec = np.nan_to_num(np.asarray(pmdec, float))
    dec_new = dec + pmdec * dt_yr / 3.6e6
    ra_new = (ra + pmra * dt_yr / 3.6e6 / np.cos(np.radians(dec))) % 360.0
    return ra_new, dec_new


def period_match(p, q, tol=0.005):
    return np.isfinite(q) and q > 0 and any(abs(q / (p * r) - 1) < tol for r in RATIOS)


def main():
    from astroquery.xmatch import XMatch

    c = pd.read_csv(sys.argv[1])
    if not {"ra", "dec", "pmRA", "pmDEC"} <= set(c.columns):
        c = c.drop(columns=[k for k in ("ra", "dec", "pmRA", "pmDEC", "Tmag") if k in c.columns])
        c = c.merge(positions(list(c["TIC"].unique())), on="TIC", how="left")
    d = c[["TIC", "ra", "dec", "pmRA", "pmDEC"]].drop_duplicates("TIC").reset_index(drop=True)
    d["ra16"], d["dec16"] = propagate(d["ra"], d["dec"], d["pmRA"], d["pmDEC"], GAIA_EPOCH - TIC_EPOCH)
    tab = {False: Table.from_pandas(d[["TIC", "ra", "dec"]]),                    # J2000, as in the TIC
           True: Table.from_pandas(d[["TIC", "ra16", "dec16"]].rename(columns={"ra16": "ra", "dec16": "dec"}))}
    hits = {}
    for name, (cat, rad, pcol, fcol) in CATS.items():
        for attempt in range(4):
            try:
                r = XMatch.query(cat1=tab[name in GAIA_CATS], cat2=cat, max_distance=rad * u.arcsec, colRA1="ra", colDec1="dec").to_pandas()
                break
            except Exception as ex:          # the CDS server sometimes drops long requests
                print(f"{name}: retry after {ex!r:.80}", flush=True)
                time.sleep(20 * (attempt + 1))
        else:
            raise RuntimeError(f"XMatch failed for {name}")
        if fcol and fcol in r:
            r["P"] = 1 / r[fcol]
        elif pcol and pcol in r:
            r["P"] = r[pcol]
        hits[name] = r
        print(f"{name}: {len(r)} matches", flush=True)
    rows = []
    for x in c.itertuples():
        out = dict(TIC=x.TIC, P_d=x.P_d)
        g = hits["gaia"][hits["gaia"]["TIC"] == x.TIC]
        tgt = g[g["angDist"] < AT_TARGET].sort_values("Gmag").head(1)
        out["ruwe"] = float(tgt["RUWE"].iloc[0]) if len(tgt) and "RUWE" in tgt else np.nan
        at, near = [], []
        for name in CATS:
            if name == "gaia":
                continue
            h = hits[name][hits[name]["TIC"] == x.TIC]
            for y in h.itertuples():
                sep = float(y.angDist)
                P = float(getattr(y, "P", np.nan))
                kind = name + (f":{y.Type}" if name == "vsx" else "")
                if name == "vsx" and not str(y.Type).startswith(("E", "ELL")):
                    continue                                  # only eclipsing/ellipsoidal variables
                if sep < AT_TARGET:
                    at.append(f"{kind}" + (f" P={P:.4f}" if np.isfinite(P) else ""))
                elif period_match(x.P_d, P):
                    near.append(f"{kind} {sep:.0f}\" P={P:.4f}")
        out["binary_at_target"] = ";".join(at)
        out["eb_nearby_same_period"] = ";".join(near)
        out["binary_flag"] = bool(at or near)
        rows.append(out)
    o = pd.DataFrame(rows)
    o.to_csv(sys.argv[2], index=False)
    print(f"{len(o)} candidates: {int(o.binary_flag.sum())} flagged; RUWE > 1.4: {int((o.ruwe > 1.4).sum())}")
    print(o[o.binary_flag | (o.ruwe > 1.4)].to_string(index=False))


if __name__ == "__main__":
    main()
