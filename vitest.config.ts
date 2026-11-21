import { defineConfig, coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'templates/*/src/**/*.test.ts',
      // Gate meta-tests: prove the repo's quality gates (docs-integrity,
      // packaging/LICENSE, coverage ratchet) actually fire when their
      // protected invariant is mutated. See scripts/gates.test.ts.
      'scripts/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      // Measure product code only. The site (including its minified Astro
      // build output), docs scripts, and repo gate scripts are not product
      // surface — counting them at 0% dilutes the number the ratchet guards.
      // Gate scripts are exercised as black boxes by scripts/gates.test.ts
      // (child processes — invisible to v8 coverage by design).
      exclude: [
        ...coverageConfigDefaults.exclude,
        'site/**',
        'docs/**',
        'scripts/**',
      ],
      // Coverage ratchet (PG-3): floors sit at the 90% org bar / just below the
      // measured baseline (2026-11-21, CI run 44891915264: stmts 90.23 /
      // branch 84.84 / funcs 90.13 / lines 90.23) so `vitest run --coverage` —
      // the CI coverage step — goes red on a regression. RATCHET RULE: when
      // coverage climbs, raise these floors to just below the new number; never
      // lower them to admit a regression. Guarded by a meta-test in
      // scripts/gates.test.ts so the ratchet cannot be silently deleted.
      thresholds: {
        statements: 90,
        branches: 84,
        functions: 90,
        lines: 90,
      },
    },
  },
});
