"""QLP product-version handling in the S3 / MAST-script index."""
from pathlib import Path
import sys
import unittest

import pandas as pd

# index_s3.py is also run directly from pipeline/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
import index_s3

KEY = 'mast/hlsp/qlp/s{s:04d}/0000/0000/0754/7487/hlsp_qlp_tess_ffi_s{s:04d}-{tic:016d}_tess_v{v:02d}_llc.fits'


def key(sector, tic, v):
    return KEY.format(s=sector, tic=tic, v=v)


class QLPVersionTests(unittest.TestCase):
    def test_v01_and_v02_keys_parse_to_tic_and_sector(self):
        self.assertEqual(index_s3.parse('QLP', key(73, 7547487, 1)), (7547487, 73))
        self.assertEqual(index_s3.parse('QLP', key(74, 7547487, 2)), (7547487, 74))
        self.assertEqual(index_s3.parse('QLP', 'mast:HLSP/qlp/s0074/x/' + key(74, 5, 2).rsplit('/', 1)[1]), (5, 74))
        self.assertIsNone(index_s3.parse('QLP', key(74, 7547487, 2).replace('_llc.fits', '_lc.fits')))

    def test_version_read_from_file_name(self):
        self.assertEqual(index_s3.version(key(73, 1, 1)), 1)
        self.assertEqual(index_s3.version(key(74, 1, 2)), 2)
        self.assertEqual(index_s3.version('mast:TESS/product/tess2020-s0030-0000000000000001-0001-s_lc.fits'), 0)

    def test_script_index_pattern_matches_both_versions(self):
        html = ''.join(f'<a href="hlsp_qlp_tess_ffi_s{s:04d}_tess_v{v:02d}_llc-fits.sh">x</a>\n'
                       for s, v in ((73, 1), (74, 2), (80, 1)))
        html += '<a href="hlsp_qlp_tess_ffi_s0081_tess_v01_llc-fits.txt">x</a>'
        found = index_s3.SCRIPT_RE['QLP'].findall(html)
        self.assertEqual([s for _, s in found], ['0073', '0074', '0080'])
        self.assertEqual(found[1][0], 'hlsp_qlp_tess_ffi_s0074_tess_v02_llc-fits.sh')
        spoc = '<a href="hlsp_tess-spoc_tess_phot_s0050_tess_v1_dl-lc.sh">x</a>'
        self.assertEqual(index_s3.SCRIPT_RE['TESS-SPOC'].findall(spoc)[0][1], '0050')

    def test_dedupe_keeps_highest_version_then_provenance_order(self):
        def uri(prov, sector, tic, v):
            return index_s3.uri(prov, key(sector, tic, v))
        rows = [(1, 74, 'QLP', uri('QLP', 74, 1, 1)), (1, 74, 'QLP', uri('QLP', 74, 1, 2)),
                (2, 74, 'QLP', uri('QLP', 74, 2, 2)), (2, 74, 'QLP', uri('QLP', 74, 2, 1)),
                (1, 75, 'QLP', uri('QLP', 75, 1, 2)),
                # Provenance still outranks version: SPOC v0 beats QLP v02.
                (3, 74, 'QLP', uri('QLP', 74, 3, 2)),
                (3, 74, 'SPOC', 'mast:TESS/product/tess2023-s0074-0000000000000003-0001-s_lc.fits')]
        out = index_s3.dedupe(pd.DataFrame(rows, columns=['tic', 'sector', 'prov', 'uri']))
        got = {(r.tic, r.sector): (r.prov, r.uri) for r in out.itertuples()}
        self.assertEqual(len(out), 4)
        self.assertEqual(list(out.columns), ['tic', 'sector', 'prov', 'uri'])
        self.assertTrue(got[(1, 74)][1].endswith('_tess_v02_llc.fits'))
        self.assertTrue(got[(2, 74)][1].endswith('_tess_v02_llc.fits'))
        self.assertTrue(got[(1, 75)][1].endswith('_tess_v02_llc.fits'))
        self.assertEqual(got[(3, 74)][0], 'SPOC')


if __name__ == '__main__':
    unittest.main()
