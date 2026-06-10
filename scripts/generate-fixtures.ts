/**
 * Golden-fixture generator.
 *
 * Runs a list of formulas through LibreOffice headless and writes the results
 * as a golden fixture file the test harness consumes.
 *
 * Usage:
 *   node scripts/generate-fixtures.ts <formulas.json> <output.fixtures.json>
 *
 * <formulas.json> is a JSON array whose entries are either a formula string
 * (self-contained) or an object with input cells:
 *   "=SUM(1,2)"
 *   { "formula": "=SUM(A1:A3)", "inputs": { "A1": 1, "A2": 2, "A3": 3 } }
 *
 * Each fixture becomes its own one-sheet .fods document (inputs at their
 * cells, the formula two rows below the last input in column A); a single
 * LibreOffice invocation converts them all to CSV.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseCellReference, tokenize, TokenType, type Token } from '../src/index';

type InputScalar = number | string | boolean;

interface FixtureSpec {
  formula: string;
  inputs?: Record<string, InputScalar>;
  /**
   * Manual override for the rare cases where LibreOffice's result differs
   * from Excel's (e.g. LibreOffice says Err:502 where Excel says #NUM!).
   * Justify each use with a comment in the formulas list's pull request.
   */
  expected?: InputScalar;
}

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

/** Functions missing from OpenFormula 1.2; LibreOffice knows them namespaced. */
const ODF_FUNCTION_NAMES: Record<string, string> = {
  IFS: 'COM.MICROSOFT.IFS',
  CONCAT: 'COM.MICROSOFT.CONCAT',
};

/**
 * Excel -> ODF formula translation using the project lexer: cell references
 * get ODF brackets (A1 -> [.A1], A1:B2 -> [.A1:.B2]) and "," becomes ";".
 */
function toOdfFormula(formula: string): string {
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  const tokens: Token[] = tokenize(body);
  let result = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === TokenType.END) {
      break;
    }
    if (
      token.type === TokenType.CELL_REF &&
      tokens[i + 1]?.type === TokenType.RANGE_OP &&
      tokens[i + 2]?.type === TokenType.CELL_REF
    ) {
      result += `[.${token.text}:.${tokens[i + 2]!.text}]`;
      i += 2;
    } else if (token.type === TokenType.CELL_REF) {
      result += `[.${token.text}]`;
    } else if (token.type === TokenType.ARG_SEP) {
      result += ';';
    } else if (token.type === TokenType.BOOLEAN) {
      // ODF spells boolean literals as functions.
      result += `${token.text.toUpperCase()}()`;
    } else if (token.type === TokenType.FUNCTION_NAME) {
      result += ODF_FUNCTION_NAMES[token.text.toUpperCase()] ?? token.text;
    } else {
      result += token.text;
    }
  }
  return `of:=${result}`;
}

/** Highest 0-based row the formula references (-1 if none). */
function maxReferencedRow(formula: string): number {
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  let max = -1;
  for (const token of tokenize(body)) {
    if (token.type === TokenType.CELL_REF) {
      const parsed = parseCellReference(token.text);
      if (parsed) {
        max = Math.max(max, parsed.row);
      }
    }
  }
  return max;
}

function inputCellXml(value: InputScalar): string {
  switch (typeof value) {
    case 'number':
      return `<table:table-cell office:value-type="float" office:value="${value}"/>`;
    case 'boolean':
      return `<table:table-cell office:value-type="boolean" office:boolean-value="${value}"/>`;
    case 'string':
      return `<table:table-cell office:value-type="string"><text:p>${xmlEscape(value)}</text:p></table:table-cell>`;
  }
}

