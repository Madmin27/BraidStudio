# BraidStudio Physical Preview Engine V1

## Amaç

Physical Preview Engine'in görevi fotogerçekçi halat resmi üretmek değil; seçilen reçetenin fiziksel olarak yüzeyi kapatıp kapatmayacağını, ne kadar seyrek/sık olacağını ve kesişimlerde göreli bombe/sıkışma eğilimini deterministik olarak hesaplamaktır.

V1 çıktısı **engineering preview** seviyesindedir. Shop-measured ip kesiti, gerçek braid angle, carrier tension ve deformasyon kalibrasyonu yoksa mikron veya üretim toleransı iddiası yapılmaz.

## Birimler

Kod seviyesinde tek birim sistemi kullanılır:

- uzunluk: `mm`
- alan: `mm2`
- yoğunluk: `g/cm3`
- lineer yoğunluk: `denier = g / 9000 m`
- braid angle: halatın boyuna ekseninden derece (`deg_from_rope_axis`)

## 1. YarnProfile

Canonical input:

```json
{
  "material": "polyester",
  "linearDensityDenier": 1000,
  "denierBasis": "per_end",
  "endsPerCarrier": 2,
  "pliesPerEnd": 1,
  "filamentsPerEnd": 192,
  "packingFactor": 0.75,
  "baseAspectRatio": 2.2
}
```

`denierBasis` anlamı:

- `per_end`: tedarikçi denyesi bir end'in toplam denyesidir; ply tekrar çarpılmaz.
- `per_ply`: tedarikçi denyesi her ply içindir; `pliesPerEnd` ile çarpılır.

Carrier toplam denyesi:

```text
per_end: Dcarrier = Ddeclared * endsPerCarrier
per_ply: Dcarrier = Ddeclared * pliesPerEnd * endsPerCarrier
```

Katı polimer kesit alanı:

```text
Asolid_mm2 = Dcarrier / (9000 * density_g_cm3)
```

Paketleme faktörü ile bundle alanı:

```text
Abundle_mm2 = Asolid_mm2 / packingFactor
```

Eliptik yaklaşım:

```text
A = pi * width * thickness / 4
```

Denier yalnız kesit alanını belirler; tek başına gerçek yarn genişliğini/yassılaşmasını belirlemez. Bu nedenle `baseAspectRatio` verilmemişse V1 nötr başlangıç olarak `1.0` (dairesel kesit) kullanır. Braid içindeki yassılaşma daha sonra deformation solver tarafından ele alınır. Böylece ölçülmemiş bir `2:1` veya benzeri yassılaşma değeri fiziksel gerçek gibi sisteme gömülmez.

Measured width/thickness verilirse denier-tabanlı tahminin önüne geçer. Tek ölçü verilirse diğer boyut alan korunarak hesaplanır. Mümkün olduğunda gerçek carrier bundle genişliği/kalınlığı ölçülmüş veri olarak girilmelidir.

`filamentsPerEnd` makro kesit alanını değiştirmez; daha sonra mikro doku/normal-map frekansı için kullanılır.

## 2. Biaxial coverage modeli

V1 yalnız simetrik iki eksenli tubular/maypole örgü için fiziksel coverage hesabı yapar.

İdeal geometri için kullanılan oran:

```text
q = Nc * Wy / (4 * pi * R * cos(alpha))
```

- `Nc`: fiziksel carrier sayısı
- `Wy`: bir carrier yarn bundle görünür genişliği
- `R`: değerlendirme yarıçapı
- `alpha`: halatın boyuna ekseninden braid angle

İdeal optical cover factor:

```text
CF = 1 - (1 - q)^2
```

Bu eşitlik ideal non-overcovered geometri için `q <= 1` bölgesinde kullanılır.

BraidStudio `q` değerini clamp etmez ve UI/API'de `crowdingRatio` adıyla taşır. Bu ad BraidStudio mühendislik terimidir; evrensel standart terim olduğu iddia edilmez.

- `q < 1`: geometric gap mümkün
- `q = 1`: ideal temas sınırı
- `q > 1`: ideal non-overlap coverage denklemi geçersiz bölgeye girer; bu kısım `overfillRatio = q - 1` olarak ayrı ele alınır

`q > 1` durumunda `CF` yalnız görsel cover metriği olarak 1.0'da saturate edilir; `1-(1-q)^2` formülü jamming fiziği olarak uzatılmaz.

Her braid ailesi için efektif aralık:

```text
familySpacing = 4 * pi * R * cos(alpha) / Nc
```

