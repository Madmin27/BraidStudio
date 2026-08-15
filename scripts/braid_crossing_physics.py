"""Finite-width over-under contact model for cylindrical maypole braids."""

from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class CrossingState:
    layer_sign: float
    contact: float
    nearest_event: int


def crossing_spacing(family_count: int, helix_rate: float) -> float:
    """Axial distance between consecutive S/Z centerline crossings."""
    if family_count < 2 or helix_rate <= 0:
        raise ValueError("family_count and helix_rate must be positive")
    return math.pi / (family_count * helix_rate)


def seamless_repeat_length(helix_rate: float, family_count: int,
                           crossing_span: int, minimum_length: float) -> tuple[float, int]:
    """Return a whole carrier/crossing repeat and its helix-turn count."""
    if helix_rate <= 0 or family_count < 1 or crossing_span < 1 or minimum_length <= 0:
        raise ValueError("repeat inputs must be positive")
    helix_period = math.tau / helix_rate
    crossing_multiplier = crossing_span // math.gcd(family_count, crossing_span)
    minimum_turns = max(1, math.ceil(minimum_length / helix_period))
    period_count = math.ceil(minimum_turns / crossing_multiplier) * crossing_multiplier
    return helix_period * period_count, period_count


def contact_half_length(carrier_width: float, braid_angle_radians: float,
                        spacing: float) -> float:
    """Half of the axial overlap footprint of two equal finite-width ribbons."""
    if carrier_width <= 0 or spacing <= 0:
        raise ValueError("carrier_width and spacing must be positive")
    sine = max(math.sin(braid_angle_radians), 1e-6)
    physical = carrier_width / (4.0 * sine)
    # Leave a narrow collision-free interval in which radial order can swap.
    return min(physical, spacing * 0.46)


def event_order(event_index: int, family_direction: int, span: int = 1) -> int:
    """Return +1 for over and -1 for under at one crossing event.

    All S carriers share an event order on a symmetric maypole crossing ring.
    The corresponding Z carrier receives the exact opposite order.
    """
    if family_direction not in (-1, 1):
        raise ValueError("family_direction must be -1 or 1")
    if span < 1:
        raise ValueError("span must be positive")
    s_order = 1 if (event_index // span) % 2 == 0 else -1
    return s_order if family_direction > 0 else -s_order


def saturated_layer_profile(value: float, sharpness: float = 3.2) -> float:
    """Keep a carrier fully over/under except in a narrow swap interval."""
    if sharpness <= 0:
        raise ValueError("sharpness must be positive")
    clamped = max(-1.0, min(1.0, value))
    return math.tanh(sharpness * clamped) / math.tanh(sharpness)


def crossing_state(x: float, *, spacing: float, contact_half: float,
                   family_direction: int, span: int = 1) -> CrossingState:
    """Evaluate radial order and compression at a finite-width crossing.

    Radial separation reaches its maximum at the crossing center and tapers to
    zero at the finite-width contact edge. This makes a continuous yarn path
    instead of a sequence of raised rectangular patches.
    """
    if not 0 < contact_half < spacing * 0.5:
        raise ValueError("contact_half must be between zero and half spacing")

    left_event = math.floor(x / spacing)
    left_x = left_event * spacing
    local = x - left_x
    right_event = left_event + 1
    left_distance = local
    right_distance = spacing - local
    if left_distance <= right_distance:
        nearest_event = left_event
        event_distance = left_distance
    else:
        nearest_event = right_event
        event_distance = right_distance
    if event_distance >= contact_half:
        return CrossingState(0.0, 0.0, nearest_event)

    normalized_distance = event_distance / contact_half
    separation = math.cos(math.pi * normalized_distance / 2.0)
    order = event_order(nearest_event, family_direction, span)
    return CrossingState(order * separation, separation * separation, nearest_event)


def carrier_bundle_profile(sample_positions: list[float], *, spacing: float,
                           contact_half: float, family_direction: int,
                           span: int = 1) -> tuple[CrossingState, ...]:
    """Build one shared over-under profile for every fiber in a carrier bundle."""
    return tuple(
        crossing_state(
            x,
            spacing=spacing,
            contact_half=contact_half,
            family_direction=family_direction,
            span=span,
        )
        for x in sample_positions
    )


def adaptive_sample_positions(length: float, spacing: float,
                              contact_half: float) -> list[float]:
    """Place curve samples at crossing centers and contact boundaries."""
    if length <= 0:
        raise ValueError("length must be positive")
    start = -length / 2.0
    end = length / 2.0
    values = {start, end}

    # Baseline samples preserve the helix between crossing events.
    # Native fiber curves are rendered directly. Six samples per crossing keep
    # the carrier tangent smooth enough that a repeated over/under transition
    # cannot read as a joined strip or a faceted roof.
    baseline_count = max(49, int(math.ceil(length / spacing)) * 6 + 1)
    for index in range(baseline_count):
        values.add(start + length * index / (baseline_count - 1))

    first_event = math.floor(start / spacing) - 1
    last_event = math.ceil(end / spacing) + 1
    for event in range(first_event, last_event + 1):
        center = event * spacing
        for value in (center - contact_half, center, center + contact_half):
            if start <= value <= end:
                values.add(value)

    return sorted(values)
