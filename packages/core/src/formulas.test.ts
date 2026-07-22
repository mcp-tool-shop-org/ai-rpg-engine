// FormulaRegistry — named formula registration, lookup, and declaration
// validation.
//
// No dedicated test file existed for this class before F-09338c0a: its
// methods (register/get/has/validateAgainstDeclarations) were exercised only
// incidentally through other packages' module tests, so the overwrite-on-
// duplicate-id behavior fixed here was completely unverified either way. This
// file pins the duplicate-id guard plus the pre-existing get/has/
// validateAgainstDeclarations behavior.

import { describe, it, expect } from 'vitest';
import { FormulaRegistry } from './formulas.js';

describe('FormulaRegistry', () => {
  describe('register / get / has / getRegistered', () => {
    it('registers a formula and retrieves the exact function by id', () => {
      const registry = new FormulaRegistry();
      const fn = (a: unknown, b: unknown) => (a as number) + (b as number);
      registry.register('add', fn);
      expect(registry.has('add')).toBe(true);
      expect(registry.get('add')).toBe(fn);
    });

    it('has() is false for an id that was never registered', () => {
      const registry = new FormulaRegistry();
      expect(registry.has('missing')).toBe(false);
    });

    it('get() throws a descriptive error for an unregistered id', () => {
      const registry = new FormulaRegistry();
      expect(() => registry.get('missing')).toThrow('Formula "missing" is not registered');
    });

    it('getRegistered() lists every registered id', () => {
      const registry = new FormulaRegistry();
      registry.register('a', () => 1);
      registry.register('b', () => 2);
      expect(registry.getRegistered().sort()).toEqual(['a', 'b']);
    });

    // F-09338c0a (red-proof): a duplicate id must fail loud, matching
    // ModuleManager.register's established duplicate-id convention — not
    // silently overwrite the first registration with no error or warning.
    it('register() throws on a duplicate id instead of silently overwriting', () => {
      const registry = new FormulaRegistry();
      const first = () => 'first';
      const second = () => 'second';
      registry.register('dupe', first);

      expect(() => registry.register('dupe', second)).toThrow(
        'Formula id "dupe" is already registered.',
      );

      // The original registration must survive the failed re-registration.
      // Without the fix, this assertion fails: the old code's
      // `this.formulas.set(id, fn)` unconditionally replaced `first` with
      // `second` and returned void instead of throwing.
      expect(registry.get('dupe')).toBe(first);
    });

    it('register() still accepts a fresh id after a duplicate attempt was rejected elsewhere', () => {
      const registry = new FormulaRegistry();
      registry.register('a', () => 1);
      expect(() => registry.register('a', () => 2)).toThrow();
      registry.register('b', () => 3);
      expect(registry.has('b')).toBe(true);
    });

    // F-09338c0a companion path: the duplicate-id guard catches ACCIDENTAL
    // collisions, but intentional replacement (test doubles, pack overrides)
    // is a supported capability — otherwise the guard would break the
    // override pattern the CLI's own buildExtraActions failure-injection test
    // relies on. `{ override: true }` is the explicit, self-documenting way in.
    it('register() with { override: true } intentionally replaces an existing formula', () => {
      const registry = new FormulaRegistry();
      const first = () => 'first';
      const second = () => 'second';
      registry.register('dupe', first);

      expect(() => registry.register('dupe', second, { override: true })).not.toThrow();
      expect(registry.get('dupe')).toBe(second);
    });
  });

  describe('validateAgainstDeclarations', () => {
    it('reports no missing/extra when registrations exactly match declarations', () => {
      const registry = new FormulaRegistry();
      registry.register('a', () => 1);
      registry.register('b', () => 2);
      const result = registry.validateAgainstDeclarations(['a', 'b']);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
    });

    it('reports declared ids with no implementation as missing', () => {
      const registry = new FormulaRegistry();
      registry.register('a', () => 1);
      const result = registry.validateAgainstDeclarations(['a', 'b']);
      expect(result.missing).toEqual(['b']);
      expect(result.extra).toEqual([]);
    });

    it('reports registered ids outside the declared list as extra', () => {
      const registry = new FormulaRegistry();
      registry.register('a', () => 1);
      registry.register('c', () => 3);
      const result = registry.validateAgainstDeclarations(['a']);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual(['c']);
    });

    it('handles an empty registry against declared ids (all missing)', () => {
      const registry = new FormulaRegistry();
      const result = registry.validateAgainstDeclarations(['a', 'b']);
      expect(result.missing).toEqual(['a', 'b']);
      expect(result.extra).toEqual([]);
    });
  });
});
