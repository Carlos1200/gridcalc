import { describe, expect, it } from 'vitest';
import { FunctionRegistry, type RegisteredFunction } from '../../../src/index';

function dummy(name: string): RegisteredFunction {
  return { metadata: { name, minArgs: 0, maxArgs: 0 }, fn: () => 0 };
}

describe('FunctionRegistry', () => {
  it('registers and looks up case-insensitively', () => {
    const registry = new FunctionRegistry();
    registry.register(dummy('SUM'));
    expect(registry.has('sum')).toBe(true);
    expect(registry.get('Sum')?.metadata.name).toBe('SUM');
    expect(registry.names()).toEqual(['SUM']);
  });

  it('rejects duplicate registrations', () => {
    const registry = new FunctionRegistry();
    registry.register(dummy('SUM'));
    expect(() => registry.register(dummy('sum'))).toThrow(/already registered/);
  });

  it('returns undefined for unknown functions', () => {
    expect(new FunctionRegistry().get('NOPE')).toBeUndefined();
  });
});
