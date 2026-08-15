import bpy
import json
import math
import os
import random
from mathutils import Vector, noise


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get(
    "BRAID_TRUE_ROPE_OUTPUT",
    os.path.join(ROOT, "proofs", "scenario-a-16carrier-true-filaments-v1.png"),
)
BLEND_OUTPUT = os.path.splitext(OUTPUT)[0] + ".blend"

CARRIER_COUNT = int(os.environ.get("BRAID_CARRIER_COUNT", "16"))
FAMILY_COUNT = CARRIER_COUNT // 2
FILAMENTS_PER_CARRIER = int(os.environ.get("BRAID_FILAMENT_COUNT", "30"))
DENIER = float(os.environ.get("BRAID_DENIER", "1300"))
WIDTH_SCALE = float(os.environ.get("BRAID_WIDTH_SCALE", "1.0"))
ROPE_DIAMETER_MM = float(os.environ.get("BRAID_ROPE_DIAMETER_MM", "16"))
REFERENCE_DENIER = 1300.0
REFERENCE_FILAMENT_RADIUS = 0.0285
FILAMENT_RADIUS = REFERENCE_FILAMENT_RADIUS * math.sqrt(DENIER / REFERENCE_DENIER)
FILAMENT_PACKING = 0.98
PACKING_DISTANCE_SCALE = 0.82
LENTICULAR_ASPECT_RATIO = 1.8
CONTACT_COMPRESSION = 0.18
GROUP_FLATTENING = 0.20
PROFILE_SIDES = 10
ROPE_RADIUS = 0.62 * (ROPE_DIAMETER_MM / 16.0)
ROPE_LENGTH = 9.2
BRAID_ANGLE_DEGREES = 34.0
S_TWIST_DEGREES = 8.0
LAYER_LIFT = 0.085
CROSSING_FLATTEN = GROUP_FLATTENING
RINGS = 172
ACCENT_CARRIERS = {
    int(value)
    for value in os.environ.get("BRAID_ACCENT_CARRIERS", "1,9").split(",")
    if value.strip() and 1 <= int(value) <= CARRIER_COUNT
}

WHITE = (0.92, 0.92, 0.92, 1.0)
RED = (0.78, 0.006, 0.003, 1.0)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def carrier_spec(carrier_no):
    clockwise = carrier_no % 2 == 1
    family_index = (carrier_no - 1) // 2
    return {
        "carrier_no": carrier_no,
        "direction": 1 if clockwise else -1,
        "direction_name": "CW" if clockwise else "CCW",
        "family_index": family_index,
        "phase": family_index * math.pi * 2 / FAMILY_COUNT,
        "accent": carrier_no in ACCENT_CARRIERS,
    }


def packed_offsets(count, radius, width_scale):
    # Count changes the real packing topology: 30F resolves to 3x10, while
    # smaller/larger selections rebuild both row and column counts.
    rows = max(2, round(math.sqrt(count / 3.2)))
    columns = math.ceil(count / rows)
    area_scale = math.sqrt(LENTICULAR_ASPECT_RATIO)
    half_width = radius * area_scale
    half_height = radius / area_scale
    # The oval filaments overlap by only a few percent. This approximates the
    # elastic interlock of a tensioned tow while preserving every filament as
    # independent geometry.
    across_pitch = (
        2.0 * half_width * (1.0 - 0.06 * FILAMENT_PACKING)
        * PACKING_DISTANCE_SCALE * width_scale
    )
    depth_pitch = (
        2.0 * half_height * (1.0 - 0.08 * FILAMENT_PACKING)
        * PACKING_DISTANCE_SCALE
    )
    offsets = []
    remaining = count
    for row in range(rows):
        rows_left = rows - row
        row_count = math.ceil(remaining / rows_left)
        remaining -= row_count
        stagger = 0.5 if row % 2 else 0.0
        for column in range(row_count):
            across = (column - (row_count - 1) / 2 + stagger * 0.18) * across_pitch
            depth = (row - (rows - 1) / 2) * depth_pitch
            crown = math.sqrt(max(0.0, 1.0 - (across / max(across_pitch * columns * 0.55, 1e-6)) ** 2))
            depth += crown * half_height * 0.22
            offsets.append((across, depth))
    return offsets[:count]


