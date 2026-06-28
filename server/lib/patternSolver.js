import { getSignatureDefinition, normalizeVisualSignature, signaturesCompatible } from "./signatureUtils.js";

export function solvePattern(input, library) {
  const machines = Array.isArray(library?.machines) ? library.machines : [];
  const recipes = Array.isArray(library?.recipes) ? library.recipes : [];
  const patternSignatures = library?.patternSignatures || {};
  const visualSignature = String(input?.predictedSignature || input?.visualSignature || "unknown");
  const normalizedSignature = normalizeVisualSignature(visualSignature);
  const colors = normalizeColors(input?.colors);
  const estimatedCarrierCount = Number(input?.estimatedCarrierCount || 0) || null;
  const preferredMachineProfileId = input?.preferredMachineProfileId || null;
  const signatureDefinition = getSignatureDefinition(patternSignatures, normalizedSignature);
  const machinesById = new Map(machines.map((machine) => [machine.machineProfileId, machine]));

  const possibleRecipes = recipes
    .filter((recipe) => signaturesCompatible(recipe.metadata?.visualSignature, normalizedSignature))
    .map((recipe) => {
      const machine = machinesById.get(recipe.machineProfileId);
      const carrierCountMatch = Boolean(machine && estimatedCarrierCount && machine.carrierCount === estimatedCarrierCount);
      const preferredMatch = Boolean(preferredMachineProfileId && recipe.machineProfileId === preferredMachineProfileId);
      const colorCompatible = colorCountCompatible(recipe.carrierColorMap, colors);
      const patternFamilyMatch = Boolean(signatureDefinition?.family && recipe.metadata?.patternFamily === signatureDefinition.family);
      const score = clamp01(
        0.45 +
        (carrierCountMatch ? 0.20 : 0) +
        (preferredMatch ? 0.15 : 0) +
        (colorCompatible ? 0.10 : 0) +
        (patternFamilyMatch ? 0.10 : 0)
      );

      return {
        recipeId: recipe.recipeId,
        machineProfileId: recipe.machineProfileId,
        patternFamily: recipe.metadata?.patternFamily || "unknown",
        visualSignature: recipe.metadata?.visualSignature || normalizedSignature,
        braidLogic: recipe.metadata?.braidLogic || machine?.defaultWalk || "unknown",
        carrierColorMap: recolorCarrierMap(recipe.carrierColorMap || {}, colors),
        confidence: Number(score.toFixed(2)),
        status: recipe.status || "candidate",
        reason: buildReason({ carrierCountMatch, preferredMatch, colorCompatible, patternFamilyMatch }),
        requiresUserConfirmation: true,
        requiresShopValidation: true
      };
    })
    .sort((a, b) => {
      if (a.machineProfileId === preferredMachineProfileId && b.machineProfileId !== preferredMachineProfileId) return -1;
      if (b.machineProfileId === preferredMachineProfileId && a.machineProfileId !== preferredMachineProfileId) return 1;
      return b.confidence - a.confidence || a.recipeId.localeCompare(b.recipeId);
    });

  return {
    possibleRecipes,
    certainty: possibleRecipes.length === 1 ? "single_candidate" : "not_unique"
  };
}

function normalizeColors(colors) {
  const list = Array.isArray(colors) ? colors.map((color) => String(color).trim()).filter(Boolean) : [];
  return list.length ? list : ["white", "black"];
}

function colorCountCompatible(carrierColorMap, colors) {
  const recipeColorCount = new Set(Object.values(carrierColorMap || {}).map((color) => String(color).toLowerCase())).size;
  return recipeColorCount <= Math.max(1, colors.length);
}

function recolorCarrierMap(carrierColorMap, colors) {
  const entries = Object.entries(carrierColorMap);
  const colorFrequency = new Map();
  for (const [, color] of entries) {
    colorFrequency.set(color, (colorFrequency.get(color) || 0) + 1);
  }
  const recipeColors = [...colorFrequency.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([color]) => color);
  const colorMap = new Map(recipeColors.map((color, index) => [color, colors[index] || colors[colors.length - 1]]));
  return Object.fromEntries(entries.map(([carrier, color]) => [carrier, colorMap.get(color) || colors[0]]));
}

function buildReason({ carrierCountMatch, preferredMatch, colorCompatible, patternFamilyMatch }) {
  return [
    "visualSignature eşleşti",
    carrierCountMatch ? "carrierCount eşleşti" : "carrierCount aday olarak kaldı",
    preferredMatch ? "preferred machine öne alındı" : null,
    colorCompatible ? "renk sayısı uyumlu" : "renk sayısı birebir uyumlu değil",
    patternFamilyMatch ? "patternFamily eşleşti" : null
  ].filter(Boolean).join("; ");
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
