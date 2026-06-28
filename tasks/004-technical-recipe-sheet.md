# 004-technical-recipe-sheet

- status: done
- owner: codex
- updated_at: 2026-06-28
- related_files:
  - `src/state.js`
  - `public/index.html`
  - `public/app.js`
  - `public/styles.css`
  - `examples/recipe_outputs/REC-PES-20-DB-0002A.target.json`

## Not

Capture flow sonunda teknik reçete sheet ve JSON preview üretildi. Çıktı `finalSelection` kaynaklıdır; AI sonucu üretim gerçeği sayılmaz. Shop validation olmadan `production_ready: false`.
Teknik çizimler sabit SVG/HTML renderer ile deterministik üretilir.
Sheet render sonrası otomatik PNG preview üretilir; PNG indir butonu aynı çıktıyı indirir.
