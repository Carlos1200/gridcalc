import { describe, expect, it } from 'vitest';
import {
  DependencyGraph,
  extractDependencies,
  parseFormula,
  type SimpleCellAddress,
} from '../../../src/index';

/** Shorthand: addr('B2') -> { sheet: 0, col: 1, row: 1 }. */
function addr(text: string, sheet = 0): SimpleCellAddress {
  const match = /^([A-Z]+)(\d+)$/.exec(text)!;
  let col = 0;
  for (const char of match[1]!) {
    col = col * 26 + (char.charCodeAt(0) - 64);
  }
  return { sheet, col: col - 1, row: Number(match[2]!) - 1 };
}

function setFormula(graph: DependencyGraph, at: string, formula: string): void {
  graph.setFormula(addr(at), extractDependencies(parseFormula(formula), addr(at)));
}

function keys(addresses: SimpleCellAddress[]): string[] {
  return addresses.map((a) => `${a.sheet}:${a.col}:${a.row}`).sort();
}

describe('DependencyGraph edges', () => {
  it('tracks precedents and dependents, expanding ranges', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'C1', '=SUM(A1:A3)+B1');

    expect(keys(graph.getPrecedents(addr('C1')))).toEqual(
      keys([addr('A1'), addr('A2'), addr('A3'), addr('B1')]),
    );
    expect(keys(graph.getDependents(addr('A2')))).toEqual(keys([addr('C1')]));
    expect(graph.getDependents(addr('Z9'))).toEqual([]);
  });

  it('replaces edges when a formula changes', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=A1');
    setFormula(graph, 'B1', '=A2');

    expect(graph.getDependents(addr('A1'))).toEqual([]);
    expect(keys(graph.getDependents(addr('A2')))).toEqual(keys([addr('B1')]));
  });

  it('removes edges when a formula is removed', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=A1');
    graph.removeFormula(addr('B1'));

    expect(graph.getDependents(addr('A1'))).toEqual([]);
    expect(graph.getPrecedents(addr('B1'))).toEqual([]);
  });
});

describe('DependencyGraph recalculation plan', () => {
  it('orders a chain precedents-first', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=A1');
    setFormula(graph, 'C1', '=B1');
    setFormula(graph, 'D1', '=C1');

    const plan = graph.getRecalculationPlan([addr('A1')]);
    expect(plan.cyclic).toEqual([]);
    expect(plan.order).toEqual([addr('A1'), addr('B1'), addr('C1'), addr('D1')]);
  });

  it('handles diamonds (each cell appears once, after its precedents)', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=A1');
    setFormula(graph, 'C1', '=A1');
    setFormula(graph, 'D1', '=B1+C1');

    const plan = graph.getRecalculationPlan([addr('A1')]);
    const order = plan.order.map((a) => keys([a])[0]!);
    expect(order).toHaveLength(4);
    expect(order.indexOf(keys([addr('D1')])[0]!)).toBe(3);
    expect(order.indexOf(keys([addr('A1')])[0]!)).toBe(0);
  });

  it('only dirties the dependents of the changed cell', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=A1');
    setFormula(graph, 'D1', '=C1'); // unrelated island

    const plan = graph.getRecalculationPlan([addr('A1')]);
    expect(keys(plan.order)).toEqual(keys([addr('A1'), addr('B1')]));
  });

  it('reaches dependents through range references', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=SUM(A1:A10)');

    const plan = graph.getRecalculationPlan([addr('A5')]);
    expect(keys(plan.order)).toEqual(keys([addr('A5'), addr('B1')]));
  });

  it('detects a direct cycle', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'A1', '=B1');
    setFormula(graph, 'B1', '=A1');

    const plan = graph.getRecalculationPlan([addr('A1')]);
    expect(keys(plan.cyclic)).toEqual(keys([addr('A1'), addr('B1')]));
    expect(plan.order).toEqual([]);
  });

  it('detects a self-reference', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'A1', '=A1+1');

    const plan = graph.getRecalculationPlan([addr('A1')]);
    expect(keys(plan.cyclic)).toEqual(keys([addr('A1')]));
  });

  it('detects a cycle through a range', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=SUM(A1:B5)'); // the range contains B1 itself

    const plan = graph.getRecalculationPlan([addr('A1')]);
    expect(keys(plan.cyclic)).toEqual(keys([addr('B1')]));
  });

  it('keeps cells downstream of a cycle in the order, after the cycle', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'A1', '=B1');
    setFormula(graph, 'B1', '=A1');
    setFormula(graph, 'C1', '=B1+1');

    const plan = graph.getRecalculationPlan([addr('B1')]);
    expect(keys(plan.cyclic)).toEqual(keys([addr('A1'), addr('B1')]));
    expect(keys(plan.order)).toEqual(keys([addr('C1')]));
  });

  it('always includes volatile formulas in the plan', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=NOW()');
    setFormula(graph, 'C1', '=B1');
    setFormula(graph, 'E1', '=D1'); // non-volatile, untouched

    const plan = graph.getRecalculationPlan([]);
    expect(keys(plan.order)).toEqual(keys([addr('B1'), addr('C1')]));
  });

  it('drops the volatile flag when the formula is replaced', () => {
    const graph = new DependencyGraph();
    setFormula(graph, 'B1', '=NOW()');
    setFormula(graph, 'B1', '=A1');

    expect(graph.getRecalculationPlan([]).order).toEqual([]);
  });

  it('survives a long dependency chain without overflowing the stack', () => {
    const graph = new DependencyGraph();
    const length = 20_000;
    for (let row = 2; row <= length; row++) {
      setFormula(graph, `A${row}`, `=A${row - 1}`);
    }

    const plan = graph.getRecalculationPlan([addr('A1')]);
    expect(plan.order).toHaveLength(length);
    expect(plan.cyclic).toEqual([]);
    expect(plan.order[0]).toEqual(addr('A1'));
    expect(plan.order[length - 1]).toEqual(addr(`A${length}`));
  });
});
