import bpy
import json
import math
import os
import random
from mathutils import Vector, noise


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get(
    "BRAID_ROPE_PROOF_OUTPUT",
    os.path.join(ROOT, "proofs", "scenario-a-16carrier-v1.png"),
)
BLEND_OUTPUT = os.path.splitext(OUTPUT)[0] + ".blend"

CARRIER_COUNT = 16
FAMILY_COUNT = CARRIER_COUNT // 2
ROPE_RADIUS = 1.0
ROPE_LENGTH = 10.8
BRAID_ANGLE_DEGREES = 34.0
YARN_HALF_WIDTH = 0.395
YARN_HALF_DEPTH = 0.105
LAYER_LIFT = 0.061
CROSSING_FLATTEN = 0.08
RINGS = 184
SIDES = 20
SURFACE_FIBERS = 56
FIBER_TWIST_DEGREES = 8.0
MACRO_PLY_COUNT = 4
BLACK_CARRIERS = {1, 9}

WHITE = (0.86, 0.89, 0.94, 1.0)
BLACK = (0.008, 0.010, 0.014, 1.0)


def clamp(value, low, high):
    return max(low, min(high, value))


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def superellipse_component(value, power=2.55):
    return math.copysign(abs(value) ** (2.0 / power), value)


def carrier_spec(carrier_no):
    clockwise = carrier_no % 2 == 1
    family_index = (carrier_no - 1) // 2
    return {
        "carrier_no": carrier_no,
        "direction": 1 if clockwise else -1,
        "direction_name": "CW" if clockwise else "CCW",
        "family_index": family_index,
        "phase": family_index * math.pi * 2 / FAMILY_COUNT,
        "color": BLACK if carrier_no in BLACK_CARRIERS else WHITE,
        "color_name": "black" if carrier_no in BLACK_CARRIERS else "white",
    }


def crossing_state(spec, x, omega):
    family_index = spec["family_index"]
    phase = spec["phase"]
    if spec["direction"] > 0:
        crossing_progress = (2 * omega * x + phase) * FAMILY_COUNT / (2 * math.pi)
        schedule_progress = crossing_progress + family_index
        family_sign = 1.0
    else:
        crossing_progress = (2 * omega * x - phase) * FAMILY_COUNT / (2 * math.pi)
        schedule_progress = -crossing_progress + family_index
        family_sign = -1.0

    twill_wave = math.sin(math.pi * 0.5 * (schedule_progress + 0.5))
    layer = family_sign * math.tanh(2.35 * twill_wave)
    distance_to_crossing = abs(crossing_progress - round(crossing_progress))
    contact = math.exp(-((distance_to_crossing / 0.21) ** 2))
    return layer, contact


def radius_variation(carrier_no, t):
    sample = noise.noise_vector(
        Vector((t * 3.1 + carrier_no * 0.83, carrier_no * 0.17, 0.0)),
        noise_basis="PERLIN_ORIGINAL",
    )[0]
    return 1.0 + sample * 0.025


def macro_ply_scale(t, section_angle, direction):
    phase = section_angle * MACRO_PLY_COUNT - direction * t * math.pi * 2 * 0.72
    return 1.0 + math.cos(phase) * 0.018


def build_carrier_samples(spec):
    alpha = math.radians(BRAID_ANGLE_DEGREES)
    omega = math.tan(alpha) / ROPE_RADIUS
    samples = []
    for ring in range(RINGS + 1):
        t = ring / RINGS
        x = -ROPE_LENGTH / 2 + ROPE_LENGTH * t
        theta = spec["phase"] + spec["direction"] * omega * x
        layer, contact = crossing_state(spec, x, omega)
        radial_center = ROPE_RADIUS + LAYER_LIFT * layer
        center = Vector((
            x,
            math.cos(theta) * radial_center,
            math.sin(theta) * radial_center,
        ))
        radial = Vector((0.0, math.cos(theta), math.sin(theta)))
        tangent = Vector((
            1.0,
            -spec["direction"] * omega * math.sin(theta) * radial_center,
            spec["direction"] * omega * math.cos(theta) * radial_center,
        )).normalized()
        lateral = radial.cross(tangent).normalized()
        samples.append({
            "t": t,
            "x": x,
            "theta": theta,
            "center": center,
            "radial": radial,
            "tangent": tangent,
            "lateral": lateral,
            "contact": contact,
            "layer": layer,
            "radius_scale": radius_variation(spec["carrier_no"], t),
        })
    return samples


