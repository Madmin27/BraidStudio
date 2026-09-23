# BraidStudio Agent Protocol

This file is mandatory for every AI agent, Codex session, code reviewer, and technical assistant working in this repository.

## 1. Evidence before conclusions

Never approve, reject, diagnose, or prescribe a fix before inspecting the available evidence.

Use these labels consistently:

- **Observation:** Directly visible in an image, output, log, test, or file.
- **Evidence:** Reproducible measurement, test result, commit diff, or exact file/code reference.
- **Hypothesis:** A possible cause that has not yet been verified. Never present it as fact.
- **Decision:** PASS, FAIL, or UNVERIFIED. A decision is allowed only when stated acceptance criteria have been checked.

## 2. Independent technical judgment

User feedback is important input, but it is not an automatic verdict.

- Do not agree merely because the user says an output is correct or incorrect.
- Reinspect the output independently.
- If the user reveals a defect previously missed, acknowledge the missed observation; do not invent a technical cause.
- Do not reverse a conclusion without new evidence.

## 3. Visual review rules

Before approving a visual result:

- Inspect the full view and at least one close crop.
- Check crossings, boundaries, continuity, color ownership, gaps, silhouette, material response, and visible artifacts.
- Separate geometry defects from material, lighting, camera, and post-processing defects.
- Never call a visual “accepted,” “correct,” “final,” or “production-ready” without explicit acceptance criteria and evidence.

If the page or image cannot be opened, state that plainly and request the exact screenshot or artifact. Do not infer unseen content.

## 4. Repository and active-code verification

Before proposing a code change:

- Confirm the active branch, commit, runtime entry point, and actual render path.
- Inspect the relevant files before writing a task.
- Do not send Codex to modify inactive, dead, fallback, debug, or superseded code.
- Do not claim a commit, push, merge, test pass, deployment, or live result without checking it.
- Cite exact file paths, commits, tests, or metrics when making technical claims.

## 5. Change discipline

- One verified problem per task.
- One primary change per iteration.
- Do not create repeated A/B/C experiments unless they are necessary, explicitly scoped, and have a predeclared decision criterion.
- Do not change geometry, topology, material, lighting, camera, and color placement in the same iteration.
- Preserve a known baseline before experimentation.
- Do not produce a Codex command automatically when analysis alone is requested.

## 6. Uncertainty and stop conditions

When evidence is insufficient, say **UNVERIFIED**.

Use this form:

- **Observed:** What is directly visible or measured.
- **Verified:** What the repo/tests/metrics prove.
- **Unknown:** What has not been established.
- **Next verification:** The smallest action that can resolve the unknown.

Stop and request evidence instead of guessing when:

- the active code path is unknown;
- the referenced output cannot be viewed;
- the technical cause is not reproduced;
- acceptance criteria are missing;
- a proposed fix could invalidate prior verified work.

## 7. Response standard

Responses must be concise, professional, and non-repetitive.

- State the conclusion once.
- Do not restate the same point in multiple formats.
- Do not default to “you are right.”
- Do not use confidence language unsupported by evidence.
- Distinguish facts, assumptions, and recommendations.
- Prioritize accuracy over speed and persuasion.

## 8. Mandatory review output

For significant technical reviews, use this compact structure:

```text
Status: PASS | FAIL | UNVERIFIED
Observed: ...
Evidence: ...
Unknown: ...
Decision / next action: ...
```

A PASS requires all defined criteria to pass. A single unresolved visible defect keeps the result at FAIL or UNVERIFIED.

## Merge integration boundary — 2026-09-23

The physical-preview modules from main are retained as a standalone library/demo.
They are not connected to the production server or browser. The production path
remains the shared Python geometry core and its Three.js/Blender consumers.
The single-engine restrictions below apply to this active production path.

# BraidStudio Calisma Sozlesmesi

## Etkin durum — 2026-09-22 filament cikti entegrasyonu

Bu bolum asagidaki tarihsel durum notlarindan once gelir. Kullanici temiz
Blender gorunumunu yaklasik %80 yeterli buldu ve canli testini yetkilendirdi;
nihai fotograf/uretim kabulu verilmis sayilmaz. Git push sonraya birakildi.

- Canli entegrasyon commit: `61343e6`. Geri donus dali:
  `rollback/before-filament-live-20260922` (`326f559`).
