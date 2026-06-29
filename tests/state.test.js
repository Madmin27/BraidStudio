import test from "node:test";
import assert from "node:assert/strict";
import { applyUserSelection, generateRecipe, initialRecipeState } from "../src/state.js";

test("generateRecipe rebuilds carrier layout when carrier count changes", () => {
  const state = applyUserSelection(structuredClone(initialRecipeState), {
    pattern_type: "solid_with_markers",
    colors: ["white", "blue"],
    material: "polyester",
    carrier_count: 24,
    machine_id: "default-machine",
    machine_profile_id: "mp_24_std",
    direction: "clockwise",
    braid_walk_type: "standard",
    sheath: { enabled: true, material: "polyester" },
    core: { enabled: true, material: "polyester", diameter_mm: null },
    carrier_layout: Array.from({ length: 16 }, (_, index) => ({
      carrier_no: index + 1,
      color: index === 0 || index === 8 ? "blue" : "white",
      strand_role: index === 0 || index === 8 ? "sheath_marker" : "sheath"
    }))
  });

  const next = generateRecipe(state);
  const sheet = next.generated_recipe.technical_sheet;

  assert.equal(sheet.carrier_count, 24);
  assert.equal(sheet.carrier_layout.length, 24);
  assert.equal(next.generated_recipe.finalSelection.carrier_layout.length, 24);
  assert.ok(next.generated_recipe.preview.warnings.some((warning) => warning.includes("layout deterministic olarak yeniden kuruldu")));
});

test("generateRecipe orders color sequence by carrier number", () => {
  const state = structuredClone(initialRecipeState);
  state.user_selected_options = {
    ...state.user_selected_options,
    pattern_type: "spiral",
    colors: ["white", "blue"],
    material: "polyester",
    carrier_count: 4,
    machine_profile_id: "mp_16_std",
    braid_walk_type: "standard",
    carrier_layout: [
      { carrier_no: 3, color: "blue", strand_role: "sheath_marker" },
      { carrier_no: 1, color: "white", strand_role: "sheath" },
      { carrier_no: 4, color: "white", strand_role: "sheath" },
      { carrier_no: 2, color: "yellow", strand_role: "sheath_marker" }
    ]
  };

  const next = generateRecipe(state);
  assert.deepEqual(next.generated_recipe.technical_sheet.color_sequence, ["white", "yellow", "blue", "white"]);
  assert.deepEqual(next.generated_recipe.technical_sheet.carrier_layout.map((carrier) => carrier.carrier_no), [1, 2, 3, 4]);
});