def section_axes(sample, section_angle, direction):
    contact = sample["contact"]
    width = YARN_HALF_WIDTH * (1.0 + CROSSING_FLATTEN * 0.42 * contact)
    depth = YARN_HALF_DEPTH * (1.0 - CROSSING_FLATTEN * contact)
    ply = macro_ply_scale(sample["t"], section_angle, direction)
    scale = sample["radius_scale"] * ply
    return width * scale, depth * scale


def build_yarn_mesh(spec, samples):
    vertices = []
    uvs = []
    faces = []
    for sample in samples:
        for side in range(SIDES):
            angle = side / SIDES * math.pi * 2
            c = superellipse_component(math.cos(angle))
            s = superellipse_component(math.sin(angle))
            width, depth = section_axes(sample, angle, spec["direction"])
            silhouette = (
                math.sin(sample["t"] * math.pi * 2 * 43 + angle * 3.1 + spec["carrier_no"]) * 0.0012
                + math.sin(sample["t"] * math.pi * 2 * 67 - angle * 5.3) * 0.0007
            )
            point = (
                sample["center"]
                + sample["lateral"] * c * width
                + sample["radial"] * (s * depth + silhouette)
            )
            vertices.append(tuple(point))
            uvs.append((sample["t"] * 5.0, side / SIDES))

    for ring in range(RINGS):
        row = ring * SIDES
        next_row = row + SIDES
        for side in range(SIDES):
            next_side = (side + 1) % SIDES
            a = row + side
            b = row + next_side
            c = next_row + side
            d = next_row + next_side
            faces.extend(((a, c, b), (b, c, d)))

    mesh = bpy.data.meshes.new(f"Carrier {spec['carrier_no']:02d} cohesive yarn")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="Fiber direction UV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new(f"Carrier {spec['carrier_no']:02d} {spec['direction_name']}", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def build_surface_fibers(spec, samples, material):
    curve = bpy.data.curves.new(f"Carrier {spec['carrier_no']:02d} surface fibers", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = 0.0031
    curve.bevel_resolution = 1
    curve.materials.append(material)
    effective_radius = (YARN_HALF_WIDTH + YARN_HALF_DEPTH) * 0.5
    turns = ROPE_LENGTH * math.tan(math.radians(FIBER_TWIST_DEGREES)) / (2 * math.pi * effective_radius)

    for fiber in range(SURFACE_FIBERS):
        fiber_rng = random.Random(12000 + spec["carrier_no"] * 701 + fiber * 97)
        start = fiber / SURFACE_FIBERS * math.pi * 2 + fiber_rng.uniform(-0.007, 0.007)
        fiber_scale = fiber_rng.uniform(0.82, 1.18)
        lift = fiber_rng.uniform(0.0030, 0.0048)
        spline = curve.splines.new("NURBS")
        spline.points.add(len(samples) - 1)
        spline.order_u = 4
        spline.use_endpoint_u = True
        for point, sample in zip(spline.points, samples):
            angle = start + spec["direction"] * sample["t"] * math.pi * 2 * turns
            angle += math.sin(sample["t"] * math.pi * 3.2 + fiber * 0.73) * 0.006
            c = superellipse_component(math.cos(angle))
            s = superellipse_component(math.sin(angle))
            width, depth = section_axes(sample, angle, spec["direction"])
            position = (
                sample["center"]
                + sample["lateral"] * c * (width + lift)
                + sample["radial"] * s * (depth + lift)
            )
            point.co = (*position, 1.0)
            point.radius = fiber_scale

    obj = bpy.data.objects.new(f"Carrier {spec['carrier_no']:02d} microfiber layer", curve)
    bpy.context.collection.objects.link(obj)
    return obj


def make_yarn_material(name, base_color, dark=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Base Color"].default_value = base_color
    surface.inputs["Roughness"].default_value = 0.42 if dark else 0.44
    surface.inputs["IOR"].default_value = 1.54
    surface.inputs["Subsurface Weight"].default_value = 0.07 if dark else 0.12
    surface.inputs["Subsurface Radius"].default_value = (1.0, 0.52, 0.30)
    surface.inputs["Subsurface Scale"].default_value = 0.022 if dark else 0.030
    surface.inputs["Specular IOR Level"].default_value = 0.46
    surface.inputs["Anisotropic"].default_value = 1.0
    surface.inputs["Coat Weight"].default_value = 0.02
    surface.inputs["Sheen Weight"].default_value = 0.72
    surface.inputs["Sheen Roughness"].default_value = 0.36
    surface.inputs["Sheen Tint"].default_value = (1.0, 1.0, 1.0, 1)

    tangent = nodes.new("ShaderNodeTangent")
    tangent.direction_type = "UV_MAP"
    tangent.uv_map = "Fiber direction UV"
    links.new(tangent.outputs["Tangent"], surface.inputs["Tangent"])

    micro_ao = nodes.new("ShaderNodeAmbientOcclusion")
    micro_ao.samples = 16
    micro_ao.only_local = True
    micro_ao.inputs["Color"].default_value = base_color
    micro_ao.inputs["Distance"].default_value = 0.012
    contact_ao = nodes.new("ShaderNodeAmbientOcclusion")
    contact_ao.samples = 24
    contact_ao.only_local = False
    contact_ao.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1)
    contact_ao.inputs["Distance"].default_value = 0.17
    multiply_ao = nodes.new("ShaderNodeMixRGB")
    multiply_ao.blend_type = "MULTIPLY"
    multiply_ao.inputs[0].default_value = 1.0
    links.new(micro_ao.outputs["Color"], multiply_ao.inputs[1])
    links.new(contact_ao.outputs["Color"], multiply_ao.inputs[2])
    links.new(multiply_ao.outputs["Color"], surface.inputs["Base Color"])

    texture = nodes.new("ShaderNodeTexNoise")
    texture.noise_dimensions = "3D"
    texture.inputs["Scale"].default_value = 78.0
    texture.inputs["Detail"].default_value = 2.4
    texture.inputs["Roughness"].default_value = 0.54
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.055
    bump.inputs["Distance"].default_value = 0.004
    links.new(texture.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], surface.inputs["Normal"])

    fuzz = nodes.new("ShaderNodeBsdfPrincipled")
    fuzz.inputs["Base Color"].default_value = (0.80, 0.84, 0.90, 1) if dark else (0.92, 0.95, 1.0, 1)
    fuzz.inputs["Roughness"].default_value = 0.86
    fuzz.inputs["Specular IOR Level"].default_value = 0.12
    fuzz.inputs["Sheen Weight"].default_value = 1.0
    fuzz.inputs["Sheen Roughness"].default_value = 0.52
    fresnel = nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.23
    edge_weight = nodes.new("ShaderNodeMath")
    edge_weight.operation = "MULTIPLY"
    edge_weight.inputs[1].default_value = 0.38
    links.new(fresnel.outputs["Fac"], edge_weight.inputs[0])
    mix_fuzz = nodes.new("ShaderNodeMixShader")
    links.new(edge_weight.outputs[0], mix_fuzz.inputs[0])
    links.new(surface.outputs[0], mix_fuzz.inputs[1])
    links.new(fuzz.outputs[0], mix_fuzz.inputs[2])

    glint = nodes.new("ShaderNodeBsdfAnisotropic")
    glint.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1)
    glint.inputs["Roughness"].default_value = 0.12
    glint.inputs["Anisotropy"].default_value = 0.85
    links.new(tangent.outputs["Tangent"], glint.inputs["Tangent"])
    mix_glint = nodes.new("ShaderNodeMixShader")
    mix_glint.inputs[0].default_value = 0.12
    links.new(mix_fuzz.outputs[0], mix_glint.inputs[1])
    links.new(glint.outputs[0], mix_glint.inputs[2])
    links.new(mix_glint.outputs[0], output.inputs[0])
    return material


