# 009-braid-predictor-reliability

- status: done
- owner: codex
- updated_at: 2026-06-28
- related_files:
  - `src/utils/braidPredictor.js`
  - `tests/braidPredictor.test.js`
  - `server.js`
  - `package.json`

## Not

`predictVisualSignature` eksik carrier rengini `null` bırakır, uyarı üretir ve `isReliable` hesaplar.
Makine profili `carrierGroups` değerleri odd/even fallback'ten önce kullanılır.
`POST /api/pattern/predict` endpoint'i eklendi.
