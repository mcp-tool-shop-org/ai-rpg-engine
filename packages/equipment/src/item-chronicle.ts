// Item chronicle — runtime history management for item lifecycle events
// Pure functions for recording and querying item chronicle entries.

import type { ItemChronicleEntry, ItemChronicleEvent } from './types.js';

/** Record a new event in an item's chronicle. Returns new chronicle (immutable). */
export function recordItemEvent(
  chronicle: Record<string, ItemChronicleEntry[]>,
  itemId: string,
  entry: Omit<ItemChronicleEntry, 'tick'>,
  tick: number,
): Record<string, ItemChronicleEntry[]> {
  const existing = chronicle[itemId] ?? [];
  return {
    ...chronicle,
    [itemId]: [...existing, { ...entry, tick }],
  };
}

/** Get the full history for a specific item. */
export function getItemHistory(
  chronicle: Record<string, ItemChronicleEntry[]>,
  itemId: string,
): ItemChronicleEntry[] {
  return chronicle[itemId] ?? [];
}

/** Count how many kills an item has been used for. */
export function getItemKillCount(
  chronicle: Record<string, ItemChronicleEntry[]>,
  itemId: string,
): number {
  return (chronicle[itemId] ?? []).filter((e) => e.event === 'used-in-kill').length;
}

/** Get the age of an item in ticks (since first 'acquired' event). */
export function getItemAge(
  chronicle: Record<string, ItemChronicleEntry[]>,
  itemId: string,
  currentTick: number,
): number {
  const entries = chronicle[itemId] ?? [];
  const acquired = entries.find((e) => e.event === 'acquired');
  if (!acquired) return 0;
  return currentTick - acquired.tick;
}

/** Check if an item has a specific event type in its chronicle. */
export function hasItemEvent(
  chronicle: Record<string, ItemChronicleEntry[]>,
  itemId: string,
  event: ItemChronicleEvent,
): boolean {
  return (chronicle[itemId] ?? []).some((e) => e.event === event);
}
