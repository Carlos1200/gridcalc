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
import { CellError, parseNumericString, type ScalarValue } from '../../src/index';

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

/**
 * Evaluates one fixture through the engine.
 *
 * TEMPORARY: the Engine does not exist yet (phase 0). Until it does, this
 * placeholder only understands literal (non-"=") content, which is enough
 * for the dummy fixture that proves the CI pipeline works end to end.
 * Replace its body with a real Engine call in phase 1.
 */
export function evaluateFixture(fixture: GoldenFixture): ScalarValue {
  if (fixture.formula.startsWith('=')) {
    throw new Error(
      `Golden harness cannot evaluate "${fixture.formula}" yet: Engine not implemented (phase 1).`,
    );
  }
  return parseNumericString(fixture.formula) ?? fixture.formula;
}

const FLOAT_TOLERANCE = 1e-9;

/** Compares an engine result with the expected fixture value. */
export function valuesMatch(actual: ScalarValue, expected: ScalarValue | string): boolean {
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
