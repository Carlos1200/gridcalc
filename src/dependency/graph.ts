/**
 * Dependency graph between cells. An edge A -> B means "A depends on B"
 * (A's formula reads B's value).
 *
 * Phase 1: ranges are expanded into per-cell edges at registration time.
 * That is O(range size) per formula, which is fine for hand-written ranges;
 * dedicated range nodes (HyperFormula-style) are an optimization for later.
 */

import { cellAddressFromKey, cellAddressKey } from '../reference/addressing';
import type { SimpleCellAddress } from '../reference/types';
import type { FormulaDependencies } from './extract';

/** Result of planning a recalculation after some cells changed. */
export interface RecalculationPlan {
  /**
   * Dirty cells in evaluation order (precedents before dependents).
   * Includes the changed cells themselves; the engine skips entries that do
   * not hold a formula. Cells listed in `cyclic` are excluded.
   */
  order: SimpleCellAddress[];
  /**
   * Cells that are part of a reference cycle. The engine assigns them
   * #CIRCULAR! directly; their dependents (listed in `order`) then see that
   * error as a regular value and propagate it.
   */
  cyclic: SimpleCellAddress[];
}

const addressOf = cellAddressFromKey;

export class DependencyGraph {
  /** formula cell -> cells it reads. */
  private readonly precedents = new Map<string, Set<string>>();
  /** cell -> formula cells that read it. */
  private readonly dependents = new Map<string, Set<string>>();
  /** Formula cells that call a volatile function. */
  private readonly volatileCells = new Set<string>();