- Tek geometri cekirdegi `scripts/braid_geometry.py` korunur. Hizli Three.js
  onizleme ve Blender bitmis cikti ayni normalize recete/profil olcegini kullanir.
- Geometri API'si `/api/braid-geometry`; ek `/api/renders` is API'si ayni cekirdegi
  kullanan `scripts/render_braid.py` goruntuleme adaptorunu calistirir. Ikinci bir
  orgu motoru degildir. Gorunumleri piksel bazinda esit diye sunma.
- Polyester denye olcegi 1.0, goruntu profili `data/materials/polyester_satin.json`.
  Resmi Blender 4.0.2 + OpenImageDenoise; ayni anda tek render, 12 CPU thread.
- Eski `proofs/` ve photo-study dosyalari calisan uygulamanin bagimliligi degildir.
- Denetim, sinirlar ve tekrar uretim: `docs/RENDER-INTEGRATION.md`.
- 192F ve 180 yuzey lifi optik varsayimdir; tam carpisma/fiziksel kalibrasyon
  kaniti yoktur. Nihai kalite veya anlik performans garantisi verme.


## Hedef

Tres/maypole makinesindeki gergin polyester multifilament halati uretmek:

- Her kukla halat boyunca tek kimlik, tek renk ve tek surekli tasiyicidir.
- Varsayilan orgu 1 alt, 1 usttur.
- Tasiyici kurdele veya plastik cubuk degil, lentikuler polyester ip blogudur.
- Kesisimlerde penetrasyon, boya sizmasi, kesik uc, kopuk renk ve gorunur bosluk yoktur.
- Denye, tel sayisi, halat capi ve orgu acisi geometriyi olculebilir bicimde etkiler.

## Tek Mimari

Aktif geometri cagrisi yalnizca sudur:

```text
public/app.js
  -> POST /api/braid-geometry
server.js
  -> scripts/braid_geometry.py
  -> build_geometry(mode="crossing" | "rope")
  -> ayni kesit, temas ve sweep fonksiyonlari
```

Kaynaklar:

- Tek geometri cekirdegi: `scripts/braid_geometry.py`
- Tek tarayici mesh renderer'i: `renderGeometryThree()`
- Tek API: `/api/braid-geometry`
- Tek geometri testi: `tests/unifiedGeometry.test.js`
- Tek malzeme kutuphanesi: `data/materials/*.json`

`texgen_braid_mesh.py`, `carrier_render_envelope.py`, alternatif envelope matematigi,
fallback geometri ve numarali motorlar bulunamaz. Malzeme secenekleri ayni renderer
uzerinde yalnizca dogrulanan kutuphane profilleri olarak tutulur.

## Degismez Kurallar

1. `crossing` ve `rope` ayni `build_geometry()` fonksiyonundan uretilir.
2. Iki modun `geometryModel`, kesit olculeri ve temas sabitleri birebir aynidir.
3. Her carrier bir mesh ve bir kesintisiz merkez yoludur; hucre parcalari birlestirilmez.
4. Ust-alt sirasi carrier kimligi ve makine zaman cizelgesinden gelir; renkten uretilmez.
5. Kesit lentikuler superellipse olur ve merkez yolu boyunca yerel frame ile sweep edilir.
6. Tamamlanmis duz mesh sonradan silindire bukulmez; silindirik merkez yolunda sweep edilir.
7. Beauty render'da tel sayisi ayri kalin cubuklar olarak gosterilmez.
8. Tel sayisi paket dolulugunu ve lif yogunlugunu, denye kesit alanini belirler.
9. Kullanici gorsel kabulu olmadan `accepted: true` yazilmaz.
10. Yeni motor, fallback veya `v2/final/final2` dosyasi acilmaz.

## Zorunlu Testler

- Tekil crossing ve rope ayni geometri sozlesmesini kullanir.
- 16 kukla = 16 surekli carrier mesh; 8 S ve 8 Z.
- Bir carrier birden fazla yuzey parcasina bolunmez.
- Cap ve orgu acisi degisince topoloji bozulmaz.
- Sunucu ve tarayicida eski geometri endpoint'i veya script referansi bulunmaz.
- Normal, yakin ve mobil ekran kaniti birlikte uretilir.

## Guncel Durum

Durum: YENIDEN DOGRULAMA

