function oddNumbers(count) {
  return Array.from({ length: Math.ceil(count / 2) }, (_, index) => index * 2 + 1).filter((value) => value <= count);
}

function evenNumbers(count) {
  return Array.from({ length: Math.floor(count / 2) }, (_, index) => (index + 1) * 2);
}

function maypoleProfile(count) {
  return {
    machineProfileId: `mp_${count}_std`,
    status: "generic_candidate",
    machineFamily: "maypole_circular",
    carrierCount: count,
    walkType: "1_over_1",
    carrierGroups: {
      clockwise: oddNumbers(count),
      counterClockwise: evenNumbers(count)
    },
    trackModel: `sinusoidal_${count}_horn`,
    directionOptions: ["clockwise", "counterClockwise"],
    assumptions: ["Standard horn gear alignment"],
    limitations: ["No irregular carrier spacing"],
    validationRequired: true,
    observedCarrierPaths: [],
    requiredShopMeasurements: [
      "horn gear pitch/diameter",
      "carrier offset / phase",
      "track intersections",
      "braid angle from take-up tension"
    ]
  };
}

export const machineProfiles = [
  maypoleProfile(8),
  maypoleProfile(12),
  maypoleProfile(16),
  maypoleProfile(24),
  maypoleProfile(32),
  {
    machineProfileId: "mp_square_grid_8",
    status: "generic_candidate",
    machineFamily: "square_or_grid_horn_gear_braider",
    carrierCount: 8,
    walkType: "two_track_crossing",
    carrierGroups: {
      trackA: [1, 3, 5, 7],
      trackB: [2, 4, 6, 8]
    },
    trackModel: "intersecting_grid_tracks",
    directionOptions: ["clockwise", "counterClockwise"],
    assumptions: ["Standard horn gear alignment"],
    limitations: ["Not compatible with circular rope preview unless product type is flat/square"],
    validationRequired: true,
    observedCarrierPaths: [],
    requiredShopMeasurements: [
      "horn gear pitch/diameter",
      "carrier offset / phase",
      "track intersections"
    ]
  }
];

export function findMachineProfile(profileId, carrierCount) {
  return machineProfiles.find((profile) => profile.machineProfileId === profileId)
    || machineProfiles.find((profile) => profile.carrierCount === Number(carrierCount) && profile.machineFamily === "maypole_circular")
    || machineProfiles[2];
}
