#!/usr/bin/env python3
import json
import math
import os
import sys
from contextlib import contextmanager
from pathlib import Path

from TexGen.Core import (
    AddTextile,
    CDomainPlanes,
    CInterpolationCubic,
    CNode,
    CSectionEllipse,
    CSectionMeshTriangulate,
    CTextile,
    CTextileWeave2D,
    CYarn,
    CYarnSectionConstant,
    OUTPUT_STANDARD,
    SaveToXML,
    XYZ,
)

@contextmanager
def silence_fd_stdout():
    saved = os.dup(1)
    try:
        with open(os.devnull, "w") as sink:
            os.dup2(sink.fileno(), 1)
        yield
    finally:
        os.dup2(saved, 1)
        os.close(saved)


def clamp(value, low, high):
    return max(low, min(high, value))


def calibrated_denier(denier):
    return denier / 3.0


def normalize_hex(value, fallback):
    text = str(value or "").strip()
    if not text.startswith("#") or len(text) != 7:
        return fallback
    try:
        int(text[1:], 16)
    except ValueError:
        return fallback
    return text.lower()


def carrier_direction(index, flip=False):
    direction = 1 if index % 2 == 0 else -1
    return -direction if flip else direction


def crossing_span(mode):
    return {"diamond": 1, "regular": 2, "hercules": 3}.get(mode, 1)


