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
      // Coverage ratchet (PG-3): floors sit just below the measured baseline
      // (2026-07-08, dogfood/v2.5: stmts 76.89 / branch 83.55 / funcs 68.40 /
      // lines 76.89) so `vitest run --coverage` — the CI coverage step — goes
      // red on a real regression without demanding a backfill today. RATCHET
      // RULE: when coverage climbs, raise these floors to just below the new
      // number; never lower them to admit a regression. Guarded by a meta-test
      // in scripts/gates.test.ts so the ratchet cannot be silently deleted.
      thresholds: {
        statements: 75,
        branches: 82,
        functions: 66.5,
        lines: 75,
      },
    },
  },
});
