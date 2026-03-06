// @signalfire/modules — built-in mechanical systems

export { traversalCore } from './traversal-core.js';
export { statusCore, applyStatus, removeStatus, hasStatus, getStatusStacks } from './status-core.js';
export { combatCore, createCombatCore } from './combat-core.js';
export type { CombatFormulas } from './combat-core.js';
export { inventoryCore, createInventoryCore, giveItem } from './inventory-core.js';
export type { ItemEffect } from './inventory-core.js';
export { createDialogueCore } from './dialogue-core.js';
export type { DialogueState, DialogueRegistry } from './dialogue-core.js';
