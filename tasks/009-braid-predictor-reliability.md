# 009-braid-predictor-reliability

- status: done
- owner: codex
- updated_at: 2026-06-30
- related_files:
  - `src/utils/braidPredictor.js`
  - `src/engine/braidSurfaceSimulator.js`
  - `tests/braidPredictor.test.js`
  - `tests/braidSurfaceSimulator.test.js`
  - `server.js`
  - `package.json`

## Not

`predictVisualSignature` eksik carrier rengini `null` bırakır, uyarı üretir ve `isReliable` hesaplar.
Makine profili `carrierGroups` değerleri odd/even fallback'ten önce kullanılır.
`POST /api/pattern/predict` endpoint'i eklendi.
`braidSurfaceSimulator` deterministic teknik simülasyon katmanı olarak eklendi; predictor yalnızca hızlı pre-check olarak kalır.
`POST /api/pattern/simulate` recipeId ile reçete/makine profilini okuyup `expectedVisualSignature`, `surfaceGrid`, `warnings`, `confidence` döner.
`rec_12_medical_dual_trace` için 1 ve 7 aynı CW grupta olduğundan `parallel_spiral_tracer` ve karşı spiral uyarısı testlenir.
