const DEFAULT_PHASES = [
  { pairOffset: 0, clockwiseOnTop: true },
  { pairOffset: 1, clockwiseOnTop: false }
];

export function buildBraidWalkMap({ machineProfile, ticks = 16, head = 1 } = {}) {
  const profile = normalizeProfile(machineProfile);
  const normalizedTicks = normalizeTicks(ticks);
  const normalizedHead = normalizeHead(profile, head);
  const initialSlots = initialSlotsFor(profile, normalizedHead);
  let slotsByCarrier = initialSlots;
  const frames = [];

  for (let tick = 0; tick < normalizedTicks; tick += 1) {
    const phaseIndex = tick % profile.phases.length;
    const phase = profile.phases[phaseIndex];
    const transitions = [];
    const nextSlotsByCarrier = new Map();

    for (const [leftSlot, rightSlot] of pairsFor(profile.slotCount, phase.pairOffset)) {
      const leftCarrierNo = carrierAtSlot(slotsByCarrier, leftSlot);
      const rightCarrierNo = carrierAtSlot(slotsByCarrier, rightSlot);
      const crossingId = `${normalizedHead}:${tick}:${leftSlot}-${rightSlot}`;
      const leftDirection = directionFor(leftCarrierNo, profile);
      const rightDirection = directionFor(rightCarrierNo, profile);
      const clockwiseCarrierNo = leftDirection === "clockwise" ? leftCarrierNo : rightCarrierNo;
      const counterClockwiseCarrierNo = leftDirection === "counterClockwise" ? leftCarrierNo : rightCarrierNo;
      const topCarrierNo = phase.clockwiseOnTop ? clockwiseCarrierNo : counterClockwiseCarrierNo;

      transitions.push(createTransition({
        head: normalizedHead,
        tick,
        carrierNo: leftCarrierNo,
        partnerCarrierNo: rightCarrierNo,
        fromSlot: leftSlot,
        toSlot: rightSlot,
        crossingId,
        direction: leftDirection,
        layer: leftCarrierNo === topCarrierNo ? "top" : "under"
      }));
      transitions.push(createTransition({
        head: normalizedHead,
        tick,
        carrierNo: rightCarrierNo,
        partnerCarrierNo: leftCarrierNo,
        fromSlot: rightSlot,
        toSlot: leftSlot,
        crossingId,
        direction: rightDirection,
        layer: rightCarrierNo === topCarrierNo ? "top" : "under"
      }));
      nextSlotsByCarrier.set(leftCarrierNo, rightSlot);
      nextSlotsByCarrier.set(rightCarrierNo, leftSlot);
    }

    const validation = validateFrame({ transitions, carrierCount: profile.carrierCount, slotCount: profile.slotCount });
    frames.push({ head: normalizedHead, tick, phaseIndex, transitions, validation });
    slotsByCarrier = nextSlotsByCarrier;
  }

  return {
    machineProfileId: profile.machineProfileId,
    walkMapVersion: profile.walkMapVersion,
    status: profile.status,
    provisional: profile.status !== "validated",
    head: normalizedHead,
    carrierCount: profile.carrierCount,
    slotCount: profile.slotCount,
    frames,
    finalSlots: slotsObject(slotsByCarrier)
  };
}

export function validateWalkMap(walkMap) {
  const frameErrors = (walkMap?.frames || []).flatMap((frame) => frame.validation.errors.map((error) => ({ tick: frame.tick, error })));
  return { valid: frameErrors.length === 0, errors: frameErrors };
}

function normalizeProfile(machineProfile = {}) {
  const walkProgram = machineProfile.walkProgram || {};
  const carrierCount = Number(machineProfile.carriersPerHead || machineProfile.carrierCount || 0);
  const slotCount = Number(walkProgram.slotCount || carrierCount);
  if (!Number.isInteger(carrierCount) || carrierCount < 2 || carrierCount % 2 !== 0) {
    throw new Error("braid walk map requires an even carrier count of at least 2");
  }
  if (slotCount !== carrierCount) {
    throw new Error("braid walk map currently requires one slot per carrier");
  }
  const phases = Array.isArray(walkProgram.phases) && walkProgram.phases.length ? walkProgram.phases : DEFAULT_PHASES;
  return {
    machineProfileId: machineProfile.machineProfileId || "anonymous",
    walkMapVersion: Number(machineProfile.walkMapVersion || 1),
    status: machineProfile.status || "provisional",
    headCount: Number(machineProfile.headCount || 1),
    carrierCount,
    slotCount,
    phases,
    heads: Array.isArray(machineProfile.heads) ? machineProfile.heads : [],
    carrierGroups: machineProfile.carrierGroups || {}
  };
}

