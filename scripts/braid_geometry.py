#!/usr/bin/env python3
"""Single geometry core for BraidStudio crossing proofs and full ropes."""

from __future__ import annotations

import bisect
import json
import math
import os
import sys


MODEL_ID = "unified_carrier_geometry"
PET_DENSITY_KG_M3 = 1380.0
PACKING_FRACTION = 0.52
SUPERELLIPSE_ORDER = 2.0
CONTACT_HEIGHT_COMPRESSION = 0.10120590920295836
CONTACT_CLEARANCE_MM = 0.002
CONTACT_FACE_HALF_WIDTH_RATIO = 0.55
TOW_EDGE_ROLL_RATIO = 0.03
TOW_EDGE_ROLL_WIDTH_RATIO = 0.14
LAYER_TRANSITION_RATIO = 0.32
BASELINE_WIDTH_PITCH_RATIO = 1.0
BASELINE_THICKNESS_WIDTH_RATIO = 0.17010620750784015


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
    width = normal_pitch * BASELINE_WIDTH_PITCH_RATIO * width_scale * mass_bias
    thickness = (
        width
        * BASELINE_THICKNESS_WIDTH_RATIO
        * math.sqrt(package_mass_scale)
        / max(math.sqrt(width_scale), 1e-9)
    )
    thickness = clamp(thickness, width * 0.10, width * 0.24)
    contact_height = thickness * (1.0 - CONTACT_HEIGHT_COMPRESSION)
    surface_base_radius = max(radius * 0.5, radius - contact_height)
    event_spacing_axial = circumferential_pitch / max(2.0 * math.tan(math.radians(angle)), 0.2)
    return {
        "carrierCount": carrier_count,
        "familyCount": family_count,
        "diameterMm": diameter,
        "radiusMm": radius,
        "surfaceBaseRadiusMm": surface_base_radius,
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
    right = bisect.bisect_left(events, distance)
    candidates = []
    if right < len(events):
        candidates.append(abs(distance - events[right]))
    if right > 0:
        candidates.append(abs(distance - events[right - 1]))
    nearest = min(candidates)
    return smootherstep(1.0 - nearest / max(half_length, 1e-9))


def layer_order(distance, events, thickness):
    ordered = events
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
    center_separation = contact_height + CONTACT_CLEARANCE_MM
    ordered_layers = [(event["x"], event["order"]) for event in events]
    angle = math.atan(slope)
    # A point on the tow edge meets the opposite carrier at a different axial
    # coordinate than the centreline. This is the exact offset obtained by
    # intersecting the two braid-family lines in the unwrapped rope plane.
    crossing_edge_shift_factor = math.cos(2.0 * angle) / max(
        2.0 * math.sin(angle), 1e-9
    )
    # The cylindrical frame's across axis has the opposite axial orientation
    # to the unwrapped-plane normal used in the derivation above.
    across_axial_factor = -crossing_edge_shift_factor if is_plus else crossing_edge_shift_factor
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
            "order": order,
            "layerEvents": ordered_layers,
            "contactEvents": positions,
            "contactHalfLength": contact_half,
            "centerSeparation": center_separation,
            "acrossAxialFactor": across_axial_factor,
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


def subtract(left, right):
    return tuple(a - b for a, b in zip(left, right))


def multiply(vector, scalar):
    return tuple(value * scalar for value in vector)


def dot(left, right):
    return sum(a * b for a, b in zip(left, right))


def orthogonalize(vector, tangent):
    return normalize(subtract(vector, multiply(tangent, dot(vector, tangent))))


def world_centers(points, dimensions, cylindrical):
    radius = dimensions["radiusMm"]
    surface_base_radius = dimensions["surfaceBaseRadiusMm"]
    centers = []
    outward_references = []
    for point in points:
        if cylindrical:
            theta = point["arc"] / radius
            cosine = math.cos(theta)
            sine = math.sin(theta)
            outward = (0.0, cosine, sine)
            surface = surface_base_radius + point["radial"]
            center = (point["x"], cosine * surface, sine * surface)
        else:
            outward = (0.0, 0.0, 1.0)
            center = (point["x"], point["arc"], point["radial"])
        centers.append(center)
        outward_references.append(outward)
    return centers, outward_references


def transported_frames(centers, outward_references):
    """Build one orthonormal frame from the actual 3D carrier path."""
    frames = []
    previous_outward = None
    for index, center in enumerate(centers):
        previous = centers[max(0, index - 1)]
        following = centers[min(len(centers) - 1, index + 1)]
        tangent = normalize(subtract(following, previous))
        outward = orthogonalize(outward_references[index], tangent)
        if previous_outward is not None and dot(outward, previous_outward) < 0.0:
            outward = multiply(outward, -1.0)
        across = normalize(cross(outward, tangent))
        outward = normalize(cross(tangent, across))
        frames.append((tangent, across, outward))
        previous_outward = outward
    return frames


def append_swept_mesh(points, dimensions, ring_segments, cylindrical, ribbon_shader):
    vertices = []
    normals = []
    uvs = []
    indices = []
    exponent = 2.0 / SUPERELLIPSE_ORDER
    centers, outward_references = world_centers(points, dimensions, cylindrical)
    frames = transported_frames(centers, outward_references)

    for ring, (point, center, frame) in enumerate(zip(points, centers, frames)):
        _, across_axis, outward_axis = frame
        # Preserve the accepted single-crossing silhouette. Contact compacts
        # the multifilament package; it must not inflate the visible width.
        width = dimensions["widthMm"]
        path_u = ring / max(1, len(points) - 1)
        for segment in range(ring_segments):
            # Beauty geometry is the outward tow envelope, not a closed solid
            # plastic tube. Physics still uses the full section dimensions.
            section_t = segment / max(ring_segments - 1, 1)
            angle = math.pi * section_t
            cosine = math.cos(angle)
            sine = math.sin(angle)
            across_shape = math.copysign(abs(cosine) ** exponent, cosine)
            across_offset = across_shape * width * 0.5
            sample_x = point["x"] + across_offset * point["acrossAxialFactor"]
            vertex_order = layer_order(
                sample_x,
                point["layerEvents"],
                dimensions["thicknessMm"],
            )
            vertex_contact = contact_amount(
                sample_x,
                point["contactEvents"],
                point["contactHalfLength"],
            )
            height_ratio = 1.0 - CONTACT_HEIGHT_COMPRESSION * vertex_contact
            height = dimensions["thicknessMm"] * height_ratio
            outward_shape = math.copysign(abs(sine) ** exponent, sine)
            # At a crossing, create a finite contact face instead of letting
            # two ellipses touch at one point. The over carrier flattens on its
            # inward face; the under carrier flattens on its outward face.
            is_contact_face = outward_shape * vertex_order < 0.0
            if is_contact_face:
                face_weight = smootherstep(
                    (1.0 - abs(across_shape))
                    / max(1.0 - CONTACT_FACE_HALF_WIDTH_RATIO, 1e-9)
                )
                flat_shape = math.copysign(1.0, outward_shape)
                flatten = vertex_contact * face_weight
                outward_shape += (flat_shape - outward_shape) * flatten
            edge_distance = min(section_t, 1.0 - section_t)
            edge_roll = smootherstep(
                1.0 - edge_distance / max(TOW_EDGE_ROLL_WIDTH_RATIO, 1e-9)
            )
            outward_shape -= TOW_EDGE_ROLL_RATIO * edge_roll
            outward_offset = outward_shape * height * 0.5
            saddle_offset = (
                vertex_order - point["order"]
            ) * point["centerSeparation"] * 0.5
            vertices.extend([
                center[0] + across_axis[0] * across_offset + outward_axis[0] * (outward_offset + saddle_offset),
                center[1] + across_axis[1] * across_offset + outward_axis[1] * (outward_offset + saddle_offset),
                center[2] + across_axis[2] * across_offset + outward_axis[2] * (outward_offset + saddle_offset),
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
        for segment in range(ring_segments - 1):
            following = segment + 1
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
        "crossingDeformationModel": "continuous_across_width_saddle_field",
        "crossingEdgeTimingModel": "exact_unwrapped_line_intersection",
        "crossSectionOrder": SUPERELLIPSE_ORDER,
        "beautySurfaceModel": "continuous_outward_lenticular_tow_shell",
        "closedPlasticSidewalls": False,
        "towEdgeModel": "rounded_down_outer_shell_edge",
        "towEdgeRollRatio": TOW_EDGE_ROLL_RATIO,
        "contactInterpolation": "quintic_smootherstep_C2",
        "contactMaximumHeightCompression": CONTACT_HEIGHT_COMPRESSION,
        "contactClearanceMm": CONTACT_CLEARANCE_MM,
        "contactFaceModel": "C2_finite_flat_contact_patch",
        "contactFaceHalfWidthRatio": CONTACT_FACE_HALF_WIDTH_RATIO,
        "contactWidthConstraint": "full_pitch_no_gap_width",
        "contactCompactionModel": "packing_density_increase",
        "minimumContactAreaRetention": 1.0 - CONTACT_HEIGHT_COMPRESSION,
        "maximumPackingDensityMultiplier": 1.0 / (1.0 - CONTACT_HEIGHT_COMPRESSION),
        "minimumCrossingEnvelopeClearance": 0.0,
        "crossSectionFrameModel": "actual_3d_path_orthonormal_transport",
        "cylindricalSweepModel": "centerline_first_local_frame_sweep",
        "topologySource": "periodic_machine_carrier_lattice",
        "ringSegments": ring_segments,
        "diameterMm": dimensions["diameterMm"],
        "radius": dimensions["radiusMm"],
        "surfaceBaseRadius": dimensions["surfaceBaseRadiusMm"],
        "yarnWidth": dimensions["widthMm"],
        "yarnThickness": dimensions["thicknessMm"],
        "filamentCount": dimensions["endsPerCarrier"],
        "denier": dimensions["denier"],
        "packageMassScale": dimensions["packageMassScale"],
        "derivedDimensions": dimensions,
    }


def build_carrier_records(params, dimensions, visible_rows):
    carrier_count = dimensions["carrierCount"]
    family_count = dimensions["familyCount"]
    angle = math.radians(dimensions["braidAngleDeg"])
    slope = math.tan(angle)
    circumference = math.tau * dimensions["radiusMm"]
    pitch = circumference / family_count
    visible_rows = int(clamp(int(visible_rows), 8, 60))
    row_pitch_x = pitch / max(2.0 * slope, 0.2)
    length = max(pitch * 3.0, visible_rows * row_pitch_x)
    xmin = -length * 0.5
    xmax = length * 0.5
    offsets = [-circumference * 0.5 + (index + 0.5) * pitch for index in range(family_count)]
    opposite_lines = periodic_crossing_lines(offsets, circumference, slope, xmin, xmax)
    span = crossing_span(params.get("crossingMode", "diamond"))
    steps = max(192, visible_rows * 7)
    carriers = params.get("carriers") if isinstance(params.get("carriers"), list) else []
    base_color = normalize_hex(params.get("baseColor"), "#f6f5ee")
    colors = [
        normalize_hex(
            carriers[index].get("color") if index < len(carriers) and isinstance(carriers[index], dict) else None,
            base_color,
        )
        for index in range(carrier_count)
    ]
    records = []
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
            records.append({
                "carrierNo": carrier_index + 1,
                "color": colors[carrier_index],
                "direction": direction_name,
                "isPlus": is_plus,
                "line": line,
                "events": events,
                "points": points,
            })
    records.sort(key=lambda record: record["carrierNo"])
    return {
        "records": records,
        "slope": slope,
        "xmin": xmin,
        "xmax": xmax,
        "length": length,
        "circumference": circumference,
        "visibleRows": visible_rows,
    }


def record_to_yarn(record, dimensions, ring_segments, points=None):
    sampled_points = points or record["points"]
    return {
        "carrierNo": record["carrierNo"],
        "color": record["color"],
        "direction": record["direction"],
        "continuousCarrier": True,
        "pathPointCount": len(sampled_points),
        "crossingTransitions": max(0, len(record["events"]) - 1),
        "crossingEvents": [
            {"x": event["x"], "order": event["order"]}
            for event in record["events"]
        ],
        "mesh": append_swept_mesh(
            sampled_points,
            dimensions,
            ring_segments,
            True,
            True,
        ),
    }


def build_rope(params, dimensions):
    carrier_count = dimensions["carrierCount"]
    family_count = dimensions["familyCount"]
    topology = build_carrier_records(params, dimensions, params.get("visibleRows", 30))
    ring_segments = 24 if carrier_count <= 16 else (20 if carrier_count <= 32 else 16)
    yarns = [record_to_yarn(record, dimensions, ring_segments) for record in topology["records"]]
    report = common_report(dimensions, ring_segments)
    report.update({
        "mode": "rope",
        "carrierCount": carrier_count,
        "surfacePieceCount": len(yarns),
        "piecesPerCarrier": 1,
        "directionCounts": {"S": family_count, "Z": family_count},
        "minimumCrossingTransitions": min(yarn["crossingTransitions"] for yarn in yarns),
        "circumference": topology["circumference"],
        "length": topology["length"],
        "visibleRows": topology["visibleRows"],
        "cylindricalWeave": True,
        "flatWeave": False,
        "yarns": yarns,
    })
    return report


def build_crossing(params, dimensions):
    topology = build_carrier_records(params, dimensions, 8)
    event_spacing = dimensions["eventSpacingAxialMm"]
    length = event_spacing * 1.5
    xmin = -length * 0.5
    xmax = length * 0.5
    steps = 201
    ring_segments = 24
    yarns = []
    for record in topology["records"][:2]:
        points = build_carrier_centerline(
            record["line"],
            record["isPlus"],
            record["events"],
            topology["slope"],
            xmin,
            xmax,
            steps,
            dimensions,
        )
        # Show the selected real rope crossing at the camera-facing meridian.
        # This is only a rigid rotation of the full-rope coordinates.
        front_arc = dimensions["radiusMm"] * math.pi * 0.5
        for point in points:
            point["arc"] += front_arc - record["line"]["offset"]
        yarns.append(record_to_yarn(record, dimensions, ring_segments, points))
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
        "flatWeave": False,
        "crossingWindow": True,
        "crossingSource": "cropped_from_full_rope_topology",
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