def make_fiber_material(name, base_color, dark=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    surface = material.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = base_color
    surface.inputs["Roughness"].default_value = 0.36 if dark else 0.42
    surface.inputs["IOR"].default_value = 1.54
    surface.inputs["Subsurface Weight"].default_value = 0.04 if dark else 0.08
    surface.inputs["Subsurface Radius"].default_value = (1.0, 0.55, 0.32)
    surface.inputs["Subsurface Scale"].default_value = 0.012 if dark else 0.018
    surface.inputs["Specular IOR Level"].default_value = 0.46
    surface.inputs["Anisotropic"].default_value = 0.96
    surface.inputs["Sheen Weight"].default_value = 0.95
    surface.inputs["Sheen Roughness"].default_value = 0.34
    surface.inputs["Sheen Tint"].default_value = (1.0, 1.0, 1.0, 1)
    return material


def add_area(name, location, energy, size, color, target=(0, 0, 0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size * 0.32
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    look_at(obj, target)


specs = [carrier_spec(carrier_no) for carrier_no in range(1, CARRIER_COUNT + 1)]
assert sum(spec["direction"] > 0 for spec in specs) == 8
assert sum(spec["direction"] < 0 for spec in specs) == 8
assert {spec["carrier_no"] for spec in specs if spec["color_name"] == "black"} == BLACK_CARRIERS
assert all(spec["direction_name"] == "CW" for spec in specs if spec["carrier_no"] in BLACK_CARRIERS)

measured_angle = math.degrees(math.atan(ROPE_RADIUS * math.tan(math.radians(BRAID_ANGLE_DEGREES)) / ROPE_RADIUS))
assert abs(measured_angle - BRAID_ANGLE_DEGREES) < 1e-9

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

white_shell = make_yarn_material("Approved polyester white shell", WHITE)
black_shell = make_yarn_material("Approved polyester black shell", BLACK, dark=True)
white_fiber = make_fiber_material("Approved polyester white fibers", (0.90, 0.93, 0.98, 1))
black_fiber = make_fiber_material("Approved polyester black fibers", (0.015, 0.018, 0.024, 1), dark=True)

for spec in specs:
    samples = build_carrier_samples(spec)
    shell = build_yarn_mesh(spec, samples)
    shell.data.materials.append(black_shell if spec["color_name"] == "black" else white_shell)
    build_surface_fibers(spec, samples, black_fiber if spec["color_name"] == "black" else white_fiber)

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -1.32))
floor = bpy.context.object
floor_material = bpy.data.materials.new("Neutral studio floor")
floor_material.use_nodes = True
floor_surface = floor_material.node_tree.nodes.get("Principled BSDF")
floor_surface.inputs["Base Color"].default_value = (0.055, 0.063, 0.072, 1)
floor_surface.inputs["Roughness"].default_value = 0.78
floor.data.materials.append(floor_material)

world = bpy.context.scene.world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.028, 0.034, 0.042, 1)
background.inputs["Strength"].default_value = 0.12

