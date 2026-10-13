"""QLP uncertainty fallback and cache provenance regression checks."""
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
from astropy.io import fits

from pipeline import common

# download.py is also run directly from pipeline/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
from pipeline import download


def product(f=None, e=None, q=None, t=None, spoc=False):
    n = 120 if f is None else len(f)
    f = 100 + np.tile([0., 1., -1., 2., -2., 0.5], n // 6 + 1)[:n] if f is None else f
    e = np.full(n, np.nan) if e is None else e
    q = np.zeros(n, dtype=np.int64) if q is None else q
    t = np.arange(n) * .01 if t is None else t
    cols = [fits.Column(name=name, format=fmt, array=arr) for name, fmt, arr in (
        ('TIME', 'D', t), ('QUALITY', 'K', q), ('SYS_RM_FLUX', 'D', f),
        ('DET_FLUX_ERR', 'D', e), ('SAP_X', 'D', np.zeros(n)),
        ('SAP_Y', 'D', np.zeros(n)), ('SAP_BKG', 'D', np.zeros(n)))]
    if spoc:
        names = {'SYS_RM_FLUX': 'PDCSAP_FLUX', 'DET_FLUX_ERR': 'PDCSAP_FLUX_ERR',
                 'SAP_X': 'MOM_CENTR1', 'SAP_Y': 'MOM_CENTR2'}
        for col in cols:
            col.name = names.get(col.name, col.name)
    h = fits.HDUList([fits.PrimaryHDU(), fits.BinTableHDU.from_columns(cols)])
    h[1].header['TIMEDEL'] = .01
    blob = io.BytesIO()
    h.writeto(blob)
    return blob.getvalue(), np.asarray(f), np.asarray(t)


def read(blob):
    return common.read_lc_fits(io.BytesIO(blob), 'QLP')


class QLPErrorTests(unittest.TestCase):
    def test_all_missing_recovers_empirical_errors(self):
        blob, f, t = product()
        out = read(blob)
        np.testing.assert_array_equal(out['time'], t)
        np.testing.assert_allclose(out['flux'], f / np.median(f), rtol=1e-6)
        expected = common.qlp_point_to_point_error(t, f) / np.median(f)
        np.testing.assert_allclose(out['flux_err'], expected, rtol=1e-6)
        self.assertEqual(out['flux_err_source'], 'qlp_point_to_point_mad')
        self.assertTrue(np.all(out['flux_err'] > 0))

    def test_good_and_partial_errors_preserve_original_behavior(self):
        for missing in (False, True):
            e = np.linspace(1, 2, 120)
            if missing:
                e[:30] = np.nan
                e[30:40] = 0
            blob, f, t = product(e=e)
            out = read(blob)
            good = np.isfinite(e) & (e > 0)
            np.testing.assert_array_equal(out['time'], t[good])
            np.testing.assert_allclose(out['flux_err'], e[good] / np.median(f[good]), rtol=1e-6)
            self.assertEqual(out['flux_err_source'], 'DET_FLUX_ERR')

    def test_spoc_missing_errors_does_not_use_qlp_fallback(self):
        blob, _, _ = product(spoc=True)
        out = common.read_lc_fits(io.BytesIO(blob), 'SPOC')
        self.assertEqual(len(out['time']), 0)
        self.assertEqual(out['flux_err_source'], 'PDCSAP_FLUX_ERR')

    def test_flags_and_finite_samples_respected(self):
        q = np.zeros(120, dtype=np.int64)
        q[0] = 1
        q[1] = 1 << 29  # intentionally allowed by the existing QLP mask
        q[2] = 1 << 30
        f = 100 + np.tile([0., 1., -1., 2., -2., .5], 20)
        f[3] = np.nan
        t = np.arange(120) * .01
        t[4] = np.nan
        # A valid error on an ineligible row must not suppress fallback.
        e = np.full(120, np.nan)
        e[0] = 1
        blob, _, _ = product(f=f, t=t, q=q, e=e)
        out = read(blob)
        np.testing.assert_array_equal(out['time'], t[[i for i in range(120) if i not in (0, 2, 3, 4)]])
        self.assertEqual(out['flux_err_source'], 'qlp_point_to_point_mad')

    def test_constant_too_short_and_zero_normalization_do_not_recover(self):
        for f in (np.ones(120), np.array([1., 2., 4.]), np.tile([-2., 1., -1., 2., -3., 3.], 20)):
            blob, _, _ = product(f=f)
            out = read(blob)
            self.assertEqual(len(out['time']), 0)
            self.assertEqual(out['flux_err_source'], 'qlp_point_to_point_unavailable')

    def test_time_gaps_do_not_contribute_to_scatter(self):
        t = np.array([0, 1, 2, 3, 100, 101, 102, 103], float)
        f = np.array([100, 100, 100, 100, 10000, 10001, 10002, 10003], float)
        df = np.array([0, 0, 0, 1, 1, 1], float)
        expected = 1.4826 * np.median(np.abs(df - np.median(df))) / np.sqrt(2)
        self.assertAlmostEqual(common.qlp_point_to_point_error(t, f), expected)

    def test_download_and_load_preserve_source_with_old_cache_compatibility(self):
        blob, _, _ = product()
        rows = pd.DataFrame([dict(uri='unused', prov='QLP', sector=94)])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'tic1.npz'
            with patch.object(download, 'tic_path', return_value=path), patch.object(download, 'fetch', return_value=blob):
                self.assertEqual(download.do_star(1, rows), (1, '1 sectors'))
            with patch.object(common, 'tic_path', return_value=path):
                self.assertEqual(common.load_star(1)[0]['flux_err_source'], 'qlp_point_to_point_mad')
                with np.load(path, allow_pickle=False) as z:
                    old = {k: z[k] for k in z.files if not k.endswith('flux_err_source')}
                np.savez_compressed(path, **old)
                self.assertEqual(common.load_star(1)[0]['flux_err_source'], 'unknown')


if __name__ == '__main__':
    unittest.main()
