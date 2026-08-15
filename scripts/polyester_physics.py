"""Physical parameter mapping for polyester multifilament braid proofs."""

from dataclasses import asdict, dataclass
import json
import math


PET_DENSITY_KG_M3 = 1380.0
DENIER_METERS = 9000.0
REFERENCE_DIAMETER_MM = 16.0
REFERENCE_CARRIER_COUNT = 16
REFERENCE_BRAID_ANGLE_DEGREES = 34.0
REFERENCE_YARN_END_COUNT = 20
REFERENCE_DENIER_PER_END = 1000.0
CYLINDRICAL_CONTACT_FACTOR = 1.55 / (
    2.0 * math.cos(math.radians(REFERENCE_BRAID_ANGLE_DEGREES))
)


def denier_area_mm2(denier: float, density_kg_m3: float = PET_DENSITY_KG_M3) -> float:
    """Return solid polymer cross-sectional area for a linear density in denier."""
    if denier <= 0 or density_kg_m3 <= 0:
        raise ValueError("denier and density must be positive")
    kg_per_meter = denier / 9_000_000.0
    return kg_per_meter / density_kg_m3 * 1_000_000.0


def circular_radius_mm(denier: float, density_kg_m3: float = PET_DENSITY_KG_M3) -> float:
    return math.sqrt(denier_area_mm2(denier, density_kg_m3) / math.pi)


def calibrated_microfilament_radius_um(
    denier_per_microfilament: float,
    denier_geometry_calibration: float = 1.0,
) -> float:
    """Return the rendered PET filament radius after visual denier calibration."""
    if denier_geometry_calibration <= 0:
        raise ValueError("denier_geometry_calibration must be positive")
    return circular_radius_mm(
        denier_per_microfilament * denier_geometry_calibration
    ) * 1000.0


def cohesive_yarn_end_profile(
    envelope_area_mm2: float,
    carrier_width_mm: float,
    yarn_end_count: int,
    natural_aspect_ratio: float = 1.35,
    overlap_ratio: float = 1.04,
) -> tuple[float, float]:
    """Return an area-preserving yarn-end profile that fills its carrier lane."""
    if envelope_area_mm2 <= 0 or carrier_width_mm <= 0:
        raise ValueError("envelope area and carrier width must be positive")
    if yarn_end_count < 1 or natural_aspect_ratio <= 0 or overlap_ratio < 1.0:
        raise ValueError("invalid yarn-end profile parameters")

    natural_width = math.sqrt(
        4.0 * envelope_area_mm2 * natural_aspect_ratio / math.pi
    )
    cohesive_width = carrier_width_mm / yarn_end_count * overlap_ratio
    width = max(natural_width, cohesive_width)
    height = 4.0 * envelope_area_mm2 / (math.pi * width)
    return width, height


def quantized_filament_count(yarn_denier: float, target_dpf: float = 2.25) -> int:
    """Infer a renderable industrial multifilament count from yarn denier.

    Denier alone does not uniquely determine filament count. The model therefore
    exposes target denier-per-filament and quantizes the result to a 12-filament
    spinneret multiple. The chosen default is an explicit calibration parameter,
    not a hidden physical claim.
    """
    if target_dpf <= 0:
        raise ValueError("target_dpf must be positive")
    return max(12, int(round((yarn_denier / target_dpf) / 12.0)) * 12)


@dataclass(frozen=True)
class CarrierPhysics:
    rope_diameter_mm: float
    carrier_count: int
    yarn_ends_per_carrier: int
    denier_per_yarn_end: float
    microfilaments_per_yarn_end: int
    denier_per_microfilament: float
    microfilament_radius_um: float
    total_microfilaments_per_carrier: int
    total_denier_per_carrier: float
    polymer_area_mm2: float
    packed_envelope_area_mm2: float
    carrier_width_mm: float
    carrier_thickness_mm: float
    required_carrier_width_mm: float
    fill_ratio: float
    braid_angle_degrees: float
    packing_fraction: float


def carrier_physics(
    *,
    rope_diameter_mm: float = 16.0,
    carrier_count: int = 16,
    yarn_ends_per_carrier: int = 20,
    denier_per_yarn_end: float = 1000.0,
    braid_angle_degrees: float = 34.0,
    target_dpf: float = 2.25,
    packing_fraction: float = 0.82,
    yarn_width_scale: float = 1.0,
) -> CarrierPhysics:
    if carrier_count < 4 or carrier_count % 2:
        raise ValueError("carrier_count must be even and at least 4")
    if yarn_ends_per_carrier < 1:
        raise ValueError("yarn_ends_per_carrier must be positive")
    if not 0 < packing_fraction < 1:
        raise ValueError("packing_fraction must be between 0 and 1")
    if yarn_width_scale <= 0:
        raise ValueError("yarn_width_scale must be positive")

    microfilaments = quantized_filament_count(denier_per_yarn_end, target_dpf)
    dpf = denier_per_yarn_end / microfilaments
    micro_radius_um = circular_radius_mm(dpf) * 1000.0
    total_denier = yarn_ends_per_carrier * denier_per_yarn_end
    polymer_area = denier_area_mm2(total_denier)
    envelope_area = polymer_area / packing_fraction

    reference_width = (
        2.0 * math.pi * REFERENCE_DIAMETER_MM
        * math.cos(math.radians(REFERENCE_BRAID_ANGLE_DEGREES))
        / REFERENCE_CARRIER_COUNT
        * CYLINDRICAL_CONTACT_FACTOR
    )
    reference_total_denier = REFERENCE_YARN_END_COUNT * REFERENCE_DENIER_PER_END
    carrier_width = (
        reference_width
        * math.sqrt(total_denier / reference_total_denier)
        * yarn_width_scale
    )
    carrier_thickness = envelope_area / carrier_width
    required_width = (
        2.0 * math.pi * rope_diameter_mm
        * math.cos(math.radians(braid_angle_degrees))
        / carrier_count
        * CYLINDRICAL_CONTACT_FACTOR
    )
    fill_ratio = carrier_width / required_width

    return CarrierPhysics(
        rope_diameter_mm=rope_diameter_mm,
        carrier_count=carrier_count,
        yarn_ends_per_carrier=yarn_ends_per_carrier,
        denier_per_yarn_end=denier_per_yarn_end,
        microfilaments_per_yarn_end=microfilaments,
        denier_per_microfilament=dpf,
        microfilament_radius_um=micro_radius_um,
        total_microfilaments_per_carrier=yarn_ends_per_carrier * microfilaments,
        total_denier_per_carrier=total_denier,
        polymer_area_mm2=polymer_area,
        packed_envelope_area_mm2=envelope_area,
        carrier_width_mm=carrier_width,
        carrier_thickness_mm=carrier_thickness,
        required_carrier_width_mm=required_width,
        fill_ratio=fill_ratio,
        braid_angle_degrees=braid_angle_degrees,
        packing_fraction=packing_fraction,
    )


if __name__ == "__main__":
    print(json.dumps(asdict(carrier_physics()), indent=2))
