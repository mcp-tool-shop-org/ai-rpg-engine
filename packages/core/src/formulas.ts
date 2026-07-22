// Formula registry — named formulas that modules can register and other modules can query

export type FormulaFn = (...args: unknown[]) => unknown;

export class FormulaRegistry {
  private formulas: Map<string, FormulaFn> = new Map();

  /**
   * Register a named formula implementation.
   *
   * A duplicate id throws by default: two registrations under one id would
   * silently clobber each other (second wins, no error or warning) — a real
   * config mistake, so fail loud and actionable, mirroring
   * ModuleManager.register's duplicate-module-id guard (F-09338c0a).
   *
   * Pass `{ override: true }` for the INTENTIONAL replacement case — a test
   * injecting a double, or a pack deliberately replacing a default formula.
   * That is a chosen replacement, not the accidental collision the guard
   * exists to catch, so it is allowed: formulas stay overridable by design
   * while accidental dups still fail loud.
   */
  register(id: string, fn: FormulaFn, opts?: { override?: boolean }): void {
    if (this.formulas.has(id) && !opts?.override) {
      throw new Error(
        `Formula id "${id}" is already registered. ` +
          `Formula ids must be unique; rename one of the conflicting formulas, ` +
          `remove the duplicate registration, or pass { override: true } to replace intentionally.`,
      );
    }
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
