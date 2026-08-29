// restore-session.ts — Continue/replay/inspect-save shared load authority.
//
// Extracted so inspect-save can run the same post-deserialize sequence
// restoreSessionFromSave already owned (createGame, store swap, rebind,
// migrateModuleStates, initializeNamespaces) instead of stopping at
// WorldStore.deserialize and exiting 0 on a save Continue would reject.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorldStore, migrateModuleStates, type Engine } from '@ai-rpg-engine/core';
import type { LoadedPack } from './external-pack.js';

const SAVE_FILE = path.join('.ai-rpg-engine', 'save.json');

/** One live game: a wired engine plus the pack it came from. */
export type Session = { engine: Engine; pack: LoadedPack };

/**
 * Restore the saved world into a fully pack-wired engine (the shared load
 * authority for `run` → Continue, `replay`, and `inspect-save`).
 *
 * Build a fully-wired engine (modules registered, pack event subscriptions
 * bound to its live EventBus). createGame is also where pack closures hook the
 * bus — we must reuse THAT bus, so we restore state into this engine rather
 * than constructing a bare one via Engine.deserialize. Two hardenings over the
 * old replay-only path (F1c):
 *  - the pack's ruleset is threaded into WorldStore.deserialize so stat/
 *    resource bounds survive the load (parity with Engine.deserialize, C7)
 *  - moduleManager.rebindStore(restored) rebinds the module contexts' emit
 *    path so post-load reactive emits (status DoT, defeat cascades) land in
 *    the LIVE eventLog, not the orphaned construction store (parity with
 *    Engine.deserialize, v2.5 PC-1)
 *
 * P8-WL-002/P8-SP-001: this path also runs the ENG-009 module-migration seam,
 * which it previously bypassed entirely — Engine.deserialize had the seam,
 * but this function is the only load authority shipped play reaches, so
 * version-drifted module slices loaded raw and a save → Continue → save cycle
 * carried its original meta.moduleVersions forever. After the store swap:
 *  - migrateModuleStates(restored.state, moduleManager.getModules()) — each
 *    registered module whose persisted meta.moduleVersions entry differs from
 *    its registered version gets migrateState() on its slice, then the stamp
 *    is refreshed IN PLACE (the re-stamp lives inside migrateModuleStates,
 *    world.ts — the exact call Engine.deserialize makes), so the NEXT save is
 *    post-seam. All-or-nothing: a throwing hook rejects the load with
 *    SAVE_MODULE_MIGRATION_FAILED and the half-built engine is abandoned —
 *    the caller never receives a session holding half-migrated state.
 *  - moduleManager.initializeNamespaces(restored) — namespaces ABSENT from
 *    the save get their modules' registered defaults (factory defaults run
 *    against the RESTORED world, so eventLog-cursor state baselines to the
 *    loaded log's length — P8-WL-006); PRESENT namespaces are never touched.
 *
 * @throws SaveLoadError on malformed/unsupported saves, and with code
 *   SAVE_MODULE_MIGRATION_FAILED when a module's migrateState throws —
 *   caller renders it.
 */
export function restoreSessionFromSave(pack: LoadedPack, saveData?: unknown): Session {
  const data = (saveData ?? JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'))) as {
    world?: { state?: { meta?: { seed?: number } } };
    actionLog?: unknown;
  };
  const seed = data.world?.state?.meta?.seed ?? 42;
  const engine = pack.createGame(seed);

  const restored = WorldStore.deserialize(
    JSON.stringify(data.world),
    engine.store.events,
    pack.ruleset,
  );
  (engine as { store: WorldStore }).store = restored;
  engine.moduleManager.rebindStore(restored);

  // ENG-009 seam on the shipped load path (see the doc block above). Order
  // matters: migrations first (a hook may discard its slice by returning
  // undefined), then namespace init re-defaults whatever is absent. The
  // module list comes from the pack-wired manager — pack closures own module
  // construction, so getModules() is the only public route to the exact
  // instances the pack registered.
  migrateModuleStates(restored.state, engine.moduleManager.getModules());
  engine.moduleManager.initializeNamespaces(restored);

  // Restore the action log so a save taken AFTER resuming still carries the
  // full history (`--replay` re-simulation stays coherent). The old replay
  // path silently dropped it — every resumed session forked its history.
  // Non-array shapes are ignored here (the strict validation lives on the
  // save-load authorities); an absent/corrupt log degrades to post-resume-only.
  if (Array.isArray(data.actionLog)) {
    (engine as unknown as { actionLog: unknown[] }).actionLog = [...data.actionLog];
  }

  return { engine, pack };
}
