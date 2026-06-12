/** Central function registry; one instance per engine (custom functions later). */

import type { RegisteredFunction } from './types';

export class FunctionRegistry {
  private readonly entries = new Map<string, RegisteredFunction>();
  private readonly volatile = new Set<string>();

  /** Registers a function under its canonical name. Throws on duplicates. */
  register(entry: RegisteredFunction): void {
    const name = entry.metadata.name.toUpperCase();
    if (this.entries.has(name)) {
      throw new Error(`Function ${name} is already registered`);
    }
    this.entries.set(name, entry);
    if (entry.metadata.volatile) {
      this.volatile.add(name);
    }
  }

  /** Names registered with the volatile flag (dependency extraction reads this). */
  volatileNames(): ReadonlySet<string> {
    return this.volatile;
  }

  get(name: string): RegisteredFunction | undefined {
    return this.entries.get(name.toUpperCase());
  }

  has(name: string): boolean {
    return this.entries.has(name.toUpperCase());
  }

  names(): string[] {
    return [...this.entries.keys()];
  }
}
