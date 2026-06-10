/**
 * Golden-fixture generator.
 *
 * Runs a list of formulas through LibreOffice headless and writes the results
 * as a golden fixture file the test harness consumes.
 *
 * Usage:
 *   node scripts/generate-fixtures.ts <formulas.json> <output.fixtures.json>
 *
 * <formulas.json> is a JSON array of formula strings in Excel syntax, e.g.
 *   ["=SUM(1,2)", "=ROUND(2.5,0)", "=1/0"]
 *
 * v0 limitations (grow as the suite grows):
 * - No `inputs` support yet: formulas must be self-contained (no cell refs).
 * - Excel -> ODF translation is naive: it swaps "," for ";" outside strings.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const SOFFICE_CANDIDATES = [
  'soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
];

function findSoffice(): string {
  for (const candidate of SOFFICE_CANDIDATES) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  console.error(
    'LibreOffice not found. Install it first (macOS: brew install --cask libreoffice).',
  );
  process.exit(1);
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Naive Excel -> ODF formula translation: "," becomes ";" outside strings. */
function toOdfFormula(formula: string): string {
  let result = '';
  let inString = false;
  for (const char of formula) {
    if (char === '"') inString = !inString;
    result += !inString && char === ',' ? ';' : char;
  }
  return `of:${result}`;
}

function buildFods(formulas: string[]): string {
  const rows = formulas
    .map(
      (formula) =>
        `<table:table-row><table:table-cell table:formula="${xmlEscape(toOdfFormula(formula))}"/></table:table-row>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
<office:body><office:spreadsheet><table:table table:name="Sheet1">
${rows}
</table:table></office:spreadsheet></office:body></office:document>`;
}

/** Parses one-column LibreOffice CSV output into raw cell strings. */
function parseCsvColumn(csv: string): string[] {
  return csv
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) =>
      line.startsWith('"') && line.endsWith('"')
        ? line.slice(1, -1).replace(/""/g, '"')
        : line,
    );
}

function toFixtureValue(raw: string): number | string | boolean {
  if (raw === 'TRUE') return true;
  if (raw === 'FALSE') return false;
  const asNumber = Number(raw);
  return raw !== '' && Number.isFinite(asNumber) ? asNumber : raw;
}

function main(): void {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/generate-fixtures.ts <formulas.json> <output.fixtures.json>');
    process.exit(1);
  }

  const formulas = JSON.parse(readFileSync(inputPath, 'utf8')) as string[];
  const soffice = findSoffice();
  const workDir = mkdtempSync(join(tmpdir(), 'gridcalc-fixtures-'));

  try {
    const fodsPath = join(workDir, 'fixtures.fods');
    writeFileSync(fodsPath, buildFods(formulas));
    execFileSync(soffice, ['--headless', '--convert-to', 'csv', '--outdir', workDir, fodsPath], {
      stdio: 'ignore',
    });

    const csv = readFileSync(join(workDir, 'fixtures.csv'), 'utf8');
    const values = parseCsvColumn(csv);
    if (values.length !== formulas.length) {
      throw new Error(`Expected ${formulas.length} results, got ${values.length}`);
    }

    const fixtures = formulas.map((formula, i) => ({
      formula,
      expected: toFixtureValue(values[i]!),
    }));
    writeFileSync(outputPath, JSON.stringify(fixtures, null, 2) + '\n');
    console.log(`Wrote ${fixtures.length} fixtures to ${basename(outputPath)}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
