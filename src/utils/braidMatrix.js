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

export function topDirectionAt({ time, column: _column, braidLogic = "1_over_1" }) {
  const value = String(braidLogic || "").toLowerCase();
  const span = value.includes("2_over_2") || value.includes("two-over-two") || value.includes("twill") || value.includes("2 üst") || value.includes("2 alt") ? 2 : 1;
  const counterRotating = value.includes("counter-rotating") || value.includes("counter_rotating") || value.includes("karşı");
  // time baz alınır: CW → column = start+time, CCW → column = start-time
  // (time+column) kullanılırsa her kukla için parite sabit kalır → hatalı.
  // time tek başına kullanılınca her time adımında üst/alt değişir → doğru.
  const clockwiseOnTop = Math.floor(time / span) % 2 === 0;
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
