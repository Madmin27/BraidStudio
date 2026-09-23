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
TARGET_PACKING_FRACTION = 0.65
MAX_CONTACT_PACKING_FRACTION = 0.90
SUPERELLIPSE_ORDER = 2.0
CONTACT_HEIGHT_COMPRESSION = 0.10120590920295836
CONTACT_CLEARANCE_MM = 0.002
CONTACT_FACE_HALF_WIDTH_RATIO = 0.55
TOW_EDGE_ROLL_RATIO = 0.0
TOW_EDGE_ROLL_WIDTH_RATIO = 0.14
LAYER_TRANSITION_RATIO = 0.48
BASELINE_WIDTH_PITCH_RATIO = 1.01


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


def ring_segments_for_carrier_count(carrier_count):
    return 25 if carrier_count <= 16 else (21 if carrier_count <= 32 else 15)


def plus_family_is_over(plus_index, minus_index, span):
    event_index = minus_index - plus_index
    return ((event_index // max(1, span)) % 2) == 0


def carrier_dimensions(params):
    carrier_count = int(params.get("carrierCount", 16))
    if carrier_count < 8 or carrier_count > 48 or carrier_count % 2:
        raise ValueError("carrierCount must be an even number between 8 and 48")
    diameter = float(clamp(float(params.get("diameterMm", 16)), 4, 80))
    angle = float(clamp(float(params.get("braidAngle", 34)), 24, 68))
    denier = float(clamp(float(params.get("denier", 1000)), 300, 3000))
    denier_scale = float(clamp(float(params.get("denierScale", 1.0)), 0.4, 1.2))
    effective_denier = denier * denier_scale
    ends = float(clamp(float(params.get("filamentCount", 25)), 8, 40))
    width_scale = float(clamp(float(params.get("strandWidthScale", 1.0)), 0.75, 2.2))
    polymer_area = ((effective_denier * ends * 1e-3 / 9000.0) / PET_DENSITY_KG_M3) * 1e6
    end_polymer_area = polymer_area / ends
    equivalent_end_diameter = math.sqrt(4.0 * end_polymer_area / math.pi)
    radius = diameter * 0.5
    family_count = carrier_count // 2
    circumference = math.tau * radius
    circumferential_pitch = circumference / family_count
    normal_pitch = circumferential_pitch * math.cos(math.radians(angle))
    width = normal_pitch * BASELINE_WIDTH_PITCH_RATIO * width_scale
    section_area_coefficient = math.pi * 0.25
    required_thickness = polymer_area / (
        TARGET_PACKING_FRACTION * section_area_coefficient * width
    )
    minimum_thickness = equivalent_end_diameter * 1.05
    maximum_thickness = width * 0.42
    thickness = clamp(required_thickness, minimum_thickness, maximum_thickness)
    envelope_area = section_area_coefficient * width * thickness
    packing_fraction = polymer_area / max(envelope_area, 1e-9)
    contact_packing_fraction = packing_fraction / (1.0 - CONTACT_HEIGHT_COMPRESSION)
    capacity_utilization = contact_packing_fraction / MAX_CONTACT_PACKING_FRACTION
    if contact_packing_fraction > MAX_CONTACT_PACKING_FRACTION:
        fit_status = "overfilled"
    elif packing_fraction < 0.35:
        fit_status = "loose"
    else:
        fit_status = "ok"
    contact_height = thickness * (1.0 - CONTACT_HEIGHT_COMPRESSION)
    center_separation = contact_height + CONTACT_CLEARANCE_MM
    event_spacing_axial = circumferential_pitch / max(2.0 * math.tan(math.radians(angle)), 0.2)
    helical_pitch_axial = circumference / max(math.tan(math.radians(angle)), 0.1)
    span = crossing_span(params.get("crossingMode", "diamond"))
    pattern_repeat_rows = 2 * span
    weave_repeat_axial = pattern_repeat_rows * event_spacing_axial
    sample_events = [
        (index * event_spacing_axial, 1.0 if ((index // span) % 2) == 0 else -1.0)
        for index in range(-4 * span, 4 * span + 1)
    ]
    event_positions = [event[0] for event in sample_events]
    maximum_outer_offset = max(
        layer_order(x, sample_events, thickness) * center_separation * 0.5
        + thickness * (
            1.0 - CONTACT_HEIGHT_COMPRESSION
            * contact_amount(x, event_positions, event_spacing_axial * 0.38)
        ) * 0.5
        for x in (
            sample_events[0][0]
            + (sample_events[-1][0] - sample_events[0][0]) * index / 4096
            for index in range(4097)
        )
    )
    surface_base_radius = max(radius * 0.5, radius - maximum_outer_offset)
    return {
        "carrierCount": carrier_count,
        "familyCount": family_count,
        "diameterMm": diameter,
        "radiusMm": radius,
        "surfaceBaseRadiusMm": surface_base_radius,
        "maximumOuterOffsetMm": maximum_outer_offset,
        "braidAngleDeg": angle,
        "denier": int(round(denier)),
        "denierScale": denier_scale,
        "effectiveDenier": int(round(effective_denier)),
        "denierPerEnd": int(round(denier)),
        "effectiveDenierPerEnd": int(round(effective_denier)),
        "totalCarrierDenier": int(round(denier * ends)),
        "effectiveCarrierDenier": int(round(effective_denier * ends)),
        "endsPerCarrier": int(round(ends)),
        "endPolymerAreaMm2": end_polymer_area,
        "equivalentEndDiameterMm": equivalent_end_diameter,
        "polymerAreaMm2": polymer_area,
        "envelopeAreaMm2": envelope_area,
        "targetPackingFraction": TARGET_PACKING_FRACTION,
        "packingFraction": packing_fraction,
        "contactPackingFraction": contact_packing_fraction,
        "maximumContactPackingFraction": MAX_CONTACT_PACKING_FRACTION,
        "capacityUtilization": capacity_utilization,
        "fitStatus": fit_status,
        "circumferenceMm": circumference,
        "circumferentialPitchMm": circumferential_pitch,
        "normalPitchMm": normal_pitch,
        "helicalPitchAxialMm": helical_pitch_axial,
        "patternRepeatRows": pattern_repeat_rows,
        "carrierReturnBlocks": family_count,
        "carrierReturnAxialMm": helical_pitch_axial,
        "carrierRevolutionCrossingEvents": carrier_count,
        "weaveRepeatAxialMm": weave_repeat_axial,
        "widthMm": width,
        "thicknessMm": thickness,
        "requiredThicknessMm": required_thickness,
        "minimumThicknessMm": minimum_thickness,
        "maximumThicknessMm": maximum_thickness,
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


def world_centers(points, dimensions):
    radius = dimensions["radiusMm"]
    surface_base_radius = dimensions["surfaceBaseRadiusMm"]
    centers = []
    outward_references = []
    for point in points:
        theta = point["arc"] / radius
        cosine = math.cos(theta)
        sine = math.sin(theta)
        outward = (0.0, cosine, sine)
        surface = surface_base_radius + point["radial"]
        center = (point["x"], cosine * surface, sine * surface)
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


def append_swept_mesh(points, dimensions, ring_segments):
    vertices = []
    uvs = []
    indices = []
    exponent = 2.0 / SUPERELLIPSE_ORDER
    centers, outward_references = world_centers(points, dimensions)
    frames = transported_frames(centers, outward_references)
    path_length_mm = sum(
        math.dist(centers[index - 1], centers[index])
        for index in range(1, len(centers))
    )

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
            deformation = outward_offset + saddle_offset
            vertices.extend([
                center[0] + across_axis[0] * across_offset + outward_axis[0] * deformation,
                center[1] + across_axis[1] * across_offset + outward_axis[1] * deformation,
                center[2] + across_axis[2] * across_offset + outward_axis[2] * deformation,
            ])
            uvs.extend([path_u, 0.5 + across_shape * 0.5])

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
    return {
        "vertices": vertices,
        "uvs": uvs,
        "indices": indices,
        "pathLengthMm": path_length_mm,
    }


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
        "denierScale": dimensions["denierScale"],
        "effectiveDenier": dimensions["effectiveDenier"],
        "endsPerCarrier": dimensions["endsPerCarrier"],
        "denierPerEnd": dimensions["denierPerEnd"],
        "effectiveDenierPerEnd": dimensions["effectiveDenierPerEnd"],
        "totalCarrierDenier": dimensions["totalCarrierDenier"],
        "effectiveCarrierDenier": dimensions["effectiveCarrierDenier"],
        "polymerAreaMm2": dimensions["polymerAreaMm2"],
        "envelopeAreaMm2": dimensions["envelopeAreaMm2"],
        "packingFraction": dimensions["packingFraction"],
        "contactPackingFraction": dimensions["contactPackingFraction"],
        "capacityUtilization": dimensions["capacityUtilization"],
        "fitStatus": dimensions["fitStatus"],
        "derivedDimensions": dimensions,
    }


def build_carrier_records(params, dimensions, visible_rows):
    carrier_count = dimensions["carrierCount"]
    family_count = dimensions["familyCount"]
    angle = math.radians(dimensions["braidAngleDeg"])
    slope = math.tan(angle)
    circumference = math.tau * dimensions["radiusMm"]
    pitch = circumference / family_count
    visible_rows = int(clamp(int(visible_rows), 8, 30))
    row_pitch_x = pitch / max(2.0 * slope, 0.2)
    length = max(pitch * 3.0, visible_rows * row_pitch_x)
    xmin = -length * 0.5
    xmax = length * 0.5
    offsets = [-circumference * 0.5 + (index + 0.5) * pitch for index in range(family_count)]
    opposite_lines = periodic_crossing_lines(offsets, circumference, slope, xmin, xmax)
    span = crossing_span(params.get("crossingMode", "diamond"))
    # Resolve the rounded approach to each contact rather than interpolating
    # a small number of long, visibly faceted sweep segments.
    steps = max(192, visible_rows * (12 if carrier_count <= 16 else 7))
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
        ),
    }


def calibrate_surface_radius(params, dimensions):
    """Fit the swept mesh, not an ideal cylinder, to the selected rope radius."""
    target_radius = dimensions["radiusMm"]
    corrections = []
    for _ in range(2):
        topology = build_carrier_records(params, dimensions, 8)
        yarns = [
            record_to_yarn(
                record,
                dimensions,
                ring_segments_for_carrier_count(dimensions["carrierCount"]),
            )
            for record in topology["records"]
        ]
        measured_radius = max(
            math.hypot(vertices[index + 1], vertices[index + 2])
            for yarn in yarns
            for vertices in (yarn["mesh"]["vertices"],)
            for index in range(0, len(vertices), 3)
        )
        correction = target_radius - measured_radius
        corrections.append(correction)
        dimensions["surfaceBaseRadiusMm"] += correction
    dimensions["surfaceRadiusCalibrationMm"] = sum(corrections)
    return dimensions


def build_rope(params, dimensions):
    carrier_count = dimensions["carrierCount"]
    family_count = dimensions["familyCount"]
    topology = build_carrier_records(params, dimensions, params.get("visibleRows", 30))
    ring_segments = ring_segments_for_carrier_count(carrier_count)
    yarns = [record_to_yarn(record, dimensions, ring_segments) for record in topology["records"]]
    outer_radius = max(
        math.hypot(vertices[index + 1], vertices[index + 2])
        for yarn in yarns
        for vertices in (yarn["mesh"]["vertices"],)
        for index in range(0, len(vertices), 3)
    )
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
        "meshOuterRadiusMm": outer_radius,
        "meshOuterDiameterMm": outer_radius * 2.0,
        "diameterErrorMm": outer_radius * 2.0 - dimensions["diameterMm"],
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
    ring_segments = 25
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
        "crossingSource": "cropped_from_full_rope_topology",
        "yarns": yarns,
    })
    return report


def build_geometry(params):
    dimensions = calibrate_surface_radius(params, carrier_dimensions(params))
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
