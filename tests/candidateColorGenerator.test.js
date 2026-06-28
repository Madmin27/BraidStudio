import test from "node:test";
import assert from "node:assert/strict";
import { generateCandidateColorMap } from "../server/lib/candidateColorGenerator.js";

test("16 carrier plain_weave produces 16 color map keys", () => {
  const result = generateCandidateColorMap({ carrierCount: 16, visualSignature: "plain_weave", colors: ["white", "black"] });

  assert.equal(Object.keys(result.carrierColorMap).length, 16);
  assert.equal(result.carrierColorMap["1"], "white");
  assert.equal(result.carrierColorMap["2"], "black");
});

test("24 carrier 3 tracer color map uses accent at 1,9,17", () => {
  const result = generateCandidateColorMap({ carrierCount: 24, visualSignature: "spiral_tracer", colors: ["white", "red"], tracerCount: 3 });

  assert.equal(result.carrierColorMap["1"], "red");
  assert.equal(result.carrierColorMap["9"], "red");
  assert.equal(result.carrierColorMap["17"], "red");
  assert.equal(result.carrierColorMap["7"], "white");
});
