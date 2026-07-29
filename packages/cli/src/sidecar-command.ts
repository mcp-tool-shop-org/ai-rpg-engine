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

import { startStdioServer, startSocketServer } from '@ai-rpg-engine/sidecar';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import { ENGINE_VERSION } from './engine-version.js';

export interface SidecarDeps {
  /** Diagnostics sink. NEVER stdout: stdout carries framed protocol only. */
  error: (msg: string) => void;
}

const defaultDeps: SidecarDeps = { error: (m) => process.stderr.write(`${m}\n`) };

function printSidecarHelp(error: (msg: string) => void): void {
  error('Usage: ai-rpg-engine sidecar <pack-id> [--seed <n>] [--listen <port>] [--host <addr>]');
  error('');
  error('Runs the simulation as a JSON-RPC server. One authoritative sim, N rendering');
  error('clients: the client submits intents, the sim decides, and events arrive as');
  error('tick-stamped notifications carrying a per-tick state hash.');
  error('');
  error('TRANSPORTS');
  error('  (default)        LAUNCH — stdio. The host spawns this process and speaks over');
  error('                   its pipes. stdout carries framed protocol messages ONLY;');
  error('                   a stray write there desynchronises the client permanently.');
  error('  --listen <port>  ATTACH — TCP. The process listens and a client connects.');
  error('                   Use 0 for an ephemeral port; the chosen port is printed to');
  error('                   stderr as "[sidecar] listening <host>:<port>".');
  error('');
  error('  --host <addr>    Interface for --listen. Defaults to 127.0.0.1, and should');
  error('                   stay there: any other value accepts simulation commands');
  error('                   from another machine.');
  error('');
  error('One client at a time under --listen. Two clients would interleave in socket');
  error('arrival order, which is not deterministic, and determinism through the wire is');
  error('the property this server exists to preserve. A second connection is refused');
  error('with that reason on the wire rather than dropped silently.');
  error('');
  error('Diagnostics go to stderr under BOTH transports. Under --listen stdout is not');
  error('the protocol and writing to it would be harmless, which is exactly how a rule');
  error('starts holding in one file and not its neighbour.');
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

  // Every flag that takes a VALUE, so the positional scan can skip those values.
  // The previous shape hard-coded one such flag (`--seed`) and excluded exactly one
  // index; with three value-flags that approach silently eats the pack id — the
  // failure the original's own comment warns about, one flag later.
  const VALUE_FLAGS = ['--seed', '--listen', '--host'] as const;
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const valueIndices = new Set<number>();
  for (const flag of VALUE_FLAGS) {
    const i = args.indexOf(flag);
    if (i >= 0) valueIndices.add(i + 1);
  }

  const seedRaw = valueOf('--seed');
  const listenRaw = valueOf('--listen');
  const hostRaw = valueOf('--host');
  const packId = args.find((a, i) => !a.startsWith('-') && !valueIndices.has(i));

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

  let port: number | undefined;
  if (args.includes('--listen')) {
    if (listenRaw === undefined) {
      error('✗ [SIDECAR_LISTEN_MISSING_PORT] --listen requires a port (use 0 for an ephemeral one).');
      return 1;
    }
    port = Number(listenRaw);
    // 0 is legal and means "pick one". Ports above 65535 do not exist, and a
    // privileged port is a decision, not a typo we should quietly bind.
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
      error(`✗ [SIDECAR_INVALID_PORT] --listen must be a port in 0..65535, got "${listenRaw}".`);
      return 1;
    }
  }

  if (hostRaw !== undefined && port === undefined) {
    error('✗ [SIDECAR_HOST_WITHOUT_LISTEN] --host only applies to --listen; the stdio transport has no address.');
    return 1;
  }

  const pack: PackInfo | undefined = allPacks.find((p) => p.meta.id === packId);
  if (!pack) {
    error(`✗ [SIDECAR_PACK_UNKNOWN] No pack "${packId}".`);
    error(`  Available: ${allPacks.map((p) => p.meta.id).join(', ')}`);
    return 1;
  }

  const engine = pack.createGame(seed);
  const loaded = { meta: pack.meta, createGame: pack.createGame };

  // Identical on both transports. That is the whole claim `stdio.ts` made about
  // attach: the server, the protocol and the serializer do not know which one they
  // are on, so a session cannot behave differently depending on how it arrived.
  const serverOptions = {
    engine,
    engineVersion: ENGINE_VERSION,
    serverName: `ai-rpg-engine sidecar (${pack.meta.id})`,
    // The round driver, injected. `advance` reports the capability unavailable
    // rather than pretending when a host does not supply one.
    advanceRound: (e: unknown) => runHostileRound(e as never, loaded as never, { log: () => {} }),
  };

  if (port !== undefined) {
    startSocketServer(
      { ...serverOptions, port, host: hostRaw },
      {
        // Machine-readable on purpose: a harness launching this with `--listen 0`
        // has no other way to learn the port, and parsing a prose sentence is how
        // a test starts depending on wording.
        onListening: (bound, host) => error(`[sidecar] listening ${host}:${bound}`),
        onConnection: (i) => error(`[sidecar] client ${i} attached`),
        onDisconnect: (i) => error(`[sidecar] client ${i} detached`),
        onRefused: (reason) => error(`[sidecar] ${reason}`),
        onFramingError: (d) => error(`[sidecar] framing error: ${d}`),
        onError: (err) => error(`[sidecar] transport error: ${err.message}`),
      },
    );
    error(`[sidecar] ${pack.meta.id} ready${seed !== undefined ? ` (seed ${seed})` : ''}`);
    return null; // keep the process alive; the socket drives it
  }

  startStdioServer(serverOptions);

  error(`[sidecar] ${pack.meta.id} ready${seed !== undefined ? ` (seed ${seed})` : ''}`);
  return null; // keep the process alive; stdin drives it
}
