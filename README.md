# gridcalc

Headless, Excel-compatible formula engine for TypeScript. Zero runtime dependencies.

It takes cells containing formulas (`=SUM(A1:B2)*2`) and returns their computed values, maintaining a dependency graph so edits trigger incremental recalculation. It is the "brain" behind embedded spreadsheets, budgeting tools, financial simulators, or any table with formulas inside an app — with no UI, no `.xlsx` parsing, no DOM.

> **Status: pre-alpha (phase 1 MVP).** Single-sheet engine with lexer, Pratt parser, dependency graph with incremental recalculation, cycle detection, and ~40 functions covered by golden tests generated against LibreOffice. Multi-sheet, localization and dynamic arrays are next.

## Usage

```ts
import { Engine } from 'gridcalc';

const engine = Engine.buildEmpty();
const addr = (col: number, row: number) => ({ sheet: 0, col, row });

// Fill A1:A3 and a formula in B1
engine.batch(() => {
  engine.setCellContents(addr(0, 0), 1); // A1
  engine.setCellContents(addr(0, 1), 2); // A2
  engine.setCellContents(addr(0, 2), 3); // A3
  engine.setCellContents(addr(1, 0), '=SUM(A1:A3)'); // B1
});
engine.getCellValue(addr(1, 0)); // 6

// Editing A1 recalculates only its dependents and reports what changed
const changes = engine.setCellContents(addr(0, 0), 10);
// changes -> [{ address: A1, value: 10 }, { address: B1, value: 15 }]

engine.getCellFormula(addr(1, 0)); // "=SUM(A1:A3)"
engine.setCellContents(addr(2, 0), '=B1/0'); // C1 -> #DIV/0! (errors are values, nothing throws)
```

## Design principles

- **Excel compatibility by default**, proven by golden tests against a real spreadsheet engine (LibreOffice headless), including historical quirks like the 1900 leap-year bug (configurable via `use1900LeapYearBug`).
- **Zero runtime dependencies** — embeddable, auditable, license-clean.
- **First-class localization**: configurable argument/decimal separators and translated function names (`=SUMA(A1;B2)` ⇄ `=SUM(A1,B2)`), starting with `es` and `en`.
- **Headless and environment-agnostic**: ES2020, runs in browsers and Node.

## Development

```sh
npm install
npm test            # unit + golden tests
npm run typecheck
npm run lint
npm run build       # ESM + CJS + types via tsup

# Regenerate golden fixtures (requires LibreOffice):
npm run generate-fixtures -- formulas.json tests/golden/fixtures/math.fixtures.json
```

## License

AGPL-3.0-only. A commercial license for use in proprietary software is planned.
