import { getCarrierDirection, topDirectionAt } from "../../utils/braidMatrix.js";

export function buildYarnPaths({
  recipe = {},
  machineProfile = null,
  simulatorOutput = null,
  steps = 96,
  length = 300,
  ropeRadius = 5,
  yarnRadius = null,
  angularStep = null,
  overOffset = null,
  underOffset = null,
  samplesPerStep = 3
} = {}) {
  const carrierLayout = normalizeCarrierLayout(recipe, machineProfile);
  const carrierCount = carrierLayout.length;
  const braidLogic = normalizeBraidLogic(recipe, machineProfile);

  if (!carrierCount) {
    return {
      carrierCount: 0,
      braidLogic,
      length,
      ropeRadius,
      yarnRadius,
      carrierPaths: [],
      visibleSegments: [],
      warnings: ["No carrier layout available for geometry preview."]
    };
  }

  const pathSteps = clampStepCount(simulatorOutput?.analysis?.steps || steps);
  const resolvedYarnRadius = resolveYarnRadius({ yarnRadius, ropeRadius });
  const surface = buildUnwrappedBraidSurface({
    carrierLayout,
    machineProfile,
    braidLogic,
    steps: pathSteps,
    length,
    ropeRadius,
    yarnRadius: resolvedYarnRadius,
    angularStep,
    overOffset,
    underOffset
  });

  const carrierPaths = surface.carrierPaths.map((path) => projectCarrierPathOnSurface({
    path,
    surface,
    samplesPerStep
  }));

  return {
    carrierCount,
    braidLogic,
    length,
    ropeRadius,
    yarnRadius: resolvedYarnRadius,
    surface,
    carrierPaths,
    visibleSegments: carrierPaths.flatMap((path) => path.visibleSegments),
    warnings: []
  };
}

export function buildUnwrappedBraidSurface({
  carrierLayout = [],
  machineProfile = null,
  braidLogic = "1_over_1",
  steps = 96,
  length = 300,
  ropeRadius = 5,
  yarnRadius = null,
  angularStep = null,
  overOffset = null,
  underOffset = null
} = {}) {
  const carriers = carrierLayout
    .filter((carrier) => Number.isFinite(Number(carrier.carrier_no)))
    .map((carrier) => ({
      carrier_no: Number(carrier.carrier_no),
      color: carrier.color || "white",
      strand_role: carrier.strand_role || "sheath",
      direction: getCarrierDirection(Number(carrier.carrier_no), machineProfile)
    }))
    .sort((a, b) => a.carrier_no - b.carrier_no);
  const carrierCount = carriers.length;
  const normalizedSteps = clampStepCount(steps);
  const resolvedYarnRadius = resolveYarnRadius({ yarnRadius, ropeRadius });
  const resolvedAngularStep = Number.isFinite(Number(angularStep))
    ? Number(angularStep)
    : (Math.PI * 2) / Math.max(carrierCount, 1);
  const resolvedOverOffset = Number.isFinite(Number(overOffset))
    ? Number(overOffset)
    : resolvedYarnRadius * 0.35;
  const resolvedUnderOffset = Number.isFinite(Number(underOffset))
    ? Number(underOffset)
    : -resolvedYarnRadius * 0.15;
  const circumference = Math.PI * 2 * ropeRadius;
  const stepLength = length / Math.max(normalizedSteps - 1, 1);
  const columnWidth = carrierCount ? circumference / carrierCount : 0;
  const crossingSchedule = buildCrossingSchedule({ braidLogic, steps: normalizedSteps, carrierCount });
  const carrierPaths = carriers.map((carrier) => buildHelicalCarrierPath({
    carrier,
    carrierCount,
    steps: normalizedSteps,
    angularStep: resolvedAngularStep
  }));

  return {
    carrierCount,
    braidLogic,
    length,
    ropeRadius,
    yarnRadius: resolvedYarnRadius,
    yarnCrossSection: {
      type: "circular",
      radius: resolvedYarnRadius
    },
    angularStep: resolvedAngularStep,
    overOffset: resolvedOverOffset,
    underOffset: resolvedUnderOffset,
    circumference,
    stepLength,
    columnWidth,
    carrierPaths,
    crossingSchedule
  };
}

export function normalizeCarrierLayout(recipe = {}, machineProfile = null) {
  const sheet = recipe.technicalSheet || recipe.technical_sheet || recipe.generated_recipe?.technical_sheet || {};
  const layout = recipe.carrierLayout || recipe.carrier_layout || sheet.carrier_layout || [];
  const sequence = recipe.colorSequence || recipe.color_sequence || sheet.colorSequence || sheet.color_sequence || [];
  const colorMap = recipe.carrierColorMap || recipe.carrier_color_map || {};
  const carrierCount = Number(
    recipe.carrierCount
    || recipe.carrier_count
    || sheet.carrierCount
    || sheet.carrier_count
    || machineProfile?.carrierCount
    || layout.length
    || sequence.length
    || Object.keys(colorMap).length
    || 0
  );

  return Array.from({ length: carrierCount }, (_, index) => {
    const carrierNo = index + 1;
    const existing = layout.find((carrier) => Number(carrier.carrier_no || carrier.carrierNo) === carrierNo);
    const color = existing?.color || sequence[index] || colorMap[String(carrierNo)] || colorMap[carrierNo] || "white";
    return {
      carrier_no: carrierNo,
      color,
      strand_role: existing?.strand_role || existing?.role || (color === "white" ? "sheath" : "sheath_marker")
    };
  });
}