Onceki canli goruntu kullanici tarafindan reddedildi. 2026-08-27 calisma
denetiminde tekil modun ayri, elle kurulmus kesismeler kullandigi saptandi ve
kaldirildi. Tekil artik tam halat kafesinin gercek bir kesitidir. Her iki mod
ayni 3B merkez yolu, temas, kesit ve orthonormal tasima fonksiyonlarini
calistirir. Kose gecisi, tasiyici eni boyunca silindirik frame yonu dikkate
alinarak hesaplanan tek bir saddle alaniyla uretilir. Tasiyici eni cevresel
adimi tam kapatir; gizli katman gecisini aciga cikaran kenar boslugu birakilmaz.
Guncel kanitlar `proofs/current-crossing` ve `proofs/current-rope` altindadir.
2026-08-27 tarihinde kullanici istegiyle canli onizlemeye aktarildi. Kullanici
incelemeden sonuc kabul edilmez. Guncel malzeme adayi blok cilasi kullanmaz;
UV tangent yonlu filament anisotropy, dusuk guclu filament specular haritasi,
yumusak cloth sheen ve genis softbox ile polyester saten tepkisi uretir.
32 ve 45 derece kanitlari `proofs/angle-32` ve `proofs/angle-45` altindadir.
Malzeme adayi kullanici kabulunu bekler.

## Malzeme Profilleri

- `polip_rope`: 2026-08-27 tarihinde `KoseKabulPolip1` kontrol noktasi olarak
  kullanici tarafindan kabul edilen optik ayarlar; denye olcegi `1.0`.
- `polyester_satin`: daha canli ve ipeksi saten tepki adayi; denye olcegi `1.0` (2026-09-05 fotograf calismasinda duzeltildi).
- Profil zinciri: arayuz secimi -> `/api/braid-geometry` -> kutuphane dogrulamasi
  -> etkin denye ile tek geometri cekirdegi -> ayni profil ile Three.js malzemesi.
- Uretim kamerasi normal ve PNG goruntulerinde halati daha uzaktan cerceveler.

## 2026-08-27 Runtime Temizligi

- Canli sunucu yalnizca statik arayuz ve `POST /api/braid-geometry` yayinlar.
- Eski AI analiz, recete cozumleme, tahmin ve yuzey simulasyonu rotalari kaldirildi.
- Bu rotalara ait `src`, `server/lib`, tarif/makine/desen verileri ve ayrik testler
  kaldirildi.
- Uretim testi yalnizca `tests/unifiedGeometry.test.js` icinde tek mimariyi denetler.
- Canli kanit `proofs/clean-live` altindadir; kullanici gorsel kabulunu bekler.

## 2026-09-05 Matematik ve Polyester Denetimi

Durum: GORSEL KABUL BEKLIYOR, CANLIYA ALINMADI

- API yalniz cift kukla sayisini kabul eder; S ve Z aileleri daima esittir.
- Orgu tekrari Diamond icin 2, Regular icin 4, Hercules icin 6 crossing
  sirasidir; eksenel tekrar uzunlugu crossing araligindan hesaplanir.
- Orgu acisi ideal formulle raporlanmakla kalmaz, uretilen mesh tegetinden
  olculur ve test edilir.
- Cetvel secilen ideal silindiri degil kalibre edilmis mesh dis capini denetler.
  10 mm varsayilan kanitta cap hatasi 0.001 mm altindadir.
- 48 kukla/30 sira en buyuk istek 18 MB sunucu sinirinin altinda test edilir.
- Polyester tek envelope mesh kullanir. Emissive aydinlatma, ikinci fiber shell,
  specular renk haritasi ve sheen renk haritasi yoktur.
- Denye PET polimer alanini, paket kalinligini ve optik lif kalinligini; tel
  sayisi toplam tasiyici denyesini, paket kalinligini ve yuzey bant sayisini
  birlikte degistirir. Hicbiri carrier yolu veya renk kimligini degistirmez.
- Guncel kanitlar: `proofs/final-audit-crossing`, `proofs/final-audit-rope`,
  `proofs/final-audit-denier-500`, `proofs/final-audit-denier-1500`,
  `proofs/final-audit-ends-12`, `proofs/final-audit-ends-35`.

## 2026-09-05 Fotograf Referansi Calisma Kopyasi

