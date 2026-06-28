# Gemini Dataset Method Notes

Status: `candidate_methodology`

This document records Gemini's explanation for how the first BraidStudio sample machine/recipe library was derived.

Important rule: these notes are not production validation. They are used to guide candidate generation only. Production accuracy still requires:

```text
machine profile = shop_measured
recipe = shop_validated
```

## 1. Kinematic and Combination Model

Maypole circular braiding machines are deterministic mechanical systems.

Candidate assumptions used by Gemini:

- Carrier movement can be modeled as two counter-moving groups.
- One group moves clockwise (`CW`).
- The other group moves counter-clockwise (`CCW`).
- The path can be treated as a bipartite/interlaced graph for candidate generation.
- `1_over_1` and `2_over_2` rules describe over/under crossing rhythm.

Example candidate logic:

```text
16 carrier herringbone / 2_over_2
color sequence candidate = [W, W, B, B, W, W, B, B, ...]
```

Reasoning:

- Adjacent color pairs create visible diagonal blocks.
- Breaking mathematical symmetry changes the visible spiral/diagonal behavior.
- Herringbone-like visual signatures can be approximated by grouped color offsets.

## 2. Industrial Pattern Knowledge

Gemini grouped sample recipes using common textile/rope manufacturing heuristics.

### 8 carrier

Candidate use cases:

- hollow braid
- shoelace-like braid
- sealing/gasket braid
- simple tracer patterns

Candidate color ratios:

```text
1:1 alternating
1:7 tracer
```

### 24 carrier

Candidate use cases:

- marine rope sheath
- technical polyester sheath
- paracord-like outer sheath
- tracer rope

Candidate rules:

```text
1_over_1 tracer
2_over_2 twill candidate
block/offset color sequences
```

### 32 carrier

Candidate use cases:

- dense protective sheath
- climbing/dynamic rope sheath candidate
- dual counter spiral visual pattern

Candidate rules:

```text
high carrier count
opposite spiral/color groups
close sheath coverage
```

## 3. Mapping Rule

The dataset maps mechanical constraints to visual signatures:

```text
machine profile
+ carrier count
+ braid logic
+ carrierColorMap
= candidate pattern signature
```

AI should use this mapping only to propose candidates.

## 4. AI Usage Rule

AI may:

- classify a visual signature
- match `signature_catalog.json`
- return possible recipe candidates
- suggest a carrierColorMap
- provide confidence and warnings

AI must not:

- mark a carrierColorMap as exact from a single photo
- invent a walkMap
- draw technical diagrams
- mark a recipe as production-ready

Correct output style:

```json
{
  "possibleRecipes": [
    {
      "recipeId": "rec_16_lvl3_herringbone",
      "confidence": 0.72,
      "reason": "Image appears to match diagonal_rib visual signature.",
      "status": "candidate"
    }
  ],
  "certainty": "not_unique",
  "requiresUserConfirmation": true,
  "requiresShopValidation": true
}
```

## 5. Validation Rule

A profile can become reliable only after physical measurement:

```text
generic_candidate -> shop_measured
```

Required observations:

- actual carrier numbering
- observed carrier path
- direction
- track/horn gear behavior
- over/under crossing rhythm
- slow top-view video or direct step observation

A recipe can become production-ready only after test production:

```text
candidate -> shop_validated
```

Required observations:

- sample length
- measured diameter/width
- measured gramaj
- visible pattern match
- tension/speed notes
- material notes
- approval status

## 6. Engineering Position

BraidStudio does not claim exact recipe inference from image alone.

It uses:

```text
image analysis
-> pattern signature match
-> candidate recipes
-> user confirmation
-> deterministic recipe engine
-> shop validation
```

This keeps the system useful for production while avoiding AI hallucinated technical documents.
