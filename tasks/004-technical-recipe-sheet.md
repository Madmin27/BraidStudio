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

Capture flow sonunda teknik reçete sheet üretildi. Çıktı `finalSelection` kaynaklıdır; AI sonucu üretim gerçeği sayılmaz. Shop validation olmadan `production_ready: false`.
Teknik çizimler sabit SVG/HTML renderer ile deterministik üretilir.
JSON preview ve AI tahmini paneli kaldırıldı.
Görsel yükleme tek başına reçete üretmez; AI analiz kullanıcı seçimi alanlarını doldurur, teknik reçete sadece `Reçete Görseli` butonuyla üretilir.
AI solver adayının `carrierColorMap` çıktısı `carrier_layout` olarak finalSelection'a aktarılır. Halat preview çizimi artık bu kukla/renk dizilimine göre fazlandırılır; sabit eski desen kullanılmaz.
Taşıyıcı sayısı uyuşmayan solver adayı teknik sheet'e aktarılmaz. 3 renkli marker reçetelerinde beyaz zemin üstüne siyah-sarı-siyah tracer kümesi deterministik çizilir. PNG üretimi başarısız olursa SVG fallback indirilir.
Analiz, predictor, candidate seçimi, finalSelection, renderer girdisi, PNG üretimi ve tutarsızlık raporu için görünür süreç logları eklendi.
16 kukla marker yerleşimi visualSignature'a göre seçilir: `spiral_tracer` için aynı-yön `[1,9]`, `dual_counter_spiral` için zıt-yön `[1,8]`. Yön uyumsuz candidate finalSelection'a otomatik alınmaz.
SVG preview 2-over-2 için daha dolu beyaz zemin örgüsü, zıt yön marker çizimi ve tüm kuklaları gösteren walkMap diyagramı üretir.
PNG üretimi artık `Reçete Görseli` sonrası otomatik başlamaz; yalnızca `PNG indir` butonuyla başlar. PNG render için foreignObject iç SVG namespace ve data URL yükleme akışı sağlamlaştırıldı.
Kukladan desene çizim için ortak `braidMatrix` çekirdeği eklendi: CW `+t`, CCW `-t`, 2-over-2 üstte kalma kuralı ve renderer matrix hücre çizimi aynı matematikten beslenir.
