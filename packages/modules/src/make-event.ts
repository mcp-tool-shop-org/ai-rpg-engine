import type { ActionIntent, ResolvedEvent } from '@ai-rpg-engine/core';

/**
 * Build a ResolvedEvent for a verb handler. The id is intentionally left empty:
 * WorldStore.recordEvent is the single choke point that stamps a deterministic,
 * per-world id when the event is recorded. Assigning an id here (e.g. from a
 * process-global counter) would reintroduce the cross-instance non-determinism
 * this engine's headline guarantee forbids.
 */
export function makeEvent(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
  extra?: Partial<ResolvedEvent>,
): ResolvedEvent {
  return {
    id: '',
    tick: action.issuedAtTick,
    type,
    actorId: action.actorId,
    payload,
    ...extra,
  };
}
