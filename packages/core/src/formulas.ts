// Formula registry — named formulas that modules can register and other modules can query

import type { EntityState, WorldState } from './types.js';

export type FormulaFn = (...args: unknown[]) => unknown;

export class FormulaRegistry {
  private formulas: Map<string, FormulaFn> = new Map();

  /** Register a named formula implementation */
  register(id: string, fn: FormulaFn): void {
    this.formulas.set(id, fn);
  }

  /** Get a formula by id. Throws if not registered. */
  get(id: string): FormulaFn {
    const fn = this.formulas.get(id);
    if (!fn) throw new Error(`Formula "${id}" is not registered`);
    return fn;
  }

  /** Check if a formula is registered */
  has(id: string): boolean {
    return this.formulas.has(id);
  }

  /** Get all registered formula IDs */
  getRegistered(): string[] {
    return [...this.formulas.keys()];
  }

  /** Validate that all declared formulas have implementations */
  validateAgainstDeclarations(declaredIds: string[]): { missing: string[]; extra: string[] } {
    const declaredSet = new Set(declaredIds);
    const registeredSet = new Set(this.formulas.keys());

    const missing = declaredIds.filter((id) => !registeredSet.has(id));
    const extra = [...registeredSet].filter((id) => !declaredSet.has(id));

    return { missing, extra };
  }
}
