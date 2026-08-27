# BraidStudio Calisma Denetimi - 2026-08-27

## Bulunan Kopukluk

Eski `crossing` modu iki tasiyiciyi ve uc kesismeyi elle kuruyordu. `rope`
modu ise 16 tasiyicili periyodik makine kafesini kullaniyordu. Ayni Python
dosyasinda bulunmalari ayni simulasyon olduklari anlamina gelmiyordu.

Bu ayrim kaldirildi. Tekil goruntu artik tam halati ureten
`build_carrier_records()` sonucundan iki gercek tasiyiciyi secip ayni 3B sweep
ile cizer. Tekil icin ayri kesit, temas veya malzeme motoru yoktur.

## Calisirken Gozlenen Dosyalar

Tarayici yuklemesi:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/vendor/three.module.js`
- `public/vendor/three.core.js`

Geometri istegi:

- `server.js`
- `scripts/braid_geometry.py`

Gercek istek kaydi `runtime-files.jsonl`, iki modun cagrilan Python
fonksiyonlari `crossing-functions.log` ve `rope-functions.log` dosyalarindadir.
Iki fonksiyon listesi yalnizca son sarmalayicida (`build_crossing` veya
`build_rope`) farklidir; alt topoloji, merkez yolu, temas, kesit ve sweep
fonksiyonlari aynidir.

## Kontrol Noktasi ve Silme Kaydi

- Degisiklik oncesi aktif dosyalar: `checkpoint-before-runtime-unification/`
- Silinen dosyalarin adlari: `deletion-manifest-2026-08-27.txt`
- Korunan tekil referans: `../references/single-baseline/`

Eski deneyler, tam proje kopyasi yedekler, numarali kanit klasorleri, eski
render onbellegi, kullanilmayan Three.js dagitimlari ve kullanilmayan ekran
yakalama araci silinmistir.

## Gorsel Durum

Mimari kopukluk giderildi. En boyunca kesisim zamani, silindirik frame yonu ve
iki orgu ailesinin gercek dogru kesismesiyle hesaplanir. Tam cevresel adim eni,
gizli katman gecisini aciga cikaran kose boslugunu kaldirir. Tekil ve tam halat
ayni `unified_carrier_geometry` modelini raporlamistir. Guncel kanitlar
`../proofs/current-crossing/` ve `../proofs/current-rope/` altindadir. Iki kanit
da `https://braidstudio.minen.com.tr/` uzerinden alinmis ve `deployed: true`
raporlamistir. Kullanici kabul kaydi henuz yoktur.
