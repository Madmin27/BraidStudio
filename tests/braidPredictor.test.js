import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCarrierColors, predictVisualSignature, splitCarrierGroups } from "../src/utils/braidPredictor.js";

test("rec_8_zebra predicts plain_weave", () => {
  const result = predictVisualSignature({
    "1": "black", "2": "white", "3": "black", "4": "white",
    "5": "black", "6": "white", "7": "black", "8": "white"
  }, { braidLogic: "1_over_1" });

  assert.equal(result.visualSignature, "plain_weave");
  assert.equal(result.patternFamily, "diamond");
  assert.equal(result.confidence, 0.75);
  assert.equal(result.isReliable, true);
});

test("rec_16_lvl3_herringbone predicts diagonal_rib", () => {
  const result = predictVisualSignature({
    "1": "white", "2": "white", "3": "black", "4": "black",
    "5": "white", "6": "white", "7": "black", "8": "black",
    "9": "white", "10": "white", "11": "black", "12": "black",
    "13": "white", "14": "white", "15": "black", "16": "black"
  }, { braidLogic: "2_over_2" });

  assert.equal(result.visualSignature, "diagonal_rib");
  assert.equal(result.patternFamily, "twill");
  assert.equal(result.confidence, 0.72);
});

test("rec_24_marine_double_tracer predicts spiral_tracer with kinematic warning", () => {
  const result = predictVisualSignature({
    "1": "red", "2": "white", "3": "white", "4": "white", "5": "white", "6": "white",
    "7": "red", "8": "white", "9": "white", "10": "white", "11": "white", "12": "white",
    "13": "red", "14": "white", "15": "white", "16": "white", "17": "white", "18": "white",
    "19": "red", "20": "white", "21": "white", "22": "white", "23": "white", "24": "white"
  }, { braidLogic: "1_over_1" });

  assert.equal(result.visualSignature, "spiral_tracer");
  assert.ok(result.warnings.some((warning) => warning.includes("Kinematik Uyuşmazlık Uyarısı")));
  assert.equal(result.isReliable, false);
});

test("rec_12_medical_dual_trace stays spiral_tracer with kinematic warning", () => {
  const result = predictVisualSignature({
    "1": "blue",
    "2": "white",
    "3": "white",
    "4": "white",
    "5": "white",
    "6": "white",
    "7": "blue",
    "8": "white",
    "9": "white",
    "10": "white",
    "11": "white",
    "12": "white"
  }, "1_over_1", {
    machineProfile: {
      machineProfileId: "mp_12_mid",
      carrierCount: 12
    }
  });

  assert.equal(result.visualSignature, "spiral_tracer");
  assert.notEqual(result.visualSignature, "dual_counter_spiral");
  assert.ok(result.warnings.some((warning) => warning.includes("Kinematik Uyuşmazlık")));
  assert.equal(result.isReliable, false);
});

test("real dual_counter_spiral is separated from one-direction tracer", () => {
  const result = predictVisualSignature({
    "1": "blue", "2": "white", "3": "white", "4": "white", "5": "white", "6": "white",
    "7": "white", "8": "blue", "9": "white", "10": "white", "11": "white", "12": "white"
  }, { braidLogic: "1_over_1" });

  assert.equal(result.visualSignature, "dual_counter_spiral");
  assert.equal(result.patternFamily, "tracer");
  assert.equal(result.confidence, 0.68);
});

test("adjacent yellow black tracer cluster predicts spiral_tracer not block stripe", () => {
  const result = predictVisualSignature({
    "1": "black", "2": "yellow", "3": "black", "4": "white",
    "5": "white", "6": "white", "7": "white", "8": "white",
    "9": "black", "10": "yellow", "11": "black", "12": "white",
    "13": "white", "14": "white", "15": "white", "16": "white"
  }, { braidLogic: "2_over_2" });

  assert.equal(result.visualSignature, "spiral_tracer");
  assert.notEqual(result.visualSignature, "block_striped_segment");
  assert.equal(result.patternFamily, "tracer");
});

test("missing carrier produces warning, null color and unreliable result", () => {
  const normalized = normalizeCarrierColors({
    "1": "white",
    "2": "blue",
    "4": "white"
  }, 4);
  const result = predictVisualSignature({
    "1": "white",
    "2": "blue",
    "4": "white"
  }, "1_over_1", { carrierCount: 4 });

  assert.deepEqual(normalized.colors, ["white", "blue", null, "white"]);
  assert.ok(normalized.warnings.some((warning) => warning.includes("carrier 3")));
  assert.equal(normalized.colors.includes("black"), false);
  assert.equal(result.isReliable, false);
  assert.ok(result.warnings.some((warning) => warning.includes("carrier 3")));
  assert.ok(result.confidence < 0.82);
});

test("machineProfile carrierGroups override odd/even fallback", () => {
  const groups = splitCarrierGroups(4, {
    machineProfile: {
      carrierGroups: {
        clockwise: [1, 2],
        counterClockwise: [3, 4]
      }
    }
  });

  assert.deepEqual(groups.clockwise, [1, 2]);
  assert.deepEqual(groups.counterClockwise, [3, 4]);
});
