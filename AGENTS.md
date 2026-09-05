# BraidStudio Calisma Sozlesmesi

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
