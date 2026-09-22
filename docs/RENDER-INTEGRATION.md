# Polyester output integration

User authorized live testing of the denoised candidate (approximately 80% visual
acceptance); git push is explicitly deferred. Final material acceptance is pending.

## Active paths

- `public/app.js` constructs both requests through `geometryPayload(calculateBraid())`.
- `server.js` normalizes both through `recipeAndMaterial()`; numeric inputs must be
  finite. `data/materials/polyester_satin.json` owns denier scale and render optics.
- Interactive preview: POST `/api/braid-geometry` -> `scripts/braid_geometry.py`.
- Finished output: POST `/api/renders`, poll GET `/api/renders/:id`, then PNG endpoints
  -> `scripts/render_braid.py` -> the SAME `build_geometry()` core.
- Three.js is explicitly a fast preview, not a pixel-equivalent copy of Cycles.
  Blender uses the C surface representation and OpenImageDenoise. It takes the
  actual input colors/ends/diameter/angle/width/flip/weave. There is no saved .blend
  file, proof image, alternate solver, fixed white/red-only recipe or study path
  in the runtime. The two original reference colors retain their reviewed linear
  values; other hex colors are converted from sRGB.

## Audit findings addressed

1. Reviewed images were offline proofs, absent from live browser pipeline. A real
   recipe-driven output action now exposes that renderer; no replacement image is
   silently overlaid on the interactive model.
2. Production polyester multiplied denier by 0.7. Scale is now 1 in the common
   profile, so both geometry consumers use the selected denier. Explicit 0.7
   mathematical calibration tests remain meaningful and unchanged.
3. Renderer recipes, palette and per-end grooves were hardcoded. Inputs now come
   from the shared request and palette. Diameter normalization is a uniform scene
   transform, including physical relief and filament radius.
4. NaN numeric input could reach the Python solver. It is rejected before spawning.
5. Concurrent heavy renders could exhaust resources. A reservation is acquired
   before the first await, one job runs at a time, and duplicates receive 429.
6. Historical repeat labels conflated over-under period and carrier return. They
   are now separate. The 16-carrier return remains 8 same-family blocks.
7. System Blender lacks OIDN. Runtime uses the SHA256-verified official 4.0.2
   installation at `/root/.cache/braid-render/blender-4.0.2-linux-x64/blender`.
   Override with BLENDER_BIN. It is an external deployment dependency, not in Git.

## Operational behavior

Jobs have UUIDs, fixed output names, a 10-minute kill timeout, 12 CPU threads, no
shell interpolation. Output stays outside public/ under ignored `.render-cache/`.
At most 16 jobs retained; older than six hours removed upon new submissions.
Cache clears on process restart; stale browser job ids report 404. UI shows the
submitted recipe, and control changes apply to the next job. Only polyester has
this appearance profile; Polip requests explicitly fail rather than silently using
polyester. Existing ports and service topology remain unchanged.

## Remaining limitations

- 192F and 180 surface curves per carrier are illustrative optical assumptions,
  not measured feed data. This is not volumetric calibration or complete collision
  validation. Surface gaps, filament regularity and sheen need further review.
- Crossing and rope share topology and section functions but not equal sampling
  density or camera framing. Do not infer visual equivalence from API identity.
- No browser frame-rate claim: an offline result can take minutes. Geometry tests
  and visually inspected renders remain separate evidence.
- Historical proofs and abandoned scripts are archived experiments, not active
  routes. They were not mass-deleted during this audit.

## Validation commands

`npm test`, `npm run check`, and `node scripts/render-integration-check.mjs` against
an isolated server. The integration check runs real Blender, asserts 400 on invalid
input, 429 for a simultaneous request, 409 for pending PNG, correct recipe and S/Z,
denoising enabled, and real PNG bytes. Browser desktop/mobile proof is separate.

## Executed validation — 2026-09-22

- Integration commit: `61343e6`; rollback branch
  `rollback/before-filament-live-20260922` points to `326f559`.
- Syntax checks passed; unified geometry suite passed all 12 tests, including
  the 16-carrier return after eight same-family blocks with both flip settings.
- Isolated real Blender/API check passed in 175.25 seconds, including input
  rejection, concurrency reservation, pending-image handling and PNG output.
- Production HTTPS browser test completed a real render in 243.78 seconds with
  16 carriers, 16 mm, 45 degrees, 25 ends of 1000D and the actual two-red-carrier
  UI palette. Desktop and mobile checks passed without page errors or overflow.
  Evidence: `proofs/filament-live/report.json` and `render-report.json`.
- Live HTML, JavaScript and CSS bytes match deployed files; hashes are recorded
  in `proofs/filament-live/assets.json`. Only braidstudio.service was restarted.
- The live test exposed a stale preview recipe after changing inputs and directly
  requesting a realistic output. The output action now refreshes the preview too.
  A separate UI regression check reused the completed real job (no second Blender
  run), asserting 16 mm and 45 degrees in the refreshed preview. Evidence:
  `proofs/filament-live-synced/report.json` and desktop/mobile screenshots.
- This verifies local-server access through the production HTTPS URL, not an
  independent external-network availability test. Visual approval remains about
  80 percent per the user; physical calibration and final acceptance remain open.
- Changes are committed locally. No Git push was performed.

## Preview reflection correction

User clarified that excessive oily reflection concerned the fast Three.js preview,
not the Blender output. In polyester preview optics, specularIntensity and sheen
are now zero for both base and light-carrier overrides. Lighting, filament normal
detail, geometry and the complete Blender render profile are unchanged.
Rollback: `f2c3a09`. Twelve geometry/profile tests passed. Production HTTPS
normal/close/mobile evidence is under `proofs/preview-no-reflection/`.
The initial offline no-reflection Blender experiment was stopped after the
clarification and was never applied to the runtime profile. No Git push.
