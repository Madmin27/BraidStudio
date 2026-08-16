# BraidStudio - Güncel Geliştirme Durumu

## Mevcut hedef

Tres/maypole makinesinde seçilen kukla renkleri, halat çapı, örgü açısı, ip ucu sayısı, denye ve ip paketi genişliğinden üretilecek polyester halat desenini gerçeğe yakın ve üretim açısından anlamlı biçimde simüle etmek. Görsel hedef `canli2.png` içindeki beyaz-kırmızı parlak polyester halattır. Üretim doğruluğu, görsel gösterişten önce gelir.

## Canlı sistem

- Proje: `/root/projeler/BraidStudio`
- Adres: `https://braidstudio.minen.com.tr/`
- Servis: `braidstudio.service`, etkin ve çalışıyor.
- Node dinleyicisi: `0.0.0.0:3017`; dış erişim nginx üzerinden HTTPS.
- 15 Ağustos 2026 doğrulamasında canlı adres HTTP 200 verdi.

## Doğrulanan mevcut davranış

- Varsayılan reçete: 16 kukla, 16 mm, 34 derece, yüzde 100 ip genişliği, 20 ip ucu, her uç 1000D, 1 üst/1 alt Diamond.
- Varsayılan renkler: 1 ve 3 kırmızı; diğer kuklalar beyaz.
- 16 kukla, 8 S ve 8 Z olarak dengeli ayrılıyor. Taşıyıcı rengi taşıyıcı kimliği boyunca korunuyor.
- Blender/Cycles canlı renderında her taşıyıcı tek sürekli merkez hattıdır. Lifler aynı taşıyıcının yerel kesiti içinde birlikte hareket eder; üst-alt kararı tek tek liflere verilmez.
- Varsayılan hesapta bir kukla paketi 20 x 1000D, toplam 20000D'dir. 2,25 dpf kalibrasyonu ile her 1000D uç 444 mikrofilamente, kukla başına 8880 mikrofilamente karşılık gelir. Varsayılan tam render 142080 eğri üretir.
- Denye, PET yoğunluğundan polimer kesitine çevrilir. Render lif yarıçapında ayrıca üçte bir görsel geometri kalibrasyonu vardır.
- Varsayılan etkin paket genişliği 4,87 mm, hesaplanan kalınlığı 0,40 mm ve fiziksel doluluk değeri yüzde 100'dür.
- Arayüz, seçilen çap-açı-ip paketi birleşimini `Üretime uygun`, `Gevşek`, `Sıkı`, `Örtme yetersiz` veya `İp paketi sığmıyor` olarak gösterir. Uygun açı, genişlik, ip ucu, denye ve çap alternatifleri verir.
- Aynı varsayılan paket 45 derecede yüzde 117 doluluk verir. 45 derece ve yaklaşık yüzde 85 ip genişliği ile alınan doğrulama renderında önceki kanca biçimli aşırı bindirme giderildi.
- Çıktı yatay 1 metredir. Son PNG 16000 x 800 pikseldir; 0-50 mm dikey cetvel çapla uyumludur. Sayfa başlangıçta 500 mm merkezini gösterir.
- Panorama vurgu ışığı 1 metrenin merkezindedir; 150-850 mm arasında yumuşak etki ve merkezde 420 mm sabit, yüzde 34 sıcak-beyaz aydınlık bant oluşturur.
- Kaynak tekrar artık kısa makro ışıklarla değil, tekrarın tamamından uzun üç stüdyo softbox'ı ile aydınlatılır. Böylece 1 metreye döşenirken küçük parlama noktaları tekrarlanmaz.
- Üst-alt kabarma katsayısı, kullanıcının kabul ettiği yakın plan renderla aynı `0,55 x paket kalınlığı` değerine geri alındı. Taşıyıcı lifleri blok halinde birlikte ezilir ve renk/taşıyıcı kimliği değişmez.
- Üstteki eski 3D görünüm kaldırılmıştır; üretim kaynağı yalnızca `Üretilecek halat çıktısı` için kullanılır.
- Ayarlar değiştiğinde pahalı render otomatik başlamaz; `Üret` düğmesiyle başlar. Tercihler tarayıcıda saklanır.

## Kritik kararlar

