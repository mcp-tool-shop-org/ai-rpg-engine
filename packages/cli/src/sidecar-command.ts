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
import { applyContentPack, loadContentFromFile } from '@ai-rpg-engine/content-schema';
import { createStandardChannels } from '@ai-rpg-engine/modules';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import { ENGINE_VERSION } from './engine-version.js';

export interface SidecarDeps {
  /** Diagnostics sink. NEVER stdout: stdout carries framed protocol only. */
  error: (msg: string) => void;
}

const defaultDeps: SidecarDeps = { error: (m) => process.stderr.write(`${m}\n`) };

function printSidecarHelp(error: (msg: string) => void): void {
  error(
    'Usage: ai-rpg-engine sidecar <pack-id> [--seed <n>] [--listen <port>] [--host <addr>]'
    + ' [--content <pack.json>]',
  );
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
  error('CONTENT');
  error('  --content <pack.json>');
  error('                   Route an exported content pack into the booted world. The');
  error('                   pack-id argument still supplies the CODE — modules, ruleset,');
  error('                   closures, event wiring — and this supplies the declarative');
  error('                   content, which is the boot contract C1 settled.');
  error('');
  error('                   The four-check load gate runs BEFORE any mutation, so a bad');
  error('                   engine-version range, an unknown module id, an unknown');
  error('                   top-level key or a failed content hash is refused rather');
  error('                   than half-applied. Applied counts, dropped fields and');
  error('                   advisories are all reported to stderr — nothing is eaten.');
  error('');
  error('  --start <zone-id>');
  error('                   Stand the player in a zone after intake. Authored zones are');
  error('                   MERGED into the host pack\'s world and the two graphs are');
  error('                   not connected, so without this the player begins in the');
  error('                   host\'s opening zone with no path to the authored world.');
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
  const VALUE_FLAGS = ['--seed', '--listen', '--host', '--content', '--start'] as const;
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
  const contentRaw = valueOf('--content');
  const startRaw = valueOf('--start');
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

  if (args.includes('--content') && contentRaw === undefined) {
    error('✗ [SIDECAR_CONTENT_MISSING_PATH] --content requires a path to an exported content pack.');
    return 1;
  }

  const engine = pack.createGame(seed);
  const loaded = { meta: pack.meta, createGame: pack.createGame };

  // ── Authored content into the booted world ──────────────────────────────────
  //
  // C1 settled the boot contract on evidence: a pack stays a FUNCTION, and
  // declarative content is routed INTO the world that code builds. It built
  // `applyContentPack` for exactly that and proved it in tests — and until now
  // nothing in production ever called it. C4 is the reason it exists: a diorama that
  // could only render a bundled starter would make the whole authoring layer
  // invisible, which is the gap C0 measured in the first place.
  //
  // `applyContentPack` runs the four-check load gate BEFORE any mutation, so a pack
  // claiming the wrong engine version, naming a module this engine never registered,
  // carrying an unknown top-level key, or failing its content hash is refused here
  // rather than half-applied. And `dropped` is reported rather than swallowed: C0's
  // headline failure was not that data was lost, it was that data was lost SILENTLY
  // while an instrument reported 100% lossless.
  if (contentRaw !== undefined) {
    const load = loadContentFromFile(contentRaw);
    if (!load.ok) {
      error(`✗ [SIDECAR_CONTENT_INVALID] ${load.summary}`);
      for (const e of load.errors) error(`  ${e.path}: ${e.message}`);
      return 1;
    }

    // ⚠ THE GATE IS OPT-IN, and forgetting to opt in is silent. `applyContentPack`
    // runs the four checks only `if (options.gate)` (intake.ts:403). The first version
    // of this command passed no gate while its own help text promised "the four-check
    // load gate runs BEFORE any mutation" — a documented gate that executed nothing,
    // measured by giving it a pack with a nonsense top-level key and watching it load
    // clean. That is the studio's named `gates_verify_reality_not_attestation` failure,
    // committed by the person who had just written the sentence.
    //
    // `registeredModuleIds` comes from the ENGINE, not from a catalog: resolution
    // against reality is what kills C0's phantom nine and what lets a pack ship its own
    // module without being wrongly refused.
    const applied = applyContentPack(engine, load.pack, {
      channels: createStandardChannels(),
      gate: {
        engineVersion: ENGINE_VERSION,
        registeredModuleIds: engine.moduleManager.getModules().map((m) => m.id),
        ...(typeof (load.pack as { manifest?: unknown }).manifest === 'object'
          && (load.pack as { manifest?: unknown }).manifest !== null
          ? { manifest: (load.pack as { manifest: Record<string, unknown> }).manifest }
          : {}),
      },
    });
    if (!applied.ok) {
      error('✗ [SIDECAR_CONTENT_REFUSED] the content pack was refused.');
      // The gate's `report` is the diff-style "expected / actual / what to do" C1
      // built, and it is where the offending KEY, VERSION or MODULE ID is actually
      // named. `errors[]` keeps only message+hint — the conversion drops `expected`
      // and `actual` — so a first version of this printed a refusal that never said
      // WHAT was wrong. Printing the report first is the difference between a
      // refusal and a usable one.
      if (applied.gate?.report) {
        for (const line of applied.gate.report.split('\n')) error(`  ${line}`);
      }
      for (const e of applied.errors) error(`  ${e.path}: ${e.message}`);
      return 1;
    }

    const counts = Object.entries(applied.applied)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    error(`[sidecar] applied ${contentRaw}${counts ? ` (${counts})` : ''}`);
    // Dropped fields are announced, every time, on a transport whose whole purpose is
    // that a renderer can be trusted about what it received.
    for (const d of applied.dropped) error(`[sidecar] dropped ${d.path}: ${d.reason}`);
    for (const a of applied.advisories) error(`[sidecar] advisory ${a.path}: ${a.message}`);
  }

  // ── Where the session begins ────────────────────────────────────────────────
  //
  // Applying a world nobody can stand in is applying a world nobody plays.
  //
  // `applyContentPack` MERGES authored zones into the world the host pack built, and
  // the two graphs are not connected — measured on Salt Road: the player starts in
  // the host pack's opening zone with no path to any authored one, so a client would
  // render six harbour zones and a player who cannot reach them. The forge authors a
  // default `spawnPoint`, but spawn points are not a pack key and never cross.
  //
  // `setPlayerLocation` is the engine's own primitive — it moves `locationId` AND the
  // player entity's `zoneId` together, which is the bookkeeping a caller writing
  // `locationId` from outside would get half-right (a C3 ledger entry, learned by
  // doing exactly that).
  if (args.includes('--start')) {
    if (startRaw === undefined) {
      error('✗ [SIDECAR_START_MISSING_ZONE] --start requires a zone id.');
      return 1;
    }
    // Checked against the world AFTER intake, so a typo names the zones that exist
    // rather than putting the player nowhere and letting the first move fail.
    if (engine.world.zones[startRaw] === undefined) {
      error(`✗ [SIDECAR_START_UNKNOWN_ZONE] no zone "${startRaw}" in the booted world.`);
      error(`  Zones: ${Object.keys(engine.world.zones).sort().join(', ')}`);
      return 1;
    }
    engine.store.setPlayerLocation(startRaw);
    error(`[sidecar] player starts in ${startRaw}`);
  }

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
