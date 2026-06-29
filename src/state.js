import { findMachineProfile } from "./machineProfiles.js";

export const initialRecipeState = {
  ai_analysis_result: null,
  user_selected_options: {
    pattern_type: null,
    colors: [],
    material: null,
    carrier_count: null,
    machine_id: null,
    machine_profile_id: "mp_16_std",
    direction: "clockwise",
    braid_walk_type: "standard",
    sheath: {
      enabled: true,
      material: null
    },
    core: {
      enabled: false,
      material: null,
      diameter_mm: null
    },
    carrier_layout: [],
    ai_suggestion_applied_at: null
  },
  machine_constraints: {
    allowed_carrier_counts: [8, 12, 16, 24, 32],
    supported_materials: ["polyester", "polypropylene", "cotton", "nylon"],
    max_colors: 6
  },
  generated_recipe: null,
  recipe_revision_history: []
};

export function createAiAnalysisResult({ imageHash, model = "google/gemini-2.5-flash", predictions }) {
  return {
    image_hash: imageHash,
    model,
    analyzed_at: new Date().toISOString(),
    predictions
  };
}

export function applyUserSelection(state, selectedOptions) {
  return {
    ...state,
    user_selected_options: {
      ...state.user_selected_options,
      ...selectedOptions
    }
  };
}

export function generateRecipe(state) {
  const finalSelection = state.user_selected_options;
  const colors = finalSelection.colors.length ? finalSelection.colors : ["tanımsız"];
  const carrierCount = Number(finalSelection.carrier_count || 0);
  const machineProfile = findMachineProfile(finalSelection.machine_profile_id, carrierCount);
  const carrierLayout = Array.isArray(finalSelection.carrier_layout) && finalSelection.carrier_layout.length === carrierCount
    ? finalSelection.carrier_layout
    : buildCarrierLayout(finalSelection, carrierCount, colors);
  const colorSequence = carrierLayout.map((carrier) => carrier.color);
  const layoutRegenerated = Array.isArray(finalSelection.carrier_layout)
    && finalSelection.carrier_layout.length > 0
    && finalSelection.carrier_layout.length !== carrierCount;
  const missingFields = [
    ["pattern_type", finalSelection.pattern_type],
    ["material", finalSelection.material],
    ["carrier_count", carrierCount],
    ["colors", finalSelection.colors.length]
  ].filter(([, value]) => !value).map(([field]) => field);
  const shopValidation = {
    status: machineProfile.status === "shop_measured" && finalSelection.shop_validated ? "shop_validated" : "not_validated",
    production_ready: Boolean(machineProfile.status === "shop_measured" && finalSelection.shop_validated),
    warning: "Production-ready için shop_measured machine profile + shop_validated recipe gerekir."
  };
  const previewConfidence = missingFields.length ? "low" : "medium";
  const warnings = [
    "AI sonucu üretim gerçeği değildir; reçete finalSelection üzerinden üretilmiştir.",
    "Tek fotoğraf carrierColorMap veya walkMap değerlerini kesin belirleyemez; generic profile sadece candidate çözüm üretir.",
    shopValidation.warning,
    ...(layoutRegenerated ? [`Carrier layout ${finalSelection.carrier_layout.length}, seçilen kukla sayısı ${carrierCount}; layout deterministic olarak yeniden kuruldu.`] : []),
    ...missingFields.map((field) => `Preview için veri eksik: ${field}`)
  ];
  const effectiveFinalSelection = {
    ...finalSelection,
    carrier_layout: carrierLayout
  };
  const recipe = {
    recipe_id: `REC-${String(finalSelection.material || "MAT").slice(0, 3).toUpperCase()}-${carrierCount || "XX"}-${String(finalSelection.pattern_type || "PAT").slice(0, 2).toUpperCase()}-DRAFT`,
    generated_at: new Date().toISOString(),
    source: "finalSelection",
    status: "draft",
    production_ready: shopValidation.production_ready,
    finalSelection: effectiveFinalSelection,
    technical_sheet: {
      pattern_type: finalSelection.pattern_type,
      material: finalSelection.material,
      carrier_count: carrierCount,
      machineProfile,
      machine_profile_status: machineProfile.status,
      validationRequired: machineProfile.validationRequired,
      assumptions: machineProfile.assumptions,
      limitations: machineProfile.limitations,
      requiredShopMeasurements: machineProfile.requiredShopMeasurements,
      carrier_layout: carrierLayout,
      braid_walk_type: finalSelection.braid_walk_type,
      color_sequence: colorSequence,
      carrierMap: carrierLayout,
      walkMap: buildWalkMap(carrierLayout, finalSelection.braid_walk_type, machineProfile, finalSelection.direction),
      colorSequence,
      patternPreviewData: {
        pattern_type: finalSelection.pattern_type,
        colors,
        repeat: colorSequence
      },
      recipeSteps: buildRecipeSteps(finalSelection, carrierCount),
      sheath: finalSelection.sheath,
      core: finalSelection.core,
      machine_id: finalSelection.machine_id,
      direction: finalSelection.direction
    },
    preview: {
      type: "deterministic_recipe_preview",
      previewConfidence,
      warnings
    },
    shop_validation: shopValidation
  };

  return {
    ...state,
    generated_recipe: recipe,
    recipe_revision_history: [
      ...state.recipe_revision_history,
      {
        updated_at: recipe.generated_at,
        reason: "recipe_generated_from_user_selection",
        recipe
      }
    ]
  };
}