add_area("Long satin key", (-1.8, -4.8, 7.0), 750, 8.2, (1.0, 0.96, 0.91))
add_area("Cool broad fill", (3.8, 3.2, 4.5), 560, 6.2, (0.76, 0.86, 1.0))
add_area("Soft rim", (-5.0, 1.5, 5.2), 390, 4.8, (1.0, 0.84, 0.72))
add_area("Fiber glint strip", (0.0, -3.6, 4.2), 240, 5.5, (1.0, 0.99, 0.96))

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0.0, -13.0, 4.1)
camera_data.lens = 58
look_at(camera, (0.0, 0.0, 0.05))

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 224
scene.cycles.use_denoising = False
scene.cycles.pixel_filter_type = "BLACKMAN_HARRIS"
scene.cycles.filter_width = 1.8
scene.render.resolution_x = 1600
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUTPUT
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUTPUT)
bpy.ops.render.render(write_still=True)

print(json.dumps({
    "output": OUTPUT,
    "blend": BLEND_OUTPUT,
    "carrier_count": CARRIER_COUNT,
    "cw_count": 8,
    "ccw_count": 8,
    "black_carriers": sorted(BLACK_CARRIERS),
    "black_direction": "CW",
    "crossing_mode": "2_over_2_twill",
    "crossing_flatten_percent": CROSSING_FLATTEN * 100,
    "braid_angle_degrees": measured_angle,
    "surface_fibers_per_carrier": SURFACE_FIBERS,
    "material": "approved polyester yarn v11",
}))
