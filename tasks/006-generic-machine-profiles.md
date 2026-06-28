# 006-generic-machine-profiles

- status: done
- owner: codex
- updated_at: 2026-06-28
- related_files:
  - `src/machineProfiles.js`
  - `src/state.js`
  - `public/index.html`
  - `public/app.js`

## Not

Generic maypole/grid machine profiles eklendi. Recipe Engine walkMap'i machineProfileId, carrierCount, direction ve walkType üzerinden deterministik üretir. Generic profiller `generic_candidate` kalır; production-ready için `shop_measured` profil ve `shop_validated` reçete gerekir.
Fotoğraftan carrierColorMap/walkMap kesin belirlenemez; generic profiller CSP/simulation aday çözümü için başlangıç verisidir.
