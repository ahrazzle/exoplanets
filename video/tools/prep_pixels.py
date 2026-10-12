"""Difference images for signals the pixel check traced to a neighbouring star.

For each TIC folder in the repo's data/followup_pixels given on the command line, reads the first
transit-diffImage pickle and writes public/data/pixels_<tic>.json (the mean out-of-transit image, the
difference image, the target's pixel position and the TIC stars in the cutout) and data/pixels_<tic>.png.
usage: prep_pixels.py TIC [TIC ...]
"""
import glob
import json
import pathlib
import pickle
import sys

import numpy as np

REPO = pathlib.Path(__file__).resolve().parents[2]      # the repository root, which video/ sits in
ROOT = pathlib.Path(__file__).parent.parent

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

for tic in sys.argv[1:]:
    for path in sorted(glob.glob(str(REPO / f"data/followup_pixels/tic{tic}/imageData_*.pickle"))):
        # These pickles were written by our own pipeline (followup.py running transit-diffImage), not downloaded.
        img, stars, meta, *_, planet = pickle.load(open(path, "rb"))
        sector = meta["sector"]
        diff, out_t, snr = img["diffImage"], img["meanOutTransit"], img["diffSNRImage"]
        n = diff.shape[0]
        # The cutout's pixel coordinates: ticColPix/ticRowPix are CCD pixels, so subtract the corner.
        c0, r0 = meta["cornerCol"], meta["cornerRow"]
        col, row = np.asarray(stars["ticColPix"], float) - c0, np.asarray(stars["ticRowPix"], float) - r0
        mag = np.ma.filled(stars["ticMag"], 99.0).astype(float)
        sep = np.ma.filled(stars["separation"], np.nan).astype(float)
        ids = np.asarray(stars["ticID"])
        tc, tr = float(stars["targetColPix"][0]) - c0, float(stars["targetRowPix"][0]) - r0
        tmag = mag[ids == int(tic)][0] if (ids == int(tic)).any() else np.nan
        keep = (col > -0.5) & (col < n - 0.5) & (row > -0.5) & (row < n - 0.5) & (mag < tmag + 4)
        pk = np.unravel_index(np.argmax(snr), snr.shape)
        print(f"TIC {tic} S{sector}: cutout {n}x{n}, target at ({tc:.2f}, {tr:.2f}) T={tmag:.2f}, "
              f"diff SNR peak {snr.max():.1f} at pixel (col {pk[1]}, row {pk[0]}), {keep.sum()} stars within 4 mag; "
              f"period {planet['period']:.4f} d")
        near = np.argsort((col - pk[1]) ** 2 + (row - pk[0]) ** 2)
        for i in near[:6]:
            if mag[i] < 99:
                print(f"   TIC {ids[i]} T={mag[i]:.2f} at ({col[i]:.2f}, {row[i]:.2f}), {sep[i]:.1f}\" from the target")
        out = {"tic": int(tic), "sector": int(sector), "period": planet["period"], "n": n,
               "meanOut": np.round(out_t, 2).tolist(), "diff": np.round(diff, 3).tolist(), "snr": np.round(snr, 2).tolist(),
               "target": [tc, tr, float(tmag)],
               "stars": [[round(float(col[i]), 3), round(float(row[i]), 3), round(float(mag[i]), 2), int(ids[i]),
                          round(float(sep[i]), 1)] for i in np.nonzero(keep)[0]]}
        json.dump(out, open(ROOT / "public" / "data" / f"pixels_{tic}_s{sector}.json", "w"))
        fig, ax = plt.subplots(1, 3, figsize=(15, 5))
        for a, im, t in zip(ax, [out_t, diff, snr], ["mean out of transit", "difference", "difference SNR"]):
            a.imshow(im, origin="lower", cmap="magma")
            a.plot(col[keep], row[keep], "c+", ms=8)
            a.plot(tc, tr, "wo", mfc="none", ms=14)
            a.set_title(f"TIC {tic} S{sector}: {t}")
        fig.savefig(ROOT / "data" / f"pixels_{tic}_s{sector}.png", dpi=70)
        plt.close(fig)
