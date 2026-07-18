#!/usr/bin/env node
// `ai` — the AI design-studio CLI (handbook Ch. 36).
//
// Thin executable wrapper: cli.ts stays a pure library module (index.ts
// re-exports runCli, so a shebang + self-execution there would fire the CLI
// on every `import '@ai-rpg-engine/ollama'`). The shebang and argv wiring
// live here instead, mirroring packages/cli's dist/bin.js convention.
//
// runCli handles all failures internally (structured code/message/hint
// render + process.exitCode = 1, never a raw stack — v2.5 audit PA-2). The
// catch below is a last-resort guard so a synchronous throw before runCli's
// own try/catch can never escape as an unhandled rejection.
import { runCli } from './cli.js';

runCli(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error [UNEXPECTED]: ${message}`);
  process.exitCode = 1;
});
