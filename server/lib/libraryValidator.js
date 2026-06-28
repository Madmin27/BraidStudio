import { getSignatureDefinition } from "./signatureUtils.js";

export function validateLibrary(library) {
  const machines = Array.isArray(library?.machines) ? library.machines : [];
  const recipes = Array.isArray(library?.recipes) ? library.recipes : [];
  const patternSignatures = library?.patternSignatures || {};
  const errors = [];
  const warnings = [];

  const machinesById = indexUnique(machines, "machineProfileId", errors, "machine");
  indexUnique(recipes, "recipeId", errors, "recipe");

  for (const machine of machines) {
    if (!machine.status) {
      warnings.push(`machine:${machine.machineProfileId}:missing_status_assumed_candidate`);
    }
    if (machine.status === "generic_candidate" || machine.shopMeasured === false) {
      warnings.push(`machine:${machine.machineProfileId}:not_production_ready_without_shop_measured`);
    }
  }

  for (const recipe of recipes) {
    const recipeId = recipe.recipeId || "unknown_recipe";
    const machine = machinesById.get(recipe.machineProfileId);
    const signature = recipe.metadata?.visualSignature;
    const signatureDefinition = getSignatureDefinition(patternSignatures, signature);

    if (!machine) {
      errors.push(`recipe:${recipeId}:unknown_machineProfileId:${recipe.machineProfileId}`);
      continue;
    }
    if (!signatureDefinition) {
      errors.push(`recipe:${recipeId}:unknown_visualSignature:${signature}`);
    }

    const carrierColorMap = recipe.carrierColorMap || {};
    const carrierKeyCount = Object.keys(carrierColorMap).length;
    if (carrierKeyCount !== machine.carrierCount) {
      errors.push(`recipe:${recipeId}:carrierColorMap_count:${carrierKeyCount}:expected:${machine.carrierCount}`);
    }

    const status = recipe.status || "candidate";
    if (!recipe.status) {
      warnings.push(`recipe:${recipeId}:missing_status_assumed_candidate`);
    }
    if (machine.status === "generic_candidate" || status !== "shop_validated") {
      warnings.push(`recipe:${recipeId}:not_production_ready_requires_shop_measured_and_shop_validated`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

function indexUnique(items, idField, errors, label) {
  const index = new Map();
  for (const item of items) {
    const id = item?.[idField];
    if (!id) {
      errors.push(`${label}:missing_${idField}`);
      continue;
    }
    if (index.has(id)) {
      errors.push(`${label}:duplicate_${idField}:${id}`);
      continue;
    }
    index.set(id, item);
  }
  return index;
}
