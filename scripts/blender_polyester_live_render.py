"""Render a panel-driven fiber-level polyester braid for the live application."""

from __future__ import annotations

from dataclasses import asdict
import json
import math
import os
from pathlib import Path
import random
import sys

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


def script_args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


ARGS = script_args()
if len(ARGS) != 2:
    raise SystemExit("usage: blender ... -- <config.json> <output.png>")

CONFIG_PATH = Path(ARGS[0]).resolve()
OUTPUT_PATH = Path(ARGS[1]).resolve()
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

CARRIER_COUNT = int(CONFIG["carrierCount"])
ROPE_DIAMETER = float(CONFIG["diameterMm"])
BRAID_ANGLE = float(CONFIG["braidAngle"])
YARN_ENDS = int(CONFIG["filamentCount"])
DENIER_PER_END = float(CONFIG["denier"])
WIDTH_SCALE = float(CONFIG["strandWidthScale"])
FLIP = bool(CONFIG.get("flip", False))
CROSSING_MODE = str(CONFIG.get("crossingMode", "diamond"))
CROSSING_SPAN = {"diamond": 1, "regular": 2, "hercules": 3}.get(CROSSING_MODE, 1)

os.environ["BRAID_CARRIER_COUNT"] = str(CARRIER_COUNT)
os.environ["BRAID_ROPE_DIAMETER"] = str(ROPE_DIAMETER)
os.environ["BRAID_ANGLE"] = str(BRAID_ANGLE)
os.environ["BRAID_YARN_ENDS"] = str(YARN_ENDS)
os.environ["BRAID_DENIER_PER_END"] = str(DENIER_PER_END)

import blender_polyester_microbundle_gate as gate  # noqa: E402
from braid_crossing_physics import (  # noqa: E402
    adaptive_sample_positions,
    contact_half_length,
    crossing_spacing,
    saturated_layer_profile,
    seamless_repeat_length,
)
from polyester_physics import (  # noqa: E402
    calibrated_microfilament_radius_um,
    carrier_physics,
    cohesive_yarn_end_profile,
)


PHYSICS = carrier_physics(
    rope_diameter_mm=ROPE_DIAMETER,
    carrier_count=CARRIER_COUNT,
    yarn_ends_per_carrier=YARN_ENDS,
    denier_per_yarn_end=DENIER_PER_END,
    braid_angle_degrees=BRAID_ANGLE,
    target_dpf=2.25,
    yarn_width_scale=WIDTH_SCALE,
)

MAX_RENDER_CURVES = 180_000
PHYSICAL_CURVES_TOTAL = PHYSICS.total_microfilaments_per_carrier * CARRIER_COUNT
RENDER_RATIO = min(1.0, MAX_RENDER_CURVES / PHYSICAL_CURVES_TOTAL)
RENDER_MICROFILAMENTS_PER_END = max(
    12,
    int(round(PHYSICS.microfilaments_per_yarn_end * RENDER_RATIO / 12.0)) * 12,
)
RENDER_CURVES_PER_CARRIER = YARN_ENDS * RENDER_MICROFILAMENTS_PER_END
RENDER_CURVES_TOTAL = RENDER_CURVES_PER_CARRIER * CARRIER_COUNT
EQUIVALENT_RADIUS_SCALE = math.sqrt(
    PHYSICS.microfilaments_per_yarn_end / RENDER_MICROFILAMENTS_PER_END
)
DENIER_GEOMETRY_CALIBRATION = 1.0 / 3.0
RENDER_MICROFILAMENT_RADIUS_UM = calibrated_microfilament_radius_um(
    PHYSICS.denier_per_microfilament,
    DENIER_GEOMETRY_CALIBRATION,
)