  /**
   * Registers (or replaces) the dependencies of the formula at `address`.
   * Ranges are expanded to individual cells.
   */
  setFormula(address: SimpleCellAddress, dependencies: FormulaDependencies): void {
    const key = cellAddressKey(address);
    this.clearEdges(key);

    const edges = new Set<string>();
    for (const cell of dependencies.cells) {
      edges.add(cellAddressKey(cell));
    }
    for (const range of dependencies.ranges) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        for (let row = range.start.row; row <= range.end.row; row++) {
          edges.add(cellAddressKey({ sheet: range.start.sheet, col, row }));
        }
      }
    }

    this.precedents.set(key, edges);
    for (const precedent of edges) {
      let set = this.dependents.get(precedent);
      if (!set) {
        set = new Set();
        this.dependents.set(precedent, set);
      }
      set.add(key);
    }

    if (dependencies.volatile) {
      this.volatileCells.add(key);
    } else {
      this.volatileCells.delete(key);
    }
  }

  /** Unregisters the formula at `address` (cell deleted or set to a plain value). */
  removeFormula(address: SimpleCellAddress): void {
    const key = cellAddressKey(address);
    this.clearEdges(key);
    this.precedents.delete(key);
    this.volatileCells.delete(key);
  }

  /** Cells the formula at `address` reads (ranges already expanded). */
  getPrecedents(address: SimpleCellAddress): SimpleCellAddress[] {
    const set = this.precedents.get(cellAddressKey(address));
    return set ? [...set].map(addressOf) : [];
  }

  /** Formula cells that read `address`. */
  getDependents(address: SimpleCellAddress): SimpleCellAddress[] {
    const set = this.dependents.get(cellAddressKey(address));
    return set ? [...set].map(addressOf) : [];
  }

  /**
   * Cells of `sheet` that at least one formula reads. Used as recalculation
   * seeds when the sheet is removed (its readers must turn into #REF!).
   */
  precedentsInSheet(sheet: number): SimpleCellAddress[] {
    const result: SimpleCellAddress[] = [];
    for (const key of this.dependents.keys()) {
      const address = addressOf(key);
      if (address.sheet === sheet) {
        result.push(address);
      }
    }
    return result;
  }

  /**
   * Computes which cells must be recalculated after `changed` cells were
   * edited, and in what order. Volatile formulas are always included.
   */
  getRecalculationPlan(changed: SimpleCellAddress[]): RecalculationPlan {
    const dirty = this.collectDirty(changed);
    const sccs = this.stronglyConnectedComponents(dirty);

    const order: SimpleCellAddress[] = [];
    const cyclic: SimpleCellAddress[] = [];
    for (const scc of sccs) {
      const single = scc.length === 1 ? scc[0]! : undefined;
      const selfLoop = single !== undefined && (this.precedents.get(single)?.has(single) ?? false);
      if (single !== undefined && !selfLoop) {
        order.push(addressOf(single));
      } else {
        for (const member of scc) {
          cyclic.push(addressOf(member));
        }
      }
    }
    return { order, cyclic };
  }

  private clearEdges(key: string): void {
    const previous = this.precedents.get(key);
    if (!previous) {
      return;
    }
    for (const precedent of previous) {
      const set = this.dependents.get(precedent);
      if (set) {
        set.delete(key);
        if (set.size === 0) {
          this.dependents.delete(precedent);
        }
      }
    }
    previous.clear();
  }

  /** Changed cells + volatile formulas + transitive dependents of both. */
  private collectDirty(changed: SimpleCellAddress[]): Set<string> {
    const dirty = new Set<string>();
    const queue: string[] = [];
    const seed = (key: string): void => {
      if (!dirty.has(key)) {
        dirty.add(key);
        queue.push(key);
      }
    };

    for (const addr of changed) {
      seed(cellAddressKey(addr));
    }
    for (const key of this.volatileCells) {
      seed(key);
    }
    for (let i = 0; i < queue.length; i++) {
      const dependents = this.dependents.get(queue[i]!);
      if (dependents) {
        for (const dependent of dependents) {
          seed(dependent);
        }
      }
    }
    return dirty;
  }

  /**
   * Iterative Tarjan over the dirty subgraph, following precedent edges
   * restricted to dirty cells. With edges meaning "depends on", Tarjan emits
   * SCCs in reverse topological order of the condensation — i.e. precedents
   * before dependents, exactly the evaluation order we need. Iterative to
   * survive dependency chains thousands of cells long.
   */
  private stronglyConnectedComponents(nodes: Set<string>): string[][] {
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let counter = 0;

    for (const root of nodes) {
      if (index.has(root)) {
        continue;
      }
      // Each frame is [node, children, next child to visit].
      const work: [string, string[], number][] = [[root, this.dirtyChildren(root, nodes), 0]];
      while (work.length > 0) {
        const frame = work[work.length - 1]!;
        const [node, children] = frame;
        if (frame[2] === 0) {
          index.set(node, counter);
          lowlink.set(node, counter);
          counter++;
          stack.push(node);
          onStack.add(node);
        }
        if (frame[2] < children.length) {
          const child = children[frame[2]]!;
          frame[2]++;
          if (!index.has(child)) {
            work.push([child, this.dirtyChildren(child, nodes), 0]);
          } else if (onStack.has(child)) {
            lowlink.set(node, Math.min(lowlink.get(node)!, index.get(child)!));
          }
        } else {
          work.pop();
          const parent = work[work.length - 1];
          if (parent) {
            lowlink.set(parent[0], Math.min(lowlink.get(parent[0])!, lowlink.get(node)!));
          }
          if (lowlink.get(node) === index.get(node)) {
            const scc: string[] = [];
            let member: string;
            do {
              member = stack.pop()!;
              onStack.delete(member);
              scc.push(member);
            } while (member !== node);
            sccs.push(scc);
          }
        }
      }
    }
    return sccs;
  }

  private dirtyChildren(node: string, dirty: Set<string>): string[] {
    const precedents = this.precedents.get(node);
    if (!precedents) {
      return [];
    }
    const children: string[] = [];
    for (const precedent of precedents) {
      if (dirty.has(precedent)) {
        children.push(precedent);
      }
    }
    return children;
  }
}
