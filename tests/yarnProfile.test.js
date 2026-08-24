import test from "node:test";
import assert from "node:assert/strict";
import { buildYarnProfile, buildYarnProfileCacheKey, resolveCarrierDenier } from "../src/physics/yarnProfile.js";
import { MAX_YARN_PROFILE_CACHE_ENTRIES, clearYarnProfileCache, getCachedYarnProfile, yarnProfileCacheStats } from "../src/physics/yarnProfileCache.js";

test("1000D x 2 ends polyester converts to expected bundle area", () => {
  const profile = buildYarnProfile({
    material: "polyester",
    linearDensityDenier: 1000,
    denierBasis: "per_end",
    endsPerCarrier: 2,
    packingFactor: 0.75,
    baseAspectRatio: 2.2,
    filamentsPerEnd: 192
  });

  assert.equal(profile.construction.carrierDenier, 2000);
  assert.ok(Math.abs(profile.area.effectiveBundleAreaMm2 - 0.2147074611) < 1e-9);
  assert.ok(Math.abs(profile.crossSection.widthMm - 0.7755145814) < 1e-9);
  assert.ok(Math.abs(profile.crossSection.thicknessMm - 0.3525066279) < 1e-9);
  assert.equal(profile.surface.totalFilamentsPerCarrier, 384);
});

test("unknown flattening defaults to neutral circular section", () => {
  const profile = buildYarnProfile({
    material: "polyester",
    linearDensityDenier: 1000,
    endsPerCarrier: 2
  });

  assert.equal(profile.crossSection.aspectRatio, 1);
  assert.ok(Math.abs(profile.crossSection.widthMm - profile.crossSection.thicknessMm) < 1e-12);
  assert.ok(profile.assumptions.includes("neutral_circular_aspect_ratio"));
  assert.ok(profile.confidence.reasons.some((reason) => reason.includes("neutral circular")));
});

test("per_ply denier basis multiplies plies and ends exactly once", () => {
  const result = resolveCarrierDenier({
    linearDensityDenier: 1000,
    denierBasis: "per_ply",
    pliesPerEnd: 2,
    endsPerCarrier: 3
  });
  assert.equal(result.carrierDenier, 6000);
});

test("per_end denier basis does not multiply plies again", () => {
  const result = resolveCarrierDenier({
    linearDensityDenier: 2000,
    denierBasis: "per_end",
    pliesPerEnd: 2,
    endsPerCarrier: 3
  });
  assert.equal(result.carrierDenier, 6000);
});

test("filament count changes surface metadata but not bundle geometry", () => {
  const base = {
    material: "polyester",
    linearDensityDenier: 1000,
    endsPerCarrier: 2,
    packingFactor: 0.75,
    baseAspectRatio: 2.2
  };
  const low = buildYarnProfile({ ...base, filamentsPerEnd: 96 });
  const high = buildYarnProfile({ ...base, filamentsPerEnd: 192 });

  assert.equal(low.area.effectiveBundleAreaMm2, high.area.effectiveBundleAreaMm2);
  assert.equal(low.crossSection.widthMm, high.crossSection.widthMm);
  assert.equal(low.crossSection.thicknessMm, high.crossSection.thicknessMm);
  assert.notEqual(low.surface.totalFilamentsPerCarrier, high.surface.totalFilamentsPerCarrier);
});

test("measured width and thickness override denier-estimated geometry", () => {
  const profile = buildYarnProfile({
    material: "polyester",
    linearDensityDenier: 1000,
    endsPerCarrier: 2,
    measuredWidthMm: 1.1,
    measuredThicknessMm: 0.42
  });

  assert.equal(profile.crossSection.geometrySource, "measured_width_and_thickness");
  assert.equal(profile.crossSection.widthMm, 1.1);
  assert.equal(profile.crossSection.thicknessMm, 0.42);
  assert.ok(profile.area.inferredPackingFactor > 0);
});

test("cache key ignores color and cache reuses identical yarn geometry", () => {
  const a = {
    material: "polyester",
    linearDensityDenier: 1000,
    endsPerCarrier: 2,
    filamentsPerEnd: 192,
    color: "red"
  };
  const b = { ...a, color: "blue" };
  assert.equal(buildYarnProfileCacheKey(a), buildYarnProfileCacheKey(b));

  clearYarnProfileCache();
  const p1 = getCachedYarnProfile(a);
  const p2 = getCachedYarnProfile(b);
  assert.equal(p1, p2);
  assert.equal(yarnProfileCacheStats().size, 1);
});

test("implicit defaults and explicit equivalent defaults share one cache entry", () => {
  const implicit = {
    material: "PES",
    linearDensityDenier: 1000,
    endsPerCarrier: 2
  };
  const explicit = {
    material: "polyester",
    linearDensityDenier: 1000,
    denierBasis: "per_end",
    endsPerCarrier: 2,
    pliesPerEnd: 1,
    densityGcm3: 1.38,
    packingFactor: 0.72,
    baseAspectRatio: 1,
    compressibility: 0.25
  };

  assert.equal(buildYarnProfileCacheKey(implicit), buildYarnProfileCacheKey(explicit));
  clearYarnProfileCache();
  const p1 = getCachedYarnProfile(implicit);
  const p2 = getCachedYarnProfile(explicit);
  assert.equal(p1, p2);
  assert.equal(yarnProfileCacheStats().size, 1);
});

test("yarn profile cache is bounded", () => {
  clearYarnProfileCache();
  for (let index = 0; index < MAX_YARN_PROFILE_CACHE_ENTRIES + 25; index += 1) {
    getCachedYarnProfile({
      material: "polyester",
      linearDensityDenier: 500 + index,
      endsPerCarrier: 1
    });
  }
  assert.equal(yarnProfileCacheStats().size, MAX_YARN_PROFILE_CACHE_ENTRIES);
  clearYarnProfileCache();
});

test("invalid packing factor is rejected instead of silently clamped", () => {
  assert.throws(() => buildYarnProfile({
    material: "polyester",
    linearDensityDenier: 1000,
    endsPerCarrier: 1,
    packingFactor: 1.2
  }), /packingFactor/);
});
