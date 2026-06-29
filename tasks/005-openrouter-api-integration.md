# 005-openrouter-api-integration

- status: done
- owner: codex
- updated_at: 2026-06-29
- related_files:
  - `server.js`
  - `public/app.js`
  - `.env.example`
  - `docs/braidstudio.service`
  - `docs/nginx-braidstudio.minen.com.tr.conf`

## Not

`POST /api/analyze-image` eklendi. OpenRouter API key `.env` içinden okunur. Model `google/gemini-2.5-flash`. Aynı görsel hash'i provider+model bazlı server cache dosyasından döner; kullanıcı seçenek değişiklikleri AI çağrısı yapmaz.
AI paneline işlem günlüğü, cache/model bilgisi ve ham OpenRouter cevabı eklendi.
Kukla sayısı için 16 fallback'i kaldırıldı. AI görselden güvenilir carrierCount vermezse mevcut kullanıcı seçimi korunur; prompt/cache versiyonu `fingerprint-v3` oldu.
Prompt carrierCount tahmininde beyaz şerit frekansını dikkate alır: iki tracer hattı arasında 10+ beyaz strand görünüyorsa 16 yerine 24/32 adayı tercih edilir.
