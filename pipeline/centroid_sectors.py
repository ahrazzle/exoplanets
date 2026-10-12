"""Difference-image PRF centroids in every listed sector of each signal, kept as sky positions so offsets can be
tested for consistency and direction across sectors (followup.py keeps only the size of the offset in its cheapest
good sectors). Uses transit-diffImage through LEO-Vetter, as followup.py does; with EXO_DATA_SOURCE=s3 the cutouts
come from the TESS cubes on the STScI open-data bucket. The fitted position is kept as an offset east and north of the
target (arcsec), measured in the sector's pixel frame from transit-diffImage's target position. Each record also
keeps the TIC stars that transit-diffImage places within 2' of the target, with their offsets, so the fitted position
can be compared with each of them.

Usage: python centroid_sectors.py LIST.csv --out DIR [--procs N]
LIST.csv columns: key, tic, ra, dec, period, t0 (BTJD), duration_h, sectors ("1,2,27"). Writes DIR/<key>.json.
Signals on the same star run one after another in one process, since transit-diffImage works in one folder per star.
"""
import argparse
import contextlib
import io
import json
import os
import pickle
import shutil
from multiprocessing import Pool
from types import SimpleNamespace

import numpy as np
import pandas as pd

import followup                                          # applies the S3 cutout patch when EXO_DATA_SOURCE=s3

NEAR_ARCSEC = 120.0


def stars_near(catalogue):
    """TIC stars in transit-diffImage's catalogue within NEAR_ARCSEC of the target: id, offsets east and north of
    the target (arcsec, at the sector's epoch), Tmag."""
    out = []
    for i, e, n, sep, m in zip(catalogue["ticID"], catalogue["deltaRa"], catalogue["deltaDec"], catalogue["separation"],
                               catalogue["ticMag"]):
        if sep <= NEAR_ARCSEC:
            out.append(dict(tic=int(i), east=round(float(e), 3), north=round(float(n), 3), sep=round(float(sep), 3),
                            Tmag=round(float(m), 3)))
    return out


def sky_jacobian(tdi_mod, sector, cam, ccd, col, row):
    """arcsec east and north per pixel of column and row at (col, row)."""
    ra0, dec0 = (float(np.squeeze(v)) for v in tdi_mod.pix_to_ra_dec(sector, cam, ccd, col, row))
    J = np.zeros((2, 2))
    for k, (dc, dr) in enumerate(((1.0, 0.0), (0.0, 1.0))):
        ra, dec = (float(np.squeeze(v)) for v in tdi_mod.pix_to_ra_dec(sector, cam, ccd, col + dc, row + dr))
        J[0, k] = 3600 * (ra - ra0) * np.cos(np.radians(dec0))
        J[1, k] = 3600 * (dec - dec0)
    return J


def one_signal(s, out):
    from leo_vetter.pixel import planet_dict, prf_fit, star_dict
    from tess_stars2px import tess_stars2px_function_entry as ts2px
    from transitDiffImage import tessDiffImage

    path = os.path.join(out, f"{s.key}.json")
    if os.path.exists(path):
        return
    star = star_dict(int(s.tic), float(s.ra), float(s.dec))
    star["planetData"] = [planet_dict(int(s.tic), 1, float(s.period), float(s.t0), float(s.duration_h) / 24)]
    _, _, _, all_sec, all_cam, all_ccd, _, _, _ = ts2px(int(s.tic), float(s.ra), float(s.dec))
    res = dict(key=s.key, tic=int(s.tic), ra=float(s.ra), dec=float(s.dec), period=float(s.period), t0=float(s.t0),
               duration_h=float(s.duration_h), sectors=[], errors={}, stars={})
    pid = star["planetData"][0]["planetID"]
    for sector in [int(x) for x in str(s.sectors).split(",") if x]:
        if sector not in set(all_sec):
            res["errors"][sector] = "not on silicon"
            continue
        star["sector"], star["cam"], star["ccd"] = sector, all_cam[all_sec == sector][0], all_ccd[all_sec == sector][0]
        pickle_path = followup.PIX / f"tic{int(s.tic)}" / f"imageData_{pid}_sector{sector}.pickle"
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                tdi = tessDiffImage.tessDiffImage(star, outputDir=str(followup.PIX))
                tdi.make_ffi_difference_image(thisPlanet=0, allowedBadCadences=2)
                # the pickle transit-diffImage has just written for this sector (as LEO-Vetter reads it)
                images, catalogue = pickle.load(open(pickle_path, "rb"))[:2]
                if "diffImage" not in images or np.isnan(np.sum(images["diffImage"])):
                    raise ValueError("difference image failed")
                c = prf_fit(sector, star["cam"], star["ccd"], images, catalogue)
            tc, tr = float(np.squeeze(catalogue["targetColPix"])), float(np.squeeze(catalogue["targetRowPix"]))
            J = sky_jacobian(tessDiffImage, sector, c["cam"], c["ccd"], tc, tr)
            east, north = J @ np.array([c["fit_col"] - tc, c["fit_row"] - tr])
            res["sectors"].append(dict(sector=sector, cam=int(c["cam"]), ccd=int(c["ccd"]), fit_col=float(c["fit_col"]),
                                       fit_row=float(c["fit_row"]), target_col=tc, target_row=tr, east=float(east),
                                       north=float(north), quality=float(c["quality"]),
                                       offset_arc=float(c["offset_arc"]), jacobian=J.round(4).tolist()))
            if not res["stars"]:
                res["stars"] = stars_near(catalogue)
        except Exception as ex:
            res["errors"][sector] = repr(ex)[:200]
        finally:
            for f in (followup.PIX / f"tic{int(s.tic)}").glob("*"):
                if f.is_file():
                    f.unlink(missing_ok=True)
    with open(path, "w") as fh:
        json.dump(res, fh)


def one_star(args):
    rows, out = args
    for s in rows:
        try:
            one_signal(s, out)
        except Exception as ex:
            with open(os.path.join(out, f"{s.key}.json"), "w") as fh:
                json.dump(dict(key=s.key, tic=int(s.tic), fatal=repr(ex)[:300]), fh)
    shutil.rmtree(followup.PIX / f"tic{int(rows[0].tic)}", ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list")
    ap.add_argument("--out", required=True)
    ap.add_argument("--procs", type=int, default=os.cpu_count())
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    followup.PIX.mkdir(parents=True, exist_ok=True)
    L = pd.read_csv(a.list, dtype={"sectors": str, "key": str})
    jobs = [([SimpleNamespace(**r) for r in g.to_dict("records")], a.out) for _, g in L.groupby("tic")]
    with Pool(a.procs) as p:
        for i, _ in enumerate(p.imap_unordered(one_star, jobs), 1):
            if i % 50 == 0 or i == len(jobs):
                print(f"{i}/{len(jobs)} stars", flush=True)


if __name__ == "__main__":
    main()
