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

`texgen_braid_mesh.py`, `carrier_render_envelope.py`, alternatif envelope matematigi,
fallback geometri, malzeme varyantlari ve numarali motorlar bulunamaz.

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
incelemeden sonuc kabul edilmez; malzeme/polyester kalibrasyonu sonraki istir.
