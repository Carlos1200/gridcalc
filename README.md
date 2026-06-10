# gridcalc

Headless, Excel-compatible formula engine for TypeScript. Zero runtime dependencies.

It takes cells containing formulas (`=SUM(A1:B2)*2`) and returns their computed values, maintaining a dependency graph so edits trigger incremental recalculation. It is the "brain" behind embedded spreadsheets, budgeting tools, financial simulators, or any table with formulas inside an app — with no UI, no `.xlsx` parsing, no DOM.

> **Status: pre-alpha (phase 0).** Value system, coercions and Excel date serials are implemented and tested; lexer, parser, dependency graph and the function library are in progress.

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
