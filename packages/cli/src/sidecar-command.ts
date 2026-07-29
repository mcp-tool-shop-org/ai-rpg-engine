// sidecar-command.ts — `ai-rpg-engine sidecar <pack-id>`: the sim as a server.
//
// This is the command that makes C4's diorama possible: one authoritative sim
// process, spoken to over JSON-RPC by a client that is not a terminal. C0
// measured that the sim's only presentation consumer was a terminal calling it
// IN-PROCESS; that is the thing this changes.
//
// The command is deliberately thin. @ai-rpg-engine/sidecar owns the protocol and
// knows nothing about packs; this file owns pack resolution and knows nothing
// about framing. The round driver is passed IN because the round loop lives
// above the engine — `runWorldTick` is a per-round function the CLI drives, not
// a verb, which v3.6 learned by shipping a probe that could never have seen it.

import { startStdioServer } from '@ai-rpg-engine/sidecar';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import { ENGINE_VERSION } from './engine-version.js';

export interface SidecarDeps {
  /** Diagnostics sink. NEVER stdout: stdout carries framed protocol only. */
  error: (msg: string) => void;
}

const defaultDeps: SidecarDeps = { error: (m) => process.stderr.write(`${m}\n`) };

function printSidecarHelp(error: (msg: string) => void): void {
  error('Usage: ai-rpg-engine sidecar <pack-id> [--seed <n>]');
  error('');
  error('Runs the simulation as a JSON-RPC server over stdio. One authoritative sim,');
  error('N rendering clients: the client submits intents, the sim decides, and events');
  error('arrive as tick-stamped notifications carrying a per-tick state hash.');
  error('');
  error('stdout carries framed protocol messages ONLY. All diagnostics go to stderr —');
  error('a stray write to stdout corrupts the frame stream and desynchronises the client.');
  error('');
  error(`Packs: ${allPacks.map((p) => p.meta.id).join(', ')}`);
}

/**
 * Start the sidecar. Returns the process exit code, or `null` when the server
 * is running (the caller keeps the process alive on stdin).
 */
export function runSidecar(args: string[], deps: SidecarDeps = defaultDeps): number | null {
  const { error } = deps;

  if (args.includes('--help') || args.includes('-h')) {
    printSidecarHelp(error);
    return 0;
  }

  const seedIdx = args.indexOf('--seed');
  const seedRaw = seedIdx >= 0 ? args[seedIdx + 1] : undefined;
  // Same guard shape as `validate --manifest`: without it, a missing flag makes
  // `seedIdx + 1` index 0 and eats the pack id.
  const seedValueIdx = seedIdx >= 0 ? seedIdx + 1 : -1;
  const packId = args.find((a, i) => !a.startsWith('-') && i !== seedValueIdx);

  if (!packId) {
    error('✗ [SIDECAR_PACK_MISSING] Missing <pack-id>.');
    printSidecarHelp(error);
    return 1;
  }

  let seed: number | undefined;
  if (seedRaw !== undefined) {
    seed = Number(seedRaw);
    if (!Number.isSafeInteger(seed) || seed < 0) {
      error(`✗ [SIDECAR_INVALID_SEED] --seed must be a non-negative integer, got "${seedRaw}".`);
      return 1;
    }
  }

  const pack: PackInfo | undefined = allPacks.find((p) => p.meta.id === packId);
  if (!pack) {
    error(`✗ [SIDECAR_PACK_UNKNOWN] No pack "${packId}".`);
    error(`  Available: ${allPacks.map((p) => p.meta.id).join(', ')}`);
    return 1;
  }

  const engine = pack.createGame(seed);
  const loaded = { meta: pack.meta, createGame: pack.createGame };

  startStdioServer({
    engine,
    engineVersion: ENGINE_VERSION,
    serverName: `ai-rpg-engine sidecar (${pack.meta.id})`,
    // The round driver, injected. `advance` reports the capability unavailable
    // rather than pretending when a host does not supply one.
    advanceRound: (e: unknown) => runHostileRound(e as never, loaded as never, { log: () => {} }),
  });

  error(`[sidecar] ${pack.meta.id} ready${seed !== undefined ? ` (seed ${seed})` : ''}`);
  return null; // keep the process alive; stdin drives it
}
