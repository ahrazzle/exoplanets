"""Epoch handling in the binary check: TIC positions are J2000, Gaia DR3 positions are epoch 2016.0."""
import os
import tempfile
import unittest
from unittest.mock import patch

import astropy.units as u
import numpy as np
import pandas as pd
from astropy.coordinates import SkyCoord
from astropy.table import Table

from pipeline import binary_check as bc


def sky_offset_arcsec(ra0, dec0, ra1, dec1):
    return SkyCoord(ra0 * u.deg, dec0 * u.deg).separation(SkyCoord(ra1 * u.deg, dec1 * u.deg)).arcsec


class PropagateTests(unittest.TestCase):
    def test_synthetic_star(self):
        # 1000 mas/yr in RA (pmRA includes cos dec) at dec 60 deg for 16 yr: 16" on the sky, 32" in raw RA.
        ra, dec = bc.propagate(10.0, 60.0, 1000.0, 0.0, 16.0)
        self.assertAlmostEqual((ra - 10.0) * 3600, 32.0, places=6)
        self.assertEqual(dec, 60.0)
        self.assertAlmostEqual(sky_offset_arcsec(10.0, 60.0, ra, dec), 16.0, places=2)

    def test_declination_and_negative_motion(self):
        ra, dec = bc.propagate(10.0, -30.0, -500.0, 250.0, 16.0)
        self.assertAlmostEqual((dec + 30.0) * 3600, 4.0, places=6)
        self.assertLess(ra, 10.0)
        self.assertAlmostEqual(sky_offset_arcsec(10.0, -30.0, ra, dec), np.hypot(8.0, 4.0), places=2)

    def test_nan_proper_motion_is_a_no_op(self):
        ra, dec = bc.propagate(10.0, 60.0, np.nan, np.nan, 16.0)
        self.assertEqual((ra, dec), (10.0, 60.0))
        ra, dec = bc.propagate(10.0, 60.0, 1000.0, np.nan, 16.0)       # one component missing
        self.assertEqual(dec, 60.0)
        self.assertAlmostEqual((ra - 10.0) * 3600, 32.0, places=6)

    def test_arrays_and_ra_wrap(self):
        ra, dec = bc.propagate([359.99999, 10.0], [0.0, 0.0], [1000.0, 0.0], [0.0, 0.0], 16.0)
        self.assertTrue(0 <= ra[0] < 1)
        self.assertEqual(ra[1], 10.0)

    def test_tic_156909067(self):
        # TIC v8 row for TIC 156909067 (MAST, astroquery Catalogs.query_criteria, TIC version 20190415),
        # epoch J2000: ra, dec, pmRA, pmDEC (mas/yr).
        ra, dec, pmra, pmdec = 104.003579365797, -38.4046999851027, -83.9486, 239.194
        # Gaia DR3 5577716114256475776 (CDS VizieR I/355/gaiadr3, RA_ICRS/DE_ICRS, epoch 2016.0); RUWE 3.620.
        gra, gdec = 104.00310348194, -38.40363689919
        self.assertGreater(sky_offset_arcsec(ra, dec, gra, gdec), bc.AT_TARGET)   # the bug: no match at J2000
        ra16, dec16 = bc.propagate(ra, dec, pmra, pmdec, bc.GAIA_EPOCH - bc.TIC_EPOCH)
        self.assertLess(sky_offset_arcsec(ra16, dec16, gra, gdec), bc.AT_TARGET)
        self.assertLess(sky_offset_arcsec(ra16, dec16, gra, gdec), 0.1)


class MatchEpochTests(unittest.TestCase):
    """main() sends the 2016.0 position to Gaia tables and the TIC position to the others, offline."""

    def test_positions_by_catalogue(self):
        seen = {}

        def fake_query(cat1, cat2, **kw):
            seen[cat2] = (float(cat1["ra"][0]), float(cat1["dec"][0]))
            return Table(names=["TIC", "angDist", "Gmag"], dtype=[int, float, float])

        with tempfile.TemporaryDirectory() as tmp:
            src, out = os.path.join(tmp, "in.csv"), os.path.join(tmp, "out.csv")
            pd.DataFrame(dict(TIC=[156909067], P_d=[6.667], ra=[104.003579365797], dec=[-38.4046999851027],
                              pmRA=[-83.9486], pmDEC=[239.194])).to_csv(src, index=False)
            with patch("sys.argv", ["binary_check.py", src, out]), \
                    patch("astroquery.xmatch.XMatch.query", side_effect=fake_query):
                bc.main()
        for name, (cat, *_rest) in bc.CATS.items():
            ra, dec = seen[cat]
            if name in bc.GAIA_CATS:
                self.assertAlmostEqual(ra, 104.00310324959857, places=6, msg=name)
                self.assertAlmostEqual(dec, -38.403636900658256, places=6, msg=name)
            else:
                self.assertEqual((ra, dec), (104.003579365797, -38.4046999851027), msg=name)


if __name__ == "__main__":
    unittest.main()
