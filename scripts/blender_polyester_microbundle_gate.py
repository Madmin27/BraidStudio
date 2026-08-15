"""Render Gate 2: one physically parameterized polyester carrier bundle.

The proof deliberately contains no carrier shell, ribbon mesh, or texture-only
fiber lines. Every visible longitudinal element is a curve generated from the
denier-derived PET microfilament radius.
"""

from __future__ import annotations

from dataclasses import asdict
import json
import math
import os
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from polyester_physics import carrier_physics  # noqa: E402


ROOT = SCRIPT_DIR.parent
PROOF_DIR = ROOT / "proofs" / "microbundle-gate"
PROOF_DIR.mkdir(parents=True, exist_ok=True)

YARN_ENDS = int(os.getenv("BRAID_YARN_ENDS", "20"))
DENIER_PER_END = float(os.getenv("BRAID_DENIER_PER_END", "1000"))
TARGET_DPF = float(os.getenv("BRAID_TARGET_DPF", "2.25"))
ROPE_DIAMETER = float(os.getenv("BRAID_ROPE_DIAMETER", "16"))
CARRIER_COUNT = int(os.getenv("BRAID_CARRIER_COUNT", "16"))
BRAID_ANGLE = float(os.getenv("BRAID_ANGLE", "34"))
SEED = int(os.getenv("BRAID_RENDER_SEED", "1641300"))

RENDER_MODE = os.getenv("BRAID_GATE_RENDER_MODE", "both")
GATE_COLOR = os.getenv("BRAID_GATE_COLOR", "white").lower()
COLOR_SUFFIX = "red" if GATE_COLOR == "red" else "white"
FULL_PATH = PROOF_DIR / f"polyester-carrier-20x1000D-v7-{COLOR_SUFFIX}.png"
MACRO_PATH = PROOF_DIR / f"polyester-carrier-20x1000D-v7-{COLOR_SUFFIX}-macro.png"
BLEND_PATH = PROOF_DIR / f"polyester-carrier-20x1000D-v7-{COLOR_SUFFIX}.blend"
META_PATH = PROOF_DIR / f"polyester-carrier-20x1000D-v7-{COLOR_SUFFIX}.json"


