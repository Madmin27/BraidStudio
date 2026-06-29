# 004-technical-recipe-sheet

- status: done
- owner: codex
- updated_at: 2026-06-29
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
Teknik sheet'ten `Makara görünümü` ve `Desen şeması` blokları kaldırıldı. Ana/yakın halat görünümü matrix tabanlı SVG stroke'lara gradient + drop shadow hacim katmanı ekler.
Ana halat, yakın görünüm ve kukla yürüyüş diyagramı için Canvas renderer çekirdeği eklendi. PNG export sırasında canvas bitmap'leri data URL imajlara dönüştürülerek technical sheet çıktısına taşınır.
Halat görünümleri referans formata yaklaştırıldı: ana görünüm teknik gri örgü kafesi + segmentli tracer bandı, yakın görünüm hacimli beyaz tekstil örgüsü + segmentli tracer bandı olarak Canvas'ta çizilir.
Canvas halat renderer çizgi/tracer-band modelinden hücre tabanlı tekstil modeline geçirildi; her matrix hücresinde 2-over-2 üstte kalan carrier'ın rengi gradyanlı oval dilim olarak çizilir.
Kukla sayısı/renk/desen değişince carrier layout AI çağırmadan deterministic olarak yeniden kurulur; reçete motoru mismatch layout gelirse carrier_count'a göre layout'u yeniden üretir.
Canvas grid tam silindir açılımına geçirildi: rows=`carrierCount`; CW/CCW aktif carrier indeksi doğrudan `yGrid +/- time` ile hesaplanır. Böylece 16 kuklada 2 marker görsel oranı matematiksel olarak 2/16 düzeyine iner.
Yakın görünüm en az bir carrier çevrimini göstermek için 16 kuklada 24 adıma kilitlenir.
Teknik sheet `Notlar` bloğu tek saha doğrulama cümlesine indirildi.
