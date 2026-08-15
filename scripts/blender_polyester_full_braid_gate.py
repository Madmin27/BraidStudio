"""Render a 16-carrier, fiber-level polyester braid quality proof."""

from __future__ import annotations

from dataclasses import asdict
import gc
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


OUT_DIR = ROOT / "proofs" / "full-braid-gate"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RENDER_PATH = OUT_DIR / "polyester-16carrier-142080f-v4.png"
BLEND_PATH = OUT_DIR / "polyester-16carrier-142080f-v4.blend"
META_PATH = OUT_DIR / "polyester-16carrier-142080f-v4.json"

PHYSICS = gate.physics
LENGTH = 56.0
SAMPLE_COUNT = 52
Z_SHIFT = 8.45
UPPER_COMPRESSION = 0.08
LOWER_COMPRESSION = 0.20
LAYER_AMPLITUDE = 0.22


def create_carrier(carrier_number: int, family_direction: int, family_index: int,
                   material: bpy.types.Material) -> bpy.types.Object:
    rng = random.Random(8300 + carrier_number * 97)
    name = f"Carrier {carrier_number:02d} {'S' if family_direction > 0 else 'Z'}"
    curves = bpy.data.hair_curves.new(name + " native fibers")
    curves.materials.append(material)
    total = PHYSICS.total_microfilaments_per_carrier
    curves.add_curves([SAMPLE_COUNT] * total)

    positions = [0.0] * (total * SAMPLE_COUNT * 3)
    radii = [PHYSICS.microfilament_radius_um / 1000.0] * (total * SAMPLE_COUNT)
    point_cursor = 0

    family_count = PHYSICS.carrier_count // 2
    phase0 = math.pi + math.tau * family_index / family_count
    angle = math.radians(PHYSICS.braid_angle_degrees)
    base_radius = PHYSICS.rope_diameter_mm / 2.0 - PHYSICS.carrier_thickness_mm / 2.0 - LAYER_AMPLITUDE
    helix_rate = math.tan(angle) / base_radius
    end_rows = 3 if PHYSICS.yarn_ends_per_carrier % 3 == 0 else 2
    end_columns = math.ceil(PHYSICS.yarn_ends_per_carrier / end_rows)
    end_width = PHYSICS.carrier_width_mm / end_columns
    end_height = PHYSICS.carrier_thickness_mm / end_rows

    for end_index in range(PHYSICS.yarn_ends_per_carrier):
        layer_index = end_index % end_rows
        column = end_index // end_rows
        across_center = (column - (end_columns - 1) / 2.0) * end_width
        outward_center = (layer_index - (end_rows - 1) / 2.0) * end_height * 0.94
        end_phase = rng.random() * math.tau
        disk_points = gate.fibonacci_disk(PHYSICS.microfilaments_per_yarn_end, end_phase)

        for filament_index, (disk_across, disk_outward) in enumerate(disk_points):
            phase = end_phase + filament_index * 0.61803398875
            for sample in range(SAMPLE_COUNT):
                u = sample / (SAMPLE_COUNT - 1)
                x = (u - 0.5) * LENGTH
                theta = phase0 + family_direction * helix_rate * x

                layer_phase = 8.0 * helix_rate * x + family_direction * 8.0 * phase0
                layer_cosine = math.cos(layer_phase)
                plateau = math.tanh(1.8 * layer_cosine) / math.tanh(1.8)
                layer_wave = family_direction * LAYER_AMPLITUDE * plateau
                contact = abs(math.cos(layer_phase)) ** 8
                compression_amount = UPPER_COMPRESSION if layer_wave >= 0.0 else LOWER_COMPRESSION
                compression = 1.0 - compression_amount * contact
                width_expansion = 1.0 / compression

                internal_twist = -math.tau * x / 10.5 + phase * 0.05
                cos_twist = math.cos(internal_twist)
                sin_twist = math.sin(internal_twist)
                local_across = (
                    disk_across * cos_twist - disk_outward * sin_twist
                ) * end_width * 0.55
                local_outward = (
                    disk_across * sin_twist + disk_outward * cos_twist
                ) * end_height * 0.54
                migration = math.sin(math.tau * u * 1.7 + phase) * 0.007
                irregular = math.sin(math.tau * u * (5.0 + (filament_index % 7) * 0.11) + phase)

                across = (across_center + local_across + migration) * width_expansion
                outward = (outward_center + local_outward) * compression + irregular * 0.0015
                radius = base_radius + layer_wave + outward

                sin_theta = math.sin(theta)
                cos_theta = math.cos(theta)
                # Width direction lies in the cylinder tangent plane and is
                # perpendicular to the carrier's helix tangent.
                world_x = x - family_direction * math.sin(angle) * across
                world_y = radius * cos_theta - math.cos(angle) * sin_theta * across
                world_z = Z_SHIFT + radius * sin_theta + math.cos(angle) * cos_theta * across

                coordinate_cursor = point_cursor * 3
                positions[coordinate_cursor:coordinate_cursor + 3] = (world_x, world_y, world_z)
                point_cursor += 1

    curves.attributes["position"].data.foreach_set("vector", positions)
    radius_attribute = curves.attributes.new("radius", "FLOAT", "POINT")
    radius_attribute.data.foreach_set("value", radii)
    curves.update_tag()
    obj = bpy.data.objects.new(name, curves)
    bpy.context.collection.objects.link(obj)
    del positions, radii
    gc.collect()
    return obj


def main() -> None:
    gate.reset_scene()
    gate.configure_render()
    scene = bpy.context.scene
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.cycles.samples = 128
    scene.cycles.max_bounces = 4

    white = gate.polyester_material("Opaque white HT polyester", (0.93, 0.925, 0.90), 0.39, 0.92)
    red = gate.polyester_material("Opaque red HT polyester", (0.72, 0.012, 0.008), 0.37, 0.94)

    family_indices = {1: 0, -1: 0}
    for carrier_number in range(1, PHYSICS.carrier_count + 1):
        direction = 1 if carrier_number % 2 else -1
        family_index = family_indices[direction]
        family_indices[direction] += 1
        material = red if carrier_number in {1, 3} else white
        create_carrier(carrier_number, direction, family_index, material)

    camera = gate.add_studio()
    floor = bpy.data.objects.get("Studio floor")
    if floor is not None:
        floor.location.z = 0.0
    target = (0.0, 0.0, Z_SHIFT)
    for obj in bpy.context.scene.objects:
        if obj.type == "LIGHT":
            gate.look_at(obj, target)
    gate.render_view(camera, RENDER_PATH, (0.0, -44.0, 20.0), target, 34.5)

    metadata = asdict(PHYSICS)
    metadata.update({
        "microfilaments_total": PHYSICS.total_microfilaments_per_carrier * PHYSICS.carrier_count,
        "s_carriers": PHYSICS.carrier_count // 2,
        "z_carriers": PHYSICS.carrier_count // 2,
        "red_carriers": [1, 3],
        "upper_compression": UPPER_COMPRESSION,
        "lower_compression": LOWER_COMPRESSION,
        "layer_amplitude_mm": LAYER_AMPLITUDE,
        "carrier_shell_meshes": 0,
        "render": str(RENDER_PATH),
    })
    META_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
