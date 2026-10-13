# QLP products with unusable uncertainty columns

`read_lc_fits` previously discarded an entire QLP product when its selected uncertainty column
(`DET_FLUX_ERR`, or `KSPSAP_FLUX_ERR` when absent) had no finite positive values, even when flux,
time and quality were usable. The following cached public products reproduce the defect on input
snapshot `ec8311b`:

| Sector 94 QLP TIC | Original returned cadences | Recovered cadences | Empirical normalized scatter |
|---|---:|---:|---:|
| 90956394 | 0 | 8,822 | 0.00328490 (3,285 ppm) |
| 346744851 | 0 | 9,093 | 0.00166239 (1,662 ppm) |

The products are `hlsp_qlp_tess_ffi_s0094-0000000090956394_tess_v01_llc.fits` and
`hlsp_qlp_tess_ffi_s0094-0000000346744851_tess_v01_llc.fits`. Exact public MAST URLs, product URIs, byte counts and verified SHA256 hashes are recorded in
[`qlp_missing_errors.csv`](qlp_missing_errors.csv), so these inputs can be downloaded and checked
without the original cache. Both selected uncertainty columns are entirely NaN. Counts use the existing `QLP_BAD_BITS` mask, not a replacement `QUALITY == 0` rule.
These recover 17,915 usable cadences; they do not establish any catalog or tier changes.

## Bounded fallback

Only QLP can use this fallback, and only if **none** of the finite time/flux, quality-passing samples
has a finite positive selected error. Valid or partially valid uncertainty columns retain the original
cadence mask and normalization; missing errors in a partially usable product are not filled.

Eligible samples are sorted by time. Differences between adjacent fluxes are used only at positive
separations no larger than three times the median positive cadence spacing. The constant raw-flux
error is `1.4826 * median(abs(diff - median(diff))) / sqrt(2)`, then divided by the usual median flux.
At least four samples and three accepted differences, positive scatter and positive finite median flux
are required. Constant or too-short data remain empty; no arbitrary noise floor is introduced.

This follows the point-to-point scatter approach already used for TGLC, with gap exclusion. It is an
approximate white-noise uncertainty: stellar variability, correlated noise, transits or changing noise
levels can bias it, and the median-spacing gap rule assumes a reasonably populated regular cadence.
It is not a calibrated per-cadence measurement error or a substitute background-error column.

The returned `flux_err_source` is `qlp_point_to_point_mad` on successful recovery,
`qlp_point_to_point_unavailable` when the fallback cannot estimate a positive uncertainty, or the
selected FITS error column otherwise. TGLC identifies its existing estimate as
`tglc_point_to_point_mad`. `download.py` persists the source in each sector's NPZ; `load_star` reads
it and reports `unknown` for older caches lacking this optional field.

## Verification and existing caches

Seven synthetic FITS/cache regressions cover recovery, unchanged valid and partial errors, existing
quality bits and finite-sample filtering, no SPOC fallback, gap exclusion, degenerate data and provenance
round trips with old-cache compatibility. They passed with Python 3.12, numpy 2.5.3 and astropy 8.0.1:

```bash
python -m unittest discover -s tests -v
```

Both real FITS returned exactly the eligible counts above, with finite positive uncertainties.
No full-catalog search, validation or retiering was performed.

`download.py` skips stars whose NPZ already exists. A product previously omitted from an otherwise
populated star cache is therefore not automatically recovered: move that star's NPZ to a backup and
rerun the downloader for that TIC with the same manifest. The cache location is given by
`pipeline.common.tic_path(tic)`. A star with no usable sectors had no NPZ written and can simply be
retried. Re-reading an independently cached FITS through `read_lc_fits` applies the fix immediately.
