"""Pack the 4,039,203 searched stars for the sky map, and draw quick-look density maps.

public/data/sky.bin holds, per star, sorted brightest first: lon, lat (float32 degrees, ecliptic), then
after all of those, Tmag and Teff (uint16: Tmag x 1000, Teff in K). public/data/sky.json describes it.
data/sky_*.png are density maps in three frames, to choose the stage.
usage: prep_sky.py
"""
import json
import pathlib

import numpy as np
import pandas as pd
from astropy import units as u
from astropy.coordinates import SkyCoord

REPO = pathlib.Path(__file__).resolve().parents[2]      # the repository root, which video/ sits in
ROOT = pathlib.Path(__file__).parent.parent
searched = np.load(ROOT / "data" / "searched_tics.npy")

cols = ["ID", "ra", "dec", "Tmag", "Teff"]
stars = pd.concat([pd.read_parquet(REPO / f"data/catalogs/shard{k}.parquet", columns=cols) for k in range(8)])
stars = stars[np.isin(stars.ID.to_numpy(), searched)].sort_values("Tmag").reset_index(drop=True)
print(f"{len(stars):,} stars; Tmag {stars.Tmag.min():.2f}-{stars.Tmag.max():.2f}; "
      f"Teff {stars.Teff.min():.0f}-{stars.Teff.max():.0f}; Teff NaN {stars.Teff.isna().sum()}")

c = SkyCoord(stars.ra.to_numpy() * u.deg, stars.dec.to_numpy() * u.deg)
ecl = c.barycentrictrueecliptic
gal = c.galactic
frames = {"ecliptic": (ecl.lon.deg, ecl.lat.deg), "galactic": (gal.l.deg, gal.b.deg),
          "equatorial": (stars.ra.to_numpy(), stars.dec.to_numpy())}


def mollweide(lon, lat):
    lam = np.radians(((lon + 180) % 360) - 180)
    phi = np.radians(lat)
    th = phi.copy()
    for _ in range(30):
        f = 2 * th + np.sin(2 * th) - np.pi * np.sin(phi)
        th -= f / (2 + 2 * np.cos(2 * th) + 1e-12)
    return 2 * np.sqrt(2) / np.pi * lam * np.cos(th), np.sqrt(2) * np.sin(th)


import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

for name, (lon, lat) in frames.items():
    x, y = mollweide(-np.asarray(lon), np.asarray(lat))   # east to the left, as on the sky
    h, _, _ = np.histogram2d(y, x, bins=(500, 1000), range=((-1.42, 1.42), (-2.84, 2.84)))
    plt.figure(figsize=(12, 6.2), facecolor="black")
    plt.imshow(np.log1p(h), origin="lower", cmap="magma", extent=(-2.84, 2.84, -1.42, 1.42))
    plt.axis("off")
    plt.savefig(ROOT / "data" / f"sky_{name}.png", dpi=100, bbox_inches="tight", facecolor="black")
    plt.close()

out = ROOT / "public" / "data"
out.mkdir(parents=True, exist_ok=True)
lon, lat = frames["ecliptic"]
with open(out / "sky.bin", "wb") as f:
    f.write(np.stack([lon, lat], axis=1).astype(np.float32).tobytes())
    f.write(np.round(stars.Tmag.to_numpy() * 1000).astype(np.uint16).tobytes())
    f.write(np.nan_to_num(stars.Teff.to_numpy(), nan=4500).round().astype(np.uint16).tobytes())
json.dump({"count": len(stars), "frame": "barycentric true ecliptic", "order": "Tmag ascending",
           "layout": ["lonlat float32[count][2] degrees", "tmag uint16[count] x1000", "teff uint16[count] K"]},
          open(out / "sky.json", "w"), indent=1)
np.save(ROOT / "data" / "sky_tic_order.npy", stars.ID.to_numpy())
