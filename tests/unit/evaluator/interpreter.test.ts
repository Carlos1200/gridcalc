import { describe, expect, it } from 'vitest';
import {
  CellError,
  CellErrorType,
  DEFAULT_CONFIG,
  EmptyValue,
  evaluateAst,
  FunctionRegistry,
  parseFormula,
  type Ast,
  type EvaluationContext,
  type RawInterpreterValue,
  type RawScalarValue,
} from '../../../src/index';

/** Stub context backed by a plain map of A1 keys to scalar values. */
function makeContext(
  cells: Record<string, RawScalarValue> = {},
  functions = new FunctionRegistry(),
): EvaluationContext {
  const byKey = new Map<string, RawScalarValue>();
  for (const [key, value] of Object.entries(cells)) {
    byKey.set(key.toUpperCase(), value);
  }
  const valueAt = (col: number, row: number): RawScalarValue => {
    let letters = '';
    let n = col + 1;
    while (n > 0) {
      letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return byKey.get(`${letters}${row + 1}`) ?? EmptyValue;
  };
  return {
    formulaAddress: { sheet: 0, col: 25, row: 99 },
    config: DEFAULT_CONFIG,
    functions,
    getNamedExpressionValue: () => undefined,
    getCellFormula: () => undefined,
    sheetPosition: (sheetId) => (sheetId === 0 ? 1 : undefined),
    sheetPositionByName: (name) => (name.toLowerCase() === 'sheet1' ? 1 : undefined),
    sheetIdByName: (name) => (name.toLowerCase() === 'sheet1' ? 0 : undefined),
    countSheets: () => 1,
    getCellValue: (addr) => valueAt(addr.col, addr.row),
    getRangeValues: (range) => {
      const rows: RawScalarValue[][] = [];
      for (let row = range.start.row; row <= range.end.row; row++) {
        const cells: RawScalarValue[] = [];
        for (let col = range.start.col; col <= range.end.col; col++) {
          cells.push(valueAt(col, row));
        }
        rows.push(cells);
      }
      return rows;
    },
  };
}

function evaluate(
  formula: string,
  cells: Record<string, RawScalarValue> = {},
  functions?: FunctionRegistry,
): RawInterpreterValue {
  return evaluateAst(parseFormula(formula), makeContext(cells, functions));
}

/** Errors compared by display string, like in the golden harness. */
function display(value: RawInterpreterValue): unknown {
  return value instanceof CellError ? value.toString() : value;
}

describe('literals', () => {
  it('evaluates scalar literals', () => {
    expect(evaluate('=42')).toBe(42);
    expect(evaluate('="hi"')).toBe('hi');
    expect(evaluate('=TRUE')).toBe(true);
  });

  it('evaluates error literals and parse errors', () => {
    expect(display(evaluate('=#N/A'))).toBe('#N/A');
    expect(display(evaluate('=1+'))).toBe('#ERROR!');
  });
});

describe('arithmetic operators', () => {
  it('applies Excel precedence', () => {
    expect(evaluate('=1+2*3')).toBe(7);
    expect(evaluate('=-2^2')).toBe(4); // unary minus binds tighter than ^
    expect(evaluate('=2^10')).toBe(1024);
    expect(evaluate('=10/4')).toBe(2.5);
  });

  it('coerces operands like Excel', () => {
    expect(evaluate('="5"+1')).toBe(6);
    expect(evaluate('=TRUE+1')).toBe(2);
    expect(evaluate('=50%+1')).toBe(1.5);
    expect(display(evaluate('="abc"+1'))).toBe('#VALUE!');
  });

  it('snaps +/- results to precisionRounding digits, like Excel', () => {
    expect(evaluate('=0.1+0.2')).toBe(0.3); // exactly, not 0.30000000000000004
    expect(evaluate('=0.1+0.2=0.3')).toBe(true);
    expect(evaluate('=(0.1+0.2)-0.3')).toBe(0);
    // Multiplication is NOT snapped (Excel only fixes up additive noise).
    expect(evaluate('=0.1*3=0.3')).toBe(false);
  });

  it('returns #DIV/0! and #NUM! on the right edge cases', () => {
    expect(display(evaluate('=1/0'))).toBe('#DIV/0!');
    expect(display(evaluate('=0^0'))).toBe('#NUM!');
    expect(display(evaluate('=(-8)^0.5'))).toBe('#NUM!'); // NaN
    expect(display(evaluate('=1E308*10'))).toBe('#NUM!'); // overflow
  });
});

describe('unary operators', () => {
  it('negates with coercion', () => {
    expect(evaluate('=-"5"')).toBe(-5);
    expect(display(evaluate('=-"abc"'))).toBe('#VALUE!');
  });

  it('unary plus is a no-op, even on text', () => {
    expect(evaluate('=+"abc"')).toBe('abc');
    expect(evaluate('=+TRUE')).toBe(true);
  });

  it('percent divides by 100 with coercion', () => {
    expect(evaluate('=50%')).toBe(0.5);
    expect(evaluate('=TRUE%')).toBe(0.01);
  });
});

describe('concatenation', () => {
  it('coerces both operands to text', () => {
    expect(evaluate('="a"&"b"')).toBe('ab');
    expect(evaluate('=1&2')).toBe('12');
    expect(evaluate('=TRUE&""')).toBe('TRUE');
  });
});

describe('comparison operators', () => {
  it('compares same-type values', () => {
    expect(evaluate('=1<2')).toBe(true);
    expect(evaluate('=2>=2')).toBe(true);
    expect(evaluate('=1<>2')).toBe(true);
    expect(evaluate('=FALSE<TRUE')).toBe(true);
  });

  it('compares text case-insensitively', () => {
    expect(evaluate('="A"="a"')).toBe(true);
    expect(evaluate('="apple"<"BANANA"')).toBe(true);
  });

  it('never coerces across types: number < text < logical', () => {
    expect(evaluate('="1"=1')).toBe(false);
    expect(evaluate('=1<"a"')).toBe(true);
    expect(evaluate('="zzz"<TRUE')).toBe(true);
  });
});

describe('references and empty cells', () => {
  it('reads cell values through the context', () => {
    expect(evaluate('=B2*2', { B2: 21 })).toBe(42);
  });

  it('treats empty cells as 0 / "" / FALSE depending on context', () => {
    expect(evaluate('=A1+1')).toBe(1);
    expect(evaluate('=A1&"x"')).toBe('x');
    expect(evaluate('=A1=0')).toBe(true);
    expect(evaluate('=A1=""')).toBe(true);
    expect(evaluate('=A1=FALSE')).toBe(true);
  });

  it('propagates errors stored in cells, left operand first', () => {
    const ref = new CellError(CellErrorType.REF);
    expect(display(evaluate('=A1+1', { A1: ref }))).toBe('#REF!');
    expect(display(evaluate('=1/0+A1', { A1: ref }))).toBe('#DIV/0!');
  });

  it('broadcasts a range in scalar context elementwise (phase 3)', () => {
    // Phase 1 rejected this with #VALUE!; dynamic arrays lift it instead.
    expect(evaluate('=A1:A2+1', { A1: 1, A2: 2 })).toEqual([[2], [3]]);
  });
});

describe('function calls', () => {
  it('returns #NAME? for unknown functions and names', () => {
    expect(display(evaluate('=FOO()'))).toBe('#NAME?');
    expect(display(evaluate('=IVA*2'))).toBe('#NAME?');
  });

  it('invokes eager functions with evaluated args', () => {
    const registry = new FunctionRegistry();
    registry.register({
      metadata: { name: 'ADD2', minArgs: 2, maxArgs: 2 },
      fn: (args: RawInterpreterValue[]) => (args[0] as number) + (args[1] as number),
    });
    expect(evaluate('=ADD2(B1,2)', { B1: 40 }, registry)).toBe(42);
  });

  it('checks arity against metadata', () => {
    const registry = new FunctionRegistry();
    registry.register({
      metadata: { name: 'ADD2', minArgs: 2, maxArgs: 2 },
      fn: () => 0,
    });
    expect(display(evaluate('=ADD2(1)', {}, registry))).toBe('#N/A');
    expect(display(evaluate('=ADD2(1,2,3)', {}, registry))).toBe('#N/A');
  });

  it('passes ranges to eager functions as 2D arrays', () => {
    const registry = new FunctionRegistry();
    registry.register({
      metadata: { name: 'ROWCOUNT', minArgs: 1, maxArgs: 1, argHandling: 'range-aware' },
      fn: (args: RawInterpreterValue[]) => (Array.isArray(args[0]) ? args[0].length : -1),
    });
    expect(evaluate('=ROWCOUNT(A1:A3)', {}, registry)).toBe(3);
  });

  it('lazy functions control what gets evaluated (short-circuit)', () => {
    const registry = new FunctionRegistry();
    registry.register({
      metadata: { name: 'PICKFIRST', minArgs: 2, maxArgs: 2, argHandling: 'lazy' },
      fn: (args: Ast[], context: EvaluationContext) => evaluateAst(args[0]!, context),
    });
    // The second argument would be #DIV/0! if evaluated eagerly.
    expect(evaluate('=PICKFIRST(7,1/0)', {}, registry)).toBe(7);
  });

  it('omitted arguments and empty cells reach the function as EmptyValue', () => {
    const registry = new FunctionRegistry();
    registry.register({
      metadata: { name: 'SECONDISEMPTY', minArgs: 2, maxArgs: 2 },
      fn: (args: RawInterpreterValue[]) => args[1] === EmptyValue,
    });
    expect(evaluate('=SECONDISEMPTY(1,)', {}, registry)).toBe(true); // omitted arg
    expect(evaluate('=SECONDISEMPTY(1,A1)', {}, registry)).toBe(true); // empty cell
    expect(evaluate('=SECONDISEMPTY(1,2)', {}, registry)).toBe(false);
  });
});
