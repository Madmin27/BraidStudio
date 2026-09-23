#!/usr/bin/env python3
"""Single geometry core for BraidStudio crossing proofs and full ropes."""

from __future__ import annotations

import bisect
import json
import math
import os
import sys


MODEL_ID = "unified_carrier_geometry_v1"
PET_DENSITY_KG_M3 = 1380.0
PACKING_FRACTION = 0.52
SUPERELLIPSE_ORDER = 2.4
SHAPE_AREA_FACTOR = (
    math.gamma(1.0 + 1.0 / SUPERELLIPSE_ORDER) ** 2
    / math.gamma(1.0 + 2.0 / SUPERELLIPSE_ORDER)
)
CONTACT_HEIGHT_COMPRESSION = 0.10120590920295836
LAYER_TRANSITION_RATIO = 0.32


def clamp(value, low, high):
    return max(low, min(high, value))


def smootherstep(value):
    value = clamp(value, 0.0, 1.0)
    return value * value * value * (value * (value * 6.0 - 15.0) + 10.0)


def normalize_hex(value, fallback):
    text = str(value or "").strip()
    if len(text) != 7 or not text.startswith("#"):
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


def plus_family_is_over(plus_index, minus_index, span):
    event_index = minus_index - plus_index
    return ((event_index // max(1, span)) % 2) == 0


def carrier_dimensions(params):
    carrier_count = int(clamp(int(params.get("carrierCount", 16)), 8, 48))
    diameter = float(clamp(float(params.get("diameterMm", 16)), 4, 80))
    angle = float(clamp(float(params.get("braidAngle", 34)), 24, 68))
    denier = float(clamp(float(params.get("denier", 1000)), 300, 3000))
    ends = float(clamp(float(params.get("filamentCount", 25)), 8, 40))
    width_scale = float(clamp(float(params.get("strandWidthScale", 1.0)), 0.75, 2.2))
    polymer_area = ((denier * ends * 1e-3 / 9000.0) / PET_DENSITY_KG_M3) * 1e6
    packed_area = polymer_area / PACKING_FRACTION
    radius = diameter * 0.5
    family_count = carrier_count // 2
    circumferential_pitch = math.tau * radius / family_count
    normal_pitch = circumferential_pitch * math.cos(math.radians(angle))
    package_mass_scale = ends * denier / 25000.0
    mass_bias = clamp(1.0 + 0.04 * (package_mass_scale ** 0.35 - 1.0), 0.96, 1.07)
    width = normal_pitch * 0.96 * width_scale * mass_bias
    thickness = packed_area / max(SHAPE_AREA_FACTOR * width, 1e-9)
    thickness = clamp(thickness, width * 0.10, width * 0.24)
    event_spacing_axial = circumferential_pitch / max(2.0 * math.tan(math.radians(angle)), 0.2)
    return {
        "carrierCount": carrier_count,
        "familyCount": family_count,
        "diameterMm": diameter,
        "radiusMm": radius,
        "braidAngleDeg": angle,
        "denier": int(round(denier)),
        "endsPerCarrier": int(round(ends)),
        "polymerAreaMm2": polymer_area,
        "packedAreaMm2": packed_area,
        "packageMassScale": package_mass_scale,
        "circumferentialPitchMm": circumferential_pitch,
        "normalPitchMm": normal_pitch,
        "widthMm": width,
        "thicknessMm": thickness,
        "aspectRatio": width / thickness,
        "eventSpacingAxialMm": event_spacing_axial,
        "contactHalfLengthAxialMm": event_spacing_axial * 0.38,
    }


def contact_amount(distance, events, half_length):
    if not events:
        return 0.0
    nearest = min(abs(distance - event) for event in events)
    return smootherstep(1.0 - nearest / max(half_length, 1e-9))


def layer_order(distance, events, thickness):
    ordered = sorted(events, key=lambda event: event[0])
    if not ordered:
        return 0.0
    if len(ordered) == 1 or distance <= ordered[0][0]:
        return ordered[0][1]
    if distance >= ordered[-1][0]:
        return ordered[-1][1]
    positions = [event[0] for event in ordered]
    right_index = bisect.bisect_right(positions, distance)
    left = ordered[right_index - 1]
    right = ordered[right_index]
    midpoint = (left[0] + right[0]) * 0.5
    transition_half = max(
        thickness * 1.15,
        abs(right[0] - left[0]) * LAYER_TRANSITION_RATIO,
    )
    blend = smootherstep(
        (distance - midpoint + transition_half) / max(transition_half * 2.0, 1e-9)
    )
    return left[1] + (right[1] - left[1]) * blend


def periodic_crossing_lines(offsets, period, slope, xmin, xmax):
    low = min(offsets) + 2.0 * slope * xmin - period
    high = max(offsets) + 2.0 * slope * xmax + period
    family_count = len(offsets)
    lines = []
    for carrier_index, base in enumerate(offsets):
        first_repeat = math.floor((low - base) / period) - 1
        last_repeat = math.ceil((high - base) / period) + 1
        for repeat in range(first_repeat, last_repeat + 1):
            lines.append({
                "offset": base + repeat * period,
                "globalIndex": carrier_index + repeat * family_count,
            })
    return lines


def carrier_events(line, is_plus, opposite_lines, slope, xmin, xmax, span):
    events = []
    for opposite in opposite_lines:
        crossing_x = (
            (opposite["offset"] - line["offset"]) / (2.0 * slope)
            if is_plus
            else (line["offset"] - opposite["offset"]) / (2.0 * slope)
        )
        if not xmin <= crossing_x <= xmax:
            continue
        plus_over = (
            plus_family_is_over(line["globalIndex"], opposite["globalIndex"], span)
            if is_plus
            else plus_family_is_over(opposite["globalIndex"], line["globalIndex"], span)
        )
        over = plus_over if is_plus else not plus_over
        events.append({"x": crossing_x, "over": over, "order": 1.0 if over else -1.0})
    return sorted(events, key=lambda event: event["x"])


def build_carrier_centerline(line, is_plus, events, slope, xmin, xmax, steps, dimensions):
    positions = [event["x"] for event in events]
    contact_half = dimensions["contactHalfLengthAxialMm"]
    contact_height = dimensions["thicknessMm"] * (1.0 - CONTACT_HEIGHT_COMPRESSION)
    center_separation = contact_height
    ordered_layers = [(event["x"], event["order"]) for event in events]
    points = []
    for step in range(steps + 1):
        x = xmin + (xmax - xmin) * step / steps
        y = slope * x + line["offset"] if is_plus else -slope * x + line["offset"]
        order = layer_order(x, ordered_layers, dimensions["thicknessMm"])
        contact = contact_amount(x, positions, contact_half)
        points.append({
            "x": x,
            "arc": y,
            "radial": order * center_separation * 0.5,
            "contact": contact,
        })
    return points


def vector_length(vector):
    return math.sqrt(sum(value * value for value in vector))


def normalize(vector):
    length = vector_length(vector) or 1.0
    return tuple(value / length for value in vector)


def cross(left, right):
    return (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )


def append_swept_mesh(points, dimensions, ring_segments, cylindrical, ribbon_shader):
    vertices = []
    normals = []
    uvs = []
    indices = []
    exponent = 2.0 / SUPERELLIPSE_ORDER
    radius = dimensions["radiusMm"]

    centers = []
    frames = []
    for index, point in enumerate(points):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        if cylindrical:
            theta = point["arc"] / radius
            cosine = math.cos(theta)
            sine = math.sin(theta)
            surface = radius + point["radial"]
            center = (point["x"], cosine * surface, sine * surface)
            outward = (0.0, cosine, sine)
            surface_tangent = normalize((
                following["x"] - previous["x"],
                -sine * (following["arc"] - previous["arc"]),
                cosine * (following["arc"] - previous["arc"]),
            ))
            across = normalize(cross(outward, surface_tangent))
        else:
            center = (point["x"], point["arc"], point["radial"])
            tangent = normalize((
                following["x"] - previous["x"],
                following["arc"] - previous["arc"],
                following["radial"] - previous["radial"],
            ))
            outward = (0.0, 0.0, 1.0)
            across = normalize(cross(outward, tangent))
        centers.append(center)
        frames.append((across, outward))

    for ring, (point, center, frame) in enumerate(zip(points, centers, frames)):
        across_axis, outward_axis = frame
        height = dimensions["thicknessMm"] * (
            1.0 - CONTACT_HEIGHT_COMPRESSION * point["contact"]
        )
        if cylindrical:
            exposed_radius = radius + point["radial"] + height * 0.5
            width = dimensions["widthMm"] * max(1.0, exposed_radius / radius)
        else:
            width = dimensions["widthMm"]
        path_u = ring / max(1, len(points) - 1)
        for segment in range(ring_segments):
            angle = math.tau * segment / ring_segments
            cosine = math.cos(angle)
            sine = math.sin(angle)
            across_shape = math.copysign(abs(cosine) ** exponent, cosine)
            outward_shape = math.copysign(abs(sine) ** exponent, sine)
            across_offset = across_shape * width * 0.5
            outward_offset = outward_shape * height * 0.5
            vertices.extend([
                center[0] + across_axis[0] * across_offset + outward_axis[0] * outward_offset,
                center[1] + across_axis[1] * across_offset + outward_axis[1] * outward_offset,
                center[2] + across_axis[2] * across_offset + outward_axis[2] * outward_offset,
            ])
            normal = normalize((
                across_axis[0] * cosine + outward_axis[0] * sine,
                across_axis[1] * cosine + outward_axis[1] * sine,
                across_axis[2] * cosine + outward_axis[2] * sine,
            ))
            normals.extend(normal)
            uvs.extend(
                [path_u, 0.5 + across_shape * 0.5]
                if ribbon_shader
                else [segment / ring_segments, path_u]
            )

    for ring in range(len(points) - 1):
        row = ring * ring_segments
        following_row = (ring + 1) * ring_segments
        for segment in range(ring_segments):
            following = (segment + 1) % ring_segments
            a = row + segment
            b = row + following
            c = following_row + segment
            d = following_row + following
            indices.extend([a, c, b, b, c, d])
    return {"vertices": vertices, "normals": normals, "uvs": uvs, "indices": indices}


def common_report(dimensions, ring_segments):
    return {
        "engine": "BraidStudio unified carrier geometry",
        "geometryModel": MODEL_ID,
        "productionGeometry": True,
        "units": "mm",
        "carrierPathModel": "one_continuous_bundle_per_carrier",
        "crossingModel": "whole_bundle_contact_event",
        "crossingDepthModel": "quintic_C2_layer_exchange",
        "crossSectionOrder": SUPERELLIPSE_ORDER,
        "contactInterpolation": "quintic_smootherstep_C2",
        "contactMaximumHeightCompression": CONTACT_HEIGHT_COMPRESSION,
        "contactWidthConstraint": "adjacent_carrier_pitch_at_exposed_radius",
        "minimumContactAreaRetention": 1.0 - CONTACT_HEIGHT_COMPRESSION,
        "minimumCrossingEnvelopeClearance": 0.0,
        "crossSectionFrameModel": "surface_normal_locked",
        "cylindricalSweepModel": "centerline_first_local_frame_sweep",
        "ringSegments": ring_segments,
        "diameterMm": dimensions["diameterMm"],
        "radius": dimensions["radiusMm"],
        "yarnWidth": dimensions["widthMm"],
        "yarnThickness": dimensions["thicknessMm"],
        "filamentCount": dimensions["endsPerCarrier"],
        "denier": dimensions["denier"],
        "packageMassScale": dimensions["packageMassScale"],
        "derivedDimensions": dimensions,
    }


def build_rope(params, dimensions):
    carrier_count = dimensions["carrierCount"]
    family_count = dimensions["familyCount"]
    angle = math.radians(dimensions["braidAngleDeg"])
    slope = math.tan(angle)
    circumference = math.tau * dimensions["radiusMm"]
    pitch = circumference / family_count
    visible_rows = int(clamp(int(params.get("visibleRows", 30)), 8, 60))
    row_pitch_x = pitch / max(2.0 * slope, 0.2)
    length = max(pitch * 3.0, visible_rows * row_pitch_x)
    xmin = -length * 0.5
    xmax = length * 0.5
    offsets = [-circumference * 0.5 + (index + 0.5) * pitch for index in range(family_count)]
    opposite_lines = periodic_crossing_lines(offsets, circumference, slope, xmin, xmax)
    span = crossing_span(params.get("crossingMode", "diamond"))
    steps = max(192, visible_rows * 7)
    ring_segments = 24 if carrier_count <= 16 else (20 if carrier_count <= 32 else 16)
    carriers = params.get("carriers") if isinstance(params.get("carriers"), list) else []
    base_color = normalize_hex(params.get("baseColor"), "#f6f5ee")
    colors = [
        normalize_hex(
            carriers[index].get("color") if index < len(carriers) and isinstance(carriers[index], dict) else None,
            base_color,
        )
        for index in range(carrier_count)
    ]
    yarns = []
    for is_plus, direction_name in ((True, "S"), (False, "Z")):
        family = [
            index for index in range(carrier_count)
            if (carrier_direction(index, params.get("flip", False)) > 0) == is_plus
        ]
        for family_index, carrier_index in enumerate(family):
            line = {
                "offset": offsets[family_index],
                "globalIndex": family_index,
            }
            events = carrier_events(line, is_plus, opposite_lines, slope, xmin, xmax, span)
            points = build_carrier_centerline(
                line, is_plus, events, slope, xmin, xmax, steps, dimensions
            )
            yarns.append({
                "carrierNo": carrier_index + 1,
                "color": colors[carrier_index],
                "direction": direction_name,
                "continuousCarrier": True,
                "pathPointCount": len(points),
                "crossingTransitions": max(0, len(events) - 1),
                "mesh": append_swept_mesh(
                    points,
                    dimensions,
                    ring_segments,
                    True,
                    bool(params.get("ribbonShader", True)),
                ),
            })
    yarns.sort(key=lambda yarn: yarn["carrierNo"])
    report = common_report(dimensions, ring_segments)
    report.update({
        "mode": "rope",
        "carrierCount": carrier_count,
        "surfacePieceCount": len(yarns),
        "piecesPerCarrier": 1,
        "directionCounts": {"S": family_count, "Z": family_count},
        "minimumCrossingTransitions": min(yarn["crossingTransitions"] for yarn in yarns),
        "circumference": circumference,
        "length": length,
        "visibleRows": visible_rows,
        "cylindricalWeave": True,
        "flatWeave": False,
        "yarns": yarns,
    })
    return report


def build_crossing(params, dimensions):
    angle = math.radians(dimensions["braidAngleDeg"])
    slope = math.tan(angle)
    event_spacing = dimensions["eventSpacingAxialMm"]
    length = event_spacing * 1.5
    xmin = -length * 0.5
    xmax = length * 0.5
    steps = 201
    ring_segments = 64
    carriers = params.get("carriers") if isinstance(params.get("carriers"), list) else []
    colors = [
        normalize_hex(
            carriers[index].get("color") if index < len(carriers) and isinstance(carriers[index], dict) else None,
            "#e11912" if index == 0 else "#f6f5ee",
        )
        for index in range(2)
    ]
    yarns = []
    for index, is_plus in enumerate((True, False)):
        center_order = 1.0 if is_plus else -1.0
        events = [
            {"x": -event_spacing, "over": center_order < 0.0, "order": -center_order},
            {"x": 0.0, "over": center_order > 0.0, "order": center_order},
            {"x": event_spacing, "over": center_order < 0.0, "order": -center_order},
        ]
        line = {"offset": 0.0, "globalIndex": 0}
        points = build_carrier_centerline(
            line, is_plus, events, slope, xmin, xmax, steps, dimensions
        )
        yarns.append({
            "carrierNo": index + 1,
            "color": colors[index],
            "direction": "S" if is_plus else "Z",
            "continuousCarrier": True,
            "pathPointCount": len(points),
            "crossingTransitions": 1,
            "mesh": append_swept_mesh(points, dimensions, ring_segments, False, True),
        })
    report = common_report(dimensions, ring_segments)
    report.update({
        "mode": "crossing",
        "carrierCount": 2,
        "surfacePieceCount": 2,
        "piecesPerCarrier": 1,
        "directionCounts": {"S": 1, "Z": 1},
        "minimumCrossingTransitions": 1,
        "length": length,
        "cylindricalWeave": False,
        "flatWeave": True,
        "yarns": yarns,
    })
    return report


def build_geometry(params):
    dimensions = carrier_dimensions(params)
    mode = params.get("mode", "rope")
    if mode == "crossing":
        return build_crossing(params, dimensions)
    if mode != "rope":
        raise ValueError(f"Unsupported geometry mode: {mode}")
    return build_rope(params, dimensions)


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = build_geometry(payload)
        os.write(1, (json.dumps(result, separators=(",", ":")) + "\n").encode("utf-8"))
    except Exception as error:
        os.write(2, (json.dumps({"error": str(error)}) + "\n").encode("utf-8"))
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
