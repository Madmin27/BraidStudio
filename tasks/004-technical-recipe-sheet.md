# 004-technical-recipe-sheet

- status: done
- owner: codex
- updated_at: 2026-06-30
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
Taşıyıcı sayısı uyuşmayan solver adayı teknik sheet'e aktarılmaz. 3 renkli marker reçetelerinde beyaz zemin üstüne siyah-sarı-siyah tracer kümesi deterministik çizilir.
Analiz, predictor, candidate seçimi, finalSelection, renderer girdisi, PNG üretimi ve tutarsızlık raporu için görünür süreç logları eklendi.
16 kukla marker yerleşimi visualSignature'a göre seçilir: `spiral_tracer` için aynı-yön `[1,9]`, `dual_counter_spiral` için zıt-yön `[1,8]`. Yön uyumsuz candidate finalSelection'a otomatik alınmaz.
SVG preview 2-over-2 için daha dolu beyaz zemin örgüsü, zıt yön marker çizimi ve tüm kuklaları gösteren walkMap diyagramı üretir.
PNG üretimi artık `Reçete Görseli` sonrası otomatik başlamaz; yalnızca `PNG indir` butonuyla başlar ve sadece `Ana halat görünümü` canvas çıktısını indirir.
Kukladan desene çizim için ortak `braidMatrix` çekirdeği eklendi: CW `+t`, CCW `-t`, 2-over-2 üstte kalma kuralı ve renderer matrix hücre çizimi aynı matematikten beslenir.
Teknik sheet'ten `Makara görünümü`, `Desen şeması` ve `Yakın görünüm` blokları kaldırıldı. Ana halat görünümü tek desen referansı olarak Canvas'ta çizilir.
Ana halat görünümü ve kukla yürüyüş diyagramı için Canvas renderer çekirdeği eklendi. PNG export artık yalnızca ana halat canvas bitmap'ini indirir.
Ana halat görünümü referans formata yaklaştırıldı: hacimli beyaz tekstil örgüsü + segmentli tracer bandı olarak Canvas'ta çizilir.
Ana halat canvas iplik dokusu siyah/beyaz için ortak 5-stop gradyan, %6 crown overlap ve 0.6px dış kontur ile dengelendi.
Ana halat renderer artık marker overlay mantığı kullanmaz; görünen her iplik hücresi `buildBraidMatrix` üzerinden carrier no, machineProfile yönü, kukla sayısı ve yürüyüş tipine göre seçilir.
Canvas halat renderer çizgi/tracer-band modelinden hücre tabanlı tekstil modeline geçirildi; her matrix hücresinde 2-over-2 üstte kalan carrier'ın rengi gradyanlı oval dilim olarak çizilir.
Kukla sayısı/renk/desen değişince carrier layout AI çağırmadan deterministic olarak yeniden kurulur; reçete motoru mismatch layout gelirse carrier_count'a göre layout'u yeniden üretir.
Canvas grid tam silindir açılımına geçirildi: rows=`carrierCount`; CW/CCW aktif carrier indeksi doğrudan `yGrid +/- time` ile hesaplanır. Böylece 16 kuklada 2 marker görsel oranı matematiksel olarak 2/16 düzeyine iner.
Yakın görünüm en az bir carrier çevrimini göstermek için 16 kuklada 24 adıma kilitlenir.
Teknik sheet `Notlar` bloğu tek saha doğrulama cümlesine indirildi.
Ana halat görünümünde yatay matrix adımı 40 ile sınırlandı; `cellWidth=cellHeight` kare-grid korunur ve desen yatayda tekrar ettirilir. Canvas genişliği artık 164 gibi aşırı hücre üretip mozaik/ekose görüntü oluşturmaz.
`spiral_tracer` marker kümeleri aynı pariteye yerleştirilir (`1,3,5` gibi); renkli iplikler tek yönde kalır, `dual_counter_spiral` haricinde CW/CCW karışmaz.
Canvas halat görünümü hücre boyama yerine carrier başına sürekli strand path katmanları çizer; base iplikler altta, marker iplikler fazlı/kesikli üst katmanda render edilir.
