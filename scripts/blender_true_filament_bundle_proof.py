import bpy
import json
import math
import os
import random
from mathutils import Vector, noise


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILAMENT_COUNT = int(os.environ.get("BRAID_FILAMENT_COUNT", "30"))
DENIER = float(os.environ.get("BRAID_DENIER", "1300"))
WIDTH_SCALE = float(os.environ.get("BRAID_WIDTH_SCALE", "1.0"))
OUTPUT = os.environ.get(
    "BRAID_TRUE_BUNDLE_OUTPUT",
    os.path.join(
        ROOT,
        "proofs",
        f"polyester-true-bundle-{FILAMENT_COUNT}f-{int(DENIER)}d-v2.png",
    ),
)
BLEND_OUTPUT = os.path.splitext(OUTPUT)[0] + ".blend"
COUNT_OUTPUT = os.path.splitext(OUTPUT)[0] + "-cross-section.png"

LENGTH = 5.4
S_TWIST_DEGREES = 8.0
REFERENCE_DENIER = 1300.0
REFERENCE_RADIUS = 0.0285
SAMPLES = 150


def clamp(value, low, high):
    return max(low, min(high, value))


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_polyester_hair_material():
    material = bpy.data.materials.new("1300D polyester filament scattering")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    hair = nodes.new("ShaderNodeBsdfHairPrincipled")
    hair.parametrization = "COLOR"
    hair.inputs["Color"].default_value = (0.91, 0.94, 0.985, 1)
    hair.inputs["Roughness"].default_value = 0.20
    hair.inputs["Radial Roughness"].default_value = 0.31
    hair.inputs["Coat"].default_value = 0.30
    hair.inputs["IOR"].default_value = 1.54

    glint = nodes.new("ShaderNodeBsdfAnisotropic")
    glint.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1)
    glint.inputs["Roughness"].default_value = 0.12
    glint.inputs["Anisotropy"].default_value = 0.85

    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.08
    links.new(hair.outputs[0], mix.inputs[1])
    links.new(glint.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs[0])
    return material


def grid_dimensions(count):
    rows = max(2, round(math.sqrt(count / 3.2)))
    columns = math.ceil(count / rows)
    return rows, columns


def packed_offsets(count, radius, width_scale):
    rows, columns = grid_dimensions(count)
    x_pitch = radius * 1.88 * width_scale
    y_pitch = radius * 1.78
    raw = []
    remaining = count
    for row in range(rows):
        rows_left = rows - row
        row_count = math.ceil(remaining / rows_left)
        remaining -= row_count
        stagger = 0.5 if row % 2 else 0.0
        for column in range(row_count):
            across = (column - (row_count - 1) / 2 + stagger * 0.18) * x_pitch
            depth = (row - (rows - 1) / 2) * y_pitch
            crown = math.sqrt(max(0.0, 1.0 - (across / max(x_pitch * columns * 0.55, 1e-6)) ** 2))
            depth += crown * radius * 0.22
            raw.append((across, depth))
    return raw[:count], rows, columns


def bundle_center(t):
    x = -LENGTH / 2 + LENGTH * t
    perlin = noise.noise_vector(
        Vector((t * 2.7 + 0.71, 0.0, 0.0)),
        noise_basis="PERLIN_ORIGINAL",
    )
    return Vector((x, perlin.y * 0.006, perlin.z * 0.008))