PACKED_OFFSETS = packed_offsets(FILAMENTS_PER_CARRIER, FILAMENT_RADIUS, WIDTH_SCALE)
LENTICULAR_HALF_WIDTH = FILAMENT_RADIUS * math.sqrt(LENTICULAR_ASPECT_RATIO)
LENTICULAR_HALF_HEIGHT = FILAMENT_RADIUS / math.sqrt(LENTICULAR_ASPECT_RATIO)
BUNDLE_HALF_WIDTH = max(abs(offset[0]) for offset in PACKED_OFFSETS) + LENTICULAR_HALF_WIDTH
BUNDLE_HALF_DEPTH = max(abs(offset[1]) for offset in PACKED_OFFSETS) + LENTICULAR_HALF_HEIGHT


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


def build_carrier_samples(spec):
    omega = math.tan(math.radians(BRAID_ANGLE_DEGREES)) / ROPE_RADIUS
    samples = []
    for ring in range(RINGS + 1):
        t = ring / RINGS
        x = -ROPE_LENGTH / 2 + ROPE_LENGTH * t
        theta = spec["phase"] + spec["direction"] * omega * x
        layer, contact = crossing_state(spec, x, omega)
        center_radius = ROPE_RADIUS + LAYER_LIFT * layer
        center = Vector((
            x,
            math.cos(theta) * center_radius,
            math.sin(theta) * center_radius,
        ))
        radial = Vector((0.0, math.cos(theta), math.sin(theta)))
        tangent = Vector((
            1.0,
            -spec["direction"] * omega * math.sin(theta) * center_radius,
            spec["direction"] * omega * math.cos(theta) * center_radius,
        )).normalized()
        lateral = radial.cross(tangent).normalized()
        samples.append({
            "t": t,
            "center": center,
            "radial": radial,
            "tangent": tangent,
            "lateral": lateral,
            "contact": contact,
        })
    return samples


def set_socket(node, name, value):
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def make_polyester_material(name, color, accent=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    polyester = nodes.new("ShaderNodeBsdfPrincipled")
    polyester.inputs["Base Color"].default_value = color
    polyester.inputs["Roughness"].default_value = 0.42
    polyester.inputs["IOR"].default_value = 1.54
    polyester.inputs["Alpha"].default_value = 1.0
    set_socket(polyester, "Metallic", 0.0)
    set_socket(polyester, "Transmission Weight", 0.0)
    set_socket(polyester, "Subsurface Weight", 0.012)
    set_socket(polyester, "Subsurface Radius", (0.001, 0.001, 0.001))
    set_socket(polyester, "Subsurface Scale", 0.001)
    set_socket(polyester, "Specular IOR Level", 0.20)
    set_socket(polyester, "Sheen Weight", 1.0)
    set_socket(polyester, "Sheen Roughness", 0.36)
    set_socket(polyester, "Sheen Tint", (1.0, 1.0, 1.0, 1.0))
    set_socket(polyester, "Anisotropic IOR Level", 0.88)
    set_socket(polyester, "Coat Weight", 0.02)
    set_socket(polyester, "Coat Roughness", 0.35)

    tangent = nodes.new("ShaderNodeTangent")
    tangent.direction_type = "UV_MAP"
    tangent.uv_map = "FilamentUV"
    if polyester.inputs.get("Tangent") is not None:
        links.new(tangent.outputs["Tangent"], polyester.inputs["Tangent"])

    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (2.5, 500.0, 1.0)
    micro_noise = nodes.new("ShaderNodeTexNoise")
    micro_noise.noise_dimensions = "3D"
    micro_noise.inputs["Scale"].default_value = 1.0
    micro_noise.inputs["Detail"].default_value = 3.0
    micro_noise.inputs["Roughness"].default_value = 0.68
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.012
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], micro_noise.inputs["Vector"])
    links.new(micro_noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], polyester.inputs["Normal"])
    links.new(polyester.outputs[0], output.inputs[0])
    return material