function buildCarrierLayout(finalSelection, carrierCount, colors) {
  const isMarker = markerPattern(finalSelection.pattern_type);
  const markerPositions = markerCarrierPositions(carrierCount, finalSelection.pattern_type);
  const markerSet = new Set(markerPositions);

  // Marker deseni ve 3+ renk varsa: marker kümelerine colors[1], diğer kuklalara fazla renkleri dağıt
  if (isMarker && colors.length > 2) {
    const base = colors[0];
    const markerColor = colors[1];
    const extraColors = colors.slice(2);
    const nonMarkerIndices = [];
    const layout = Array.from({ length: carrierCount }, (_, index) => {
      const position = index + 1;
      if (markerSet.has(position)) {
        return { carrier_no: position, color: markerColor, strand_role: "sheath_marker" };
      }
      nonMarkerIndices.push(index);
      return null;
    });
    let colorIdx = 0;
    for (const idx of nonMarkerIndices) {
      const color = colorIdx < extraColors.length ? extraColors[colorIdx] : base;
      layout[idx] = { carrier_no: idx + 1, color, strand_role: "sheath" };
      colorIdx++;
    }
    return layout;
  }

  return Array.from({ length: carrierCount }, (_, index) => {
    const position = index + 1;
    const colorIndex = isMarker && colors.length > 1
      ? (markerSet.has(position) ? 1 : 0)
      : index % colors.length;
    return {
      carrier_no: position,
      color: colors[colorIndex],
      strand_role: isMarker && colorIndex === 1 ? "sheath_marker" : "sheath"
    };
  });
}

function markerPattern(patternType) {
  const value = String(patternType || "").toLowerCase();
  return value.includes("fleck") || value.includes("marker") || value.includes("izli");
}

function markerCarrierPositions(carrierCount, patternType) {
  if (!markerPattern(patternType)) return [];
  if (carrierCount === 16) return [1, 9];
  if (carrierCount === 24) return [1, 13];
  if (carrierCount === 32) return [1, 17];
  const count = Math.max(1, Math.min(3, Math.floor(carrierCount / 5)));
  return Array.from({ length: count }, (_, index) => Math.round(((index + 0.5) * carrierCount) / count));
}

function buildWalkMap(carrierLayout, walkType, machineProfile, direction = "clockwise") {
  const count = carrierLayout.length;
  if (machineProfile.status === "shop_measured" && machineProfile.observedCarrierPaths?.length) {
    return {
      status: "shop_measured",
      machineProfileId: machineProfile.machineProfileId,
      walkType,
      direction,
      observedCarrierPaths: machineProfile.observedCarrierPaths
    };
  }
  const clockwise = new Set(machineProfile.carrierGroups.clockwise || machineProfile.carrierGroups.trackA || []);
  const counterClockwise = new Set(machineProfile.carrierGroups.counterClockwise || machineProfile.carrierGroups.trackB || []);
  const steps = Math.min(8, Math.max(4, Math.ceil(count / 3)));
  return {
    status: "generic_candidate",
    machineProfileId: machineProfile.machineProfileId,
    trackModel: machineProfile.trackModel,
    walkType,
    direction,
    validationRequired: true,
    steps: Array.from({ length: steps }, (_, stepIndex) => ({
      step: stepIndex + 1,
      moves: carrierLayout.map((carrier, index) => {
        const carrierDirection = clockwise.has(carrier.carrier_no) ? "clockwise" : counterClockwise.has(carrier.carrier_no) ? "counterClockwise" : "unknown";
        const delta = carrierDirection === "clockwise" ? 2 : -2;
        const from = index + 1;
        const to = ((from - 1 + delta + count) % count) + 1;
        return {
          carrier_no: carrier.carrier_no,
          from,
          to,
          direction: carrierDirection,
          quarter_turn: stepIndex + 1
        };
      })
    }))
  };
}

function buildRecipeSteps(finalSelection, carrierCount) {
  return [
    `Makineyi ${carrierCount} kukla için hazırlayın.`,
    "Renk dizilimine göre ipleri kuklalara takın.",
    `${finalSelection.braid_walk_type || "standard"} yürüyüş ayarını seçin.`,
    finalSelection.core.enabled ? "İç dolgu lifini merkez boruya yerleştirin." : "İç dolgu kullanılmayacak şekilde merkez hattı boş bırakın.",
    "Düşük hızda deneme üretimi yapıp tansiyonu kontrol edin.",
    "Shop validation tamamlanmadan seri üretime geçmeyin."
  ];
}

export function shouldAnalyzeImage({ imageHash, cachedAnalysis }) {
  return !cachedAnalysis || cachedAnalysis.image_hash !== imageHash;
}