function normalizeTicks(ticks) {
  const value = Number(ticks);
  if (!Number.isInteger(value) || value < 1 || value > 256) {
    throw new Error("braid walk map ticks must be an integer from 1 to 256");
  }
  return value;
}

function normalizeHead(profile, head) {
  const value = Number(head);
  if (!Number.isInteger(value) || value < 1 || value > profile.headCount) {
    throw new Error(`head must be an integer from 1 to ${profile.headCount}`);
  }
  return value;
}

function initialSlotsFor(profile, head) {
  const headProfile = profile.heads.find((item) => Number(item.head) === head);
  const phase = positiveModulo(Number(headProfile?.slotPhase || 0), profile.slotCount);
  return new Map(Array.from({ length: profile.carrierCount }, (_, index) => [
    index + 1,
    positiveModulo(index + phase, profile.slotCount)
  ]));
}

function pairsFor(slotCount, pairOffset) {
  const pairs = [];
  const offset = positiveModulo(Number(pairOffset || 0), slotCount);
  for (let index = 0; index < slotCount; index += 2) {
    pairs.push([positiveModulo(offset + index, slotCount), positiveModulo(offset + index + 1, slotCount)]);
  }
  return pairs;
}

function carrierAtSlot(slotsByCarrier, slot) {
  for (const [carrierNo, occupiedSlot] of slotsByCarrier) {
    if (occupiedSlot === slot) return carrierNo;
  }
  throw new Error(`no carrier occupies slot ${slot}`);
}

function directionFor(carrierNo, profile) {
  if ((profile.carrierGroups.clockwise || []).includes(carrierNo)) return "clockwise";
  if ((profile.carrierGroups.counterClockwise || []).includes(carrierNo)) return "counterClockwise";
  return carrierNo % 2 === 1 ? "clockwise" : "counterClockwise";
}

function createTransition(transition) {
  return transition;
}

function validateFrame({ transitions, carrierCount, slotCount }) {
  const errors = [];
  const carriers = transitions.map((transition) => transition.carrierNo);
  const targetSlots = transitions.map((transition) => transition.toSlot);
  if (new Set(carriers).size !== carrierCount) errors.push("carrier coverage is incomplete or duplicated");
  if (new Set(targetSlots).size !== slotCount) errors.push("target slots are not unique");
  for (const transition of transitions) {
    const movement = signedSingleSlotMovement(transition.fromSlot, transition.toSlot, slotCount);
    if (transition.direction === "clockwise" && movement !== 1) {
      errors.push("clockwise carrier did not advance one slot clockwise");
    }
    if (transition.direction === "counterClockwise" && movement !== -1) {
      errors.push("counterClockwise carrier did not advance one slot counter-clockwise");
    }
  }

  const byCrossing = new Map();
  for (const transition of transitions) {
    const crossing = byCrossing.get(transition.crossingId) || [];
    crossing.push(transition);
    byCrossing.set(transition.crossingId, crossing);
  }
  for (const crossing of byCrossing.values()) {
    if (crossing.length !== 2) {
      errors.push("crossing does not have exactly two carriers");
      continue;
    }
    if (crossing[0].partnerCarrierNo !== crossing[1].carrierNo || crossing[1].partnerCarrierNo !== crossing[0].carrierNo) {
      errors.push("crossing partners are not symmetric");
    }
    if (crossing[0].direction === crossing[1].direction) {
      errors.push("crossing must contain one clockwise and one counterClockwise carrier");
    }
    if (crossing[0].layer === crossing[1].layer) errors.push("crossing must have one top and one under carrier");
  }
  return { valid: errors.length === 0, errors };
}

function signedSingleSlotMovement(fromSlot, toSlot, slotCount) {
  if (positiveModulo(toSlot - fromSlot, slotCount) === 1) return 1;
  if (positiveModulo(fromSlot - toSlot, slotCount) === 1) return -1;
  return 0;
}

function slotsObject(slotsByCarrier) {
  return Object.fromEntries([...slotsByCarrier.entries()].map(([carrierNo, slot]) => [String(carrierNo), slot]));
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}