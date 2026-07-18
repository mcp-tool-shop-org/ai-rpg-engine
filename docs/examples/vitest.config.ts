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
 * This split from the root vitest.config.ts is deliberate and permanent, not
 * a pending follow-up (dogfood-swarm F-8c70b4e4 corrected an earlier version
 * of this comment that framed it as a "one-line change" — it isn't):
 *
 *   - These examples import @ai-rpg-engine/* by package name, resolved
 *     through the npm workspace to each package's built dist/ output. They
 *     only pass after `npm run build`. The root `npm test` / `npm run
 *     test:watch` commands carry no such guarantee — contributors run those
 *     routinely while iterating on package src without rebuilding first, and
 *     folding this include in would make that default loop fail with
 *     confusing dist-resolution errors unrelated to whatever they changed.
 *   - It is already enforced in CI, post-build, as its own explicit step —
 *     see ci.yml's "Typecheck doc examples" (this config's tsconfig.json)
 *     and "Behavior-test doc examples" (this file) steps, node 22 leg only.
 *     Adding the include to the root config on top of those two steps would
 *     run these tests twice per CI run, not once.
 *
 * If you want these folded into the default run anyway, that's a real
 * change to ci.yml's step structure (drop the two dedicated steps, prove the
 * root `vitest run --coverage` step still runs post-build on every leg that
 * needs it) — not a one-line include edit.
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
