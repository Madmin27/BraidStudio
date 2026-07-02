status: doing
owner: codex
updated_at: 2026-07-01
related_files:
- src/renderers/geometryPreview/yarnPathBuilder.js
- src/renderers/geometryPreview/threeBraidRenderer.js
- src/renderers/geometryPreview/yarnMaterials.js
- tests/geometryPreview.test.js

# Geometry Preview Renderer

Canvas realistic rope hedefi durduruldu.

Three.js tabanlı yarn geometry preview iskeleti eklendi:
- unwrapped braid surface üretir
- crossing schedule yüzey katmanında hesaplanır
- surface point cylindrical rope sheath koordinatına map edilir
- açık tubular braid path önceliklidir; kapalı/dolu halat hedefi sonraki aşamadır
- carrier theta formülü: `phase + direction * step * angularStep`
- carrier path -> CatmullRomCurve3
- curve -> TubeGeometry
- color -> carrierColorMap
- material -> MeshStandardMaterial
- over/under -> radius offset

Frontend entegrasyonu ayrı aşama.
