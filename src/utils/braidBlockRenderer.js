/* ------------------------------------------------------------------ */
/* Braid Block Renderer — Cell Painter yerine Visible Braid Block     */
/*                                                                    */
/* Her matrix cell için kare boyamak yerine, topCarrier'a ait görünen */
/* örgü yüzünü diagonal, rounded, flat braid-block olarak çizer.      */
/* underCarrier sadece gölge etkisi verir, asla boyanmaz.             */
/*                                                                    */
/* Kurallar:                                                          */
/*   1. buildBraidMatrix() mantığına dokunma.                         */
/*   2. Sadece topCarrier görünür yüz üretir.                        */
/*   3. underCarrier sadece gölge etkisi, boyanmaz.                  */
/*   4. CW = alt-sol → üst-sağ, CCW = üst-sol → alt-sağ            */
/*   5. Gölge iki uzun kenara (blok yönüne paralel).                 */
/*   6. Shape: rounded short ribbon / capsule-parallelogram.          */
/*   7. Amaç: white-color-white-color alternasyonu.                   */
/* ------------------------------------------------------------------ */

/* ---- Renk yardımcıları (braidCanvasRenderer.js ile kopya,        */
/*      circular import'u önlemek için burada tanımlandı)            */
const _FALLBACK_COLORS = {
  siyah: "#1b1f1d", black: "#1b1f1d",
  kırmızı: "#bd2f2b", red: "#bd2f2b",
  lacivert: "#1f3d70", mavi: "#1f3d70", blue: "#1f3d70",
  beyaz: "#f8faf9", white: "#f8faf9",
  gray: "#77817b", gri: "#77817b",
  nylon: "#d8dde0",
  sarı: "#d7a800", yellow: "#d7d900",
  yeşil: "#2d7d46", green: "#2d7d46",
  turuncu: "#d96c1a", orange: "#d96c1a",
  mor: "#6b3fa0", purple: "#6b3fa0",
  pembe: "#d45087", pink: "#d45087"
};
function _colorToHex(color) {
  return _FALLBACK_COLORS[String(color || "").toLowerCase()] || "#8d9892";
}
function _brightness(hex) {
  const v = hex.replace("#", "");
  const r = parseInt(v.substring(0, 2), 16);
  const g = parseInt(v.substring(2, 4), 16);
  const b = parseInt(v.substring(4, 6), 16);
  return Math.round((r * 299 + g * 587 + b * 114) / 1000);
}
function _shadeHex(hex, percent) {
  const v = hex.replace("#", "");
  const num = parseInt(v.length === 3 ? v.split("").map(c => c + c).join("") : v, 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/* ------------------------------------------------------------------ */
/* Capsule-parallelogram path: dört noktalı yamuk, kısa kenarları     */
/* quadratic bezier ile yuvarlatılmış.                                */
/* ------------------------------------------------------------------ */
function roundedQuadPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  // 1. kısa kenar (yuvarlatılmış): 0→1
  ctx.quadraticCurveTo(
    (points[0].x + points[1].x) / 2,
    (points[0].y + points[1].y) / 2,
    points[1].x,
    points[1].y
  );
  // 1. uzun kenar (düz): 1→2
  ctx.lineTo(points[2].x, points[2].y);
  // 2. kısa kenar (yuvarlatılmış): 2→3
  ctx.quadraticCurveTo(
    (points[2].x + points[3].x) / 2,
    (points[2].y + points[3].y) / 2,
    points[3].x,
    points[3].y
  );
  // 2. uzun kenar (düz): 3→0
  ctx.lineTo(points[0].x, points[0].y);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* Ana blok render fonksiyonu                                         */
/* crown: { x, y, color, direction, underCarrier, ... }               */
/* cellW, cellH: grid hücre boyutları                                 */
/* ------------------------------------------------------------------ */
export function drawVisibleBraidBlock(ctx, crown, cellW, cellH) {
  const { x, y, color, direction, underCarrier } = crown;
  const cx = x;
  const cy = y;

  /* ---- Blok geometrisi ---- */
  // Uzun eksen hücre sınırlarının dışına taşar → ribbon overlap
  const padX = cellW * 0.26;
  // Kısa kenarların hücre dikeyinde konumlanma oranı
  const offsetRatio = 0.18;

  // Merkez çizgisinin iki uç noktası
  let p1, p2;
  if (direction === "clockwise") {
    // CW: alt-sol → üst-sağ
    p1 = { x: cx - padX, y: cy + cellH * (1 - offsetRatio) };
    p2 = { x: cx + cellW + padX, y: cy + cellH * offsetRatio };
  } else {
    // CCW: üst-sol → alt-sağ
    p1 = { x: cx - padX, y: cy + cellH * offsetRatio };
    p2 = { x: cx + cellW + padX, y: cy + cellH * (1 - offsetRatio) };
  }

  // Blok kalınlığı (merkez çizgisine dik)
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;  // birim normal (dik vektör)
  const ny = dx / len;
  const halfW = cellH * 0.20;

  // Dört köşe noktası (paralelkenar)
  // 0: üst-kenar başlangıç, 1: üst-kenar bitiş (kısa kenar)
  // 2: alt-kenar bitiş (uzun kenar başlangıcı), 3: alt-kenar başlangıç
  const pts = [
    { x: p1.x + nx * halfW, y: p1.y + ny * halfW },  // üst-sol
    { x: p2.x + nx * halfW, y: p2.y + ny * halfW },  // üst-sağ
    { x: p2.x - nx * halfW, y: p2.y - ny * halfW },  // alt-sağ
    { x: p1.x - nx * halfW, y: p1.y - ny * halfW }   // alt-sol
  ];

  const hex = _colorToHex(color);
  const bVal = _brightness(hex);

  /* ---- Adım 1: underCarrier gölgesi (blok yönünde uzun kenarlara) ---- */
  // underCarrier varsa, blok altından geçen ipin gölgesi eklenir.
  // Gölge, blok normali yönünde hafifçe ötelenmiş ve karartılmış bir şekildir.
  if (underCarrier) {
    ctx.save();
    ctx.globalAlpha = bVal > 180 ? 0.03 : 0.05;
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.shadowColor = "transparent";

    // underCarrier gölgesi: bloğun alt-kenarı boyunca, normal yönünde ötelenmiş
    const shift = -halfW * 0.35;
    const shadowPts = pts.map(p => ({ x: p.x + nx * shift, y: p.y + ny * shift }));
    shadowPts[1] = { x: pts[1].x + nx * shift * 0.6, y: pts[1].y + ny * shift * 0.6 };
    shadowPts[2] = { x: pts[2].x + nx * shift * 0.6, y: pts[2].y + ny * shift * 0.6 };
    roundedQuadPath(ctx, shadowPts);
    ctx.fill();
    ctx.restore();
  }

  /* ---- Adım 2: Uzun kenar kontak gölgesi ---- */
  // Bloğun iki uzun kenarı boyunca ince bir gölge şeridi
  // (bloklar arası geçişte derinlik hissi)
  ctx.save();
  ctx.globalAlpha = bVal > 180 ? 0.025 : 0.04;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.shadowColor = "transparent";

  // Alt uzun kenar gölgesi (pt3→pt2 arası)
  const edgeInset = halfW * 0.3;
  const edgeShadowPts = [
    { x: pts[3].x - nx * edgeInset, y: pts[3].y - ny * edgeInset },
    { x: pts[2].x - nx * edgeInset, y: pts[2].y - ny * edgeInset },
    { x: pts[2].x + nx * 0.15, y: pts[2].y + ny * 0.15 },
    { x: pts[3].x + nx * 0.15, y: pts[3].y + ny * 0.15 }
  ];
  roundedQuadPath(ctx, edgeShadowPts);
  ctx.fill();
  ctx.restore();

  /* ---- Adım 3: Ana blok (gradyan + hafif kenar çizgisi) ---- */
  ctx.save();

  // Dik eksende 3-stop gradyan: iplik silindirik dokusu
  const grad = ctx.createLinearGradient(
    (p1.x + p2.x) / 2 + nx * halfW,
    (p1.y + p2.y) / 2 + ny * halfW,
    (p1.x + p2.x) / 2 - nx * halfW,
    (p1.y + p2.y) / 2 - ny * halfW
  );

  if (bVal > 180) {
    // Beyaz/açık iplik — yumuşak, düşük kontrast
    grad.addColorStop(0, "#f2f2f2");
    grad.addColorStop(0.30, "#ffffff");
    grad.addColorStop(0.70, "#f7f7f7");
    grad.addColorStop(1, "#e6e6e6");
  } else if (bVal < 40) {
    // Siyah/koyu iplik — hafif ton geçişi
    grad.addColorStop(0, _shadeHex(hex, -6));
    grad.addColorStop(0.30, _shadeHex(hex, 10));
    grad.addColorStop(0.70, _shadeHex(hex, 3));
    grad.addColorStop(1, _shadeHex(hex, -8));
  } else {
    // Renkli iplik — hafif ton geçişi
    grad.addColorStop(0, _shadeHex(hex, -6));
    grad.addColorStop(0.28, _shadeHex(hex, 8));
    grad.addColorStop(0.72, _shadeHex(hex, 2));
    grad.addColorStop(1, _shadeHex(hex, -8));
  }

  // Yumuşak gölge - bloklar arası derinlik
  ctx.shadowColor = bVal > 180 ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.07)";
  ctx.shadowBlur = 0.8;
  ctx.shadowOffsetX = nx * halfW * 0.08;
  ctx.shadowOffsetY = ny * halfW * 0.08;

  ctx.fillStyle = grad;
  roundedQuadPath(ctx, pts);
  ctx.fill();

  // İnce kenar çizgisi (blok sınırlarını belli belirsiz ayırır)
  ctx.shadowColor = "transparent";
  ctx.globalAlpha = bVal > 180 ? 0.06 : 0.10;
  ctx.strokeStyle = bVal > 180 ? "rgba(160,160,160,0.08)" : _shadeHex(hex, -4);
  ctx.lineWidth = 0.20;
  ctx.stroke();

  ctx.restore();
}
