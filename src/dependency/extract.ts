/** Extraction of cell/range/name dependencies from a parsed formula AST. */

import type { Ast } from '../ast/nodes';
import type { CellReference, SimpleCellAddress, SimpleCellRange } from '../reference/types';

/**
 * Functions that must be recalculated on every cycle even when their inputs
 * did not change. OFFSET and INDIRECT are volatile because their precedents
 * cannot be known statically from the AST.
 */
export const VOLATILE_FUNCTIONS: ReadonlySet<string> = new Set([
  'NOW',
  'TODAY',
  'RAND',
  'RANDBETWEEN',
  'OFFSET',
  'INDIRECT',
]);

/** Everything a formula reads, resolved against the address it lives at. */
export interface FormulaDependencies {
  /** Individual cells referenced directly (deduplicated). */
  cells: SimpleCellAddress[];
  /** Rectangular ranges referenced (normalized and deduplicated). */
  ranges: SimpleCellRange[];
  /** Named expressions referenced (phase 2; deduplicated). */
  names: string[];
  /** True if the formula calls any volatile function. */
  volatile: boolean;
}

function resolveReference(ref: CellReference, formulaAddress: SimpleCellAddress): SimpleCellAddress {
  return {
    sheet: ref.sheet ?? formulaAddress.sheet,
    col: ref.col,
    row: ref.row,
  };
}

function addressKey(addr: SimpleCellAddress): string {
  return `${addr.sheet}:${addr.col}:${addr.row}`;
}

/**
 * Walks the AST of a formula living at `formulaAddress` and collects every
 * reference it contains. Relative/absolute flags do not matter here: by parse
 * time `col`/`row` are already concrete indices.
 */
export function extractDependencies(ast: Ast, formulaAddress: SimpleCellAddress): FormulaDependencies {
  const cells = new Map<string, SimpleCellAddress>();
  const ranges = new Map<string, SimpleCellRange>();
  const names = new Set<string>();
  let volatile = false;

  const visit = (node: Ast): void => {
    switch (node.type) {
      case 'CELL_REFERENCE': {
        const addr = resolveReference(node.reference, formulaAddress);
        cells.set(addressKey(addr), addr);
        break;
      }
      case 'RANGE_REFERENCE': {
        const start = resolveReference(node.start, formulaAddress);
        const end = resolveReference(node.end, formulaAddress);
        // Excel normalizes B2:A1 to A1:B2.
        const range: SimpleCellRange = {
          start: { sheet: start.sheet, col: Math.min(start.col, end.col), row: Math.min(start.row, end.row) },
          end: { sheet: start.sheet, col: Math.max(start.col, end.col), row: Math.max(start.row, end.row) },
        };
        ranges.set(`${addressKey(range.start)}-${addressKey(range.end)}`, range);
        break;
      }
      case 'NAMED_EXPRESSION':
        names.add(node.name);
        break;
      case 'FUNCTION_CALL':
        if (VOLATILE_FUNCTIONS.has(node.name)) {
          volatile = true;
        }
        for (const arg of node.args) {
          visit(arg);
        }
        break;
      case 'UNARY_OP':
        visit(node.operand);
        break;
      case 'BINARY_OP':
        visit(node.left);
        visit(node.right);
        break;
      case 'ARRAY_LITERAL':
        for (const row of node.values) {
          for (const item of row) {
            visit(item);
          }
        }
        break;
      default:
        // Literals, EMPTY_ARG and PARSE_ERROR reference nothing.
        break;
    }
  };

  visit(ast);
  return {
    cells: [...cells.values()],
    ranges: [...ranges.values()],
    names: [...names],
    volatile,
  };
}
