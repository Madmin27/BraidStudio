import bpy
import json
import math
import os
import random
from mathutils import Vector


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get(
    "BRAID_YARN_PROOF_OUTPUT",
    os.path.join(ROOT, "proofs", "polyester-yarn-block-v3.png"),
)
BLEND_OUTPUT = os.path.splitext(OUTPUT)[0] + ".blend"

THREAD_COUNT = 30
MICROFIBERS_PER_THREAD = 5
FILAMENT_COUNT = THREAD_COUNT * MICROFIBERS_PER_THREAD
YARN_LENGTH = 9.6
FILAMENT_RADIUS = 0.0075
LATERAL_STEP = 0.043
VERTICAL_STEP = 0.038
SEED = 4317


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, color, target=(0, 0, 0)):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "RECTANGLE"
    light_data.size = size
    light_data.size_y = size * 0.32
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    bpy.context.collection.objects.link(light)
    look_at(light, target)
    return light


def make_polyester_material():
    material = bpy.data.materials.new("Polyester multifilament - pearl white")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Base Color"].default_value = (0.84, 0.87, 0.92, 1.0)
    surface.inputs["Roughness"].default_value = 0.64
    surface.inputs["IOR"].default_value = 1.54
    surface.inputs["Specular IOR Level"].default_value = 0.34
    surface.inputs["Anisotropic"].default_value = 0.92
    surface.inputs["Coat Weight"].default_value = 0.035
    surface.inputs["Coat Roughness"].default_value = 0.42
    surface.inputs["Sheen Weight"].default_value = 0.98
    surface.inputs["Sheen Roughness"].default_value = 0.41
    surface.inputs["Sheen Tint"].default_value = (0.96, 0.98, 1.0, 1.0)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 92.0
    noise.inputs["Detail"].default_value = 2.0
    noise.inputs["Roughness"].default_value = 0.46
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.006
    material.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    material.node_tree.links.new(bump.outputs["Normal"], surface.inputs["Normal"])
    material.node_tree.links.new(surface.outputs[0], output.inputs[0])
    return material


def make_fiber(name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = 3

    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point_item, point in zip(spline.points, points):
        point_item.co = (*point, 1.0)
        point_item.radius = 0.96 + 0.04 * math.sin(point[0] * 1.37 + len(name))
    spline.order_u = 4
    spline.use_endpoint_u = True

    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def packed_offsets():
    thread_centers = []
    rows = (10, 11, 9)
    for row_index, columns in enumerate(rows):
        y_offset = (row_index - 1) * VERTICAL_STEP
        stagger = 0.5 * LATERAL_STEP if row_index != 1 else 0.0
        for column in range(columns):
            z_offset = (column - (columns - 1) / 2) * LATERAL_STEP + stagger
            thread_centers.append((y_offset, z_offset))

    offsets = []
    micro_radius = 0.0095
    micro_pattern = (
        (0.0, 0.0),
        (-micro_radius, -micro_radius * 0.55),
        (micro_radius, -micro_radius * 0.55),
        (-micro_radius * 0.6, micro_radius * 0.72),
        (micro_radius * 0.6, micro_radius * 0.72),
    )
    for thread_index, (center_y, center_z) in enumerate(thread_centers[:THREAD_COUNT]):
        for micro_index, (micro_y, micro_z) in enumerate(micro_pattern):
            offsets.append((thread_index, micro_index, center_y, center_z, micro_y, micro_z))
    return offsets


def fiber_path(fiber_index, thread_index, micro_index, center_y, center_z, micro_y, micro_z):
    points = []
    phase = fiber_index * 2.3999632297
    count = 72
    for step in range(count):
        t = step / (count - 1)
        x = -YARN_LENGTH / 2 + t * YARN_LENGTH

        # All fibers share the same slow bend, so the bundle remains cohesive.
        shared_y = math.sin((t - 0.12) * math.pi * 1.35) * 0.045
        shared_z = math.sin((t + 0.08) * math.pi * 1.10) * 0.030

        # Small correlated wander breaks perfect CG regularity without splitting the bundle.
        local_y = math.sin(t * math.pi * 4.0 + phase) * 0.0026
        local_z = math.sin(t * math.pi * 3.2 + phase * 0.73) * 0.0022

        # The 30 thread centers remain in one bundle and receive only a slight collective roll.
        bundle_turn = (t - 0.5) * math.radians(12)
        packed_y = center_y * math.cos(bundle_turn) - center_z * math.sin(bundle_turn)
        packed_z = center_y * math.sin(bundle_turn) + center_z * math.cos(bundle_turn)

        # Five microfibers twist around each thread center, producing a real ply highlight.
        ply_turn = t * math.pi * 2 * 6.5 + thread_index * 0.37 + micro_index * 0.08
        ply_y = micro_y * math.cos(ply_turn) - micro_z * math.sin(ply_turn)
        ply_z = micro_y * math.sin(ply_turn) + micro_z * math.cos(ply_turn)
        y = shared_y + packed_y + ply_y + local_y
        z = shared_z + packed_z + ply_z + local_z
        points.append((x, y, z))
    return points


random.seed(SEED)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

material = make_polyester_material()
for filament_index, offset in enumerate(packed_offsets()):
    radius_jitter = 0.94 + random.random() * 0.10
    points = fiber_path(filament_index, *offset)
    make_fiber(
        f"Polyester filament {filament_index + 1:02d}",
        points,
        FILAMENT_RADIUS * radius_jitter,
        material,
    )

# Neutral studio floor gives contact shadow without contaminating the white yarn.
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.57))
floor = bpy.context.object
floor.name = "Neutral studio floor"
floor_material = bpy.data.materials.new("Neutral matte floor")
floor_material.use_nodes = True
floor_bsdf = floor_material.node_tree.nodes.get("Principled BSDF")
floor_bsdf.inputs["Base Color"].default_value = (0.055, 0.063, 0.072, 1)
floor_bsdf.inputs["Roughness"].default_value = 0.72
floor.data.materials.append(floor_material)

world = bpy.context.scene.world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.028, 0.034, 0.043, 1)
background.inputs["Strength"].default_value = 0.13

add_area("Long soft key", (-0.8, -3.4, 5.6), 290, 6.5, (1.0, 0.96, 0.90), (0, 0, 0))
add_area("Cool filament fill", (2.4, 3.1, 2.2), 205, 4.5, (0.72, 0.84, 1.0), (0, 0, 0))
add_area("Silk rim", (-3.8, 1.2, 4.0), 185, 3.2, (1.0, 0.82, 0.66), (-1.2, 0, 0))

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0.25, -7.1, 2.25)
camera_data.lens = 62
look_at(camera, (0, 0, -0.17))

scene = bpy.context.scene
scene.camera = camera
scene.render.resolution_x = 1400
scene.render.resolution_y = 620
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUTPUT
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 256
scene.cycles.use_denoising = False
scene.render.image_settings.color_depth = "8"

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUTPUT)
bpy.ops.render.render(write_still=True)

print(json.dumps({
    "output": OUTPUT,
    "blend": BLEND_OUTPUT,
    "filaments": FILAMENT_COUNT,
    "threads": THREAD_COUNT,
    "microfibers_per_thread": MICROFIBERS_PER_THREAD,
    "filament_radius": FILAMENT_RADIUS,
    "renderer": "Cycles + Principled sheen/anisotropy",
}))