physics = carrier_physics(
    rope_diameter_mm=ROPE_DIAMETER,
    carrier_count=CARRIER_COUNT,
    yarn_ends_per_carrier=YARN_ENDS,
    denier_per_yarn_end=DENIER_PER_END,
    braid_angle_degrees=BRAID_ANGLE,
    target_dpf=TARGET_DPF,
)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.curves, bpy.data.hair_curves, bpy.data.meshes,
                       bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def set_input(node, name: str, value) -> None:
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def polyester_material(name: str, color, roughness: float, sheen: float):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*color, 1.0)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    output = nodes.get("Material Output")
    set_input(bsdf, "Base Color", (*color, 1.0))
    set_input(bsdf, "Metallic", 0.0)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "IOR", 1.54)
    set_input(bsdf, "Specular IOR Level", 0.08)
    set_input(bsdf, "Anisotropic", 0.86)
    set_input(bsdf, "Transmission Weight", 0.0)
    set_input(bsdf, "Coat Weight", 0.0)
    set_input(bsdf, "Sheen Weight", sheen)
    set_input(bsdf, "Sheen Roughness", 0.42)
    set_input(bsdf, "Sheen Tint", (1.0, 0.995, 0.98, 1.0))

    geometry = nodes.new("ShaderNodeNewGeometry")
    links.new(geometry.outputs["Tangent"], bsdf.inputs["Tangent"])

    hair = nodes.new("ShaderNodeBsdfHairPrincipled")
    hair.parametrization = "COLOR"
    set_input(hair, "Color", (*color, 1.0))
    set_input(hair, "Roughness", 0.32)
    set_input(hair, "Radial Roughness", 0.42)
    set_input(hair, "Coat", 0.05)
    set_input(hair, "IOR", 1.54)
    set_input(hair, "Random Roughness", 0.08)
    set_input(hair, "Reflection", 1.0)
    set_input(hair, "Transmission", 0.0)
    set_input(hair, "Secondary Reflection", 0.12)

    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.10
    links.new(bsdf.outputs["BSDF"], mix.inputs[1])
    links.new(hair.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def fibonacci_disk(count: int, phase: float):
    golden = math.pi * (3.0 - math.sqrt(5.0))
    points = []
    for index in range(count):
        radius = math.sqrt((index + 0.42) / count)
        theta = index * golden + phase
        points.append((radius * math.cos(theta), radius * math.sin(theta)))
    return points


def add_bundle() -> bpy.types.Object:
    rng = random.Random(SEED)
    curve = bpy.data.hair_curves.new("PET carrier - native microfiber curves")

    if GATE_COLOR == "red":
        materials = [polyester_material("PET red satin", (0.72, 0.012, 0.008), 0.37, 0.92)]
    else:
        materials = [polyester_material("PET white satin", (0.93, 0.925, 0.90), 0.40, 0.88)]
    curve.materials.append(materials[0])

    length = 26.0
    sample_count = 52
    end_rows = 3 if YARN_ENDS % 3 == 0 else 2
    end_columns = math.ceil(YARN_ENDS / end_rows)
    end_width = physics.carrier_width_mm / end_columns
    end_height = physics.carrier_thickness_mm / end_rows
    filament_count = physics.microfilaments_per_yarn_end

    total_filaments = physics.total_microfilaments_per_carrier
    curve.add_curves([sample_count] * total_filaments)
    positions = [0.0] * (total_filaments * sample_count * 3)
    radii = [physics.microfilament_radius_um / 1000.0] * (total_filaments * sample_count)
    point_cursor = 0

    for end_index in range(YARN_ENDS):
        layer = end_index % end_rows
        column = end_index // end_rows
        y_center = (column - (end_columns - 1) / 2.0) * end_width
        z_center = (layer - (end_rows - 1) / 2.0) * end_height * 0.94
        end_phase = rng.random() * math.tau
        points = fibonacci_disk(filament_count, end_phase)

        for filament_index, (disk_y, disk_z) in enumerate(points):
            phase = end_phase + filament_index * 0.61803398875

            for sample in range(sample_count):
                u = sample / (sample_count - 1)
                x = (u - 0.5) * length

                # Each yarn end contains a coherent S-twisted microfiber bundle.
                twist = -math.tau * x / 10.5 + phase * 0.05
                cos_t = math.cos(twist)
                sin_t = math.sin(twist)
                rotated_y = (disk_y * cos_t - disk_z * sin_t) * end_width * 0.55
                rotated_z = (disk_y * sin_t + disk_z * cos_t) * end_height * 0.54
                migration = math.sin(math.tau * u * 1.7 + phase) * 0.008
                irregular = math.sin(math.tau * u * (5.0 + (filament_index % 7) * 0.11) + phase)
                end_wave = math.sin(math.tau * u * 0.7 + end_phase) * 0.018
                y = y_center + rotated_y + migration + irregular * 0.0028
                z = z_center + rotated_z + end_wave + irregular * 0.0018
                coordinate_cursor = point_cursor * 3
                positions[coordinate_cursor:coordinate_cursor + 3] = (x, y, z)
                point_cursor += 1

    curve.attributes["position"].data.foreach_set("vector", positions)
    radius_attribute = curve.attributes.new("radius", "FLOAT", "POINT")
    radius_attribute.data.foreach_set("value", radii)
    curve.update_tag()

    obj = bpy.data.objects.new("20x1000D PET carrier", curve)
    bpy.context.collection.objects.link(obj)
    return obj


def look_at(obj: bpy.types.Object, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, color, target=(0, 0, 0), shape="RECTANGLE", size_y=8.0):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = shape
    data.size = size
    if shape == "RECTANGLE":
        data.size_y = size_y
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def add_studio() -> bpy.types.Object:
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.82, 0.835, 0.84, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

    add_area("Large softbox", (-5.0, -10.0, 18.0), 1250.0, 22.0,
             (1.0, 0.975, 0.93), size_y=10.0)
    add_area("Broad satin fill", (3.0, -1.0, 11.0), 360.0, 24.0,
             (0.93, 0.97, 1.0), size_y=5.5)
    add_area("Front fill", (0.0, -13.0, 4.0), 680.0, 18.0,
             (1.0, 1.0, 1.0), size_y=5.0)
    add_area("Edge strip", (7.0, 4.0, 8.0), 520.0, 18.0,
             (1.0, 0.88, 0.78), size_y=1.2)

    floor_mat = bpy.data.materials.new("Neutral studio floor")
    floor_mat.use_nodes = True
    floor_bsdf = floor_mat.node_tree.nodes["Principled BSDF"]
    set_input(floor_bsdf, "Base Color", (0.68, 0.70, 0.705, 1.0))
    set_input(floor_bsdf, "Roughness", 0.72)
    bpy.ops.mesh.primitive_plane_add(size=120.0, location=(0.0, 0.0, -1.35))
    floor = bpy.context.object
    floor.name = "Studio floor"
    floor.data.materials.append(floor_mat)

    camera_data = bpy.data.cameras.new("Macro camera")
    camera = bpy.data.objects.new("Macro camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.lens = 85.0
    bpy.context.scene.camera = camera
    return camera


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 3
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 675
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 20
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0


def render_view(camera, path: Path, location, target, ortho_scale: float) -> None:
    camera.location = location
    camera.data.ortho_scale = ortho_scale
    look_at(camera, target)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    reset_scene()
    configure_render()
    add_bundle()
    camera = add_studio()

    if RENDER_MODE in {"both", "full"}:
        render_view(camera, FULL_PATH, (1.0, -13.0, 21.0), (0.0, 0.0, 0.0), 16.5)
    if RENDER_MODE in {"both", "macro"}:
        render_view(camera, MACRO_PATH, (2.0, -8.0, 13.0), (1.5, 0.0, 0.0), 7.5)

    metadata = asdict(physics)
    metadata.update({
        "rendered_microfilaments": physics.total_microfilaments_per_carrier,
        "carrier_shell_meshes": 0,
        "fiber_geometry": (
            f"{physics.total_microfilaments_per_carrier} native Hair Curves "
            "with denier-derived point radius"
        ),
        "full_render": str(FULL_PATH),
        "macro_render": str(MACRO_PATH),
    })
    META_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