def build_true_carrier_bundle(spec, samples, material):
    vertices = []
    faces = []
    vertex_uvs = []
    effective_radius = (BUNDLE_HALF_WIDTH + BUNDLE_HALF_DEPTH) * 0.5
    twist_turns = ROPE_LENGTH * math.tan(math.radians(S_TWIST_DEGREES)) / (2 * math.pi * effective_radius)
    for filament, (base_across, base_depth) in enumerate(PACKED_OFFSETS):
        filament_rng = random.Random(16000 + spec["carrier_no"] * 701 + filament * 97)
        phase_jitter = filament_rng.uniform(-0.012, 0.012)
        diameter_jitter = filament_rng.uniform(0.965, 1.035)
        filament_start = len(vertices)
        first_center = None
        last_center = None
        first_tangent = None
        last_tangent = None
        for ring, sample in enumerate(samples):
            twist = spec["direction"] * sample["t"] * math.pi * 2 * twist_turns + phase_jitter
            # Braiding tension suppresses free bundle roll. A small S-twist
            # migration remains visible, while the 3x10 carrier keeps covering
            # its assigned cylindrical cell instead of periodically turning
            # edge-on and opening false lattice holes.
            migration = 0.05
            across = base_across + base_depth * math.sin(twist) * migration
            depth = base_depth + base_across * math.sin(twist) * migration

            contact = sample["contact"]
            across *= 1.0 + CROSSING_FLATTEN * 0.42 * contact
            depth *= 1.0 - CROSSING_FLATTEN * contact

            micro = noise.noise_vector(
                Vector((sample["t"] * 8.0 + filament * 0.37, spec["carrier_no"] * 0.23, 0.0)),
                noise_basis="PERLIN_ORIGINAL",
            )
            across += micro.y * FILAMENT_RADIUS * 0.045
            depth += micro.z * FILAMENT_RADIUS * 0.045
            center = sample["center"] + sample["lateral"] * across + sample["radial"] * depth
            radius_noise = noise.noise_vector(
                Vector((sample["t"] * 3.1 + filament * 0.19, spec["carrier_no"], 0.0)),
                noise_basis="PERLIN_ORIGINAL",
            )[0]
            radius_scale = diameter_jitter * (1.0 + radius_noise * 0.025)
            compression = CONTACT_COMPRESSION * sample["contact"]
            half_width = LENTICULAR_HALF_WIDTH * radius_scale * (1.0 + compression * 0.34)
            half_height = LENTICULAR_HALF_HEIGHT * radius_scale * (1.0 - compression)

            # Major axis follows the cylindrical surface; the thin axis is
            # radial. This radial lock prevents the lenticular section from
            # rolling back into a round tube as the carrier follows its helix.
            for side in range(PROFILE_SIDES):
                angle = math.pi * 2.0 * side / PROFILE_SIDES
                profile = (
                    sample["lateral"] * (math.cos(angle) * half_width)
                    + sample["radial"] * (math.sin(angle) * half_height)
                )
                vertices.append(tuple(center + profile))
                vertex_uvs.append((sample["t"] * 4.0, side / PROFILE_SIDES))

            if ring > 0:
                previous = filament_start + (ring - 1) * PROFILE_SIDES
                current = filament_start + ring * PROFILE_SIDES
                for side in range(PROFILE_SIDES):
                    next_side = (side + 1) % PROFILE_SIDES
                    faces.append((
                        previous + side,
                        previous + next_side,
                        current + next_side,
                        current + side,
                    ))

            if ring == 0:
                first_center = center
                first_tangent = sample["tangent"]
            if ring == len(samples) - 1:
                last_center = center
                last_tangent = sample["tangent"]

        first_cap = len(vertices)
        vertices.append(tuple(first_center - first_tangent * FILAMENT_RADIUS * 0.04))
        vertex_uvs.append((0.0, 0.5))
        last_cap = len(vertices)
        vertices.append(tuple(last_center + last_tangent * FILAMENT_RADIUS * 0.04))
        vertex_uvs.append((4.0, 0.5))
        last_ring = filament_start + (len(samples) - 1) * PROFILE_SIDES
        for side in range(PROFILE_SIDES):
            next_side = (side + 1) % PROFILE_SIDES
            faces.append((first_cap, filament_start + next_side, filament_start + side))
            faces.append((last_cap, last_ring + side, last_ring + next_side))

    mesh = bpy.data.meshes.new(
        f"Carrier {spec['carrier_no']:02d} exact {FILAMENTS_PER_CARRIER}F lenticular mesh"
    )
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="FilamentUV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = vertex_uvs[loop.vertex_index]
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    obj = bpy.data.objects.new(
        f"Carrier {spec['carrier_no']:02d} {spec['direction_name']} "
        f"exact {FILAMENTS_PER_CARRIER}F lenticular",
        mesh,
    )
    obj["filament_count"] = FILAMENTS_PER_CARRIER
    obj["profile_type"] = "LENTICULAR"
    obj["profile_aspect_ratio"] = LENTICULAR_ASPECT_RATIO
    bpy.context.collection.objects.link(obj)
    return obj


