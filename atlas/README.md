# ai-rpg-engine: how it works

Mapped at 2026-10-01 from commit 8dceef7 by Atlas 1.24.0.

## What this is

39 parts, mostly TypeScript (797 files), JavaScript (13), CSS (2), GDScript (2) and Astro (1). Work enters through 6 doors; CI and Release each reach 35 parts, and CI is followed because a pull request goes through it. It publishes workspace packages to npm and a container image. It deploys a site to GitHub Pages. People run ai and ai-rpg-engine.

## What changed since 2026-09-30 (a54df85)

- CI's pull request trigger no longer names `.github/workflows/**`, `Dockerfile`, `atlas/**`, `codecov.yml`, `docs/check-docs-integrity.mjs`, `docs/examples/**`, `docs/mixed-game-viability-proof.ts`, `eslint.config.js`, `package-lock.json`, `package.json`, `packages/**`, `scripts/**`, `templates/**`, `tsconfig.json`, `tsconfig.tests.json` and `vitest.config.ts`.
- 2 files changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request; on a push touching 16 paths; or by hand. Runs packages/cli/src/bin.ts, scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs and 390 more; builds docs/mixed-game-viability-proof.ts; checks templates/, docs/, eslint.config.js and 5 more; packs package-lock.json, package.json, packages/ and 1 more into an image.
2. **Release.** When a release is published; or by hand. Runs packages/cli/src/bin.ts, scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs and 389 more; builds docs/mixed-game-viability-proof.ts; checks templates/, docs/, eslint.config.js and 5 more; packs package-lock.json, package.json, packages/ and 1 more into an image.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Docs Integrity.** On a pull request touching 5 paths; on a push touching 5 paths; or by hand. Runs docs/check-docs-integrity.mjs.
5. **ai-rpg-engine** (a command people run). Runs packages/cli/src/bin.ts.
6. **ai** (a command people run). Runs packages/ollama/src/bin.ts.

## What happens through CI

1. The workflow runs 6 files in cli, 4 files in scripts, packages/asset-registry/src/file-store.test.ts, packages/asset-registry/src/hash.test.ts and packages/asset-registry/src/memory-store.test.ts in asset-registry, packages/audio-director/src/director.test.ts in audio-director, 4 files in campaign-memory, and 141 files in 29 more parts; it builds docs/mixed-game-viability-proof.ts in docs; it checks docs/ in docs, eslint.config.js and vitest.config.ts in the repository root, scripts/ in scripts, and templates/ in starter; it packs package-lock.json, package.json and tsconfig.json in the repository root and packages/ (31 parts) into an image.
   1. Inside packages/cli/src/bin.ts, `main` does, in order:
      1. `some`
      2. `find`
      3. `loadExternalPack`
      4. `glyphsFor` (terminal-ui)
      5. `closeReadline`
      6. `promptMenu`
      7. `readRunHistory`
      8. `map`
      9. `formatRecentRuns`
      10. `map`
   2. Or, when `args.includes('--version') || args.includes('-v') || comman…`, `main` does `closeReadline` instead.
   3. Or, when `wantsHelp && !COMMANDS_WITH_OWN_HELP.has(command)`, `main` does `closeReadline` instead.
   4. Or, when `raw === undefined || raw === '' || raw.startsWith('-')`, `main` does `map` instead.
   5. `main` returns early 5 more ways.
2. It writes to docs/c0-alignment/intake-table.json, docs/c0-alignment/reverse-table.json and docs/c0-alignment/version-skew.json.
3. It uploads coverage to Codecov.

## Who reads the results

