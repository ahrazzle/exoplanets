"""Which TIC stars the full-sky search produced signals for, per results folder.

Writes data/searched_tics.npy (sorted unique TIC IDs over all folders) and prints counts, so the sky map
can be checked against the README's 4,039,203 stars searched.
usage: searched_stars.py
"""
import pathlib

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

REPO = pathlib.Path(__file__).resolve().parents[2]      # the repository root, which video/ sits in
OUT = pathlib.Path(__file__).parent.parent / "data"

shards = {}
for k in range(8):
    shards[k] = pd.read_parquet(REPO / f"data/catalogs/shard{k}.parquet", columns=["ID"])["ID"].to_numpy()
    print(f"shard{k}.parquet: {len(shards[k]):,} stars")

found = []
for d in sorted((REPO / "results_cloud").iterdir()):
    f = d / "signals_allsky.parquet"
    if not f.exists():
        continue
    tic = np.unique(pq.read_table(f, columns=["tic"])["tic"].to_numpy())
    which = {k: int(np.isin(tic, s).sum()) for k, s in shards.items()}
    print(f"{d.name}: {len(tic):,} stars with signals; in shards {({k: v for k, v in which.items() if v})}")
    found.append(tic)

allt = np.unique(np.concatenate(found))
print(f"union: {len(allt):,} stars")
OUT.mkdir(exist_ok=True)
np.save(OUT / "searched_tics.npy", allt)