/** Builds a one-sheet flat ODS; returns the XML and the formula's 1-based row. */
function buildFods(spec: FixtureSpec): { xml: string; formulaRow: number } {
  const grid = new Map<number, Map<number, string>>(); // row -> col -> cell xml
  let maxRow = 0;
  let maxCol = 0;
  for (const [ref, value] of Object.entries(spec.inputs ?? {})) {
    const parsed = parseCellReference(ref);
    if (!parsed) {
      throw new Error(`Invalid input cell reference "${ref}" for ${spec.formula}`);
    }
    if (!grid.has(parsed.row)) {
      grid.set(parsed.row, new Map());
    }
    grid.get(parsed.row)!.set(parsed.col, inputCellXml(value));
    maxRow = Math.max(maxRow, parsed.row);
    maxCol = Math.max(maxCol, parsed.col);
  }

  // Below every input AND every referenced cell (a formula inside its own
  // range would be a circular reference), with one blank row in between.
  const formulaRow = Math.max(maxRow, maxReferencedRow(spec.formula)) + 2;
  grid.set(
    formulaRow,
    new Map([[0, `<table:table-cell table:formula="${xmlEscape(toOdfFormula(spec.formula))}"/>`]]),
  );

  const rows: string[] = [];
  for (let row = 0; row <= formulaRow; row++) {
    const cells: string[] = [];
    const rowCells = grid.get(row);
    for (let col = 0; col <= Math.max(maxCol, 0); col++) {
      cells.push(rowCells?.get(col) ?? '<table:table-cell/>');
    }
    rows.push(`<table:table-row>${cells.join('')}</table:table-row>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"
  office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
<office:body><office:spreadsheet><table:table table:name="Sheet1">
${rows.join('\n')}
</table:table></office:spreadsheet></office:body></office:document>`;
  return { xml, formulaRow: formulaRow + 1 };
}

/** First CSV field of a line, unescaping quotes. */
function firstCsvField(line: string): string {
  if (!line.startsWith('"')) {
    const comma = line.indexOf(',');
    return comma === -1 ? line : line.slice(0, comma);
  }
  let field = '';
  for (let i = 1; i < line.length; i++) {
    if (line[i] === '"') {
      if (line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        break;
      }
    } else {
      field += line[i];
    }
  }
  return field;
}

function toFixtureValue(raw: string): InputScalar {
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

  const entries = JSON.parse(readFileSync(inputPath, 'utf8')) as (string | FixtureSpec)[];
  const specs: FixtureSpec[] = entries.map((entry) =>
    typeof entry === 'string' ? { formula: entry } : entry,
  );

  const soffice = findSoffice();
  const workDir = mkdtempSync(join(tmpdir(), 'gridcalc-fixtures-'));

  try {
    const formulaRows: number[] = [];
    const fodsPaths: string[] = [];
    specs.forEach((spec, i) => {
      const { xml, formulaRow } = buildFods(spec);
      const path = join(workDir, `f${i}.fods`);
      writeFileSync(path, xml);
      fodsPaths.push(path);
      formulaRows.push(formulaRow);
    });

    // One LibreOffice startup converts every document.
    execFileSync(soffice, ['--headless', '--convert-to', 'csv', '--outdir', workDir, ...fodsPaths], {
      stdio: 'ignore',
    });

    const fixtures = specs.map((spec, i) => {
      const csv = readFileSync(join(workDir, `f${i}.csv`), 'utf8');
      const lines = csv.replace(/\r\n/g, '\n').split('\n');
      const line = lines[formulaRows[i]! - 1];
      if (line === undefined) {
        throw new Error(`No CSV output for ${spec.formula}`);
      }
      const computed = toFixtureValue(firstCsvField(line));
      const expected = spec.expected ?? computed;
      if (typeof expected === 'string' && expected.startsWith('Err:')) {
        console.warn(`WARNING: LibreOffice could not compute ${spec.formula} -> ${expected}`);
      }
      return spec.inputs
        ? { formula: spec.formula, inputs: spec.inputs, expected }
        : { formula: spec.formula, expected };
    });

    writeFileSync(outputPath, JSON.stringify(fixtures, null, 2) + '\n');
    console.log(`Wrote ${fixtures.length} fixtures to ${basename(outputPath)}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
