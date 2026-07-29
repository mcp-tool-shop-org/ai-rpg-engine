// open-gates.ts — remove entry gates from a booted world, for probes whose
// subject is NOT gating.
//
// ⚠ WHY THIS EXISTS, stated plainly so it is never mistaken for a weakening.
//
// C3/P2 made `ZoneState.entryGate` rule-bearing, and the C0 coverage fixture
// authors a HARD gate on `zone-under-vault` and another on `zone-sky-gantry`. The
// moment those gates became live, every prior probe that WALKS the exported graph
// started failing — C1's "the player actually walks the exported graph", its
// alive-as-rules sweep, and C3/P1's spawn tests — because an ungeared player can
// no longer get into the vault.
//
// That is the gate WORKING. The tests it broke are measuring something else:
// whether converted zone fields bear rules, whether a spawn set fires, whether
// the player traverses the subgraph. Their subject is not access control, and
// leaving them blocked would mean deleting real measurements over an unrelated
// obstacle.
//
// So the probes that are not about gating say so, in one line, by calling this.
// The alternative — satisfying three conditions in every traversal probe — would
// couple every one of them to the fixture's gate content, so a future gate edit
// would break a spawn test for no reason.
//
// This is deliberately NOT a production helper and is not exported from the
// package. Gates are removed from the WORLD, never from the pack, so nothing here
// touches what the exporter emits or what the load gate checks.
//
// Not a `.test.ts`: importing a value from a test file drags its `describe`
// blocks into every importer's module graph, which is the bug C0's ledger entry
// 10 spent a debugging pass on (three parallel copies of the intake suite racing
// on the same temp filenames).

import type { Engine } from '@ai-rpg-engine/core';

/**
 * Strip every zone's `entryGate` from a booted world, and return how many were
 * removed.
 *
 * Callers assert on the count when they want to be sure the fixture still
 * authors gates — a helper that silently removed nothing would let a probe pass
 * for the wrong reason if the gates ever moved.
 */
export function openAllGates(engine: Engine): number {
  let removed = 0;
  for (const zone of Object.values(engine.world.zones)) {
    if (zone.entryGate !== undefined) {
      delete zone.entryGate;
      removed++;
    }
  }
  return removed;
}
