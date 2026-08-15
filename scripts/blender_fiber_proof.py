import bpy
import json
import math
import os
import random
import sys
from mathutils import Vector


INPUT = os.environ.get("BRAID_FIBER_INPUT", "/tmp/braidstudio-fiber-proof.json")
OUTPUT = os.environ.get("BRAID_FIBER_OUTPUT", "/tmp/braidstudio-fiber-proof.png")


def rgb(hex_color):
    value = hex_color.lstrip("#")
    return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)) + (1,)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def hair_material(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    hair = nodes.new("ShaderNodeBsdfHairPrincipled")
    hair.parametrization = "COLOR"
    hair.inputs["Color"].default_value = rgb(color)
    hair.inputs["Roughness"].default_value = 0.20
    hair.inputs["Radial Roughness"].default_value = 0.32
    hair.inputs["Coat"].default_value = 0.28
    hair.inputs["IOR"].default_value = 1.53
    material.node_tree.links.new(hair.outputs[0], output.inputs[0])
    return material


def make_curve(name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 2
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for item, point in zip(spline.points, points):
        item.co = (*point, 1)
    spline.order_u = min(3, len(points))
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def fiber_points(path, across, depth, phase, radius):
    result = []
    for index, raw in enumerate(path):
        center = Vector((raw["x"], raw["y"], raw["z"]))
        before = path[max(0, index - 1)]
        after = path[min(len(path) - 1, index + 1)]
        tangent = Vector((after["x"] - before["x"], after["y"] - before["y"], after["z"] - before["z"])).normalized()
        radial = Vector((0, center.y, center.z)).normalized()
        lateral = radial.cross(tangent).normalized()
        outward = tangent.cross(lateral).normalized()
        if outward.dot(radial) < 0:
            outward.negate()
        micro = math.sin(index * 0.44 + phase) * radius * 0.12
        point = center + lateral * across + outward * (depth + micro)
        result.append(point)
    return result


def add_area(name, location, energy, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    look_at(obj, (0, 0, 0))


with open(INPUT, "r", encoding="utf-8") as handle:
    data = json.load(handle)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

materials = {}
filament_count = 20
bundle_width = data["yarnWidth"] * data["diameterScale"] * 0.93
bundle_depth = data["yarnThickness"] * data["diameterScale"]
columns = 10
rows = 2
fiber_radius = bundle_width / (columns * 2) * 1.01
random.seed(12)

for yarn_index, yarn in enumerate(data["yarns"]):
    color = yarn["color"]
    if color not in materials:
        materials[color] = hair_material("Polyester " + color, color)
    for filament in range(filament_count):
        column = filament % columns
        row = filament // columns
        across = (column - (columns - 1) / 2) * fiber_radius * 1.94
        crown = math.sqrt(max(0, 1 - (across / (bundle_width * 0.52)) ** 2))
        depth = bundle_depth * 0.42 + row * fiber_radius * 1.62 + crown * bundle_depth * 0.14
        jitter = (random.random() - 0.5) * fiber_radius * 0.035
        points = fiber_points(yarn["fiberPath"], across + jitter, depth, filament * 0.71, fiber_radius)
        make_curve(f"Y{yarn_index:02d}_F{filament:02d}", points, fiber_radius, materials[color])

# Soft core only fills the microscopic voids; it never defines the visible braid.
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=data["radius"] * 0.90, depth=data["length"] * 1.01, location=(0, 0, 0), rotation=(0, math.pi / 2, 0))
core = bpy.context.object
core_mat = bpy.data.materials.new("Core")
core_mat.diffuse_color = (0.64, 0.66, 0.64, 1)
core_mat.roughness = 0.9
core.data.materials.append(core_mat)

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -data["radius"] * 1.28))
floor = bpy.context.object
floor_mat = bpy.data.materials.new("Floor")
floor_mat.diffuse_color = (0.72, 0.73, 0.72, 1)
floor_mat.roughness = 0.72
floor.data.materials.append(floor_mat)

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.74, 0.76, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.48

add_area("Key", (-4.0, -6.0, 8.0), 700, 5.0, (1.0, 0.97, 0.92))
add_area("Fill", (3.0, 5.0, 4.0), 380, 4.0, (0.80, 0.88, 1.0))
add_area("Rim", (5.0, -4.0, 3.0), 460, 3.0, (1.0, 0.95, 0.88))

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (data["length"] * 0.05, -data["radius"] * 11.2, data["radius"] * 2.5)
camera_data.lens = 68
look_at(camera, (0, 0, 0))

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 80
scene.cycles.use_denoising = False
scene.render.resolution_x = 1200
scene.render.resolution_y = 620
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUTPUT
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.resolution_percentage = 100
bpy.ops.wm.save_as_mainfile(filepath="/tmp/braidstudio-fiber-proof.blend")
bpy.ops.render.render(write_still=True)
print(json.dumps({"output": OUTPUT, "filaments": filament_count, "carriers": len({y["carrierNo"] for y in data["yarns"]}), "pieces": len(data["yarns"])}))
