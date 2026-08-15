import bpy
import json
import math
import os
import random
from mathutils import Vector, noise


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get(
    "BRAID_YARN_PROOF_OUTPUT",
    os.path.join(ROOT, "proofs", "polyester-yarn-block-v11.png"),
)
BLEND_OUTPUT = os.path.splitext(OUTPUT)[0] + ".blend"

LENGTH = 9.6
HALF_DEPTH = 0.15
HALF_WIDTH = 0.24
SECTION_POWER = 2.65
RINGS = 220
SIDES = 96
FIBER_TWIST_DEGREES = 8.0
MACRO_PLY_COUNT = 4


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def center_at(t):
    return (
        -LENGTH / 2 + LENGTH * t,
        math.sin((t - 0.15) * math.pi * 1.25) * 0.012,
        math.sin((t + 0.08) * math.pi * 1.05) * 0.008,
    )


def section_scale(t):
    perlin = noise.noise_vector(
        Vector((t * 3.1 + 1.73, 0.0, 0.0)),
        noise_basis="PERLIN_ORIGINAL",
    )[0]
    return 1.0 + perlin * 0.025


def macro_ply_scale(t, angle):
    phase = angle * MACRO_PLY_COUNT - t * math.pi * 2 * 0.72
    return 1.0 + math.cos(phase) * 0.018


def superellipse_component(value):
    return math.copysign(abs(value) ** (2.0 / SECTION_POWER), value)


