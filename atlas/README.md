# ai-rpg-engine: how it works

Mapped at 2026-09-23 from commit 7ff40cd.

## What this is

39 parts. Work enters through 4 doors; the busiest is CI, which reaches 35 parts.

## What changed since the last map

This is the first map.

## What comes in

1. **CI.** On a pull request touching 15 paths; on a push touching 15 paths; or by hand. Runs scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs, scripts/verify-mixed-game-viability.mjs and 6 more.
2. **Release.** When a release is published; or by hand. Runs scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs, scripts/verify-mixed-game-viability.mjs and 6 more.
3. **Docs Integrity.** On a pull request touching 5 paths; on a push touching 5 paths; or by hand. Runs docs/check-docs-integrity.mjs.
4. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs no file this map can see.

## What happens through CI

1. The workflow runs docs/ in docs, eslint.config.js and vitest.config.ts in the repository root, 4 files in scripts, templates/ in starter, and packages/ (31 parts).
2. It writes to packages/ledger-adapter/scripts/.

## Who reads the results

- **packages/ledger-adapter/** has no reader in this repository.

## The other doors

**Release** runs scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs, scripts/verify-mixed-game-viability.mjs and 6 more, writes to packages/ledger-adapter/scripts/, and publishes to npm and a container image.

**Docs Integrity** runs docs/check-docs-integrity.mjs.

**Deploy site to GitHub Pages** runs no file this map can see and deploys the site.

## What breaks what

- **core** is imported by 26 parts (campaign-memory, character-creation, character-profile, cli, content-schema, docs, equipment, ledger-adapter, modules, ollama, pack-registry, sidecar, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie, terminal-ui) and sits on the path of 2 doors.
- **content-schema** is imported by 18 parts (cli, docs, modules, ollama, pack-registry, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 2 doors.
- **equipment** is imported by 17 parts (character-profile, cli, ledger-adapter, modules, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie), and by 1 more only from tests; it sits on the path of 2 doors.
- **modules** is imported by 16 parts (cli, docs, ollama, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie), and by 4 more only from tests; it sits on the path of 2 doors.
- **character-creation** is imported by 15 parts (character-profile, cli, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 2 doors.
- **pack-registry** is imported by 14 parts (cli, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 2 doors.
- **presentation** is imported by 3 parts (audio-director, sidecar, terminal-ui), and by 1 more only from tests; it sits on the path of 2 doors.
- **starter-gladiator** is imported by 2 parts (cli, ledger-adapter), and by 4 more only from tests; it sits on the path of 2 doors.

## What tends to change together

- **packages/cli/src/packs-fallout-sink-consequence.test.ts** and **packages/cli/src/packs-fallout-sink.test.ts** changed together in 10 of 14 commits, inside the cli part.
- **packages/ledger-adapter/src/contracts.ts** and **packages/ledger-adapter/src/settle/adapter.ts** changed together in 11 of 16 commits, inside the ledger-adapter part.
- **packages/ollama/src/cli-run.test.ts** and **packages/ollama/src/cli.ts** changed together in 11 of 16 commits, inside the ollama part.
- **packages/ledger-adapter/src/contracts.ts** and **packages/ledger-adapter/src/settle/adapter.test.ts** changed together in 10 of 16 commits, inside the ledger-adapter part.
- **packages/ollama/src/cli-run.test.ts** and **packages/ollama/src/index.ts** changed together in 10 of 17 commits, inside the ollama part.

11 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

- **packages/ledger-adapter/scripts/** is written by packages/ledger-adapter/scripts/live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **createGame** is exported by 13 parts (starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective and 8 more); with the same name in this many parts it is most likely a shared contract, not a copy.
- **toContentPack** is exported by packages/starter-fantasy/src/content.ts (starter-fantasy) and templates/starter/src/content.ts (starter); the two look alike.

## Generated, never hand-edited

- **packages/ledger-adapter/scripts/** is written by packages/ledger-adapter/scripts/live-replay.mjs.
- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs.

## Hand-authored

People write .claude/, .github/, docs/, dogfood/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → docs/

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 import sites could not be resolved.
- 42 writes and 61 reads use paths built at run time and are not named here.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
