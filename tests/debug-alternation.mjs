/**
 * DEBUG: Hucre yonu / renk alternasyonu kontrolu
 *
 * Amaç: buildBraidMatrix ciktisini "gercek halat referansi" ile karsilastirip
 * alternasyon patterninde sorun olup olmadigini tespit etmek.
 *
 * Gercek 16-telli two-over-two sennit halat beklentisi:
 * - Tek numarali carrierlar (1,3,5,...,15) -> CW -> saga (+1) hareket
 * - Cift numarali carrierlar (2,4,6,...,16) -> CCW -> sola (-1) hareket
 * - Iki-over-iki: CW 2 adim ustte, sonra CCW 2 adim ustte
 * - Kolon bazinda: CW-CCW-CW-CCW-... sirali dizilim
 *
 * Gercek halatta her kolonda tam olarak 1 carrier usttedir.
 * Karsi yonden gelen carrier altinda kalir (underCarrier).
 */

import { buildBraidMatrix, getCarrierDirection, topDirectionAt } from '../src/utils/braidMatrix.js';

// --- Layout: app.js default 16-carrier two-over-two ---
const carrierLayout = Array.from({ length: 16 }, (_, i) => ({
  carrier_no: i + 1,
  color: [1].includes(i + 1) ? 'siyah' :
         [3, 5].includes(i + 1) ? 'kirmizi' :
         [10, 12].includes(i + 1) ? 'mavi' : 'beyaz',
  strand_role: [1, 3, 5, 10, 12].includes(i + 1) ? 'sheath_marker' : 'sheath'
}));

const mp = {
  carrierGroups: {
    clockwise: [1, 3, 5, 7, 9, 11, 13, 15],
    counterClockwise: [2, 4, 6, 8, 10, 12, 14, 16]
  }
};

const STEPS = 24;
const matrix = buildBraidMatrix({
  carrierLayout,
  machineProfile: mp,
  braidLogic: 'two-over-two',
  steps: STEPS
});

// --- Yardimcilar ---
const C = { siyah: 'S', kirmizi: 'K', mavi: 'M', beyaz: '.' };
const D = { clockwise: 'CW', counterClockwise: 'cc' };

// ====== TABLO 1: Direction pattern ======
console.log('============================================================');
console.log('TABLO 1: DIRECTION PATTERN');
console.log('CW=clockwise ustte, cc=counterClockwise ustte');
console.log('Renk: S=siyah K=kirmizi M=mavi .=beyaz');
console.log('============================================================\n');

console.log('     Kolon->  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15');
console.log('     ------------------------------------------------------------');
for (let t = 0; t < 16; t++) {
  let row = 't=' + String(t).padStart(2) + ' |';
  for (let c = 0; c < 16; c++) {
    const cell = matrix.cells[t][c];
    row += ' ' + D[cell.topDirection] + C[cell.topCarrier?.color || 'beyaz'];
  }
  const cwHeavy = Math.floor(t / 2) % 2 === 0;
  console.log(row + (cwHeavy ? '  <- CW agirlikli' : '  <- CCW agirlikli'));
}
console.log('');

// ====== TABLO 2: Renkli carrier pozisyonlari ======
console.log('============================================================');
console.log('TABLO 2: RENKLI CARRIER POZISYONLARI');
console.log('============================================================\n');

const coloredCarriers = carrierLayout.filter(c => c.color !== 'beyaz');
for (const cr of coloredCarriers) {
  const dir = getCarrierDirection(cr.carrier_no, mp);
  console.log('\nCarrier #' + String(cr.carrier_no).padStart(2) + ' (' + cr.color + ', ' + dir + '):');
  let line = '';
  for (let t = 0; t < STEPS; t++) {
    const col = matrix.cells[t].findIndex(c => c.topCarrier?.carrier_no === cr.carrier_no);
    if (col >= 0) {
      line += ' t=' + t + '->c' + col;
    }
  }
  console.log(line);
}
console.log('');

// ====== TABLO 3: Alternasyon analizi ======
console.log('============================================================');
console.log('TABLO 3: ALTERNASYON ANALIZI');
console.log('============================================================\n');

