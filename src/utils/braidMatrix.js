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
    const row = [];
    for (let column = 0; column < carrierCount; column += 1) {
      const clockwise = findCarrierAt({ carriers, carrierCount, column, time, direction: "clockwise" });
      const counterClockwise = findCarrierAt({ carriers, carrierCount, column, time, direction: "counterClockwise" });
      const topDirection = topDirectionAt({ time, column, braidLogic });
      const topCarrier = topDirection === "clockwise"
        ? clockwise || counterClockwise
        : counterClockwise || clockwise;
      const underCarrier = topCarrier === clockwise ? counterClockwise : clockwise;

      row.push({
        time,
        column,
        topDirection: topCarrier?.direction || topDirection,
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

export function topDirectionAt({ time, column, braidLogic = "1_over_1" }) {
  const value = String(braidLogic || "").toLowerCase();
  const span = value.includes("2_over_2") || value.includes("two-over-two") || value.includes("twill") ? 2 : 1;
  return Math.floor((time + column) / span) % 2 === 0 ? "clockwise" : "counterClockwise";
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