export function normalizeBraidLogic(recipe = {}, machineProfile = null) {
  const sheet = recipe.technicalSheet || recipe.technical_sheet || recipe.generated_recipe?.technical_sheet || {};
  const value = String(
    recipe.braidLogic
    || recipe.braid_logic
    || recipe.braid_walk_type
    || recipe.metadata?.braidLogic
    || sheet.walkType
    || sheet.walk_type
    || sheet.braid_walk_type
    || machineProfile?.defaultWalk
    || "1_over_1"
  ).toLowerCase();

  if (value.includes("2_over_2") || value.includes("two-over-two") || value.includes("twill") || value.includes("2 üst") || value.includes("2 alt")) {
    return "2_over_2";
  }
  return "1_over_1";
}

function projectCarrierPathOnSurface({
  path,
  surface,
  samplesPerStep
}) {
  const points = [];
  const visibleSegments = [];
  let currentSegment = null;
  const sampleCount = Math.max(1, Math.round(samplesPerStep));
  const lastTime = Math.max(path.points[path.points.length - 1]?.time || 1, 1);

  for (let index = 0; index < path.points.length; index += 1) {
    const point = path.points[index];
    const next = path.points[index + 1] || null;
    const samples = next ? sampleCount : 1;

    for (let sample = 0; sample < samples; sample += 1) {
      const mix = samples === 1 ? 0 : sample / samples;
      const time = lerp(point.time, next?.time ?? point.time, mix);
      const column = interpolateColumn(point.column, next?.column ?? point.column, surface.carrierCount, mix);
      const theta = interpolateAngle(point.theta, next?.theta ?? point.theta, mix);
      const surfacePoint = buildSurfacePoint({
        carrier: path.carrier,
        time,
        column,
        theta,
        lastTime,
        surface
      });
      const projected = mapSurfacePointToCylinder(surfacePoint, surface);

      points.push(projected);
      if (projected.top && !currentSegment) {
        currentSegment = {
          carrier_no: path.carrier.carrier_no,
          color: path.carrier.color,
          direction: path.carrier.direction,
          points: []
        };
      }
      if (projected.top) currentSegment.points.push(projected);
      if (!projected.top && currentSegment) {
        if (currentSegment.points.length > 1) visibleSegments.push(currentSegment);
        currentSegment = null;
      }
    }
  }

  if (currentSegment?.points.length > 1) visibleSegments.push(currentSegment);

  return {
    carrier: path.carrier,
    points,
    visibleSegments
  };
}

function buildSurfacePoint({
  carrier,
  time,
  column,
  theta,
  lastTime,
  surface
}) {
  const wrappedColumn = positiveModulo(column, surface.carrierCount);
  const top = topDirectionAt({
    time: Math.round(time),
    column: Math.round(wrappedColumn),
    braidLogic: surface.braidLogic
  }) === carrier.direction;

  return {
    carrier_no: carrier.carrier_no,
    color: carrier.color,
    direction: carrier.direction,
    time,
    column: wrappedColumn,
    theta,
    top,
    u: (time / lastTime) * surface.length,
    v: positiveModulo(theta, Math.PI * 2) / (Math.PI * 2) * surface.circumference,
    radialOffset: top ? surface.overOffset : surface.underOffset
  };
}

export function mapSurfacePointToCylinder(surfacePoint, surface) {
  const theta = (surfacePoint.v / Math.max(surface.circumference, 1)) * Math.PI * 2;
  const radius = surface.ropeRadius + surface.yarnRadius + surfacePoint.radialOffset;

  return {
    ...surfacePoint,
    radius,
    x: surfacePoint.u - surface.length / 2,
    y: Math.cos(theta) * radius,
    z: Math.sin(theta) * radius
  };
}

export function buildCrossingSchedule({ braidLogic = "1_over_1", steps = 0, carrierCount = 0 } = {}) {
  return Array.from({ length: Math.max(0, steps) }, (_, time) => (
    Array.from({ length: Math.max(0, carrierCount) }, (_, column) => ({
      time,
      column,
      topDirection: topDirectionAt({ time, column, braidLogic })
    }))
  ));
}

function buildHelicalCarrierPath({ carrier, carrierCount, steps, angularStep }) {
  const directionSign = carrier.direction === "clockwise" ? 1 : -1;
  const phase = ((carrier.carrier_no - 1) / Math.max(carrierCount, 1)) * Math.PI * 2;
  const points = Array.from({ length: Math.max(0, steps) }, (_, time) => {
    const theta = phase + directionSign * time * angularStep;
    return {
      time,
      theta,
      phase,
      directionSign,
      column: positiveModulo((carrier.carrier_no - 1) + directionSign * time, carrierCount)
    };
  });

  return {
    carrier,
    phase,
    directionSign,
    angularStep,
    points
  };
}

function interpolateColumn(current, next, carrierCount, mix) {
  const half = carrierCount / 2;
  let adjustedNext = next;
  if (next - current > half) adjustedNext = next - carrierCount;
  if (next - current < -half) adjustedNext = next + carrierCount;
  return lerp(current, adjustedNext, mix);
}

function interpolateAngle(current, next, mix) {
  let adjustedNext = next;
  const full = Math.PI * 2;
  if (next - current > Math.PI) adjustedNext = next - full;
  if (next - current < -Math.PI) adjustedNext = next + full;
  return lerp(current, adjustedNext, mix);
}

function resolveYarnRadius({ yarnRadius, ropeRadius }) {
  const explicit = Number(yarnRadius);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(0.02, Number(ropeRadius || 5) * 0.065);
}

function clampStepCount(value) {
  const numeric = Number(value || 96);
  if (!Number.isFinite(numeric)) return 96;
  return Math.max(2, Math.min(512, Math.round(numeric)));
}

function lerp(start, end, mix) {
  return start + (end - start) * mix;
}

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}