- Üretim topolojisi, ip paketi geometrisi ve polyester optiği ayrı katmanlardır. Malzeme değişikliği üst-alt düzenini veya renk sırasını değiştirmemelidir.
- Denye tek başına gerçek filament sayısını belirlemez. Mevcut 2,25 dpf değeri açık bir kalibrasyondur; gerçek ip etiketi varsa onun filament bilgisi kullanılmalıdır.
- İp paketi çap veya açı değişince kendiliğinden büyütülmez. Uygunsuz kombinasyon bozulabilir veya açık kalabilir; arayüz bunu önceden bildirir.
- Açı, motor içinde halat eksenine göre tanımlıdır. Üretim uygunluk hesabı da aynı açı konvansiyonunu kullanır.
- Silindirik temas katsayısı, kabul edilen 16 mm / 34 derece örneğine kalibre edilmiştir. Bu katsayı evrensel üretim sabiti değildir.
- Görsel lif kalitesi onaylanmadan eski plastik kabuk/şerit yaklaşımına dönülmeyecektir.

## Temel dosyalar

- `public/app.js`: kontroller, tercihler, 1 metre çıktı, cetvel, ışık, render kuyruğu ve uygunluk paneli.
- `src/utils/braidProductionPhysics.js`: tarayıcıdaki çap-açı-denye-ip ucu-genişlik uygunluk hesabı.
- `scripts/polyester_physics.py`: PET denye/kesit, paket genişliği, kalınlık ve doluluk hesabının Blender karşılığı.
- `scripts/blender_polyester_live_render.py`: canlı, sürekli taşıyıcılı gerçek lif Cycles renderı.
- `scripts/braid_crossing_physics.py`: üst-alt geçiş, temas ve tekrar geometrisi.
- `server.js`: render işi, önbellek sürümü, kuyruk ve canlı API.
- `scripts/checkpoints/`: önemli değişiklikler öncesindeki geri dönüş kopyaları.

## Son test durumu

- `npm test`: 10/10 geçti.
- `npm run check`: geçti.
- Python unit testleri: 19/19 geçti.
- Varsayılan 34 derece renderı ve 45 derece/yüzde 85 doğrulama renderı görsel olarak incelendi.
- Düzeltilmiş varsayılan 16 mm / 34 derece / 20x1000D renderı hem kaynak PNG hem canlı 1 metre panorama olarak incelendi. Panel 4,87 mm paket / 4,87 mm gereken genişlik ve yüzde 100 doluluk gösterdi.
- Kaynak tekrarda kısa ve noktasal ışıklar kaldırıldı. Geometrinin tamamından uzun üç softbox, `0,38` pürüzlülük, yüksek polyester sheen, temiz AgX düşük kontrast ve yükseltilmiş ortam pozlamasıyla tekrar boyunca yönlü fakat kesintisiz lif aydınlatması sağlar.
- Canlı lif malzemesi `v41` ile kabul edilen geometri korunur; SSS ve transmisyon sıfırlıdır. v40 bol ışık denemesi görüntüyü fazla yıkadığı için geri alındı; dengeli v39 softbox değerleri tekrar canlı cache anahtarıyla yayınlandı.
- Gemini teknik danışmanlık önerileri doğrultusunda `v42` optik denemesi yapıldı: carrier geometri ve üst-alt algoritması değiştirilmeden nötr beyaz/kırmızı tekstil pigmentleri, daha yüksek anizotropi, çok düşük SSS, indirect clamp ve geniş softbox ayarı denendi. `proofs/default-16mm-34deg-v42-gemini-optics.png` görsel olarak incelendi; renkler daha temiz fakat polyester ipeksi parlama etkisi hâlâ sınırlı kabul edildi.
- Gemini'nin hiyerarşik taşıyıcı önerisi `v43` olarak uygulandı: üst-alt dalgası taşıyıcı merkez eğrisinde çözülür, 20 lif aynı taşıyıcı frame'ine bağlı yerel offset olarak taşınır. Lifler artık bağımsız örgü elemanı gibi üst-alt yapmaz; denye ve tel sayısı taşıyıcı içi yerel doku/kalınlık olarak kalır.
- `proofs/default-16mm-34deg-v43-carrier-frame.png` ve `proofs/variant-16mm-35deg-v43-carrier-frame.png` görsel olarak incelendi. Son canlıdaki aşırı yıkanmış/kirli plastik görüntüye göre daha dengeli çıktı verdi; ancak hedef fotoğrafa göre kırmızı-beyaz sınırlarında küçük taşma, uçta gri açıklıklar ve temas-gölge kusurları hâlâ var.
- Canlı render cache anahtarı `fiber-cycles-v43-carrier-frame-balanced-polyester` olarak değiştirildi; eski v42 görsellerin tarayıcı/cache üzerinden gelmesi engellenmelidir.
- Kabul edilen `45 derece / 14x800D` reçete yeni motorla yeniden üretildi; aynı 31 mm fiziksel kadraja alındığında hücre sırası ve üst-alt yapısı kabul görüntüsüyle eşleşti.
- `v38` varsayılan 16 mm / 34 derece / 20x1000D Cycles renderı normal ve yakın ölçekte `v37` ile karşılaştırıldı. Optik fark sınırlı fakat temizdir; lif ayrımı ve renk sınırları korunurken sert parlama yumuşamıştır.
- Canlı servis etkin, HTTPS adresi HTTP 200 veriyor.

