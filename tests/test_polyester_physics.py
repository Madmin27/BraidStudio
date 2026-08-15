import math
import sys
import unittest

sys.path.insert(0, "scripts")

from polyester_physics import (
    calibrated_microfilament_radius_um,
    carrier_physics,
    circular_radius_mm,
    cohesive_yarn_end_profile,
    denier_area_mm2,
)


class PolyesterPhysicsTest(unittest.TestCase):
    def test_denier_area_and_radius_are_consistent(self):
        area = denier_area_mm2(6.5)
        radius = circular_radius_mm(6.5)
        self.assertAlmostEqual(area, math.pi * radius * radius, places=12)

    def test_default_carrier_preserves_selected_mass(self):
        model = carrier_physics()
        self.assertEqual(model.yarn_ends_per_carrier, 20)
        self.assertEqual(model.total_denier_per_carrier, 20000.0)
        self.assertEqual(model.total_microfilaments_per_carrier, 20 * 444)
        self.assertGreater(model.carrier_width_mm, 4.86)
        self.assertLess(model.carrier_width_mm, 4.88)
        self.assertGreater(model.carrier_thickness_mm, 0.40)
        self.assertLess(model.carrier_thickness_mm, 0.41)
        self.assertAlmostEqual(model.fill_ratio, 1.0)

    def test_denier_changes_microfilament_radius(self):
        low = carrier_physics(denier_per_yarn_end=500)
        high = carrier_physics(denier_per_yarn_end=1300)
        self.assertNotEqual(low.microfilaments_per_yarn_end, high.microfilaments_per_yarn_end)
        self.assertGreater(high.total_denier_per_carrier, low.total_denier_per_carrier)
        self.assertGreater(high.carrier_thickness_mm, low.carrier_thickness_mm)

    def test_render_denier_calibration_only_thins_each_microfilament(self):
        physical = calibrated_microfilament_radius_um(2.25, 1.0)
        rendered = calibrated_microfilament_radius_um(2.25, 1 / 3)
        self.assertAlmostEqual(rendered / physical, math.sqrt(1 / 3), places=12)

    def test_carrier_package_width_is_independent_from_braid_angle(self):
        low_angle = carrier_physics(braid_angle_degrees=30)
        high_angle = carrier_physics(braid_angle_degrees=45)
        self.assertAlmostEqual(high_angle.carrier_width_mm, low_angle.carrier_width_mm)
        self.assertAlmostEqual(high_angle.carrier_thickness_mm, low_angle.carrier_thickness_mm)

    def test_diameter_changes_fit_without_changing_loaded_yarn_width(self):
        small = carrier_physics(rope_diameter_mm=10, braid_angle_degrees=45)
        large = carrier_physics(rope_diameter_mm=24, braid_angle_degrees=45)
        self.assertAlmostEqual(small.carrier_width_mm, large.carrier_width_mm)
        self.assertGreater(small.fill_ratio, large.fill_ratio)

    def test_yarn_end_profile_spreads_without_losing_material_area(self):
        area = 0.1
        width, height = cohesive_yarn_end_profile(area, 24.0, 20)
        self.assertGreaterEqual(width, 24.0 / 20 * 1.04)
        self.assertAlmostEqual(math.pi * width * height / 4.0, area)

    def test_45_degree_14x800_carrier_preserves_loaded_yarn_mass(self):
        model = carrier_physics(
            rope_diameter_mm=16,
            carrier_count=16,
            yarn_ends_per_carrier=14,
            denier_per_yarn_end=800,
            braid_angle_degrees=45,
            yarn_width_scale=1.0,
        )
        self.assertGreater(model.carrier_width_mm, 3.64)
        self.assertLess(model.carrier_width_mm, 3.66)
        self.assertGreater(model.carrier_thickness_mm, 0.30)
        self.assertLess(model.carrier_thickness_mm, 0.31)
        self.assertGreater(model.fill_ratio, 0.87)
        self.assertLess(model.fill_ratio, 0.88)


if __name__ == "__main__":
    unittest.main()