def build_bundle_mesh():
    vertices = []
    uvs = []
    indices = []
    for ring in range(RINGS + 1):
        t = ring / RINGS
        cx, cy, cz = center_at(t)
        scale = section_scale(t)
        for side in range(SIDES):
            angle = side / SIDES * math.pi * 2
            normal_y = superellipse_component(math.cos(angle))
            normal_z = superellipse_component(math.sin(angle))
            normal_length = math.hypot(normal_y, normal_z) or 1
            radial_scale = scale * macro_ply_scale(t, angle)
            silhouette_noise = (
                math.sin(t * math.pi * 2 * 43 + angle * 3.1) * 0.0012
                + math.sin(t * math.pi * 2 * 67 - angle * 5.3) * 0.0007
            )
            y = normal_y * HALF_DEPTH * radial_scale + normal_y / normal_length * silhouette_noise
            z = normal_z * HALF_WIDTH * radial_scale + normal_z / normal_length * silhouette_noise
            vertices.append((cx, cy + y, cz + z))
            uvs.append((t * 4.2, side / SIDES))

    for ring in range(RINGS):
        row = ring * SIDES
        next_row = row + SIDES
        for side in range(SIDES):
            next_side = (side + 1) % SIDES
            a = row + side
            b = row + next_side
            c = next_row + side
            d = next_row + next_side
            indices.extend((a, c, b, b, c, d))

    mesh = bpy.data.meshes.new("Cohesive polyester yarn envelope")
    mesh.from_pydata(vertices, [], [indices[index:index + 3] for index in range(0, len(indices), 3)])
    mesh.update()

    uv_layer = mesh.uv_layers.new(name="Fiber direction UV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]

    obj = bpy.data.objects.new("Cohesive polyester yarn envelope", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def make_bundle_material():
    material = bpy.data.materials.new("Polyester satin envelope")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Base Color"].default_value = (0.86, 0.89, 0.94, 1)
    surface.inputs["Roughness"].default_value = 0.44
    surface.inputs["IOR"].default_value = 1.54
    surface.inputs["Subsurface Weight"].default_value = 0.12
    surface.inputs["Subsurface Radius"].default_value = (1.0, 0.52, 0.30)
    surface.inputs["Subsurface Scale"].default_value = 0.030
    surface.inputs["Specular IOR Level"].default_value = 0.44
    surface.inputs["Anisotropic"].default_value = 1.0
    surface.inputs["Coat Weight"].default_value = 0.02
    surface.inputs["Sheen Weight"].default_value = 0.72
    surface.inputs["Sheen Roughness"].default_value = 0.36
    surface.inputs["Sheen Tint"].default_value = (0.96, 0.98, 1.0, 1)

    tangent = nodes.new("ShaderNodeTangent")
    tangent.direction_type = "UV_MAP"
    tangent.uv_map = "Fiber direction UV"
    links.new(tangent.outputs["Tangent"], surface.inputs["Tangent"])

    cavity = nodes.new("ShaderNodeAmbientOcclusion")
    cavity.samples = 16
    cavity.only_local = True
    cavity.inputs["Color"].default_value = (0.86, 0.89, 0.94, 1)
    cavity.inputs["Distance"].default_value = 0.012
    links.new(cavity.outputs["Color"], surface.inputs["Base Color"])

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

    # Broad four-ply structure sits below the fine surface fibers.
    ply_wave = nodes.new("ShaderNodeTexWave")
    ply_wave.wave_type = "BANDS"
    ply_wave.bands_direction = "X"
    ply_wave.inputs["Scale"].default_value = 0.72
    ply_wave.inputs["Distortion"].default_value = 1.15
    ply_wave.inputs["Detail"].default_value = 2.0
    ply_bump = nodes.new("ShaderNodeBump")
    ply_bump.inputs["Strength"].default_value = 0.10
    ply_bump.inputs["Distance"].default_value = 0.012
    links.new(ply_wave.outputs["Color"], ply_bump.inputs["Height"])
    links.new(ply_bump.outputs["Normal"], bump.inputs["Normal"])
    fuzz = nodes.new("ShaderNodeBsdfPrincipled")
    fuzz.inputs["Base Color"].default_value = (0.92, 0.95, 1.0, 1)
    fuzz.inputs["Roughness"].default_value = 0.86
    fuzz.inputs["Specular IOR Level"].default_value = 0.12
    fuzz.inputs["Sheen Weight"].default_value = 1.0
    fuzz.inputs["Sheen Roughness"].default_value = 0.52
    fresnel = nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.23
    edge_weight = nodes.new("ShaderNodeMath")
    edge_weight.operation = "MULTIPLY"
    edge_weight.inputs[1].default_value = 0.38
    mix = nodes.new("ShaderNodeMixShader")
    links.new(fresnel.outputs["Fac"], edge_weight.inputs[0])
    links.new(edge_weight.outputs[0], mix.inputs[0])
    links.new(surface.outputs[0], mix.inputs[1])
    links.new(fuzz.outputs[0], mix.inputs[2])

    # A narrow white anisotropic lobe restores polyester micro-glints above SSS.
    glint = nodes.new("ShaderNodeBsdfAnisotropic")
    glint.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1)
    glint.inputs["Roughness"].default_value = 0.12
    glint.inputs["Anisotropy"].default_value = 0.85
    links.new(tangent.outputs["Tangent"], glint.inputs["Tangent"])
    mix_glint = nodes.new("ShaderNodeMixShader")
    mix_glint.inputs[0].default_value = 0.12
    links.new(mix.outputs[0], mix_glint.inputs[1])
    links.new(glint.outputs[0], mix_glint.inputs[2])
    links.new(mix_glint.outputs[0], output.inputs[0])
    return material


def make_fiber_material():
    material = bpy.data.materials.new("Polyester directional microfibers")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Base Color"].default_value = (0.86, 0.89, 0.95, 1)
    surface.inputs["Roughness"].default_value = 0.45
    surface.inputs["IOR"].default_value = 1.54
    surface.inputs["Subsurface Weight"].default_value = 0.08
    surface.inputs["Subsurface Radius"].default_value = (1.0, 0.55, 0.32)
    surface.inputs["Subsurface Scale"].default_value = 0.018
    surface.inputs["Specular IOR Level"].default_value = 0.38
    surface.inputs["Anisotropic"].default_value = 0.96
    surface.inputs["Sheen Weight"].default_value = 0.95
    surface.inputs["Sheen Roughness"].default_value = 0.36
    surface.inputs["Sheen Tint"].default_value = (1.0, 1.0, 1.0, 1)
    links.new(surface.outputs[0], output.inputs[0])
    return material


def make_curve(name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for item, point in zip(spline.points, points):
        item.co = (*point, 1)
    spline.order_u = 4
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def add_surface_fibers(material):
    random.seed(8201)
    samples = 88
    fiber_count = 156
    effective_radius = (HALF_DEPTH + HALF_WIDTH) * 0.5
    turns = LENGTH * math.tan(math.radians(FIBER_TWIST_DEGREES)) / (2 * math.pi * effective_radius)

    # Continuous S-twist: fibers travel around the whole cross-section and never end on a face.
    for fiber in range(fiber_count):
        fiber_rng = random.Random(8201 + fiber * 97)
        start_angle = fiber / fiber_count * math.pi * 2 + fiber_rng.uniform(-0.006, 0.006)
        fiber_radius = 0.00102 * fiber_rng.uniform(0.86, 1.14)
        surface_lift = fiber_rng.uniform(0.00135, 0.00195)
        points = []
        for sample in range(samples):
            t = sample / (samples - 1)
            cx, cy, cz = center_at(t)
            scale = section_scale(t)
            angle = start_angle + t * math.pi * 2 * turns
            angle += math.sin(t * math.pi * 3.2 + fiber * 0.73) * 0.006
            normal_y = superellipse_component(math.cos(angle))
            normal_z = superellipse_component(math.sin(angle))
            length = math.hypot(normal_y, normal_z) or 1
            radial_scale = scale * macro_ply_scale(t, angle)
            y_local = normal_y * HALF_DEPTH * radial_scale + normal_y / length * surface_lift
            z_local = normal_z * HALF_WIDTH * radial_scale + normal_z / length * surface_lift
            points.append((cx, cy + y_local, cz + z_local))
        make_curve(f"S-twist microfiber {fiber + 1:03d}", points, fiber_radius, material)

    # Sparse restrained flyaways signal real fiber without breaking the bundle.
    for fiber in range(6):
        start_angle = -math.pi * 0.70 + fiber / 5 * math.pi * 1.34
        points = []
        phase = random.random() * math.pi * 2
        for sample in range(samples):
            t = sample / (samples - 1)
            cx, cy, cz = center_at(t)
            angle = start_angle + t * math.pi * 2 * turns
            normal_y = superellipse_component(math.cos(angle))
            normal_z = superellipse_component(math.sin(angle))
            length = math.hypot(normal_y, normal_z) or 1
            radial_scale = macro_ply_scale(t, angle)
            lift = math.sin(math.pi * t) ** 3 * 0.004
            y_local = normal_y * HALF_DEPTH * radial_scale + normal_y / length * (0.0022 + lift)
            z_local = normal_z * HALF_WIDTH * radial_scale + normal_z / length * (0.0022 + lift)
            z_local += math.sin(t * math.pi * 2.3 + phase) * 0.0018
            points.append((cx, cy + y_local, cz + z_local))
        make_curve(f"Flyaway {fiber + 1:02d}", points, 0.00072, material)


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


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bundle = build_bundle_mesh()
bundle.data.materials.append(make_bundle_material())
add_surface_fibers(make_fiber_material())

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.57))
floor = bpy.context.object
floor_material = bpy.data.materials.new("Neutral floor")
floor_material.use_nodes = True
floor_surface = floor_material.node_tree.nodes.get("Principled BSDF")
floor_surface.inputs["Base Color"].default_value = (0.065, 0.073, 0.082, 1)
floor_surface.inputs["Roughness"].default_value = 0.78
floor.data.materials.append(floor_material)

