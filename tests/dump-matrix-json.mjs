/**
 * Matrix doğrulama: debug-matrix-surface.json üret
 * İlk 12 row × 24 col için detaylı alan dökümü
 */
import { buildBraidMatrix, getCarrierDirection, topDirectionAt } from '../src/utils/braidMatrix.js';
import fs from 'fs';

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

const matrix = buildBraidMatrix({
  carrierLayout,
  machineProfile: mp,
  braidLogic: 'two-over-two',
  steps: 24
});

// İlk 12 row × 24 col
const rows = 12;
const cols = 16;
const dump = [];

for (let t = 0; t < rows; t++) {
  for (let c = 0; c < cols; c++) {
    const cell = matrix.cells[t][c];
    const entry = {
      row: t,
      col: c,
      cwCarrier: cell.cwCarrier
        ? { no: cell.cwCarrier.carrier_no, color: cell.cwCarrier.color }
        : null,
      ccwCarrier: cell.ccwCarrier
        ? { no: cell.ccwCarrier.carrier_no, color: cell.ccwCarrier.color }
        : null,
      topDirection: cell.topDirection,
      topCarrier: cell.topCarrier
        ? { no: cell.topCarrier.carrier_no, color: cell.topCarrier.color }
        : null,
      underCarrier: cell.underCarrier
        ? { no: cell.underCarrier.carrier_no, color: cell.underCarrier.color }
        : null,
    };
    dump.push(entry);
  }
}

const total = rows * cols;
const nullUnder = dump.filter(e => e.underCarrier === null).length;
const directionMismatch = [];
for (let t = 0; t < rows; t++) {
  for (let c = 0; c < cols; c++) {
    const cell = matrix.cells[t][c];
    const theoretical = topDirectionAt({ time: t, column: c, braidLogic: 'two-over-two' });
    if (cell.topDirection !== theoretical) {
      directionMismatch.push({ row: t, col: c, actual: cell.topDirection, theoretical });
    }
  }
}

const report = {
  meta: {
    totalCells: total,
    nullUnderCount: nullUnder,
    nullUnderRatio: (nullUnder / total * 100).toFixed(1) + '%',
    directionMismatchCount: directionMismatch.length,
    directionMismatchRatio: (directionMismatch.length / total * 100).toFixed(1) + '%',
    status: nullUnder === 0 && directionMismatch.length === 0 ? 'PASS' : 'FAIL'
  },
  directionMismatchDetails: directionMismatch.slice(0, 20),
  cells: dump
};

fs.writeFileSync('debug-matrix-surface.json', JSON.stringify(report, null, 2));
console.log('=== DOGRULAMA RAPORU ===');
console.log('Toplam hucre: ' + total);
console.log('underCarrier=null: ' + nullUnder + ' / ' + total + ' (' + report.meta.nullUnderRatio + ')');
console.log('Direction uyumsuz: ' + directionMismatch.length + ' / ' + total + ' (' + report.meta.directionMismatchRatio + ')');
console.log('Genel durum: ' + report.meta.status);
console.log('');
console.log('JSON yazildi: debug-matrix-surface.json');

// Tablo özeti
console.log('');
console.log('ILK 10 SATIR (row,col -> topCarrier #, underCarrier #):');
for (let i = 0; i < 10 && i < dump.length; i++) {
  const e = dump[i];
  const top = e.topCarrier ? '#' + e.topCarrier.no : 'null';
  const under = e.underCarrier ? '#' + e.underCarrier.no : 'null';
  console.log(`  (${e.row},${e.col}): top=${top} under=${under} dir=${e.topDirection}`);
}
