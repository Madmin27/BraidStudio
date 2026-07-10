import { buildBraidWalkMap } from "../engine/braidWalkMap.js";

export function getCarrierDirection(carrierNo, machineProfile = null) {
  const groups = machineProfile?.carrierGroups || {};
  if ((groups.clockwise || groups.trackA || []).includes(carrierNo)) return "clockwise";
  if ((groups.counterClockwise || groups.trackB || []).includes(carrierNo)) return "counterClockwise";
  return carrierNo % 2 === 1 ? "clockwise" : "counterClockwise";
}

export function buildBraidMatrix({
  carrierLayout = [],
  machineProfile = null,
  braidLogic = "1_over_1",
  steps = 30
} = {}) {
  const carriers = carrierLayout
    .filter((carrier) => Number.isFinite(Number(carrier.carrier_no)))
    .map((carrier) => ({
      carrier_no: Number(carrier.carrier_no),
      color: carrier.color,
      strand_role: carrier.strand_role || "sheath",
      direction: getCarrierDirection(Number(carrier.carrier_no), machineProfile)
    }))
    .sort((a, b) => a.carrier_no - b.carrier_no);
  const carrierCount = carriers.length;
  if (!carrierCount) {
    return {
      carrierCount: 0,
      steps: 0,
      braidLogic,
      cells: [],
      carrierPaths: []
    };
  }

  const normalizedSteps = Math.max(1, Number(steps || 30));
  if (usesWalkMap(machineProfile, braidLogic)) {
    return buildWalkMapMatrix({ carriers, machineProfile, braidLogic, steps: normalizedSteps });
  }
  const cells = [];
  const carrierPaths = carriers.map((carrier) => ({ carrier, points: [] }));

  for (let time = 0; time < normalizedSteps; time += 1) {
    // Build column→carrier map for this time step
    // Each column has exactly one carrier
    const colToCarrier = {};
    for (const carrier of carriers) {
      colToCarrier[carrierColumnAt(carrier, carrierCount, time)] = carrier;
    }

    const row = [];
    for (let column = 0; column < carrierCount; column += 1) {
      const primary = colToCarrier[column];
      if (!primary) continue;

      // Find crossing partner from adjacent column.
      // CW carriers move right (→), their crossing partner is a CCW carrier at column+1 (moving left).
      // CCW carriers move left (←), their crossing partner is a CW carrier at column-1 (moving right).
      const partnerCol = primary.direction === "clockwise"
        ? (column + 1) % carrierCount
        : (column - 1 + carrierCount) % carrierCount;
      const partner = colToCarrier[partnerCol] || null;

      const cwCarrier = primary.direction === "clockwise" ? primary
        : (partner && partner.direction === "clockwise" ? partner : null);
      const ccwCarrier = primary.direction === "counterClockwise" ? primary
        : (partner && partner.direction === "counterClockwise" ? partner : null);

      const topDirection = topDirectionAt({ time, column, braidLogic });
      const topCarrier = topDirection === "clockwise" ? cwCarrier : ccwCarrier;
      const underCarrier = topDirection === "clockwise" ? ccwCarrier : cwCarrier;

      row.push({
        time,
        column,
        topDirection,
        cwCarrier,
        ccwCarrier,
        topCarrier,
        underCarrier,
        visibleColor: topCarrier?.color || null
      });
    }
    cells.push(row);

    for (const path of carrierPaths) {
      path.points.push({
        time,
        column: carrierColumnAt(path.carrier, carrierCount, time)
      });
    }
  }

  return {
    carrierCount,
    steps: normalizedSteps,
    braidLogic,
    cells,
    carrierPaths
  };
}

function usesWalkMap(machineProfile, braidLogic) {
  const walkType = String(machineProfile?.walkType || "").toLowerCase();
  const logic = String(braidLogic || "").toLowerCase();
  return walkType === "pair_swap_provisional"
    && (logic.includes("1_over_1") || logic.includes("one-over-one") || logic.includes("standard"));
}

function buildWalkMapMatrix({ carriers, machineProfile, braidLogic, steps }) {
  const walkMap = buildBraidWalkMap({ machineProfile, head: 1, ticks: steps });
  const carriersByNo = new Map(carriers.map((carrier) => [carrier.carrier_no, carrier]));
  const carrierPaths = carriers.map((carrier) => ({ carrier, points: [] }));
  const pathsByCarrierNo = new Map(carrierPaths.map((path) => [path.carrier.carrier_no, path]));
  const cells = walkMap.frames.map((frame) => {
    const crossings = new Map();
    for (const transition of frame.transitions) {
      const crossing = crossings.get(transition.crossingId) || [];
      crossing.push(transition);
      crossings.set(transition.crossingId, crossing);
      pathsByCarrierNo.get(transition.carrierNo)?.points.push({
        time: frame.tick,
        column: transition.fromSlot,
        slot: transition.fromSlot,
        crossingId: transition.crossingId,
        layer: transition.layer
      });
    }
    return [...crossings.values()]
      .sort((left, right) => Math.min(...left.map((item) => item.fromSlot)) - Math.min(...right.map((item) => item.fromSlot)))
      .map((crossing, column) => {
      const topTransition = crossing.find((transition) => transition.layer === "top");
      const underTransition = crossing.find((transition) => transition.layer === "under");
      const topCarrier = carriersByNo.get(topTransition.carrierNo);
      const underCarrier = carriersByNo.get(underTransition.carrierNo);
      return {
        time: frame.tick,
        column,
        topDirection: topCarrier.direction,
        cwCarrier: topCarrier.direction === "clockwise" ? topCarrier : underCarrier,
        ccwCarrier: topCarrier.direction === "counterClockwise" ? topCarrier : underCarrier,
        topCarrier,
        underCarrier,
        visibleColor: topCarrier.color,
        crossingId: topTransition.crossingId,
        sourceTick: frame.tick,
        walkMapVersion: walkMap.walkMapVersion,
        slots: crossing.map((transition) => transition.fromSlot).sort((left, right) => left - right)
      };
    });
  });

  return {
    carrierCount: Math.max(1, carriers.length / 2),
    steps,
    braidLogic,
    cells,
    carrierPaths,
    walkMap
  };
}

export function topDirectionAt({ time, column: _column, braidLogic = "1_over_1" }) {
  const value = String(braidLogic || "").toLowerCase();
  const span = value.includes("2_over_2") || value.includes("two-over-two") || value.includes("twill") || value.includes("2 üst") || value.includes("2 alt") ? 2 : 1;
  const counterRotating = value.includes("counter-rotating") || value.includes("counter_rotating") || value.includes("karşı");
  // Örgü: zaman ve column'a göre üst/alt değişir — column eklenmezse carrier bazında sabit parity oluşur
  const clockwiseOnTop = (Math.floor(time / span) + _column) % 2 === 0;
  if (counterRotating) {
    return clockwiseOnTop ? "counterClockwise" : "clockwise";
  }
  return clockwiseOnTop ? "clockwise" : "counterClockwise";
}

function findCarrierAt({ carriers, carrierCount, column, time, direction }) {
  return carriers.find((carrier) => (
    carrier.direction === direction && carrierColumnAt(carrier, carrierCount, time) === column
  )) || null;
}

function carrierColumnAt(carrier, carrierCount, time) {
  const start = carrier.carrier_no - 1;
  const delta = carrier.direction === "clockwise" ? time : -time;
  return ((start + delta) % carrierCount + carrierCount) % carrierCount;
}