Bundan doğrudan:

```text
gapWidth = max(0, familySpacing - yarnWidth)
overlapEquivalent = max(0, yarnWidth - familySpacing)
```

hesaplanır. Renderer rastgele boşluk üretmez; gerçek carrier mesh genişlikleri ile yollar arasındaki boşluk doğal olarak görünür.

Helix pitch:

```text
pitch = 2 * pi * R / tan(alpha)
```

## 3. Carrier count ve crossing count ayrımı

Bu iki kavram API'de ayrı tutulur:

```text
physicalCarrierCount = 16
crossingsPerIdealTick = 8
```

`carriers.length / 2` hiçbir zaman fiziksel kukla sayısı olarak kullanılmaz.

## 4. Deformation solver

V1 FEA değildir. İki farklı çıktı ayrılır:

### Deterministik geometri metriği

Yarn width sabit kalırsa q değerini hedefe indirmek için gerekli yarıçap:

```text
Rrequired = Nc * Wy / (4 * pi * cos(alpha) * qTarget)
requiredRadialRelief = max(0, Rrequired - Rcurrent)
```

Bu, "mevcut teğetsel alana sığmayan yarn için ne kadar radyal alan gerekir" sorusunun geometrik göstergesidir.

### Yarı-ampirik görünür deformasyon

Crossing compression ve required relief'in ne kadarının visible crown'a dönüştüğü kalibrasyon katsayılarıyla belirlenir:

- `baseCrossingCompressionRatio`
- `overfillCompressionGain`
- `maxCrossingCompressionRatio`
- `crownResponse`
- `targetCrowdingRatio`

Shop calibration yoksa kaynak `generic_estimate` ve confidence `estimated` kalır.

## 5. Renderer contract

Renderer fizik hesabı yapmaz. `solvePhysicalPreview()` sonucu aşağıdaki contract'ı verir:

```text
physicalCarrierCount
yarnWidthMm
yarnFreeThicknessMm
yarnCrossingThicknessMm
braidAngleDegFromAxis
helixPitchMm
nominalYarnCenterlineRadiusMm
estimatedYarnCenterlineRadiusMm
topCrossingUpliftMm
underCrossingDepressionMm
material
yarnProfileCacheKey
totalFilamentsPerCarrier
```

Yeni 3D katman sadece bu değerleri ve `braidMatrix` carrier/top-under yollarını kullanmalıdır.

## 6. Cache

YarnProfile cache key'e renk girmez. Aynı fiziksel polyester yarn bloğu farklı renklerde aynı geometriyi kullanabilir.

Cache key'e giren temel parametreler:

- material
- denier ve basis
- ends / plies
- filament count
- density
- packing factor
- aspect ratio
- compressibility
- measured width/thickness

## 7. Confidence ve kalibrasyon

En güvenilir giriş sırası:

1. shop measured yarn width + thickness
2. measured braid angle
3. shop-measured machine profile
4. shop-calibrated deformation coefficients
5. denier + density + packing tahmini

Generic packing factor, aspect ratio veya deformation coefficients kullanıldığında sonuç otomatik olarak production-certified sayılmaz.

## 8. Literatür dayanağı

Coverage modelinin geometri temeli için:

- Potluri, P. et al., *Geometrical modelling and control of a triaxial braiding process*, Composites Part A, 2003.
- Rawal, A., yarn path / braid cover factor geometry çalışmaları; ideal biaxial cover relation `C = 1 - (1 - Wy*Nc/(4*pi*r*cos(alpha)))^2`.
- Heieck, F. et al., *Influence of the cover factor of 2D biaxial and triaxial braided carbon composites*, 2017.
- Ghamkhar et al., cover-factor çalışmalarında over-covered durumda ideal cover denkleminin sınırlılığı ve efektif braid radius değişimi vurgulanır.

İlgili çevrimiçi kaynaklar:

- https://www.sciencedirect.com/science/article/pii/S1359835X03000617
- https://www.sciencedirect.com/science/article/abs/pii/S0263822316322838
- https://journals.sagepub.com/doi/10.1177/15280837211073756

## V1 sınırı

V1 aşağıdakileri henüz çözmez:

- gerçek carrier/take-up tension alanı
- yarn-to-yarn friction
- core radial compression
- nonlinear material constitutive model
- full FEA/contact solve
- shop-measured horn gear trajectory düzeltmeleri

Bunlar renderer'a gömülmemeli; ileride physics katmanına kalibrasyon/veri olarak eklenmelidir.
