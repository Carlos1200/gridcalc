import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateFixture, loadFixtureFiles, valuesMatch } from './harness';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('golden fixtures', () => {
  const files = loadFixtureFiles(fixturesDir);

  it('finds at least one fixture file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file.name, () => {
      for (const fixture of file.fixtures) {
        it(`${fixture.formula} -> ${JSON.stringify(fixture.expected)}`, () => {
          const actual = evaluateFixture(fixture);
          expect(
            valuesMatch(actual, fixture.expected),
            `expected ${JSON.stringify(fixture.expected)}, got ${JSON.stringify(actual)}`,
          ).toBe(true);
        });
      }
    });
  }
});
