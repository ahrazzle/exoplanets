"""TESS sector footprints (Sectors 1-104) and a periodogram of TIC 4206066.

public/data/tess.json:
  sectors: [{sector, start (ISO date), ccds: [[[lon, lat], ...outline, 4 edges x 8 points], ... 16 CCDs]}]
           outlines in ecliptic degrees, from tess-point's pointing table and pixel-to-sky model
  periodogram: semi-coherent BLS (per-sector SNR^2 summed) of TIC 4206066 over 1-13 d
usage: prep_tess.py
"""
import json
import pathlib

import numpy as np
import pandas as pd
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.timeseries import BoxLeastSquares
from tess_stars2px import tess_stars2px_reverse_function_entry

REPO = pathlib.Path(__file__).resolve().parents[2]      # the repository root, which video/ sits in
ROOT = pathlib.Path(__file__).parent.parent

sched = pd.read_csv(REPO / "data/tess_schedule/TESS_orbit_times.csv", comment="#")
starts = sched.groupby(sched.Sector.astype(int))["Start of Orbit"].min().to_dict()

edge = np.linspace(45, 2092 - 45, 8)          # science pixels run from col 45 to 2092, rows 1-2048
lo, hi = 45.0, 2092.0
outline = ([(c, 1.0) for c in edge] + [(hi, r) for r in np.linspace(1, 2048, 8)] +
           [(c, 2048.0) for c in edge[::-1]] + [(lo, r) for r in np.linspace(2048, 1, 8)])
cols = np.array([p[0] for p in outline])
rows = np.array([p[1] for p in outline])

sectors = []
for s in range(1, 105):
    ccds = []
    for cam in range(1, 5):
        for ccd in range(1, 5):
            ra, dec = [], []
            for c, r in zip(cols, rows):
                a, d, _ = tess_stars2px_reverse_function_entry(s, cam, ccd, c, r)
                ra.append(a); dec.append(d)
            e = SkyCoord(np.array(ra) * u.deg, np.array(dec) * u.deg).barycentrictrueecliptic
            ccds.append(np.round(np.stack([e.lon.deg, e.lat.deg], axis=1), 2).tolist())
    sectors.append({"sector": s, "start": starts[s][:10], "ccds": ccds})
print(f"{len(sectors)} sectors, first {sectors[0]['start']}, last {sectors[-1]['start']}")

# Semi-coherent BLS periodogram of TIC 4206066 (the summed per-sector SNR^2), from the 30-minute bins.
lc = json.load(open(ROOT / "public/data/lc.json"))["rabtsevich"]
periods = np.exp(np.linspace(np.log(1.0), np.log(13.0), 6000))
total = np.zeros_like(periods)
for sec in lc["sectors"]:
    t = np.array(sec["t"]); f = np.array(sec["f"]) * 1e-6
    bls = BoxLeastSquares(t, f, dy=np.full_like(f, np.std(f)))
    res = bls.power(periods, [0.05, 0.07, 0.1], objective="snr")
    total += np.clip(res.depth_snr, 0, None) ** 2
snr = np.sqrt(total)
for p in lc["planets"]:
    k = np.argmin(np.abs(periods - p["P"]))
    print(f"periodogram at {p['P']:.3f} d: {snr[max(k - 3, 0):k + 4].max():.1f} (median {np.median(snr):.1f})")
top = np.argsort(snr)[::-1][:5]
print("top periods:", [(round(periods[k], 3), round(snr[k], 1)) for k in top])

# Normalise by a running median over +-10% in period, as a BLS spectrum is usually shown (signal detection
# efficiency), so peaks stand out against the rising noise floor at long periods.
logp = np.log(periods)
norm = np.array([snr[k] / np.median(snr[np.abs(logp - logp[k]) < 0.1]) for k in range(len(periods))])
for p in lc["planets"]:
    k = np.argmin(np.abs(periods - p["P"]))
    print(f"normalised at {p['P']:.3f} d: {norm[max(k - 3, 0):k + 4].max():.2f}")
top = np.argsort(norm)[::-1][:8]
print("top normalised:", [(round(periods[k], 3), round(norm[k], 2)) for k in top])
json.dump({"sectors": sectors, "periodogram": {"P": np.round(periods, 5).tolist(), "snr": np.round(snr, 2).tolist(),
                                                "power": np.round(norm, 3).tolist()}},
          open(ROOT / "public/data/tess.json", "w"))