- **docs/c0-alignment/** has no reader in this repository.

## The other doors

**Release** runs packages/cli/src/bin.ts, scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs and 389 more, builds docs/mixed-game-viability-proof.ts, checks templates/, docs/, eslint.config.js and 5 more, packs package-lock.json, package.json, packages/ and 1 more into an image, writes to docs/c0-alignment/intake-table.json, docs/c0-alignment/reverse-table.json and docs/c0-alignment/version-skew.json, and publishes workspace packages to npm and a container image (on a run by hand, only with dry_run false).

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on main.

**Docs Integrity** runs docs/check-docs-integrity.mjs and runs git.

**ai-rpg-engine** (a command people run) runs packages/cli/src/bin.ts and reaches audio-director, campaign-memory, character-creation, character-profile, content-schema, core, equipment, modules, pack-registry, presentation, sidecar, soundpack-core, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie and terminal-ui.

**ai** (a command people run) runs packages/ollama/src/bin.ts and reaches character-creation, character-profile, content-schema, core, equipment and modules.

## What breaks what

- **core** is imported by 26 parts (campaign-memory, character-creation, character-profile, cli, content-schema, docs, equipment, ledger-adapter, modules, ollama, pack-registry, sidecar, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie, terminal-ui) and sits on the path of 4 doors.
- **content-schema** is imported by 18 parts (cli, docs, modules, ollama, pack-registry, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 4 doors.
- **equipment** is imported by 17 parts (character-profile, cli, ledger-adapter, modules, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie), and by 1 more only from tests; it sits on the path of 4 doors.
- **modules** is imported by 16 parts (cli, docs, ollama, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie), and by 4 more only from tests; it sits on the path of 4 doors.
- **character-creation** is imported by 15 parts (character-profile, cli, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 4 doors.
- **pack-registry** is imported by 14 parts (cli, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 3 doors.
- **presentation** is imported by 3 parts (audio-director, sidecar, terminal-ui), and by 1 more only from tests; it sits on the path of 3 doors.
- **starter-gladiator** is imported by 2 parts (cli, ledger-adapter), and by 4 more only from tests; it sits on the path of 3 doors.

## What tends to change together

- **packages/cli/src/packs-fallout-sink-consequence.test.ts** and **packages/cli/src/packs-fallout-sink.test.ts** changed together in 10 of 14 commits, inside the cli part.
- **packages/ledger-adapter/src/contracts.ts** and **packages/ledger-adapter/src/settle/adapter.ts** changed together in 11 of 16 commits, inside the ledger-adapter part.
- **packages/ollama/src/cli-run.test.ts** and **packages/ollama/src/cli.ts** changed together in 11 of 16 commits, inside the ollama part.
- **packages/ledger-adapter/src/contracts.ts** and **packages/ledger-adapter/src/settle/adapter.test.ts** changed together in 10 of 16 commits, inside the ledger-adapter part.
- **packages/ollama/src/cli-run.test.ts** and **packages/ollama/src/index.ts** changed together in 10 of 17 commits, inside the ollama part.

11 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 56 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

Every code part is touched by at least one test.

scripts is touched by tests only through a spawn: a test runs its files as a child process.

## Written but never read

- **docs/c0-alignment/intake-table.json** is written by packages/cli/src/c0-intake-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/reverse-table.json** is written by packages/cli/src/c0-reverse-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/version-skew.json** is written by packages/cli/src/c0-version-skew.test.ts (a test) and read by nothing else in this repository.
- **docs/contract-v1/rng-audit.json** is written by packages/cli/src/c1-rng-audit.test.ts (a test) and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **createGame** is exported by 13 parts (starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective and 8 more); with the same name in this many parts it is most likely a shared contract, not a copy.
- **toContentPack** is exported by packages/starter-fantasy/src/content.ts (starter-fantasy) and templates/starter/src/content.ts (starter); the two look alike.

## Generated, never hand-edited

- **docs/c0-alignment/intake-table.json** is written by packages/cli/src/c0-intake-table.test.ts (a test).
- **docs/c0-alignment/reverse-table.json** is written by packages/cli/src/c0-reverse-table.test.ts (a test).
- **docs/c0-alignment/version-skew.json** is written by packages/cli/src/c0-version-skew.test.ts (a test).
- **docs/contract-v1/rng-audit.json** is written by packages/cli/src/c1-rng-audit.test.ts (a test).
- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs.

## Hand-authored

People write .claude/, .github/, dogfood/, the repository root and site/; 21 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → packages/cli/src/bin.ts → packages/modules/src/ability-builders.ts → packages/content-schema/src/build-catalog.ts → packages/content-schema/src/validate.ts → packages/content-schema/src/schemas.ts → packages/core/src/actions.ts → packages/core/src/world.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 imports could not be resolved: `packages/cli/src/external-pack.ts` imports a path built at run time; `packages/pack-registry/src/discover.ts` imports a path built at run time; `packages/pack-registry/src/starter-readme-usage.test.ts` imports a path built at run time.
- 21 writes and 34 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 7 writes and 112 reads go to a path their caller passes, not to this repository.
- 16 writes and 13 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 12 writes and 9 reads go to the directory the command is run in, not to this repository.
- 6 writes and 3 reads go to a temporary directory, not to this repository.
- 2 commands are built at run time and not followed, 1 of them in tests.
- CI runs or checks 434 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Release runs or checks 433 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