def add_area(name, location, energy, size, color, target=(0, 0, 0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size * 0.30
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    look_at(obj, target)


specs = [carrier_spec(carrier_no) for carrier_no in range(1, CARRIER_COUNT + 1)]
assert len(PACKED_OFFSETS) == FILAMENTS_PER_CARRIER
assert CARRIER_COUNT >= 4 and CARRIER_COUNT % 2 == 0
assert FILAMENTS_PER_CARRIER >= 2
assert DENIER > 0
assert sum(spec["direction"] > 0 for spec in specs) == FAMILY_COUNT
assert sum(spec["direction"] < 0 for spec in specs) == FAMILY_COUNT
assert {spec["carrier_no"] for spec in specs if spec["accent"]} == ACCENT_CARRIERS
assert all(spec["direction_name"] == "CW" for spec in specs if spec["accent"])

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

white_material = make_polyester_material(
    f"{FILAMENTS_PER_CARRIER}F {DENIER:g}D opaque white HT polyester", WHITE
)
accent_material = make_polyester_material(
    f"{FILAMENTS_PER_CARRIER}F {DENIER:g}D opaque red HT polyester", RED, accent=True
)

for spec in specs:
    samples = build_carrier_samples(spec)
    build_true_carrier_bundle(spec, samples, accent_material if spec["accent"] else white_material)

actual_filaments = sum(
    int(obj.get("filament_count", 0))
    for obj in bpy.context.scene.objects
    if obj.name.startswith("Carrier ") and obj.type == "MESH"
)
assert actual_filaments == CARRIER_COUNT * FILAMENTS_PER_CARRIER

bpy.ops.mesh.primitive_plane_add(size=28, location=(0, 0, -1.18))
floor = bpy.context.object
floor_material = bpy.data.materials.new("Neutral studio floor")
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

add_area("Long polyester key", (-1.4, -4.6, 6.3), 430, 7.8, (1.0, 0.96, 0.91))
add_area("Cool filament fill", (3.6, 3.0, 4.2), 260, 5.8, (0.76, 0.86, 1.0))
add_area("Silk rim", (-4.6, 1.3, 4.8), 520, 4.6, (1.0, 0.84, 0.72))
add_area("Long glint", (0.0, -3.4, 3.8), 360, 5.2, (1.0, 0.99, 0.96))

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0.0, -11.2, 3.25)
camera_data.lens = 58
look_at(camera, (0.0, 0.0, 0.02))

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(os.environ.get("BRAID_RENDER_SAMPLES", "320"))
scene.cycles.use_denoising = False
scene.cycles.pixel_filter_type = "BLACKMAN_HARRIS"
scene.cycles.filter_width = 1.7
scene.render.resolution_x = 1600
scene.render.resolution_y = 760
scene.render.resolution_percentage = int(os.environ.get("BRAID_RENDER_PERCENT", "100"))
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUTPUT
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUTPUT)
bpy.ops.render.render(write_still=True)

print(json.dumps({
    "output": OUTPUT,
    "blend": BLEND_OUTPUT,
    "representation": "no carrier shells; exact continuous lenticular filament meshes",
    "carrier_count": CARRIER_COUNT,
    "filaments_per_carrier": FILAMENTS_PER_CARRIER,
    "total_filaments": actual_filaments,
    "denier": DENIER,
    "width_scale": WIDTH_SCALE,
    "cw_count": FAMILY_COUNT,
    "ccw_count": FAMILY_COUNT,
    "accent_carriers": sorted(ACCENT_CARRIERS),
    "transmission": 0.0,
    "filament_packing": FILAMENT_PACKING,
    "packing_distance_scale": PACKING_DISTANCE_SCALE,
    "filament_profile": "LENTICULAR",
    "profile_aspect_ratio": LENTICULAR_ASPECT_RATIO,
    "contact_compression": CONTACT_COMPRESSION,
    "group_flattening": GROUP_FLATTENING,
    "filament_radius": FILAMENT_RADIUS,
    "rope_diameter_mm": ROPE_DIAMETER_MM,
    "micro_bump_scale": 500.0,
    "micro_bump_strength": 0.12,
    "crossing_mode": "2_over_2_twill",
    "crossing_flatten_percent": CROSSING_FLATTEN * 100,
    "braid_angle_degrees": BRAID_ANGLE_DEGREES,
    "s_twist_degrees": S_TWIST_DEGREES,
}))