def plus_family_is_over(plus_global_index, minus_global_index, span):
    """Resolve one physical S/Z crossing from its periodic event index."""
    event_index = minus_global_index - plus_global_index
    return ((event_index // max(1, span)) % 2) == 0


def build_centerline(index, params, radius, length, steps):
    count = params["carrierCount"]
    angle_rad = math.radians(params["braidAngle"])
    diameter_mm = params["diameterMm"]
    radius_mm = diameter_mm / 2.0
    pitch_mm = (2 * math.pi * radius_mm) / math.tan(angle_rad)
    model_length_mm = 160.0
    turns = model_length_mm / pitch_mm
    phase = index * (2 * math.pi / count)
    direction = carrier_direction(index, params.get("flip", False))
    span = crossing_span(params.get("crossingMode", "diamond"))
    points = []

    for step in range(steps + 1):
        t = step / steps
        z_mm = t * model_length_mm
        theta = phase + direction * turns * 2 * math.pi * t
        braid_row = math.floor(t * count * 2.0)
        over = ((braid_row + index + (0 if direction > 0 else span)) % (span * 2)) < span
        lift_wave = 0.5 + 0.5 * math.sin((t * count * 2.0 + index * 0.37) * math.pi)
        radial = radius + (0.16 if over else -0.11) + lift_wave * 0.018
        z = -length / 2 + t * length
        points.append(
            {
                "x": math.cos(theta) * radial,
                "y": math.sin(theta) * radial,
                "z": z,
                "theta": theta,
                "radial": radial,
                "over": over,
                "t": t,
            }
        )
    return points


def add_texgen_yarn(textile, centerline, width, thickness):
    yarn = CYarn()
    stride = max(1, len(centerline) // 56)
    sampled = centerline[::stride]
    if sampled[-1] is not centerline[-1]:
        sampled.append(centerline[-1])
    for point in sampled:
        yarn.AddNode(CNode(XYZ(point["z"], point["x"], point["y"])))
    yarn.AssignInterpolation(CInterpolationCubic())
    section = CSectionEllipse(width, thickness)
    section.AssignSectionMesh(CSectionMeshTriangulate(24))
    yarn.AssignSection(CYarnSectionConstant(section))
    yarn.SetResolution(24)
    textile.AddYarn(yarn)


def mesh_from_centerline(centerline, width, thickness, segments):
    vertices = []
    normals = []
    uvs = []
    indices = []
    ring_count = segments

    for i, point in enumerate(centerline):
        theta = point["theta"]
        radial = (math.cos(theta), math.sin(theta), 0.0)
        circum = (-math.sin(theta), math.cos(theta), 0.0)
        for j in range(ring_count):
            a = 2 * math.pi * j / ring_count
            lateral = math.cos(a) * width * 0.5
            outward = math.sin(a) * thickness * 0.5
            x = point["x"] + circum[0] * lateral + radial[0] * outward
            y = point["y"] + circum[1] * lateral + radial[1] * outward
            z = point["z"]
            nx = circum[0] * math.cos(a) + radial[0] * math.sin(a)
            ny = circum[1] * math.cos(a) + radial[1] * math.sin(a)
            nz = 0.05 * math.sin(a)
            nlen = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            vertices.extend([x, y, z])
            normals.extend([nx / nlen, ny / nlen, nz / nlen])
            uvs.extend([j / ring_count, i / max(1, len(centerline) - 1)])

    for i in range(len(centerline) - 1):
        row = i * ring_count
        next_row = (i + 1) * ring_count
        for j in range(ring_count):
            a = row + j
            b = row + (j + 1) % ring_count
            c = next_row + j
            d = next_row + (j + 1) % ring_count
            indices.extend([a, c, b, b, c, d])

    return {
        "vertices": vertices,
        "normals": normals,
        "uvs": uvs,
        "indices": indices,
    }


def build_mesh(params):
    if params.get("engine") == "weave2d":
        return build_2d_weave_mesh(params)

    carrier_count = int(clamp(int(params.get("carrierCount", 16)), 8, 48))
    diameter_mm = float(clamp(float(params.get("diameterMm", 16)), 4, 80))
    braid_angle = float(clamp(float(params.get("braidAngle", 34)), 24, 68))
    strand_width_scale = float(clamp(float(params.get("strandWidthScale", 1.25)), 0.75, 2.2))
    denier = float(clamp(float(params.get("denier", 1000)), 300, 3000))
    effective_denier = calibrated_denier(denier)
    denier_scale = math.sqrt(effective_denier / 1000.0)
    radius = clamp(0.8 + diameter_mm * 0.03, 0.92, 2.35)
    length = 6.2
    lane_width = (2 * math.pi * radius / carrier_count)
    yarn_width = clamp(lane_width * 2.28 * strand_width_scale, 0.24, 0.9)
    yarn_thickness = clamp(yarn_width * 0.28 * denier_scale, 0.025, 0.23)
    steps = 180
    ring_segments = 16
    default_base = "#59ee78"
    carriers = params.get("carriers") if isinstance(params.get("carriers"), list) else []
    colors = [
        normalize_hex((carriers[i] or {}).get("color") if i < len(carriers) and isinstance(carriers[i], dict) else "", default_base)
        for i in range(carrier_count)
    ]

    textile = CTextile()
    yarns = []
    include_mesh = params.get("geometryMode") != "surface"
    for index in range(carrier_count):
        centerline = build_centerline(
            index,
            {
                **params,
                "carrierCount": carrier_count,
                "diameterMm": diameter_mm,
                "braidAngle": braid_angle,
            },
            radius,
            length,
            steps,
        )
        add_texgen_yarn(textile, centerline, yarn_width, yarn_thickness)
        yarns.append(
            {
                "carrierNo": index + 1,
                "color": colors[index],
                "direction": "S" if carrier_direction(index, params.get("flip", False)) > 0 else "Z",
                "mesh": mesh_from_centerline(centerline, yarn_width, yarn_thickness, ring_segments),
            }
        )

    textile.AssignDomain(CDomainPlanes(XYZ(-length / 2 - 0.4, -radius * 1.7, -radius * 1.7), XYZ(length / 2 + 0.4, radius * 1.7, radius * 1.7)))
    AddTextile("braidstudio_texgen_braid", textile)

    out_dir = Path(params.get("outputDir") or "/tmp/braidstudio-texgen")
    out_dir.mkdir(parents=True, exist_ok=True)
    tg3_path = out_dir / "latest_braidstudio_texgen.tg3"
    SaveToXML(str(tg3_path), "braidstudio_texgen_braid", OUTPUT_STANDARD)

    return {
        "engine": "TexGen CYarn + BraidStudio mesh bridge",
        "tg3Path": str(tg3_path),
        "units": "model",
        "carrierCount": carrier_count,
        "diameterMm": diameter_mm,
        "braidAngle": braid_angle,
        "radius": radius,
        "length": length,
        "yarnWidth": yarn_width,
        "yarnThickness": yarn_thickness,
        "yarns": yarns,
    }


def build_2d_weave_mesh(params):
    include_mesh = params.get("geometryMode") != "surface"
    carrier_count = int(clamp(int(params.get("carrierCount", 16)), 8, 48))
    family_count = max(4, carrier_count // 2)
    diameter_mm = float(clamp(float(params.get("diameterMm", 16)), 4, 80))
    cells_x = int(clamp(int(params.get("cellsX", family_count)), 3, 12))
    cells_y = int(clamp(int(params.get("cellsY", family_count)), 3, 12))
    braid_angle = float(clamp(float(params.get("braidAngle", 34)), 24, 68))
    strand_width_scale = float(clamp(float(params.get("strandWidthScale", 1.0)), 0.75, 2.2))
    filament_count = float(clamp(float(params.get("filamentCount", 20)), 8, 40))
    denier = float(clamp(float(params.get("denier", 1000)), 300, 3000))
    effective_denier = calibrated_denier(denier)
    denier_scale = math.sqrt(effective_denier / 1300.0)
    filament_scale = math.sqrt(filament_count / 30.0)
    filament_diameter_scale = clamp(0.5 * (effective_denier / 1000.0), 0.05, 0.5)
    angle_rad = math.radians(braid_angle)
    slope = math.tan(angle_rad)
    pitch_width = 0.84
    normal_pitch = pitch_width * 0.97
    vertical_pitch = normal_pitch / max(math.cos(angle_rad), 0.2)
    length_y = family_count * vertical_pitch
    cylinder_radius = length_y / (2 * math.pi)
    target_radius = diameter_mm * 0.162678544
    diameter_scale = target_radius / cylinder_radius
    material_scale = denier_scale * (0.92 + 0.08 * filament_scale)
    width = clamp(pitch_width * 1.10 * strand_width_scale * material_scale, 0.50, 1.64)
    thickness = clamp(
        width
        * (0.095 + 0.022 * denier_scale + 0.012 * filament_scale)
        * math.sqrt(filament_diameter_scale / 0.65),
        0.018,
        0.36,
    )
    spacing = vertical_pitch
    textile = CTextileWeave2D(cells_x, cells_y, spacing, thickness, False, True)
    textile.SetGapSize(max(0.0, spacing - width) * 0.18)
    textile.SetYarnWidths(width)
    textile.SetYarnHeights(thickness)
    for x in range(cells_y):
        for y in range(cells_x):
            if (x + y) % 2 == 0:
                textile.SwapPosition(x, y)
    textile.AssignDefaultDomain()
    AddTextile("braidstudio_texgen_2d_weave", textile)

    out_dir = Path(params.get("outputDir") or "/tmp/braidstudio-texgen")
    out_dir.mkdir(parents=True, exist_ok=True)
    tg3_path = out_dir / "latest_braidstudio_2d_weave.tg3"
    SaveToXML(str(tg3_path), "braidstudio_texgen_2d_weave", OUTPUT_STANDARD)

    carriers = params.get("carriers") if isinstance(params.get("carriers"), list) else []
    base = normalize_hex(params.get("baseColor"), "#59ee78")
    colors = [
        normalize_hex((carriers[i] or {}).get("color") if i < len(carriers) and isinstance(carriers[i], dict) else "", base)
        for i in range(carrier_count)
    ]
    visible_rows = int(clamp(int(params.get("visibleRows", 30)), 8, 60))
    yarns = []
    # Keep carrier density independent from preview length. A wider preview must
    # reveal more repeats of the same braid, never stretch the carrier spacing.
    row_pitch_x = vertical_pitch / max(2 * slope, 0.2)
    length_x = max(8.0, visible_rows * row_pitch_x)
    xmin = -length_x / 2
    xmax = length_x / 2
    ymin = -length_y / 2
    ymax = length_y / 2
    z_lift = thickness * 0.65
    z_low = -thickness * 0.52
    segments_long = max(76, int(visible_rows * (2.4 if carrier_count > 32 else 2.8)))
    ring_segments = 12 if carrier_count <= 16 else 10
    span = crossing_span(params.get("crossingMode", "diamond"))

    plus_carriers = [
        {"no": i + 1, "color": colors[i], "direction": 1}
        for i in range(carrier_count)
        if carrier_direction(i, params.get("flip", False)) > 0
    ]
    minus_carriers = [
        {"no": i + 1, "color": colors[i], "direction": -1}
        for i in range(carrier_count)
        if carrier_direction(i, params.get("flip", False)) < 0
    ]

    base_offsets = [ymin + (index + 0.5) * vertical_pitch for index in range(family_count)]
    plus_lines = periodic_family_lines(
        slope, True, base_offsets, length_y, xmin, xmax, ymin, ymax
    )
    minus_lines = periodic_family_lines(
        slope, False, base_offsets, length_y, xmin, xmax, ymin, ymax
    )

    for is_plus, lines, opposite_lines, carrier_family, direction_name in (
        (True, plus_lines, minus_lines, plus_carriers, "S"),
        (False, minus_lines, plus_lines, minus_carriers, "Z"),
    ):
        for line in lines:
            carrier = carrier_family[line["carrierIndex"]]
            centerline = periodic_diagonal_centerline(
                slope, line, is_plus, opposite_lines, xmin, xmax, ymin, ymax,
                segments_long, z_lift, z_low, span
            )
            yarn_entry = {
                "carrierNo": carrier["no"],
                "color": carrier["color"],
                "direction": direction_name,
                "repeat": line["repeat"],
                "fiberPath": wrap_centerline_on_cylinder(
                    centerline,
                    cylinder_radius,
                    diameter_scale,
                ),
            }
            if include_mesh:
                yarn_entry["mesh"] = wrap_mesh_on_cylinder(
                    mesh_flat_path(centerline, width, thickness, ring_segments),
                    cylinder_radius,
                    diameter_scale,
                )
            yarns.append(yarn_entry)

    direction_counts = {
        "S": len({yarn["carrierNo"] for yarn in yarns if yarn["direction"] == "S"}),
        "Z": len({yarn["carrierNo"] for yarn in yarns if yarn["direction"] == "Z"}),
    }
    crossing_transitions = [
        sum(
            1 for index in range(1, len(yarn["fiberPath"]))
            if yarn["fiberPath"][index]["over"] != yarn["fiberPath"][index - 1]["over"]
        )
        for yarn in yarns
    ]
    full_path_transitions = [
        transitions for yarn, transitions in zip(yarns, crossing_transitions)
        if abs(yarn["repeat"]) == 0
    ]
    if not full_path_transitions or min(full_path_transitions) < 2:
        raise RuntimeError("carrier_paths_missing_over_under_transitions")

    response_yarns = yarns if include_mesh else [
        {
            "carrierNo": yarn["carrierNo"],
            "color": yarn["color"],
            "direction": yarn["direction"],
            "repeat": yarn["repeat"],
        }
        for yarn in yarns
    ]

    return {
        "engine": "TexGen CTextileWeave2D baseline + BraidStudio mesh bridge",
        "productionGeometry": True,
        "tg3Path": str(tg3_path),
        "units": "model",
        "carrierCount": carrier_count,
        "surfacePieceCount": len(yarns),
        "repeatCount": math.ceil(visible_rows / family_count),
        "directionCounts": direction_counts,
        "crossingTransitions": {
            "minimumFullPath": min(full_path_transitions),
            "maximumFullPath": max(full_path_transitions),
        },
        "radius": target_radius,
        "circumference": length_y,
        "length": length_x,
        "diameterMm": diameter_mm,
        "diameterScale": diameter_scale,
        "strandWidthScale": strand_width_scale,
        "filamentCount": int(round(filament_count)),
        "denier": int(round(denier)),
        "effectiveDenier": effective_denier,
        "filamentDiameterScale": filament_diameter_scale,
        "fiberGeometry": {
            "representation": "mesh" if include_mesh else "continuous_surface_heightfield",
            "filamentsPerCarrier": int(round(filament_count)),
            "followsCarrierOverUnderPath": True,
        },
        "yarnWidth": width,
        "yarnThickness": thickness,
        "braidAngle": braid_angle,
        "matrixSteps": max(family_count * 3, 24),
        "visibleRows": visible_rows,
        "repeatOffset": family_count,
        "flatWeave": False,
        "cylindricalWeave": True,
        "yarns": response_yarns,
    }


def periodic_family_lines(slope, is_plus, base_offsets, period, xmin, xmax, ymin, ymax):
    if is_plus:
        low = ymin - slope * xmax
        high = ymax - slope * xmin
    else:
        low = ymin + slope * xmin
        high = ymax + slope * xmax

    lines = []
    family_count = len(base_offsets)
    for carrier_index, base in enumerate(base_offsets):
        first_repeat = math.floor((low - base) / period) - 1
        last_repeat = math.ceil((high - base) / period) + 1
        for repeat in range(first_repeat, last_repeat + 1):
            offset = base + repeat * period
            x0, x1 = clipped_line_x_range(slope, offset, is_plus, xmin, xmax, ymin, ymax)
            if x1 <= x0 or x1 < xmin or x0 > xmax:
                continue
            lines.append({
                "offset": offset,
                "carrierIndex": carrier_index,
                "globalIndex": carrier_index + repeat * family_count,
                "repeat": repeat,
            })
    return lines


def periodic_diagonal_centerline(slope, line, is_plus, opposite_lines, xmin, xmax, ymin, ymax, steps, z_lift, z_low, span):
    centerline = []
    offset = line["offset"]
    x0, x1 = clipped_line_x_range(slope, offset, is_plus, xmin, xmax, ymin, ymax)
    ordered_opposite = sorted(opposite_lines, key=lambda item: item["offset"])
    opposite_pitch = min(
        (right["offset"] - left["offset"] for left, right in zip(ordered_opposite, ordered_opposite[1:]) if right["offset"] > left["offset"]),
        default=1.0,
    )
    period_x = abs(opposite_pitch / (2 * slope)) if slope else 1.0
    half_window = max(0.08, period_x * 0.5)
    for step in range(steps + 1):
        t = step / steps
        x = x0 + (x1 - x0) * t
        y = slope * x + offset if is_plus else -slope * x + offset
        nearest_line = opposite_lines[0]
        nearest_dx = half_window * 2
        for opposite_line in opposite_lines:
            other = opposite_line["offset"]
            x_int = (other - offset) / (2 * slope) if is_plus else (offset - other) / (2 * slope)
            dx = abs(x - x_int)
            if dx < nearest_dx:
                nearest_line = opposite_line
                nearest_dx = dx
        local = min(1.0, nearest_dx / half_window)
        crown = max(0.0, math.cos(local * math.pi * 0.5)) ** 1.2
        if is_plus:
            plus_over = plus_family_is_over(
                line["globalIndex"], nearest_line["globalIndex"], span
            )
        else:
            plus_over = plus_family_is_over(
                nearest_line["globalIndex"], line["globalIndex"], span
            )
        over = plus_over if is_plus else not plus_over
        z = (z_lift if over else z_low) * crown
        centerline.append({"x": x, "y": y, "z": z, "t": t, "over": over, "crown": crown})
    return centerline


def clipped_line_x_range(slope, offset, is_plus, xmin, xmax, ymin, ymax):
    candidates = []
    for x in (xmin, xmax):
        y = slope * x + offset if is_plus else -slope * x + offset
        if ymin <= y <= ymax:
            candidates.append(x)
    for y in (ymin, ymax):
        x = (y - offset) / slope if is_plus else (offset - y) / slope
        if xmin <= x <= xmax:
            candidates.append(x)
    if len(candidates) < 2:
        return xmax, xmin
    candidates = sorted(candidates)
    inset = 0.01 * (xmax - xmin)
    return candidates[0] - inset, candidates[-1] + inset


def mesh_flat_path(centerline, width, thickness, ring_segments):
    vertices = []
    normals = []
    uvs = []
    indices = []
    up = (0, 0, 1)
    section_power = 2.45
    for i, point in enumerate(centerline):
        prev_point = centerline[max(0, i - 1)]
        next_point = centerline[min(len(centerline) - 1, i + 1)]
        tx = next_point["x"] - prev_point["x"]
        ty = next_point["y"] - prev_point["y"]
        tlen = math.sqrt(tx * tx + ty * ty) or 1
        tx /= tlen
        ty /= tlen
        lateral = (-ty, tx, 0)
        crown = float(point.get("crown", 0.0))
        local_width = width * (1.0 + crown * 0.04)
        local_thickness = thickness * (1.0 - crown * 0.46)
        for j in range(ring_segments):
            a = 2 * math.pi * j / ring_segments
            cos_a = math.cos(a)
            sin_a = math.sin(a)
            lx_norm = math.copysign(abs(cos_a) ** (2.0 / section_power), cos_a)
            uz_norm = math.copysign(abs(sin_a) ** (2.0 / section_power), sin_a)
            lx = lx_norm * local_width * 0.5
            uz = uz_norm * local_thickness * 0.5
            vertices.extend([
                point["x"] + lateral[0] * lx + up[0] * uz,
                point["y"] + lateral[1] * lx + up[1] * uz,
                point["z"] + lateral[2] * lx + up[2] * uz,
            ])
            grad_lateral = math.copysign(abs(lx_norm) ** (section_power - 1), lx_norm) / max(local_width * 0.5, 1e-6)
            grad_up = math.copysign(abs(uz_norm) ** (section_power - 1), uz_norm) / max(local_thickness * 0.5, 1e-6)
            grad_length = math.hypot(grad_lateral, grad_up) or 1
            grad_lateral /= grad_length
            grad_up /= grad_length
            nx = lateral[0] * grad_lateral + up[0] * grad_up
            ny = lateral[1] * grad_lateral + up[1] * grad_up
            nz = lateral[2] * grad_lateral + up[2] * grad_up
            normals.extend([nx, ny, nz])
            uvs.extend([j / ring_segments, i / max(1, len(centerline) - 1)])
    for i in range(len(centerline) - 1):
        row = i * ring_segments
        next_row = (i + 1) * ring_segments
        for j in range(ring_segments):
            a = row + j
            b = row + (j + 1) % ring_segments
            c = next_row + j
            d = next_row + (j + 1) % ring_segments
            indices.extend([a, c, b, b, c, d])
    return {"vertices": vertices, "normals": normals, "uvs": uvs, "indices": indices}


def wrap_mesh_on_cylinder(mesh, radius, radial_scale=1.0):
    vertices = mesh["vertices"]
    normals = mesh["normals"]
    wrapped_vertices = []
    wrapped_normals = []

    for index in range(0, len(vertices), 3):
        axial = vertices[index]
        arc = vertices[index + 1]
        radial_offset = vertices[index + 2]
        theta = arc / radius
        surface = (radius + radial_offset) * radial_scale
        cos_theta = math.cos(theta)
        sin_theta = math.sin(theta)

        wrapped_vertices.extend([
            axial,
            cos_theta * surface,
            sin_theta * surface,
        ])

        nx = normals[index]
        ny = normals[index + 1]
        nz = normals[index + 2]
        world_nx = nx
        world_ny = -ny * sin_theta + nz * cos_theta
        world_nz = ny * cos_theta + nz * sin_theta
        normal_length = math.sqrt(world_nx * world_nx + world_ny * world_ny + world_nz * world_nz) or 1
        wrapped_normals.extend([
            world_nx / normal_length,
            world_ny / normal_length,
            world_nz / normal_length,
        ])

    return {
        "vertices": wrapped_vertices,
        "normals": wrapped_normals,
        "uvs": mesh["uvs"],
        "indices": mesh["indices"],
    }


def wrap_centerline_on_cylinder(centerline, radius, radial_scale=1.0):
    path = []
    for point in centerline:
        theta = point["y"] / radius
        surface = (radius + point["z"]) * radial_scale
        path.append({
            "x": point["x"],
            "y": math.cos(theta) * surface,
            "z": math.sin(theta) * surface,
            "over": bool(point.get("over", False)),
            "crown": float(point.get("crown", 0.0)),
        })
    return path


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        with silence_fd_stdout():
            result = build_mesh(payload)
        os.write(1, (json.dumps(result, separators=(",", ":")) + "\n").encode("utf-8"))
        os._exit(0)
    except Exception as exc:
        os.write(2, (json.dumps({"error": str(exc)}) + "\n").encode("utf-8"))
        os._exit(1)


if __name__ == "__main__":
    main()
