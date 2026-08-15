from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from texgen_braid_mesh import plus_family_is_over  # noqa: E402


class TexGenCrossingOrderTest(unittest.TestCase):
    def test_diamond_uses_periodic_index_difference(self):
        plus = 3
        self.assertEqual(
            [plus_family_is_over(plus, minus, 1) for minus in range(3, 9)],
            [True, False, True, False, True, False],
        )

    def test_periodic_copies_keep_the_same_event_order(self):
        for offset in (-16, -8, 0, 8, 16):
            self.assertEqual(
                plus_family_is_over(2 + offset, 5 + offset, 1),
                plus_family_is_over(2, 5, 1),
            )

    def test_regular_and_hercules_group_crossings(self):
        self.assertEqual(
            [plus_family_is_over(0, event, 2) for event in range(8)],
            [True, True, False, False, True, True, False, False],
        )
        self.assertEqual(
            [plus_family_is_over(0, event, 3) for event in range(9)],
            [True, True, True, False, False, False, True, True, True],
        )


if __name__ == "__main__":
    unittest.main()