END_ROWS = 1
END_COLUMNS = YARN_ENDS
END_ENVELOPE_AREA = PHYSICS.packed_envelope_area_mm2 / YARN_ENDS
END_PROFILE_WIDTH, END_PROFILE_HEIGHT = cohesive_yarn_end_profile(
    END_ENVELOPE_AREA,
    PHYSICS.carrier_width_mm,
    YARN_ENDS,
)
YARN_END_ASPECT_RATIO = END_PROFILE_WIDTH / END_PROFILE_HEIGHT
END_PROFILE_HALF_WIDTH = END_PROFILE_WIDTH / 2.0
END_PROFILE_HALF_HEIGHT = END_PROFILE_HEIGHT / 2.0
END_COLUMN_PITCH = (
    (PHYSICS.carrier_width_mm - END_PROFILE_WIDTH) / max(1, YARN_ENDS - 1)
)
END_ROW_PITCH = 0.0
BUNDLE_THICKNESS = END_PROFILE_HEIGHT
UPPER_COMPRESSION = 0.12
LOWER_COMPRESSION = 0.25
# Radial compression at a crossing displaces a small amount of bundle volume
# sideways.  Applying this to the carrier as one body closes the pinhole where
# four cells meet without letting individual filaments choose their own layer.
LATERAL_CONTACT_SPREAD = 0.14
# At a crossing the two carrier centres must remain farther apart than the
# combined compressed half-thicknesses.  A smaller excursion lets opposite
# colours occupy the same volume and produces the transverse "cut edge" seen
# in renders even though every filament curve is continuous.
# The compressed over/under half-thicknesses add up to 0.815 bundle heights.
# A 0.55 amplitude left a visible 0.087 mm air gap at the calibrated default.
# Keep the user-approved over-under geometry. Larger values expose color below
# the cover yarn and smaller values collapse the cell order.
LAYER_AMPLITUDE = BUNDLE_THICKNESS * 0.55
TRANSITION_RECESS = BUNDLE_THICKNESS * 0.03
Z_SHIFT = ROPE_DIAMETER / 2.0 + 0.45

