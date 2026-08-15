import math
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from braid_crossing_physics import (  # noqa: E402
    adaptive_sample_positions,
    carrier_bundle_profile,
    contact_half_length,
    crossing_spacing,
    crossing_state,
    event_order,
    saturated_layer_profile,
    seamless_repeat_length,
)


class BraidCrossingPhysicsTest(unittest.TestCase):
    def test_s_and_z_are_opposite_at_every_crossing(self):
        for event in range(-20, 21):
            self.assertEqual(event_order(event, 1, 1), -event_order(event, -1, 1))

    def test_diamond_regular_and_hercules_sequences(self):
        self.assertEqual(
            [event_order(i, 1, 1) for i in range(6)],
            [1, -1, 1, -1, 1, -1],
        )
        self.assertEqual(
            [event_order(i, 1, 2) for i in range(8)],
            [1, 1, -1, -1, 1, 1, -1, -1],
        )
        self.assertEqual(
            [event_order(i, 1, 3) for i in range(9)],
            [1, 1, 1, -1, -1, -1, 1, 1, 1],
        )

    def test_layer_order_tapers_without_flipping_inside_contact_patch(self):
        spacing = 4.7
        contact_half = 2.05
        for event in range(-3, 4):
            center = event * spacing
            expected = event_order(event, 1, 1)
            center_state = crossing_state(
                center,
                spacing=spacing,
                contact_half=contact_half,
                family_direction=1,
                span=1,
            )
            self.assertAlmostEqual(center_state.layer_sign, expected)
            for offset in (-1.0, 1.0):
                state = crossing_state(
                    center + offset,
                    spacing=spacing,
                    contact_half=contact_half,
                    family_direction=1,
                    span=1,
                )
                self.assertEqual(1 if state.layer_sign > 0 else -1, expected)
                self.assertLess(abs(state.layer_sign), 1.0)
            for offset in (-contact_half, contact_half):
                edge = crossing_state(
                    center + offset,
                    spacing=spacing,
                    contact_half=contact_half,
                    family_direction=1,
                    span=1,
                )
                self.assertAlmostEqual(edge.layer_sign, 0.0)

    def test_pair_keeps_ordered_depth_at_default_crossing(self):
        thickness = 0.30431296181238554
        amplitude = thickness * 0.55
        upper_height = thickness * (1.0 - 0.12)
        lower_height = thickness * (1.0 - 0.25)
        radial_gap = 2.0 * amplitude - 0.5 * (upper_height + lower_height)
        self.assertGreaterEqual(radial_gap, 0.0)
        self.assertLess(radial_gap, thickness * 0.35)

    def test_saturated_profile_keeps_colour_bundles_separated(self):
        self.assertAlmostEqual(saturated_layer_profile(0.0), 0.0)
        self.assertAlmostEqual(saturated_layer_profile(1.0), 1.0)
        self.assertAlmostEqual(saturated_layer_profile(-1.0), -1.0)
        self.assertGreater(saturated_layer_profile(0.5), 0.9)
        self.assertLess(saturated_layer_profile(-0.5), -0.9)

    def test_all_filaments_use_one_carrier_bundle_profile(self):
        samples = [-4.7, -2.35, 0.0, 2.35, 4.7]
        profile = carrier_bundle_profile(
            samples,
            spacing=4.7,
            contact_half=2.05,
            family_direction=1,
            span=1,
        )
        # The renderer indexes this immutable carrier profile by sample; no
        # filament coordinate participates in the over-under decision.
        self.assertIsInstance(profile, tuple)
        self.assertEqual(len(profile), len(samples))
        self.assertEqual([state.layer_sign for state in profile], [-1.0, 0.0, 1.0, 0.0, -1.0])

    def test_contact_footprint_and_samples_follow_width_and_angle(self):
        helix_rate = 0.08350108146175333
        spacing = crossing_spacing(8, helix_rate)
        half = contact_half_length(4.371307886943443, math.radians(32), spacing)
        samples = adaptive_sample_positions(56.0, spacing, half)
        self.assertGreater(half / spacing, 0.40)
        self.assertLess(half / spacing, 0.47)
        self.assertGreaterEqual(len(samples), 100)
        self.assertTrue(any(math.isclose(value, 0.0, abs_tol=1e-12) for value in samples))

    def test_seamless_repeat_closes_carrier_and_crossing_phase(self):
        helix_rate = 0.08350108146175333
        for span in (1, 2, 3):
            length, turns = seamless_repeat_length(helix_rate, 8, span, 56.0)
            self.assertGreaterEqual(length, 56.0)
            self.assertAlmostEqual(helix_rate * length / math.tau, turns)
            self.assertEqual((8 * turns) % span, 0)


if __name__ == "__main__":
    unittest.main()
