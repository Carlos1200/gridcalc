/**
 * Golden-test harness: loads fixture files produced from a real spreadsheet
 * (LibreOffice headless / Excel) and checks the engine against them.
 *
 * Fixture format (one JSON array per category file):
 *   { "formula": "=SUM(A1:A3)", "inputs": { "A1": 1, "A2": 2, "A3": 3 }, "expected": 6 }
 *
 * `expected` error values are encoded as their display string, e.g. "#DIV/0!".
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CellError, Engine, parseCellReference, type ScalarValue } from '../../src/index';

export interface GoldenFixture {
  formula: string;
  inputs?: Record<string, ScalarValue>;
  expected: ScalarValue | string;
}

export interface FixtureFile {
  name: string;
  fixtures: GoldenFixture[];
}

export function loadFixtureFiles(fixturesDir: string): FixtureFile[] {
  return readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.fixtures.json'))
    .map((file) => ({
      name: file,
      fixtures: JSON.parse(readFileSync(join(fixturesDir, file), 'utf8')) as GoldenFixture[],
    }));
}

/** Far away from any realistic fixture input cell. */
const FORMULA_CELL = { sheet: 0, col: 701, row: 9999 }; // ZZ10000

/** Evaluates one fixture through a fresh Engine. */
export function evaluateFixture(fixture: GoldenFixture): ScalarValue | null {
  const engine = Engine.buildEmpty();
  engine.batch(() => {
    for (const [ref, value] of Object.entries(fixture.inputs ?? {})) {
      const parsed = parseCellReference(ref);
      if (!parsed) {
        throw new Error(`Invalid input reference "${ref}" in fixture`);
      }
      engine.setCellContents({ sheet: 0, col: parsed.col, row: parsed.row }, value);
    }
    engine.setCellContents(FORMULA_CELL, fixture.formula);
  });
  return engine.getCellValue(FORMULA_CELL);
}

const FLOAT_TOLERANCE = 1e-9;

/** Compares an engine result with the expected fixture value. */
export function valuesMatch(actual: ScalarValue | null, expected: ScalarValue | string): boolean {
  if (actual === null) {
    return false; // fixtures never expect an empty cell
  }
  if (actual instanceof CellError) {
    return actual.toString() === expected;
  }
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (actual === expected) return true;
    const scale = Math.max(Math.abs(actual), Math.abs(expected), 1);
    return Math.abs(actual - expected) <= FLOAT_TOLERANCE * scale;
  }
  return actual === expected;
}