## Bilinen sınırlar ve açık sorunlar

- Gerçek üretimle kesin eşleşme için kullanılan ipin gerçek etiketi (`1000D/192F`, `1000D/288F` gibi), gerilim altındaki ölçülmüş paket genişliği, bobin gergisi, çekirdek çapı ve gerçek makine örgü açısı gereklidir.
- Mevcut silindirik temas katsayısı yalnızca kabul edilen varsayılan görsele kalibre edildi. Geniş çap ve uç açılarda gerçek numunelerle yeniden doğrulanmalıdır.
- 45 derece/yüzde 85 çıktısı büyük kanca hatasını çözdü; fakat polyester parlaklığı, hücre köşeleri ve temas ezilmesi hedef fotoğrafla ölçülü yan yana kalibrasyonu henüz tamamlamadı.
- 1 metre çıktı, bir fiziksel üretim tekrarının kesintisiz döşenmesiyle oluşturulur; Blender tek seferde bir metre geometri render etmez.
- Ortadaki 40 cm ışık son 1 metre birleştirme aşamasında uygulanır; kaynak Blender tekrarındaki stüdyo ışığından ayrıdır.
- v43 ile taşıyıcı hiyerarşisi düzeltilmiş olsa da temas modeli hâlâ gerçek ip basıncı kadar fiziksel değil. Kalan ana mühendislik işi, renk/material ayarı değil; taşıyıcıların temas sınırında kırpma, gölge ve paket kenarı davranışının ayrı bir geometri testiyle izole edilmesidir.
- Çalışma ağacı çok sayıda eski proof, render, checkpoint ve değişiklik içeriyor; henüz temiz bir sürüm commit'i yoktur. İlgisiz dosyalar geri alınmamalıdır.

## Başarısız ve tekrar edilmemesi gereken yaklaşımlar

- Düz kabuk veya şerit üzerine çizgi/normal map atmak plastik, koli bandı veya yağlı boya görünümü verdi.
- Her mikrofilamente bağımsız üst-alt yolu vermek taşıyıcı bütünlüğünü bozdu, renk bulaşması ve fizik dışı geçiş üretti.
- Taşıyıcıyı kısa parçalara bölüp birleştirmek enine çatı, keskin genişleme ve renk kayması oluşturdu.
- Düz yüzey formülünü temas düzeltmesi olmadan kullanmak varsayılan reçetede 3,51 mm paket ve büyük boşluklar üretti.
- 45 derece için yanlış açı konvansiyonuyla yüzde 126 genişlik önermek ağır üst üste binme ve kanca uçları oluşturdu. Eksen açısı düzeltmesiyle öneri yaklaşık yüzde 85 oldu.
- Başarılı test sonucu tek başına görsel onay sayılmaz; her geometri değişiminde normal ve yakın ölçekli render incelenmelidir.

## Sonraki adımlar

1. Gerçek 1000D ipin filament sayısını, gerilim altındaki düz paket genişliğini, çekirdek çapını ve bobin gergisini kullanıcıdan veya üretim föyünden al.
2. Bu ölçülerle 16 mm / 34 derece referans katsayısını yeniden kalibre et; tahmini dpf yerine gerçek filament bilgisini kullan.
3. 30, 34 ve 45 derece için panelin önerdiği uygun kombinasyonlarda deterministik renderlar al ve boşluk, bindirme, üst-alt sürekliliği ile renk kimliğini kontrol et.
4. `canli2.png` ile aynı ölçek, kadraj ve pozlamada yan yana karşılaştırma yap; paket genişliği, hücre boyu, parlaklık ve temas gölgesini ayrı ölç.
5. Geometri doğrulandıktan sonra render maliyetini taşıyıcı/lif blok önbelleği veya temsilci lif gruplarıyla azalt. Performans optimizasyonu doğruluktan önce yapılmayacak.