for (let t = 0; t < 12; t++) {
  const seq = [];
  const colored = [];
  for (let c = 0; c < 16; c++) {
    const cell = matrix.cells[t][c];
    seq.push(D[cell.topDirection]);
    if (cell.topCarrier?.color !== 'beyaz') {
      colored.push({ col: c, cn: cell.topCarrier.carrier_no, color: cell.topCarrier.color, dir: cell.topDirection });
    }
  }
  console.log('t=' + t + ': yon=' + seq.join('-'));
  if (colored.length) {
    const str = colored.map(r => 'c' + r.col + '#' + r.cn + C[r.color] + D[r.dir]).join(', ');
    console.log('      renkli: ' + str);
    for (let i = 1; i < colored.length; i++) {
      const gap = colored[i].col - colored[i-1].col;
      if (gap <= 2) {
        console.log('      ! Yanyana renkli: #' + colored[i-1].cn + '@c' + colored[i-1].col + ' ile #' + colored[i].cn + '@c' + colored[i].col + ' (' + gap + ' kolon ara)');
      }
    }
  }
}
console.log('');

// ====== TABLO 4: Teorik topDirectionAt pattern ======
console.log('============================================================');
console.log('TABLO 4: topDirectionAt TEORIK (time+column)/span % 2');
console.log('span=2 (two-over-two): direction flips every 2');
console.log('============================================================\n');

console.log('     Kolon->  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15');
console.log('     ------------------------------------------------------------');
for (let t = 0; t < 8; t++) {
  let row = 't=' + t + ' |';
  for (let c = 0; c < 16; c++) {
    const td = topDirectionAt({ time: t, column: c, braidLogic: 'two-over-two' });
    row += ' ' + D[td] + ' ';
  }
  console.log(row);
}
console.log('');

// ====== TABLO 5: Carrier hareket analizi ======
console.log('============================================================');
console.log('TABLO 5: CARRIER HAREKET ANALIZI');
console.log('============================================================\n');

for (let cn = 1; cn <= 16; cn++) {
  const dir = getCarrierDirection(cn, mp);
  const sym = dir === 'clockwise' ? '->' : '<-';
  const cols = [];
  for (let t = 0; t < 8; t++) {
    const col = matrix.cells[t].findIndex(c => c.topCarrier?.carrier_no === cn || c.underCarrier?.carrier_no === cn);
    cols.push(col);
  }
  const color = carrierLayout[cn - 1].color;
  const star = color !== 'beyaz' ? ' *' : '';
  console.log('#' + String(cn).padStart(2) + ' ' + sym + ' (' + dir.padEnd(16) + ') renk=' + color.padEnd(8) + ' kolonlar: ' + cols.join(', ') + star);
}
console.log('');

// ====== TABLO 6: underCarrier durumu ======
console.log('============================================================');
console.log('TABLO 6: underCarrier DURUMU');
console.log('============================================================\n');

const nullUnders = [];
for (let t = 0; t < STEPS; t++) {
  for (let c = 0; c < 16; c++) {
    const cell = matrix.cells[t][c];
    if (!cell.underCarrier) {
      nullUnders.push({ t, c, topCn: cell.topCarrier?.carrier_no, topDir: cell.topDirection });
    }
  }
}
console.log('Toplam underCarrier=null: ' + nullUnders.length + ' / ' + (STEPS * 16));
if (nullUnders.length > 0 && nullUnders.length <= 40) {
  for (const nu of nullUnders) {
    console.log(' -> (t=' + nu.t + ', c=' + nu.c + '): top #' + nu.topCn + ' ' + nu.topDir);
  }
} else if (nullUnders.length > 40) {
  console.log('(ilk 20:)');
  for (const nu of nullUnders.slice(0, 20)) {
    console.log(' -> (t=' + nu.t + ', c=' + nu.c + '): top #' + nu.topCn + ' ' + nu.topDir);
  }
}
console.log('');

