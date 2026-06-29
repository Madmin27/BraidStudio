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

`POST /api/analyze-image` eklendi. OpenRouter API key `.env` içinden okunur. Aşama 1 modeli `OPENROUTER_MODEL`, aşama 2 matematik/reçete modeli `OPENROUTER_MODEL2`. Aynı görsel hash'i provider+model+prompt bazlı server cache dosyasından döner; kullanıcı seçenek değişiklikleri AI çağrısı yapmaz.
AI paneline işlem günlüğü, cache/model bilgisi ve ham OpenRouter cevabı eklendi.
Kukla sayısı için 16 fallback'i kaldırıldı. AI görselden güvenilir carrierCount vermezse mevcut kullanıcı seçimi korunur; prompt/cache versiyonu `hybrid-v1` oldu.
Prompt carrierCount tahmininde beyaz şerit frekansını dikkate alır: iki tracer hattı arasında 10+ beyaz strand görünüyorsa 16 yerine 24/32 adayı tercih edilir.
Hibrit pipeline eklendi: Flash sadece `Detected_Colors`, `Pattern_Flow`, `White_Strand_Count_Between_Markers` metadata metni üretir; R1 bu metni endüstriyel kısıtlarla `technicalSheet` JSON adayına çevirir.
Flash sıcaklığı `0.05`, R1 sıcaklığı `0.65` olarak ayrıldı. R1 JSON parse öncesi `<think>...</think>` ve markdown fence blokları temizlenir.
Analiz sırasında upload panelinde canlı progress bar, pulse efekti ve hibrit aşama listesi gösterilir.
Backend `/api/analyze-image` için istek/cache/pipeline/aşama/hata logları journala yazılır. OpenRouter çağrılarına 110sn, frontend analiz isteğine 240sn timeout eklendi.
Görsel yüklendikten sonra upload panelinde katlanabilir `Görsel bilgileri` alanı açılır; kullanım, çap, beklenen kukla, marker yönü, beyaz şerit sayımı ve notlar Flash analiz promptuna yardımcı bağlam olarak gönderilir.
