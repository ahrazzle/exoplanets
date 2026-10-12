"""A coherent box-least-squares periodogram of TIC 4206066 (Sectors 6, 32, 98 joined), 1-13 days.

Writes public/data/periodogram.json: per screen column (600 columns, log period) the highest normalised
power, so the plot keeps every spike. Power is BLS depth SNR divided by its running median (+-10% in period).
usage: prep_periodogram.py
"""
import json
import pathlib

import numpy as np
from astropy.timeseries import BoxLeastSquares

ROOT = pathlib.Path(__file__).parent.parent
lc = json.load(open(ROOT / "public/data/lc.json"))["rabtsevich"]
t = np.concatenate([s["t"] for s in lc["sectors"]])
f = np.concatenate([s["f"] for s in lc["sectors"]]) * 1e-6
dy = np.concatenate([np.full(len(s["f"]), np.std(s["f"]) * 1e-6) for s in lc["sectors"]])

span = t.max() - t.min()
fmin, fmax = 1 / 13.0, 1 / 1.0
df = 0.25 * 0.05 / span                    # a quarter of a 1.2-hour transit's phase width over the baseline
freqs = np.arange(fmin, fmax, df)
periods = np.sort(1 / freqs)
print(f"{len(periods):,} trial periods over {span:.0f} days")
bls = BoxLeastSquares(t, f, dy=dy)
res = bls.power(periods, [0.05, 0.07, 0.1], objective="snr")
snr = np.nan_to_num(res.depth_snr)

logp = np.log(periods)
cols = 600
edges = np.linspace(np.log(1.0), np.log(13.0), cols + 1)
idx = np.clip(np.digitize(logp, edges) - 1, 0, cols - 1)
colmax = np.zeros(cols)
np.maximum.at(colmax, idx, snr)
# normalise each column by the median power within +-10% in period
med = np.array([np.median(snr[np.abs(logp - (edges[k] + edges[k + 1]) / 2) < 0.1]) for k in range(cols)])
power = colmax / med
pc = np.exp((edges[:-1] + edges[1:]) / 2)
for p in lc["planets"]:
    k = np.argmin(np.abs(pc - p["P"]))
    print(f"P {p['P']:.4f}: column power {power[max(k - 1, 0):k + 2].max():.2f}, SNR {colmax[max(k - 1, 0):k + 2].max():.1f}")
top = np.argsort(power)[::-1][:6]
print("top columns:", [(round(pc[k], 3), round(power[k], 2)) for k in top])
json.dump({"P": np.round(pc, 4).tolist(), "power": np.round(power, 3).tolist(), "snr": np.round(colmax, 2).tolist()},
          open(ROOT / "public/data/periodogram.json", "w"))