- Geri donus: `73cacd4`; calisma dali `work/photo-reference`.
- Bu kopya canliya aktarilmadi; gorsel kabul verilmedi.
- Tek geometri cekirdegi ve tasiyici topolojisi korunur.
- Polyester profilindeki denye olcegi 1.0: 1000D artik 700D olarak yorumlanmaz.
- Eksik LTC kurulumu olan RectAreaLight yerine yerel PMREM studyo yansimasi
  kullanilir. Uc panelden uretilir; harici HDR/AI gorseli kullanilmaz.
- Polyester carrier'lari birbirine golge dusurur. Polip icin ortam yansimasi
  ve carrier golgesi acilmaz.
- Polyester parlakligi renk dokusuna boyanmaz; sabit fiziksel specular,
  yonlu yansima ve ince boyuna silindirik normal ayrintisindan gelir.
- Filament yogunlugu halen optik yaklasimdir; gercek D/F etiketi olculmemistir.
- `proofs/photo-reference/target.png` kullanicinin referansidir.
- `proofs/photo-reference-rope`: 32 kukla, 16 mm, 45 derece, 12 ip x 1000D.
  Bu fotograf makinesinin cozulmus recetesi degil, acikca belirtilmis test recetesidir.
- `proofs/photo-reference-crossing`: ayni recetenin gercek iki-carrier kesiti.
- `proofs/photo-reference-default`: 16 kukla, 10 mm varsayilan regresyonu.
- Detayli karsilastirma ve sinirlar: `PHOTO_REFERENCE_REVIEW.md`.

## Kirmizi Yansima Duzeltmesi

- Kullanici `photo-reference-rope` adayindaki BEYAZ gorunumu kabul edilebilir
  buldu; bu kabul kirmiziya veya tam urunun gorsel kabulune genellenmez.
- Beyazin roughness 0.20, specular 1.0, ortam yansimasi 3.2 degerleri,
  normal dokusu ve sahne isiklari korunur.
- Koyu/renkli ipte roughness 0.34, specular 0.72, ortam yansimasi 1.6;
  mevcut filament specular haritasi yansimayi lifler arasinda dagitir.
- Ortam yansimasi artik diger optikler gibi acik/koyu ip ayrimina uyar.
- Son kanitlar `proofs/red-reflection-rope` ve `proofs/red-reflection-crossing`.
- Calisma halen izole kopyadadir; canliya aktarilmadi.

- Kullanicinin sonraki ince ayari: renkli ip specular 0.60, ortam yansimasi
  1.35 olarak biraz daha azaltildi. Beyaz specular 1.0 / ortam 3.2 ve
  tum isiklar ayni. Kanitlar `proofs/red-reflection-soft-crossing` ve
  `proofs/red-reflection-soft-rope` altindadir.

## 16 Kukla Kimlik Tekrari Denetimi

- Malzeme geri donusu: `a536b43`; beyaz ve kirmizi tonlari burada korunur.
- Onceki kullaniciya gosterilen malzeme resmi 32 kukla, 16S/16Z ve 0.9375
  turdu. 16 kukla denetimine ornek olarak kullanilamaz.
- 16 kukla / 16 mm / 45 derece / 12 ip x 1000D / Diamond orneginde gercek
  sweep mesh'inin kutupsal kesitinden kimlik sirasi olculdu: her ailede
  8 farkli kimlik ve 8 aralik sonra ayni kimlik; adim 50.26548 mm.
- 224 S/Z kesisiminde karsilikli ust-alt emri ve mesh tacinin radyal sirasi
  kontrol edildi. Bu, tum yuzeyler icin penetrasyon kaniti sayilmaz.
- `tests/unifiedGeometry.test.js` gercek mesh'ten 8-blok tekrari ve helis
  yonunu normal/ters kukla dagiliminda denetler (12 test).
- Ust-alt orgu tekrari (Diamond: 2 kesisim sirasi) ile ayni kuklanin geri
  donusu (8 ayni-yon blok araligi, 16 kesisim araligi/tur) farkli kavramlardir.
- Arayuz bu iki tekrar turunu ayri gosterir. Goruntu icindeki etiket kukla,
  S/Z, cap ve aciyi belirtir.
- Geometri merkez yollari ve malzeme degismedi; tekrar metaverisi ve
  arayuz aciklamasi eklendi. Canliya aktarim yapilmadi.
