import { defineConfig } from 'vitest/config';

/**
 * Dedicated vitest config for the handbook composition examples.
 *
 * The root vitest config only scans `packages/*` and `templates/*`, so the
 * files under docs/examples — which the handbook and README advertise as
 * "runnable examples" — were never compiled or executed and silently rotted.
 *
 * Run from the repo root with:
 *   npx vitest run --config docs/examples/vitest.config.ts
 *
 * To fold these into the default `npm test` run, add
 * `'docs/examples/**\/*.test.ts'` to the `include` array in the root
 * vitest.config.ts (one-line change, noted as a cross-file follow-up).
 */
export default defineConfig({
  // Anchor the project root at the repo root (this command is run from there)
  // so the include glob below resolves the same way it would in the root config.
  root: process.cwd(),
  test: {
    include: ['docs/examples/**/*.test.ts'],
    environment: 'node',
  },
});
