/**
 * Engine benchmarks for the phase 4 target: partial recalculation under
 * 100ms on grids of 100k+ cells.
 *
 * Usage: npx tsx scripts/benchmark.ts
 */

import { performance } from 'node:perf_hooks';
import { Engine, type SimpleCellAddress } from '../src/index';

function time(label: string, run: () => unknown): number {
  const start = performance.now();
  const result = run();
  const elapsed = performance.now() - start;
  void result;
  console.log(`${label.padEnd(58)} ${elapsed.toFixed(1).padStart(8)} ms`);
  return elapsed;
}

function at(col: number, row: number): SimpleCellAddress {
  return { sheet: 0, col, row };
}

console.log('— aggregation: 100,000 values + 100 SUM formulas —');
{
  const engine = Engine.buildEmpty();
  time('build 100k values + 100 column SUMs (batch)', () => {
    engine.batch(() => {
      // 100 columns x 1000 rows of values, one SUM per column below them.
      for (let col = 0; col < 100; col++) {
        for (let row = 0; row < 1000; row++) {
          engine.setCellContents(at(col, row), row + 1);
        }
        engine.setCellContents(at(col, 1001), `=SUM(${ref(col, 0)}:${ref(col, 999)})`);
      }
    });
  });
  time('partial recalc: edit 1 of 100k values', () => {
    engine.setCellContents(at(50, 500), 999999);
  });
  time('partial recalc: edit another value', () => {
    engine.setCellContents(at(10, 100), -1);
  });
}

console.log('\n— dependency chain: 50,000 formulas deep —');
{
  const engine = Engine.buildEmpty();
  time('build 50k-cell chain (batch)', () => {
    engine.batch(() => {
      engine.setCellContents(at(0, 0), 1);
      for (let row = 1; row < 50000; row++) {
        engine.setCellContents(at(0, row), `=A${row}+1`);
      }
    });
  });
  time('partial recalc: edit the chain head (50k dependents)', () => {
    engine.setCellContents(at(0, 0), 100);
  });
  time('partial recalc: edit the chain middle (25k dependents)', () => {
    engine.setCellContents(at(0, 25000), 0);
  });
}

console.log('\n— 2D grid: 200x500 = 100,000 formulas (left + above) —');
{
  const engine = Engine.buildEmpty();
  time('build 100k-formula grid (batch)', () => {
    engine.batch(() => {
      engine.setCellContents(at(0, 0), 1);
      for (let col = 0; col < 200; col++) {
        for (let row = 0; row < 500; row++) {
          if (col === 0 && row === 0) {
            continue;
          }
          const left = col > 0 ? ref(col - 1, row) : '0';
          const above = row > 0 ? ref(col, row - 1) : '0';
          engine.setCellContents(at(col, row), `=${left}+${above}`);
        }
      }
    });
  });
  time('partial recalc: edit a corner cell (all 100k dirty)', () => {
    engine.setCellContents(at(0, 0), 2);
  });
  time('partial recalc: edit near the far corner (small closure)', () => {
    engine.setCellContents(at(198, 498), 0);
  });
}

function ref(col: number, row: number): string {
  let letters = '';
  let n = col + 1;
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row + 1}`;
}
