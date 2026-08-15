"""Render Gate 3: one physically compressed polyester carrier crossing."""

from __future__ import annotations

from dataclasses import asdict
import json
import math
from pathlib import Path
import random
import sys

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import blender_polyester_microbundle_gate as gate  # noqa: E402


OUT_DIR = ROOT / "proofs" / "crossing-gate"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RENDER_PATH = OUT_DIR / "polyester-17760f-single-crossing-v3.png"
BLEND_PATH = OUT_DIR / "polyester-17760f-single-crossing-v3.blend"
META_PATH = OUT_DIR / "polyester-17760f-single-crossing-v3.json"

PHYSICS = gate.physics
SAMPLE_COUNT = 56
LENGTH = 24.0
UPPER_COMPRESSION = 0.08
LOWER_COMPRESSION = 0.20
CROSSING_ANGLE = 34.0


def create_carrier(name: str, color, role: str, seed: int) -> bpy.types.Object:
    rng = random.Random(seed)
    material = gate.polyester_material(name + " material", color, 0.39, 0.92)
    curves = bpy.data.hair_curves.new(name + " native fibers")
    curves.materials.append(material)
    total = PHYSICS.total_microfilaments_per_carrier
    curves.add_curves([SAMPLE_COUNT] * total)

    positions = [0.0] * (total * SAMPLE_COUNT * 3)
    radii = [PHYSICS.microfilament_radius_um / 1000.0] * (total * SAMPLE_COUNT)
    point_cursor = 0
    end_rows = 3 if PHYSICS.yarn_ends_per_carrier % 3 == 0 else 2
    end_columns = math.ceil(PHYSICS.yarn_ends_per_carrier / end_rows)
    end_width = PHYSICS.carrier_width_mm / end_columns
    end_height = PHYSICS.carrier_thickness_mm / end_rows
    compression_amount = UPPER_COMPRESSION if role == "upper" else LOWER_COMPRESSION

    for end_index in range(PHYSICS.yarn_ends_per_carrier):
        layer = end_index % end_rows
        column = end_index // end_rows
        y_center = (column - (end_columns - 1) / 2.0) * end_width
        z_center = (layer - (end_rows - 1) / 2.0) * end_height * 0.94
        end_phase = rng.random() * math.tau
        disk_points = gate.fibonacci_disk(PHYSICS.microfilaments_per_yarn_end, end_phase)

        for filament_index, (disk_y, disk_z) in enumerate(disk_points):
            phase = end_phase + filament_index * 0.61803398875
            for sample in range(SAMPLE_COUNT):
                u = sample / (SAMPLE_COUNT - 1)
                x = (u - 0.5) * LENGTH
                # A flat contact plateau covers the complete finite-width crossing.
                contact = math.exp(-((x / 5.0) ** 8))
                compression = 1.0 - compression_amount * contact
                width_expansion = 1.0 / compression

                twist = -math.tau * x / 10.5 + phase * 0.05
                cos_t = math.cos(twist)
                sin_t = math.sin(twist)
                local_y = (disk_y * cos_t - disk_z * sin_t) * end_width * 0.55
                local_z = (disk_y * sin_t + disk_z * cos_t) * end_height * 0.54
                migration = math.sin(math.tau * u * 1.7 + phase) * 0.008
                irregular = math.sin(math.tau * u * (5.0 + (filament_index % 7) * 0.11) + phase)
                group_wave = math.sin(math.tau * u * 0.7 + end_phase) * 0.012

                center_lift = (0.38 if role == "upper" else -0.05) * contact
                y = (y_center + local_y + migration) * width_expansion + irregular * 0.0025
                z = center_lift + (z_center + local_z + group_wave) * compression + irregular * 0.0015

                coordinate_cursor = point_cursor * 3
                positions[coordinate_cursor:coordinate_cursor + 3] = (x, y, z)
                point_cursor += 1

    curves.attributes["position"].data.foreach_set("vector", positions)
    radius_attribute = curves.attributes.new("radius", "FLOAT", "POINT")
    radius_attribute.data.foreach_set("value", radii)
    curves.update_tag()

    obj = bpy.data.objects.new(name, curves)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler[2] = math.radians(CROSSING_ANGLE if role == "upper" else -CROSSING_ANGLE)
    return obj


def main() -> None:
    gate.reset_scene()
    gate.configure_render()
    scene = bpy.context.scene
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.cycles.samples = 128

    create_carrier("White PET upper 8880F", (0.93, 0.925, 0.90), "upper", 341)
    create_carrier("Red PET lower 8880F", (0.72, 0.012, 0.008), "lower", 734)
    camera = gate.add_studio()
    gate.render_view(camera, RENDER_PATH, (0.0, -17.0, 23.0), (0.0, 0.0, 0.0), 18.0)

    metadata = asdict(PHYSICS)
    metadata.update({
        "microfilaments_total": PHYSICS.total_microfilaments_per_carrier * 2,
        "crossing_angle_degrees": CROSSING_ANGLE * 2.0,
        "upper_compression": UPPER_COMPRESSION,
        "lower_compression": LOWER_COMPRESSION,
        "nominal_contact_gap_um": 34.0,
        "carrier_shell_meshes": 0,
        "render": str(RENDER_PATH),
    })
    META_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