- Tekrar denetimi: `python3 scripts/carrier-repeat-audit.py`.
- Kanitlar: `proofs/carrier-repeat-16/identity-repeat.png`, `audit.json`,
  `normal.png`, `close.png`, `mobile.png`, `report.json`.

## 2026-09-05 Canli Onizleme Dagitimi

- Kullanici acikca canliya aktarim istedi; `79b5d10` surumu asil proje
  `/root/projeler/BraidStudio` altina aktarildi ve yalniz braidstudio.service
  yeniden baslatildi.
- Canli adres: https://braidstudio.minen.com.tr/
- Beyaz korundu; kirmizi specular 0.60 / ortam 1.35. Goruntu etiketi ve
  8-blok kukla tekrari aciklamalari canlida.
- 12 test ve sozdizimi kontrolleri gecti. Servis active/running, HTTPS 200;
  HTTPS'te sunulan app.js yerel dosyayla birebir ayni.
- Canli Chromium kaniti: `proofs/live-carrier-repeat-16` (normal, yakin,
  mobil, PNG, rapor); browserErrors bos. Test recetesi 16 kukla, 16 mm,
  45 derece, 12 ip x 1000D. Kullaniciya ait kayitli tercihler silinmedi.
- Onceki canli geri donus dali: `rollback/before-photo-live-20260905`
  (`73cacd4`). Malzeme kontrol noktasi `a536b43`.
- Canliya aktarim, tum urunun gorsel/uretim kabulunun tamamlandigi anlamina
  gelmez; kullanici deseni canlida inceleyecek.

## GUNCEL DURUM: Canli Dagitim Geri Alindi

- Kullanici parlak plastik/musamba gorunumunu reddetti ve geri almaya izin verdi.
- Son canli dagitim kaldirildi. Uretim public/server/scripts/data/tests ve
  paket dosyalari `73cacd4` durumuna geri donduruldu. Yeni malzeme aktif degil.
- Yalniz braidstudio.service yeniden baslatildi; active. HTTPS app.js eski
  kaynakla birebir eslesiyor; canli API eski polyester profilini donduruyor.
- Geri alinan surumun 11 testi ve sozdizimi/diff kontrolleri gecti.
- Onceki beyaz/kirmizi hakkindaki kismi olumlu geri bildirim, reddedilen
  son canli gorunum icin kabul sayilamaz. Yeni aday canliya alinmamalidir.
- Reddedilen calisma `archive/rejected-polyester-live-20260905` dalinda ve
  `/root/projeler/BraidStudio-photo-study` kopyasinda inceleme icin korunur.
  Bu calisma kopyasi aktif uretim surumu degildir.
- Eski raporlar ve ekran kanitlari tarihseldir; aktif durumu bu bolum belirtir.

## Kabul Edilen Tekil Referans ve Canli Farkinin Incelenmesi

- Kullanici `red-reflection-soft-crossing/close.png` gorunumunu kabul ettigini
  yeniden netlestirdi. Reddedilen, bu gorunumun canlidaki tam-halatta karsiligiydi.
  Tekil referans reddedilmis sayilmamalidir; tam halat kabul edilmis sayilmaz.
- Ana canli proje halen 73cacd4 runtime'ina geri alinmis durumda.
- Reddedilen/arsiv calisma kopyasinda `scripts/material-parity-proof.mjs`
  ile 32 kukla / 16 mm / 45 derece / 12 ip x 1000D kosullarinda karsilastirma yapildi.
  Onayli kesismenin 202 yol noktasi ve 25 kesit noktasi var; gercek halattan
  secilen kisa bolumun 11 yol noktasi ve 21 kesit noktasi var. Halattan alinan
  bolum gercek vertex'lerin kesilmesi ve ortak rijit donusle gosterilir;
  yeni tasiyici yolu veya baska bir uretim motoru uretilmez.
- UV baslangici/uzunlugu da ayni degildir. Ayni malzeme JSON'u gorunum
  esdegerligini tek basina kanitlamaz. Buyutulmus karsilastirma ise tek
  basina kullanicinin canlidaki plastik gorunumunun nedenini kanitlamadi.
- Malzeme yeniden ayarlanmadi, canliya aktarim yapilmadi. Kullaniciya
  canlidaki malzeme/kukla/cap/aci/ip sayisi soruldu; henuz bilinmiyor.
- Kanit: BraidStudio-photo-study/proofs/crossing-rope-parity.