def build_filament_bundle(material):
    denier_scale = math.sqrt(DENIER / REFERENCE_DENIER)
    filament_radius = REFERENCE_RADIUS * denier_scale
    offsets, rows, columns = packed_offsets(FILAMENT_COUNT, filament_radius, WIDTH_SCALE)
    max_across = max(abs(offset[0]) for offset in offsets) + filament_radius
    max_depth = max(abs(offset[1]) for offset in offsets) + filament_radius
    effective_bundle_radius = (max_across + max_depth) * 0.5
    turns = LENGTH * math.tan(math.radians(S_TWIST_DEGREES)) / (2 * math.pi * effective_bundle_radius)

    curve = bpy.data.curves.new("Exact packed polyester filament bundle", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = filament_radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    curve.materials.append(material)

    random.seed(1300 + FILAMENT_COUNT)
    for filament, (base_across, base_depth) in enumerate(offsets):
        spline = curve.splines.new("NURBS")
        spline.points.add(SAMPLES - 1)
        spline.order_u = 4
        spline.use_endpoint_u = True
        phase_jitter = random.uniform(-0.012, 0.012)
        diameter_jitter = random.uniform(0.965, 1.035)
        for sample, point in enumerate(spline.points):
            t = sample / (SAMPLES - 1)
            center = bundle_center(t)
            twist = t * math.pi * 2 * turns + phase_jitter
            cos_twist = math.cos(twist)
            sin_twist = math.sin(twist)
            across = base_across * cos_twist - base_depth * sin_twist
            depth = base_across * sin_twist + base_depth * cos_twist
            micro = noise.noise_vector(
                Vector((t * 8.0 + filament * 0.37, filament * 0.19, 0.0)),
                noise_basis="PERLIN_ORIGINAL",
            )
            across += micro.y * filament_radius * 0.045
            depth += micro.z * filament_radius * 0.045
            point.co = (center.x, center.y + depth, center.z + across, 1.0)
            point.radius = diameter_jitter

    obj = bpy.data.objects.new("30F packed polyester yarn block", curve)
    bpy.context.collection.objects.link(obj)
    return {
        "object": obj,
        "filament_radius": filament_radius,
        "rows": rows,
        "columns": columns,
        "bundle_width": max_across * 2,
        "bundle_depth": max_depth * 2,
        "twist_turns": turns,
    }


def add_area(name, location, energy, size, color, target=(0, 0, 0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size * 0.28
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    look_at(obj, target)


assert 8 <= FILAMENT_COUNT <= 40
assert 300 <= DENIER <= 3000
assert 0.8 <= WIDTH_SCALE <= 1.9

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bundle = build_filament_bundle(make_polyester_hair_material())

bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, -0.54))
floor = bpy.context.object
floor_material = bpy.data.materials.new("Neutral fiber inspection floor")
floor_material.use_nodes = True
floor_surface = floor_material.node_tree.nodes.get("Principled BSDF")
floor_surface.inputs["Base Color"].default_value = (0.050, 0.058, 0.068, 1)
floor_surface.inputs["Roughness"].default_value = 0.80
floor.data.materials.append(floor_material)

world = bpy.context.scene.world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.025, 0.031, 0.039, 1)
background.inputs["Strength"].default_value = 0.11

add_area("Long polyester key", (-0.8, -3.4, 5.0), 260, 6.2, (1.0, 0.96, 0.91))
add_area("Cool filament fill", (2.8, 3.2, 2.8), 210, 4.8, (0.76, 0.86, 1.0))
add_area("Silk rim", (-3.2, 1.2, 3.6), 180, 3.8, (1.0, 0.84, 0.72))
add_area("Long glint", (0.8, -2.8, 3.3), 110, 3.6, (1.0, 0.99, 0.96))

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (5.7, -8.8, 2.5)
camera_data.lens = 60
look_at(camera, (0.0, 0.0, -0.02))

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 480
scene.cycles.use_denoising = False
scene.cycles.pixel_filter_type = "BLACKMAN_HARRIS"
scene.cycles.filter_width = 1.6
scene.render.resolution_x = 1400
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUTPUT
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUTPUT)
bpy.ops.render.render(write_still=True)

camera.location = (LENGTH / 2 + 2.8, 0.0, 0.0)
camera_data.lens = 82
look_at(camera, (LENGTH / 2 - 0.12, 0.0, 0.0))
scene.render.resolution_x = 800
scene.render.resolution_y = 800
scene.render.filepath = COUNT_OUTPUT
bpy.ops.render.render(write_still=True)

print(json.dumps({
    "output": OUTPUT,
    "cross_section_output": COUNT_OUTPUT,
    "blend": BLEND_OUTPUT,
    "representation": "no shell; exact packed continuous filament curves",
    "filament_count": FILAMENT_COUNT,
    "denier": DENIER,
    "width_scale": WIDTH_SCALE,
    "filament_radius": bundle["filament_radius"],
    "packing_rows": bundle["rows"],
    "packing_columns": bundle["columns"],
    "bundle_width": bundle["bundle_width"],
    "bundle_depth": bundle["bundle_depth"],
    "s_twist_degrees": S_TWIST_DEGREES,
    "twist_turns": bundle["twist_turns"],
}))
