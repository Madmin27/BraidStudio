# Gemini Dataset Method Notes

Status: `candidate_methodology`

Bu dosya, BraidStudio veri kütüphanesindeki ilk makine/reçete örneklerinin hangi mantıkla kurulduğunu açıklar.

Önemli kural: Bu notlar üretim doğrulaması değildir. Candidate üretimi ve AI yönlendirmesi içindir. Üretim doğruluğu için hâlâ şu statüler gerekir:

```text
machine profile = shop_measured
recipe = shop_validated
```

## Temel Yaklaşım

Bu verilerin arkasında hem maypole tipi örgü makinelerinin kinematik matematiği hem de tekstil/halat sanayisindeki endüstriyel kullanım kalıpları vardır.

Amaç, AI'nin görselden doğrudan kesin reçete uydurması değil; mekanik kısıtlar ile görsel desen imzalarını eşleştirerek olası reçeteler üretmesidir.

```text
machine profile
+ carrier count
+ braid logic
+ carrierColorMap
= candidate pattern signature
```

## 1. Kinematik ve Kombinasyon Matematiği

Maypole tipi yuvarlak örgü makineleri deterministik sistemlerdir. Aynı makine profili, aynı yön ve aynı örgü mantığı ile aynı carrier hareketini tekrar eder.

Candidate model:

- Taşıyıcıların izlediği yol bipartite / iki parçalı çizge gibi modellenebilir.
- Bir grup saat yönünde (`CW`) hareket eder.
- Diğer grup saat yönünün tersine (`CCW`) hareket eder.
- `1_over_1` ve `2_over_2` örgü kuralları, taşıyıcıların üst/alt geçiş ritmini temsil eder.
- Bu model, gerçek makine ölçümü yapılana kadar `generic_candidate` kabul edilir.

## 2. 16 Taşıyıcılı Herringbone Örneği

16 taşıyıcılı herringbone / `2_over_2` candidate deseninde renk dizilimi ardışık çiftler halinde verilir:

```text
[W, W, B, B, W, W, B, B, W, W, B, B, W, W, B, B]
```

Açıklama:

- Yan yana gelen renk çiftleri yüzeyde çapraz bloklar oluşturur.
- Renk fazı ve üst/alt geçiş ritmi birlikte görünür desen imzasını belirler.
- Matematiksel simetri bozulduğunda spiral/diagonal davranış değişir.
- Bu yapı `diagonal_rib` / `herringbone` aday desen ailesi için başlangıç şablonudur.

Repo karşılığı:

```text
data/recipes/rec_16_lvl3_herringbone.json
```

## 3. Endüstriyel Kullanım Kalıpları

Reçetelerde kullanılan taşıyıcı sayıları ve renk dizilimleri, halat/tekstil üretimindeki yaygın kalıplar baz alınarak candidate olarak kurulmuştur.

Bunlar üretim garantisi değil; solver'ın hızlı aday üretmesi için başlangıç veri setidir.

### 8 Taşıyıcı

Candidate kullanım alanları:

- hollow braid
- ayakkabı bağcığı benzeri örgüler
- teknik sızdırmazlık fitilleri / salmastra
- basit zebra veya tracer desenleri

Candidate renk oranları:

```text
1:1 alternating
1:7 tracer
```

Not:

Düşük taşıyıcılı makinelerde merkez dolgu/kılıf kapama sınırlı olabilir. Bu yüzden 8 taşıyıcı profilleri daha çok içi boş veya basit teknik örgü adayları için düşünülür.

### 24 Taşıyıcı

Candidate kullanım alanları:

- marine rope sheath
- iskota halatı dış kılıfı
- teknik polyester dış kılıf
- paracord benzeri dış kılıf
- tracer rope

Candidate kurallar:

```text
1_over_1 tracer
2_over_2 twill candidate
block / offset color sequences
```

Not:

24 taşıyıcı, orta-sık örgülü teknik halat kılıfları için pratik bir başlangıç profilidir. Yine de gerçek üretim için makine profili ölçülmelidir.

### 32 Taşıyıcı

Candidate kullanım alanları:

- sıkı dış kılıf
- dinamik/tırmanış ipi dış kılıfı candidate
- dual counter spiral desenleri
- yüksek aşınma dayanımı isteyen sheath yapıları

Candidate kurallar:

```text
high carrier count
opposite spiral color groups
dense sheath coverage
```

Not:

32 veya daha yüksek taşıyıcı sayıları, daha kapalı ve sık kılıf yapıları için düşünülür. BraidStudio'da bu profil eklenirse yine `generic_candidate` başlamalıdır.

## 4. AI Kullanım Kuralı

AI şunları yapabilir:

- görsel desen imzası sınıflandırmak
- `data/patterns/signature_catalog.json` ile eşleştirmek
- `data/recipes/*.json` içinden olası reçeteleri sıralamak
- candidate `carrierColorMap` önermek
- confidence / warning üretmek

AI şunları yapamaz:

- tek fotoğraftan kesin carrierColorMap ilan etmek
- walkMap uydurmak
- teknik diyagram çizmek
- production-ready demek
- shop validation yerine geçmek

Doğru çıktı formatı:

```json
{
  "possibleRecipes": [
    {
      "recipeId": "rec_16_lvl3_herringbone",
      "confidence": 0.72,
      "reason": "Image appears to match diagonal_rib visual signature.",
      "status": "candidate"
    }
  ],
  "certainty": "not_unique",
  "requiresUserConfirmation": true,
  "requiresShopValidation": true
}
```

## 5. Pattern Mapping

BraidStudio'nun ilk solver mantığı şu şekilde olmalıdır:

```text
AI image analysis
-> visualSignature
-> signature_catalog match
-> recipe candidates
-> candidate carrierColorMap
-> user confirmation
-> Recipe Engine
-> deterministic SVG / technical sheet
```

Örnek eşleşmeler:

```text
plain_weave     -> rec_16_lvl1_diamond
diagonal_rib    -> rec_16_lvl3_herringbone
spiral_tracer   -> rec_24_tracer_rope
```

## 6. Validation Rule

Bir makine profili güvenilir hale ancak fiziksel ölçümden sonra geçer:

```text
generic_candidate -> shop_measured
```

Gerekli gözlemler:

- gerçek carrier numaralandırması
- observedCarrierPaths
- yön
- track / horn gear davranışı
- üst/alt geçiş ritmi
- yavaş üstten video veya doğrudan adım gözlemi

Bir reçete üretime hazır hale ancak test üretiminden sonra geçer:

```text
candidate -> shop_validated
```

Gerekli gözlemler:

- numune uzunluğu
- ölçülen çap/en/kalınlık
- ölçülen gramaj
- görünür desen eşleşmesi
- tansiyon/hız notları
- malzeme notları
- onay durumu

## 7. Engineering Position

BraidStudio tek fotoğraftan kesin reçete çıkardığını iddia etmez.

BraidStudio şu işi yapar:

```text
image analysis
-> pattern signature match
-> possibleRecipes[]
-> user confirmation
-> deterministic recipe engine
-> shop validation
```

Bu yaklaşım AI'nin hızlı aday üretmesini sağlar ama teknik dokümanın doğruluk kaynağını algoritma ve shop validation olarak tutar.
