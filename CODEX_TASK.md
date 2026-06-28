# CODEX_TASK

## Proje Kuralı

BraidStudio, AI destekli örgü/halat reçete sistemi olarak geliştirilecek.

AI tahmini kullanıcı seçimini ezemez. Nihai reçete her zaman `user_selected_options` ve `machine_constraints` üzerinden üretilir. `ai_analysis_result` öneri/geçmiş olarak kalır.

## State Sözleşmesi

- `ai_analysis_result`: görsel analizi, model adı, görsel hash, tahminler.
- `user_selected_options`: kullanıcı onaylı desen, renk, hammadde, kukla sayısı, makine.
- `machine_constraints`: makineye göre izin verilen teknik sınırlar.
- `generated_recipe`: nihai reçete çıktısı.
- `recipe_revision_history`: reçete üretim/değişiklik geçmişi.

## AI ve Cache

- Başlangıç modeli: OpenRouter üzerinden `google/gemini-2.5-flash`.
- Model değişirse kullanıcı onaylı veri ve reçete geçmişi sıfırlanmaz.
- Aynı görsel `image_hash` ile tekrar analiz edilmez.
- Renk, hammadde, kukla sayısı gibi kullanıcı seçenekleri değişince AI tekrar çağrılmaz.
- AI sonucu cache/persist edilir; kullanıcı onayı kalıcı veri kabul edilir.
- AI görselden teknik parmak izi üretir: `predictedSignature`, `confidenceScore`, `structuralAnalysis`, renkler, baskın/iz renkleri, materyal ve uyarı.
- `structuralAnalysis` en az `carrierCount`, `symmetry`, `primaryApplication` alanlarını taşır.
- AI `recipeId`, `walkMap`, carrier yolu veya production-ready sonucu üretmez.
- Fotoğraf analizi sonrası `server/lib/patternSolver.js`, `data/` kütüphanesinden olası reçete adaylarını döndürür.
- Carrier color map adayları `server/lib/candidateColorGenerator.js` ile deterministik üretilir; kullanıcı onayı olmadan kesin kabul edilmez.
- İlk UI'da görsel yükleme, önizleme ve desen albümünden seçim bulunur.
- Capture flow sonunda chat cevabı değil, teknik reçete sheet ve JSON preview üretilir.
- Görsel preview fotogerçekçi üretilmez; reçete verisinden deterministik çizilir.
- Shop validation olmadan reçete `production_ready` olamaz.
- OpenRouter API key `/root/sunucu/BraidStudio/.env` içindeki `OPENROUTER_API_KEY` alanına yazılır.
- TechnicalSheetRenderer sabit şablon kullanır; ana halat, yakın görünüm, kesit, makara, desen, renk dizilimi, kukla dizilimi ve yürüyüş diyagramı SVG/HTML ile hesaplanır.
- Carrier color map ve kukla yürüyüşü AI tarafından çizilmez; Recipe Engine finalSelection üzerinden deterministik üretir.
- Generic machine profiles `generic_candidate` statüsündedir. Aynı profile/direction/walkType aynı walkMap üretir.
- Production-ready için machine profile `shop_measured`, recipe `shop_validated` olmalıdır.
- Tek fotoğraf carrierColorMap veya walkMap'i kesin belirleyemez; AI yalnızca structured suggestion üretir, Recipe Engine generic/shop profile ile candidate çözüm üretir.

## Backend Kütüphane Akışı

- `server/lib/libraryLoader.js`: `data/machines`, `data/recipes`, `data/patterns/signature_catalog.json` okur.
- `server/lib/libraryValidator.js`: makine/reçete referanslarını, carrierColorMap sayısını ve production-ready şartlarını kontrol eder.
- `server/lib/patternSolver.js`: predicted/visual signature + renk + tahmini kukla sayısına göre `possibleRecipes[]` üretir.
- API uçları: `GET /api/library`, `GET /api/library/validate`, `POST /api/pattern/solve`, `POST /api/pattern/generate-color-map`, `POST /api/pattern/predict`.

## Task Takibi

Dosya tabanlı takip kullanılır:
- `CODEX_TASK.md`
- `TASK_INDEX.md`
- `tasks/*.md`

Her task dosyasında şu alanlar bulunur:
- `status`: `todo` / `doing` / `done` / `blocked`
- `owner`: `user` / `codex` / `ai`
- `updated_at`
- `related_files`

Her geliştirme sonunda ilgili task, `TASK_INDEX.md` ve gerekirse bu dosya güncellenir.

## Yayın Notu

Hedef domain: `braidstudio.minen.com.tr`.
HTTPS sertifikası: `/etc/letsencrypt/live/braidstudio.minen.com.tr/fullchain.pem`.
Aktif servis portu: `127.0.0.1:3017`.
