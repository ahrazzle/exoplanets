"""Regression checks for star-independent classifier validation."""
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold

from pipeline import fa_classifier as fa


def table():
    # Two signals per star, alternating real/inverted stars; holdout TIC 0 also
    # has real and first-sample rows, to exercise reservation of all siblings.
    t = pd.DataFrame({"tic": np.repeat(np.arange(30), 2)})
    t["label"] = np.where(t["tic"] % 2 == 0, "real", "inverted")
    t["inv_set"] = np.where(t["label"] == "real", 0, 1)
    t.loc[0, ["label", "inv_set"]] = ["inverted", 2]
    t = pd.concat([t, pd.DataFrame({"tic": [0], "label": ["inverted"], "inv_set": [1]})], ignore_index=True)
    for f in fa.FEATURES:
        t[f] = t["tic"].astype(float)
    return t


class ClassifierTests(unittest.TestCase):
    def test_every_grouped_fold_is_disjoint_and_covers_rows(self):
        t = table()
        X = t[fa.FEATURES].values
        y = (t["label"] == "real").astype(int).values
        for rep in range(3):
            seen = np.zeros(len(t), dtype=int)
            for tr, te in fa.cv_folds(X, y, t["tic"].values, rep):
                self.assertFalse(set(t.iloc[tr]["tic"]) & set(t.iloc[te]["tic"]))
                seen[te] += 1
            np.testing.assert_array_equal(seen, 1)

    def test_holdout_reserves_real_and_inv1_siblings(self):
        t = table()
        train, extra = fa.holdout_masks(t)
        self.assertTrue(extra[t["tic"] == 0].all())
        self.assertFalse(train[t["tic"] == 0].any())
        self.assertTrue((train | extra).all())
        self.assertFalse(set(t.loc[train, "tic"]) & set(t.loc[extra, "tic"]))

    def test_all_rows_scored_without_training_on_prediction_stars(self):
        class CheckingModel:
            def __init__(self, **kwargs):
                pass

            def fit(self, X, y, sample_weight):
                self.stars = set(X[:, 0])

            def predict_proba(self, X):
                self_outer.assertFalse(self.stars & set(X[:, 0]))
                return np.tile([0.75, 0.25], (len(X), 1))

        self_outer = self
        t = table()
        train, extra = fa.holdout_masks(t)
        with patch.object(fa, "HistGradientBoostingClassifier", CheckingModel):
            holdout = fa.oof_scores(t, train, 2, extra=extra)
            full = fa.oof_scores(t, pd.Series(True, index=t.index), 2)
        for scores in (holdout, full):
            self.assertTrue(scores.notna().all())
            self.assertTrue(scores.index.equals(t.index))
            np.testing.assert_allclose(scores, 0.25)

    def test_rejects_leaking_holdout_and_missing_tic(self):
        t = table()
        train, extra = fa.holdout_masks(t, "signal")
        with self.assertRaisesRegex(ValueError, "held-out TIC"):
            fa.oof_scores(t, train, 2, extra=extra)
        t.loc[0, "tic"] = np.nan
        with self.assertRaisesRegex(ValueError, "TIC"):
            fa.holdout_masks(t)

    def test_legacy_masks_and_folds_match_released_algorithm(self):
        t = table()
        train, extra = fa.holdout_masks(t, "signal")
        pd.testing.assert_series_equal(train, (t["label"] == "real") | (t["inv_set"] == 1))
        pd.testing.assert_series_equal(extra, (t["label"] == "inverted") & (t["inv_set"] == 2))
        d = t[train]
        X = d[fa.FEATURES].values
        y = (d["label"] == "real").astype(int).values
        for rep in range(3):
            expected = StratifiedKFold(5, shuffle=True, random_state=rep).split(X, y)
            actual = fa.cv_folds(X, y, d["tic"].values, rep, "signal")
            for (tr1, te1), (tr2, te2) in zip(expected, actual):
                np.testing.assert_array_equal(tr1, tr2)
                np.testing.assert_array_equal(te1, te2)

    def test_zero_events_has_positive_upper_bound(self):
        lower, upper = fa.wilson_interval(0, 35)
        self.assertAlmostEqual(lower, 0)
        self.assertAlmostEqual(upper, 0.09890099, places=6)
        self.assertTrue(np.isnan(fa.wilson_interval(0, 0)[1]))


if __name__ == "__main__":
    unittest.main()
