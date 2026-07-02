import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createBraidGeometryPreview, createScene } from "../src/renderers/geometryPreview/threeBraidRenderer.js";
import { resolveYarnColor } from "../src/renderers/geometryPreview/yarnMaterials.js";
import {
  buildUnwrappedBraidSurface,
  buildYarnPaths,
  mapSurfacePointToCylinder,
  normalizeCarrierLayout
} from "../src/renderers/geometryPreview/yarnPathBuilder.js";

const mp16 = {
  machineProfileId: "mp_16_standard",
  carrierCount: 16,
  carrierGroups: {
    clockwise: [1, 3, 5, 7, 9, 11, 13, 15],
    counterClockwise: [2, 4, 6, 8, 10, 12, 14, 16]
  }
};

function recipeWithMarkers(markerMap) {
  return {
    braidLogic: "2_over_2",
    carrierCount: 16,
    carrierColorMap: Object.fromEntries(Array.from({ length: 16 }, (_, index) => {
      const carrierNo = index + 1;
      return [String(carrierNo), markerMap[carrierNo] || "white"];
    }))
  };
}

test("geometry preview normalizes carrier colors from carrierColorMap", () => {
  const layout = normalizeCarrierLayout(recipeWithMarkers({ 1: "black", 9: "red" }), mp16);

  assert.equal(layout.length, 16);
  assert.equal(layout[0].color, "black");
  assert.equal(layout[8].color, "red");
  assert.equal(layout[1].color, "white");
});

test("same-direction markers create separate clockwise yarn paths", () => {
  const model = buildYarnPaths({
    recipe: recipeWithMarkers({ 1: "black", 9: "black" }),
    machineProfile: mp16,
    steps: 8,
    length: 160,
    samplesPerStep: 1
  });
  const carrier1 = model.carrierPaths.find((path) => path.carrier.carrier_no === 1);
  const carrier9 = model.carrierPaths.find((path) => path.carrier.carrier_no === 9);

  assert.equal(model.carrierPaths.length, 16);
  assert.equal(carrier1.carrier.direction, "clockwise");
  assert.equal(carrier9.carrier.direction, "clockwise");
  assert.deepEqual(carrier1.points.slice(0, 4).map((point) => point.column), [0, 1, 2, 3]);
  assert.deepEqual(carrier9.points.slice(0, 4).map((point) => point.column), [8, 9, 10, 11]);
});

test("opposite-direction markers keep opposite helical movement", () => {
  const model = buildYarnPaths({
    recipe: recipeWithMarkers({ 1: "black", 8: "blue" }),
    machineProfile: mp16,
    steps: 5,
    length: 160,
    samplesPerStep: 1
  });
  const carrier1 = model.carrierPaths.find((path) => path.carrier.carrier_no === 1);
  const carrier8 = model.carrierPaths.find((path) => path.carrier.carrier_no === 8);

  assert.equal(carrier1.carrier.direction, "clockwise");
  assert.equal(carrier8.carrier.direction, "counterClockwise");
  assert.deepEqual(carrier1.points.map((point) => point.column), [0, 1, 2, 3, 4]);
  assert.deepEqual(carrier8.points.map((point) => point.column), [7, 6, 5, 4, 3]);
});

test("carrier yarn path follows phase plus direction times angular step", () => {
  const angularStep = Math.PI / 8;
  const model = buildYarnPaths({
    recipe: recipeWithMarkers({ 1: "black", 8: "blue" }),
    machineProfile: mp16,
    steps: 4,
    length: 160,
    ropeRadius: 5,
    yarnRadius: 0.3,
    angularStep,
    samplesPerStep: 1
  });
  const carrier1 = model.carrierPaths.find((path) => path.carrier.carrier_no === 1);
  const carrier8 = model.carrierPaths.find((path) => path.carrier.carrier_no === 8);
  const carrier8Phase = ((8 - 1) / 16) * Math.PI * 2;

  assert.equal(carrier1.points[0].theta, 0);
  assert.equal(carrier1.points[3].theta, angularStep * 3);
  assert.equal(Number(carrier8.points[0].theta.toFixed(6)), Number(carrier8Phase.toFixed(6)));
  assert.equal(Number(carrier8.points[3].theta.toFixed(6)), Number((carrier8Phase - angularStep * 3).toFixed(6)));
});

test("unwrapped surface exposes crossing schedule before cylindrical mapping", () => {
  const surface = buildUnwrappedBraidSurface({
    carrierLayout: normalizeCarrierLayout(recipeWithMarkers({ 1: "black" }), mp16),
    machineProfile: mp16,
    braidLogic: "2_over_2",
    steps: 6,
    length: 160,
    ropeRadius: 5,
    yarnRadius: 0.4
  });

  assert.equal(surface.carrierCount, 16);
  assert.equal(surface.carrierPaths.length, 16);
  assert.equal(surface.crossingSchedule.length, 6);
  assert.equal(surface.crossingSchedule[0].length, 16);
  assert.equal(surface.crossingSchedule[0][0].topDirection, "clockwise");
  assert.equal(surface.crossingSchedule[0][2].topDirection, "counterClockwise");
  assert.ok(surface.circumference > 31);
  assert.ok(surface.columnWidth > 1.9);
});

test("default yarn radius follows rope radius percentage range", () => {
  const model = buildYarnPaths({
    recipe: recipeWithMarkers({ 1: "black" }),
    machineProfile: mp16,
    ropeRadius: 10,
    steps: 4
  });

  assert.equal(model.yarnRadius, 0.65);
  assert.ok(model.yarnRadius >= 10 * 0.05);
  assert.ok(model.yarnRadius <= 10 * 0.09);
});

test("cylindrical mapping keeps unwrapped u and wraps v around rope radius", () => {
  const surface = buildUnwrappedBraidSurface({
    carrierLayout: normalizeCarrierLayout(recipeWithMarkers({ 1: "black" }), mp16),
    machineProfile: mp16,
    braidLogic: "2_over_2",
    steps: 6,
    length: 160,
    ropeRadius: 5,
    yarnRadius: 0.4,
    overOffset: 0.3
  });
  const point = mapSurfacePointToCylinder({
    carrier_no: 1,
    color: "black",
    direction: "clockwise",
    time: 0,
    column: 0,
    top: true,
    u: 80,
    v: surface.circumference / 4,
    radialOffset: 0.3
  }, surface);

  assert.equal(point.x, 0);
  assert.ok(Math.abs(point.y) < 0.000001);
  assert.equal(Number(point.z.toFixed(1)), 5.7);
});

test("three renderer creates a scene and carrier tube meshes", () => {
  const { scene, camera } = createScene();
  const preview = createBraidGeometryPreview({
    recipe: recipeWithMarkers({ 1: "black", 9: "red" }),
    machineProfile: mp16,
    options: {
      showCore: false,
      steps: 8,
      samplesPerStep: 1,
      tubularSegments: 8,
      radialSegments: 6
    }
  });

  scene.add(preview.group);

  assert.ok(scene instanceof THREE.Scene);
  assert.ok(camera instanceof THREE.PerspectiveCamera);
  assert.ok(preview.group instanceof THREE.Group);
  assert.equal(preview.yarnMeshes.length, 16);
  assert.ok(preview.yarnMeshes.every((mesh) => mesh.geometry instanceof THREE.TubeGeometry));
  preview.dispose();
});

test("known yarn color aliases resolve to deterministic hex values", () => {
  assert.equal(resolveYarnColor("siyah"), "#171a18");
  assert.equal(resolveYarnColor("red"), "#d51f17");
  assert.equal(resolveYarnColor("#abc"), "#aabbcc");
});