ANGLE_RADIANS = math.radians(PHYSICS.braid_angle_degrees)
BASE_RADIUS = (
    PHYSICS.rope_diameter_mm / 2.0
    - BUNDLE_THICKNESS / 2.0
    - LAYER_AMPLITUDE
)
HELIX_RATE = math.tan(ANGLE_RADIANS) / BASE_RADIUS
HELIX_PERIOD = math.tau / abs(HELIX_RATE)
FAMILY_COUNT = PHYSICS.carrier_count // 2
# Use a whole number of carrier and crossing cycles. The two render edges then
# contain the same carrier, layer and filament phase and form a seamless
# physical production repeat.
LENGTH, PERIOD_COUNT = seamless_repeat_length(
    abs(HELIX_RATE),
    FAMILY_COUNT,
    CROSSING_SPAN,
    max(48.0, ROPE_DIAMETER * 3.5),
)
INTERNAL_TWIST_TURNS = max(1, round(LENGTH / 10.5))
CROSSING_SPACING = crossing_spacing(PHYSICS.carrier_count // 2, HELIX_RATE)
CONTACT_HALF_LENGTH = contact_half_length(
    PHYSICS.carrier_width_mm,
    ANGLE_RADIANS,
    CROSSING_SPACING,
)
GEOMETRY_PADDING = max(PHYSICS.carrier_width_mm * 1.5, CROSSING_SPACING)
GEOMETRY_LENGTH = LENGTH + GEOMETRY_PADDING * 2.0
SAMPLE_XS = adaptive_sample_positions(
    GEOMETRY_LENGTH,
    CROSSING_SPACING,
    CONTACT_HALF_LENGTH,
)
SAMPLE_COUNT = len(SAMPLE_XS)


def hex_color(value: str) -> tuple[float, float, float]:
    text = str(value or "#f6f5ee").lstrip("#")
    if len(text) != 6:
        text = "f6f5ee"
    return tuple(int(text[index:index + 2], 16) / 255.0 for index in (0, 2, 4))


def carrier_color(carrier_number: int) -> str:
    carriers = CONFIG.get("carriers") if isinstance(CONFIG.get("carriers"), list) else []
    if carrier_number <= len(carriers):
        color = str((carriers[carrier_number - 1] or {}).get("color", ""))
        if len(color) == 7 and color.startswith("#"):
            return color.lower()
    return "#e11912" if carrier_number in {1, 3} else "#f6f5ee"


def polyester_display_color(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    """Normalize near-white/red UI colors to clean opaque textile pigments."""
    r, g, b = rgb
    if min(rgb) > 0.88 and max(rgb) - min(rgb) < 0.10:
        return hex_color("#f2f4f7")
    if r > 0.65 and g < 0.22 and b < 0.20:
        return hex_color("#d60c18")
    return rgb


def tune_live_polyester(material: bpy.types.Material) -> None:
    """Keep fibers opaque while adding controlled satin/polyester response."""
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf is not None:
        gate.set_input(bsdf, "Roughness", 0.32)
        gate.set_input(bsdf, "Specular IOR Level", 0.055)
        gate.set_input(bsdf, "Anisotropic", 0.88)
        gate.set_input(bsdf, "Anisotropic Rotation", 0.25)
        gate.set_input(bsdf, "Transmission Weight", 0.0)
        gate.set_input(bsdf, "Subsurface Weight", 0.025)
        gate.set_input(bsdf, "Subsurface Scale", 0.035)
        gate.set_input(bsdf, "Subsurface Radius", (0.10, 0.05, 0.03))
        gate.set_input(bsdf, "Sheen Roughness", 0.34)

    hair = next(
        (node for node in nodes if node.bl_idname == "ShaderNodeBsdfHairPrincipled"),
        None,
    )
    if hair is not None:
        gate.set_input(hair, "Roughness", 0.30)
        gate.set_input(hair, "Radial Roughness", 0.42)
        gate.set_input(hair, "Secondary Reflection", 0.10)
        gate.set_input(hair, "Transmission", 0.0)


def create_carrier(carrier_number: int, family_direction: int, family_index: int,
                   material: bpy.types.Material) -> bpy.types.Object:
    rng = random.Random(8300 + carrier_number * 97)
    family_label = "S" if family_direction > 0 else "Z"
    name = f"Carrier {carrier_number:02d} {family_label}"
    curves = bpy.data.hair_curves.new(name + " native fibers")
    curves.materials.append(material)
    total = RENDER_CURVES_PER_CARRIER
    curves.add_curves([SAMPLE_COUNT] * total)

    positions = [0.0] * (total * SAMPLE_COUNT * 3)
    render_radius = (
        RENDER_MICROFILAMENT_RADIUS_UM / 1000.0 * EQUIVALENT_RADIUS_SCALE
    )
    radii = [render_radius] * (total * SAMPLE_COUNT)
    point_cursor = 0

    family_count = FAMILY_COUNT
    phase0 = math.pi + math.tau * family_index / family_count
    angle = ANGLE_RADIANS
    base_radius = BASE_RADIUS
    helix_rate = HELIX_RATE
    end_rows = END_ROWS
    end_columns = END_COLUMNS
    bundle_layers = []
    bundle_recesses = []
    bundle_contacts = []
    for x in SAMPLE_XS:
        crossing_phase = (
            family_count * helix_rate * x
            + family_direction * family_count * phase0
        ) / CROSSING_SPAN
        layer_profile = saturated_layer_profile(math.cos(crossing_phase))
        bundle_layers.append(family_direction * LAYER_AMPLITUDE * layer_profile)
        bundle_recesses.append(
            TRANSITION_RECESS * (1.0 - layer_profile * layer_profile)
        )
        bundle_contacts.append(abs(layer_profile) ** 8)

    # Compute one continuous layer profile per carrier. Every filament in this
    # carrier consumes the same profile, so the bundle crosses as one body.
    for end_index in range(PHYSICS.yarn_ends_per_carrier):
        layer_index = 0
        column = end_index
        across_center = (column - (end_columns - 1) / 2.0) * END_COLUMN_PITCH
        outward_center = (layer_index - (end_rows - 1) / 2.0) * END_ROW_PITCH
        end_phase = rng.random() * math.tau
        disk_points = gate.fibonacci_disk(RENDER_MICROFILAMENTS_PER_END, end_phase)

        for filament_index, (disk_across, disk_outward) in enumerate(disk_points):
            phase = end_phase + filament_index * 0.61803398875
            for sample, x in enumerate(SAMPLE_XS):
                # Keep the internal fiber motion periodic on the production
                # repeat while evaluating padded geometry outside both crop
                # edges. Oblique bundles can then cross the seam continuously.
                u = (x + LENGTH / 2.0) / LENGTH
                theta = phase0 + family_direction * helix_rate * x

                internal_twist = -math.tau * x / 10.5 + phase * 0.05
                cos_twist = math.cos(internal_twist)
                sin_twist = math.sin(internal_twist)
                local_across = (
                    disk_across * cos_twist - disk_outward * sin_twist
                ) * END_PROFILE_HALF_WIDTH
                local_outward = (
                    disk_across * sin_twist + disk_outward * cos_twist
                ) * END_PROFILE_HALF_HEIGHT
                migration = math.sin(math.tau * u * 1.7 + phase) * 0.007
                irregular = math.sin(
                    math.tau * u * (5.0 + (filament_index % 7) * 0.11) + phase
                )

                uncompressed_across = across_center + local_across + migration
                layer_wave = bundle_layers[sample]
                transition_recess = bundle_recesses[sample]
                contact = bundle_contacts[sample]
                compression_amount = (
                    UPPER_COMPRESSION if layer_wave >= 0.0 else LOWER_COMPRESSION
                )
                compression = 1.0 - compression_amount * contact
                # The complete carrier receives one small, smooth contact
                # spread. This is deliberately far below the old 25% expansion
                # that produced a transverse roof at every crossing.
                across = uncompressed_across * (1.0 + LATERAL_CONTACT_SPREAD * contact)
                outward = (
                    (outward_center + local_outward) * compression
                    + irregular * 0.0015
                )
                radius = base_radius + layer_wave - transition_recess + outward

                sin_theta = math.sin(theta)
                cos_theta = math.cos(theta)
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
    return obj


def main() -> None:
    gate.reset_scene()
    gate.configure_render()
    scene = bpy.context.scene
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 96
    scene.cycles.max_bounces = 4
    scene.render.filepath = str(OUTPUT_PATH)

    material_cache: dict[str, bpy.types.Material] = {}
    family_indices = {1: 0, -1: 0}
    for carrier_number in range(1, PHYSICS.carrier_count + 1):
        direction = 1 if carrier_number % 2 else -1
        if FLIP:
            direction *= -1
        family_index = family_indices[direction]
        family_indices[direction] += 1
        color_hex = carrier_color(carrier_number)
        material = material_cache.get(color_hex)
        if material is None:
            rgb = polyester_display_color(hex_color(color_hex))
            lightness = max(rgb)
            # Keep the accepted fiber geometry, but let the highlights spread
            # along the polyester tangent instead of forming a hard hot spot.
            roughness = 0.32
            sheen = 0.92 if lightness > 0.75 else 0.88
            material = gate.polyester_material(
                f"Opaque HT polyester {color_hex}", rgb, roughness, sheen
            )
            tune_live_polyester(material)
            material_cache[color_hex] = material
        create_carrier(carrier_number, direction, family_index, material)

    camera = gate.add_studio()
    # The proof studio uses short macro lights. Repeating that render over one
    # metre repeated their hot spots and left most of the rope grey. Replace
    # them with strip softboxes longer than the complete physical repeat.
    for obj in list(scene.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    target = (0.0, 0.0, Z_SHIFT)
    studio_length = max(120.0, GEOMETRY_LENGTH * 1.35)
    gate.add_area(
        "Long textile softbox", (0.0, -18.0, Z_SHIFT + 16.0), 2650.0,
        studio_length * 1.08, (1.0, 0.985, 0.955), target=target,
        size_y=18.0,
    )
    gate.add_area(
        "Wide front silk fill", (0.0, -16.0, Z_SHIFT + 4.0), 760.0,
        studio_length * 1.08, (1.0, 1.0, 1.0), target=target,
        size_y=16.0,
    )
    gate.add_area(
        "Soft top fiber sheen", (0.0, -3.0, Z_SHIFT + 22.0), 1420.0,
        studio_length * 1.12, (0.965, 0.98, 1.0), target=target,
        size_y=10.0,
    )
    world_background = scene.world.node_tree.nodes.get("Background")
    if world_background is not None:
        world_background.inputs["Color"].default_value = (0.96, 0.965, 0.97, 1.0)
        world_background.inputs["Strength"].default_value = 0.88
    scene.cycles.sample_clamp_indirect = 10.0
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.30
    floor = bpy.data.objects.get("Studio floor")
    if floor is not None:
        floor.location.z = 0.0
    for obj in bpy.context.scene.objects:
        if obj.type == "LIGHT":
            gate.look_at(obj, target)
    camera_distance = max(38.0, ROPE_DIAMETER * 2.75)
    camera_view_scale = 1.0
    render_aspect = scene.render.resolution_x / scene.render.resolution_y
    ortho_scale = max(
        50.0 * render_aspect,
        ROPE_DIAMETER * 1.35 * render_aspect,
        LENGTH * 1.06,
    )
    gate.render_view(camera, OUTPUT_PATH, (0.0, -camera_distance, Z_SHIFT + 11.5), target, ortho_scale)

    metadata = asdict(PHYSICS)
    metadata.update({
        "physical_microfilaments_total": PHYSICAL_CURVES_TOTAL,
        "rendered_curve_total": RENDER_CURVES_TOTAL,
        "representative_fiber_ratio": RENDER_RATIO,
        "denier_geometry_calibration": DENIER_GEOMETRY_CALIBRATION,
        "render_microfilament_radius_um": RENDER_MICROFILAMENT_RADIUS_UM,
        "render_denier_per_microfilament": (
            PHYSICS.denier_per_microfilament * DENIER_GEOMETRY_CALIBRATION
        ),
        "s_carriers": PHYSICS.carrier_count // 2,
        "z_carriers": PHYSICS.carrier_count // 2,
        "crossing_mode": CROSSING_MODE,
        "crossing_span": CROSSING_SPAN,
        "strand_width_scale": WIDTH_SCALE,
        "upper_compression": UPPER_COMPRESSION,
        "lower_compression": LOWER_COMPRESSION,
        "lateral_contact_spread": LATERAL_CONTACT_SPREAD,
        "exact_yarn_end_count": YARN_ENDS,
        "yarn_end_rows": END_ROWS,
        "yarn_end_columns": END_COLUMNS,
        "yarn_end_profile_aspect_ratio": YARN_END_ASPECT_RATIO,
        "yarn_end_profile_width_mm": END_PROFILE_HALF_WIDTH * 2.0,
        "yarn_end_profile_height_mm": END_PROFILE_HALF_HEIGHT * 2.0,
        "bundle_thickness_mm": BUNDLE_THICKNESS,
        "layer_amplitude_mm": LAYER_AMPLITUDE,
        "transition_recess_mm": TRANSITION_RECESS,
        "crossing_spacing_mm": CROSSING_SPACING,
        "contact_half_length_mm": CONTACT_HALF_LENGTH,
        "layer_control": "volumetric_yarn_end_bundle",
        "curve_sample_count": SAMPLE_COUNT,
        "carrier_shell_meshes": 0,
        "repeat_length_mm": LENGTH,
        "geometry_padding_mm": GEOMETRY_PADDING,
        "geometry_length_mm": GEOMETRY_LENGTH,
        "helix_period_mm": HELIX_PERIOD,
        "repeat_period_count": PERIOD_COUNT,
        "internal_twist_turns": INTERNAL_TWIST_TURNS,
        "ortho_scale_mm": ortho_scale,
        "render_aspect": render_aspect,
        "camera_view_scale": camera_view_scale,
        "render": str(OUTPUT_PATH),
    })
    OUTPUT_PATH.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