// ====== TABLO 7: Renk gecis analizi ======
console.log('============================================================');
console.log('TABLO 7: RENK GECIS ANALIZI (time adimlarinda kolon bazinda renk)');
console.log('============================================================\n');

for (let t = 0; t < 8; t++) {
  let row = 't=' + t + ': ';
  for (let c = 0; c < 16; c++) {
    const cell = matrix.cells[t][c];
    const color = cell.topCarrier?.color || '?';
    const short = C[color] || (color === 'beyaz' ? '.' : '?');
    row += short;
  }
  const colored = [];
  for (let c = 0; c < 16; c++) {
    if (matrix.cells[t][c].topCarrier?.color !== 'beyaz') {
      colored.push(String(c));
    }
  }
  row += '  [' + colored.join(',') + ']';
  console.log(row);
}
console.log('');

// ====== OZET DEGERLENDIRME ======
console.log('============================================================');
console.log('OZET DEGERLENDIRME');
console.log('============================================================\n');

const underRatio = nullUnders.length / (STEPS * 16);
console.log('underCarrier=null orani: ' + (underRatio * 100).toFixed(1) + '%');
if (underRatio > 0.05) {
  console.log('! underCarrier=null orani yuksek. Ideal 0 olmali.');
} else {
  console.log('OK - underCarrier=null orani kabul edilebilir.');
}
console.log('');

console.log('5 renkli carrier:');
console.log('  #1(siyah,CW) #3(kirmizi,CW) #5(kirmizi,CW) #10(mavi,CCW) #12(mavi,CCW)');
console.log('');

let mismatch = 0;
for (let t = 0; t < 16; t++) {
  for (let c = 0; c < 16; c++) {
    const actual = matrix.cells[t][c].topDirection;
    const expected = topDirectionAt({ time: t, column: c, braidLogic: 'two-over-two' });
    if (actual !== expected) mismatch++;
  }
}
console.log('Direction pattern teorik ile uyum: ' + mismatch + ' / ' + (16 * 16) + ' uyumsuz');
if (mismatch === 0) {
  console.log('OK - topDirection tam uyumlu.');
} else {
  console.log('! topDirection teorik ile uyumsuz.');
}
console.log('');

let adjacencyCount = 0;
for (let t = 0; t < STEPS; t++) {
  const colored = [];
  for (let c = 0; c < 16; c++) {
    if (matrix.cells[t][c].topCarrier?.color !== 'beyaz') {
      colored.push(c);
    }
  }
  for (let i = 1; i < colored.length; i++) {
    if (colored[i] - colored[i-1] <= 2) adjacencyCount++;
  }
}
console.log('Yanyana renkli carrier: ' + adjacencyCount + ' kez');
if (adjacencyCount > 10) {
  console.log('! Renkli carrierlar yanyana - render alternasyonunu etkileyebilir.');
}

// ====== FINAL KARAR ======
console.log('\n============================================================');
console.log('KARAR: matrix dogru mu, braid logic mi, renderer mi?');
console.log('============================================================');
if (mismatch === 0 && underRatio === 0) {
  console.log('SONUC: Matrix yapisi TAMAMEN DOGRU.');
  console.log('  - topDirection teorik ile uyumlu');
  console.log('  - underCarrier eslesmesi kusursuz');
  console.log('');
  console.log('  Bu durumda SORUN RENDERERDA:');
  console.log('  1) buildMatrixSurfaceCrowns row/col swapping (row=cell.column, col=cell.time)');
  console.log('  2) PASS 0 overlap mantigi (renkli/ beyaz overlap multiplier)');
  console.log('  3) Crown siralamasi (colored-first vs white-first)');
} else if (mismatch > 0) {
  console.log('SONUC: BRAID LOGIC/MATRIX tarafinda SORUN VAR.');
  console.log('  topDirectionAt veya findCarrierAt kontrol edilmeli.');
} else if (underRatio > 0.05) {
  console.log('SONUC: MATRIX TAMAMLANMAMIS. underCarrier eslesmesi sorunlu.');
  console.log('  findCarrierAt veya carrierColumnAt kontrol edilmeli.');
}