world = bpy.context.scene.world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.035, 0.043, 0.052, 1)
background.inputs["Strength"].default_value = 0.10

add_area("Long satin key", (-0.6, -3.4, 5.5), 175, 7.0, (1.0, 0.96, 0.91))
add_area("Cool soft fill", (2.8, 3.0, 2.4), 165, 4.8, (0.75, 0.86, 1.0))
add_area("Warm rim", (-4.0, 1.0, 3.8), 135, 3.4, (1.0, 0.84, 0.70), (-1.3, 0, 0))
add_area("Anisotropic streak", (-0.9, -2.7, 3.6), 92, 3.6, (1.0, 0.98, 0.94), (-0.9, 0, 0))

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0.2, -7.0, 2.25)
camera_data.lens = 62
look_at(camera, (0, 0, -0.16))

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 320
scene.cycles.use_denoising = False
scene.cycles.pixel_filter_type = "BLACKMAN_HARRIS"
scene.cycles.filter_width = 1.8
scene.render.resolution_x = 1400
scene.render.resolution_y = 620
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
    "surface_fibers": 162,
    "fiber_twist_degrees": FIBER_TWIST_DEGREES,
    "representation": "cohesive envelope + directional microfiber geometry",
    "renderer": "Cycles + SSS + macro-ply + micro-AO + dual specular + filtered fibers",
    "macro_ply_count": MACRO_PLY_COUNT,
    "linear_radius_variation_percent": 2.5,
}))
