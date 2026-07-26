// contract-core — the obligation engine behind Salt Road Ledger's five verbs.
//
// PACK-LOCAL BY DESIGN. This lives inside the starter rather than in
// @ai-rpg-engine/modules because it has exactly one consumer today
// (DECOMPOSE_BY_SECRETS: do not promote to shared until there are two). If a
// second pack wants obligations, that is the moment to lift it.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
// This module has NO knowledge of XRPL, ledgers, or settlement, and it must not
// acquire any. `@ai-rpg-engine/ledger-adapter` is absent from this package's
// dependencies and a test asserts that it stays absent. Every mechanic here
// works fully offline: `consign` creates a real obligation in world state,
// `audit` reconciles the player's own books, and lien seizure takes a real item
// out of a real inventory. An attached ledger adapter MIRRORS these on-chain at
// checkpoints; it never enables them, and the game cannot tell whether one is
// listening.
//
// The coupling surface is one direction only: this module EMITS the events in
// §"Checkpoint event vocabulary" below. A driver subscribes. The pack does not
// know a driver exists.
//
// ── DETERMINISM ─────────────────────────────────────────────────────────────
// No Math.random, no Date.now, no wall clock. Due dates are computed from
// `world.meta.tick` plus an authored term. Seizure picks its victim by sorted
// item id, never by iteration order or a roll — so two same-seed runs seize the
// same asset. Everything here is a pure function of world state plus the action.

import type { ActionIntent, EngineModule, EntityState, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import type { ItemCatalog, ItemDefinition } from '@ai-rpg-engine/equipment';

/** Persisted namespace key (world.modules[CONTRACT_STATE_KEY]). */
export const CONTRACT_STATE_KEY = 'contract-core';

/** Lien at or above this and the Assay Guild takes a consigned asset. */
export const SEIZURE_THRESHOLD = 70;
/** Lien at or above this and the Guild Seal is revoked — the run's soft fail. */
export const REVOCATION_THRESHOLD = 90;
/** Ticks a consignment runs before it is overdue. */
export const DEFAULT_TERM_TICKS = 12;

export type ObligationStatus = 'open' | 'honoured' | 'defaulted' | 'seized';

/** One consignment: goods handed over against a promise of later payment. */
export type Obligation = {
  id: string;
  itemId: string;
  counterparty: string;
  /** Coin owed to the factor when the obligation is honoured. */
  value: number;
  /** The tick at which this becomes overdue (issuedTick + term). */
  dueTick: number;
  issuedTick: number;
  status: ObligationStatus;
};

/** A risk taken on for a fee. Liquidity now, lien later if the claim fires. */
export type UnderwritingPolicy = {
  id: string;
  counterparty: string;
  premium: number;
  /** Lien applied if the claim fires. */
  exposure: number;
  issuedTick: number;
  claimed: boolean;
};

export type ContractModuleState = {
  obligations: Obligation[];
  underwritten: UnderwritingPolicy[];
  /** Monotonic counter for obligation/policy ids — deterministic, never a UUID. */
  nextId: number;
};

export type ContractCoreConfig = {
  /** The pack's item catalog — the same one equipment-core is built with. */
  catalog: ItemCatalog;
  /** Ticks a consignment runs before going overdue. Defaults to DEFAULT_TERM_TICKS. */
  termTicks?: number;
};

// ── State access (lazy, tolerant, non-attaching) ────────────────────────────

const EMPTY: ContractModuleState = { obligations: [], underwritten: [], nextId: 1 };

function peek(world: WorldState): ContractModuleState | undefined {
  const ns = world.modules[CONTRACT_STATE_KEY];
  return ns && typeof ns === 'object' && !Array.isArray(ns) ? (ns as ContractModuleState) : undefined;
}

/** Read-only view. `EMPTY`-shaped when nothing has been recorded. Never attaches. */
export function getContractState(world: WorldState): ContractModuleState {
  const s = peek(world);
  if (!s) return EMPTY;
  return {
    obligations: Array.isArray(s.obligations) ? s.obligations : [],
    underwritten: Array.isArray(s.underwritten) ? s.underwritten : [],
    nextId: typeof s.nextId === 'number' ? s.nextId : 1,
  };
}

/** The mutable namespace, created on first write. */
function mutable(world: WorldState): ContractModuleState {
  const existing = peek(world);
  if (existing) {
    existing.obligations ??= [];
    existing.underwritten ??= [];
    existing.nextId ??= 1;
    return existing;
  }
  const fresh: ContractModuleState = { obligations: [], underwritten: [], nextId: 1 };
  world.modules[CONTRACT_STATE_KEY] = fresh;
  return fresh;
}

/** Every open obligation, oldest first. */
export function getOpenObligations(world: WorldState): Obligation[] {
  return getContractState(world).obligations.filter((o) => o.status === 'open');
}

/** Obligations past their due tick and still open. */
export function getOverdueObligations(world: WorldState, tick: number): Obligation[] {
  return getOpenObligations(world).filter((o) => tick > o.dueTick);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
  extra?: Partial<ResolvedEvent>,
): ResolvedEvent {
  return { id: '', tick: action.issuedAtTick, type, actorId: action.actorId, payload, ...extra };
}

function reject(action: ActionIntent, reason: string, hint: string, extra?: Record<string, unknown>): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason, hint, ...extra })];
}

function findItem(catalog: ItemCatalog, itemId: string): ItemDefinition | undefined {
  return catalog.items.find((i) => i.id === itemId);
}

function itemRefOf(action: ActionIntent): string | undefined {
  const fromParams = action.parameters?.itemId;
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;
  if (typeof action.toolId === 'string' && action.toolId.length > 0) return action.toolId;
  const fromTarget = action.targetIds?.[0];
  if (typeof fromTarget === 'string' && fromTarget.length > 0) return fromTarget;
  return undefined;
}

function resource(entity: EntityState, key: string): number {
  return entity.resources[key] ?? 0;
}

/** Clamped resource move. The engine clamps at 0 too; this keeps ceilings honest. */
function adjust(entity: EntityState, key: string, delta: number, max?: number): void {
  const next = resource(entity, key) + delta;
  entity.resources[key] = max === undefined ? Math.max(0, next) : Math.min(max, Math.max(0, next));
}

/** Rarity → a base unit value. Authored, not rolled. */
const RARITY_VALUE: Record<string, number> = {
  common: 10,
  uncommon: 18,
  rare: 32,
  legendary: 60,
};

function baseValue(item: ItemDefinition): number {
  return RARITY_VALUE[item.rarity] ?? 10;
}

/** Does the actor hold an item granting this verb? (The seal grants consign.) */
function holdsVerbGrantingItem(actor: EntityState, catalog: ItemCatalog, verb: string): boolean {
  for (const id of actor.inventory ?? []) {
    const item = findItem(catalog, id);
    if (item?.grantedVerbs?.includes(verb)) return true;
  }
  // Equipped items count too — read through the equipment namespace as plain
  // data rather than importing equipment-core's reader, so this module keeps a
  // type-only relationship with that package.
  const equip = world_equipped(actor);
  for (const id of equip) {
    const item = findItem(catalog, id);
    if (item?.grantedVerbs?.includes(verb)) return true;
  }
  return false;
}

/** Equipped ids for an entity, read off the entity's own statuses. */
function world_equipped(actor: EntityState): string[] {
  // equipment-core mirrors each equipped item into an `equipped-<itemId>`
  // status. Reading that prefix keeps this module free of any dependency on
  // equipment-core's module-state shape.
  return actor.statuses
    .map((s) => s.statusId)
    .filter((id) => id.startsWith('equipped-'))
    .map((id) => id.slice('equipped-'.length));
}

// ── appraise ────────────────────────────────────────────────────────────────

function appraiseHandler(action: ActionIntent, world: WorldState, catalog: ItemCatalog): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can appraise.');

  const ref = itemRefOf(action);
  if (!ref) {
    const carried = (actor.inventory ?? []).filter((id) => findItem(catalog, id));
    return reject(action, 'appraise what?', 'appraise <item-id>', { candidates: carried });
  }
  const item = findItem(catalog, ref);
  if (!item) return reject(action, `no such item: ${ref}`, 'appraise <item-id>');

  // Accuracy is a function of ledger vs the item's rarity — a common bale is
  // easy to price, a legendary instrument is not. Deterministic: no roll.
  const difficulty = Math.min(20, baseValue(item) / 4);
  const accuracy = Math.max(0, Math.min(100, Math.round(50 + (actor.stats.ledger ?? 0) * 5 - difficulty * 2)));
  const trueValue = baseValue(item);
  // A poor appraisal reports a band rather than a number — you know you do not
  // know. The band is derived, never randomised.
  const spread = Math.round((trueValue * (100 - accuracy)) / 100);

  return [
    makeEvent(action, 'merchant.item.appraised', {
      itemId: item.id,
      itemName: item.name,
      rarity: item.rarity,
      accuracy,
      estimateLow: Math.max(1, trueValue - spread),
      estimateHigh: trueValue + spread,
      provenanceOrigin: item.provenance?.origin ?? null,
      provenanceFlags: item.provenance?.flags ?? [],
      exact: spread === 0,
    }),
  ];
}

// ── haggle ──────────────────────────────────────────────────────────────────

const HAGGLE_LIQUIDITY_COST = 5;

function haggleHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can haggle.');

  if (resource(actor, 'liquidity') < HAGGLE_LIQUIDITY_COST) {
    // The liquidity floor from the design: at 0 every haggle fails. You cannot
    // push on a price with nothing behind you.
    return reject(
      action,
      'no liquidity to push with',
      'Free up capital before contesting a price.',
      { required: HAGGLE_LIQUIDITY_COST, available: resource(actor, 'liquidity') },
    );
  }

  const targetId = action.targetIds?.[0];
  const target = targetId ? world.entities[targetId] : undefined;
  if (!target) return reject(action, 'haggle with whom?', 'haggle <npc-id>');

  adjust(actor, 'liquidity', -HAGGLE_LIQUIDITY_COST);

  // tongue vs their ledger, clamped. Deterministic — the same pairing always
  // yields the same margin, so a replay reproduces the price.
  const margin = Math.max(-15, Math.min(25, (actor.stats.tongue ?? 0) * 3 - (target.stats.ledger ?? 0) * 2));

  return [
    makeEvent(action, 'merchant.price.haggled', {
      counterparty: target.id,
      counterpartyName: target.name,
      marginPercent: margin,
      liquiditySpent: HAGGLE_LIQUIDITY_COST,
      won: margin > 0,
    }, { targetIds: [target.id] }),
  ];
}

// ── consign ─────────────────────────────────────────────────────────────────

function consignHandler(
  action: ActionIntent,
  world: WorldState,
  catalog: ItemCatalog,
  termTicks: number,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can consign.');

  // The seal is the licence. Without it you are cash-on-the-barrel only, which
  // is the Warrens' whole pitch — and the reason seizing the seal hurts.
  if (!holdsVerbGrantingItem(actor, catalog, 'consign')) {
    return reject(
      action,
      'no guild seal — nobody will hold goods against your word',
      'Register with the Assay Guild to consign.',
    );
  }

  if (resource(actor, 'lien') >= SEIZURE_THRESHOLD) {
    return reject(
      action,
      'too encumbered to consign — your lien is public',
      'Pay down what you owe before promising more.',
      { lien: resource(actor, 'lien'), threshold: SEIZURE_THRESHOLD },
    );
  }

  const ref = itemRefOf(action);
  if (!ref) {
    const carried = (actor.inventory ?? []).filter((id) => findItem(catalog, id));
    return reject(action, 'consign what?', 'consign <item-id>', { candidates: carried });
  }
  if (!(actor.inventory ?? []).includes(ref)) {
    return reject(action, `not carrying ${ref}`, 'You can only consign goods in hand.');
  }
  const item = findItem(catalog, ref);
  if (!item) return reject(action, `no such item: ${ref}`, 'consign <item-id>');

  const counterpartyId = action.targetIds?.[0];
  const counterparty = counterpartyId ? world.entities[counterpartyId] : undefined;
  if (!counterparty) return reject(action, 'consign to whom?', 'consign <item-id> <broker-id>');

  const state = mutable(world);
  const id = `obl-${state.nextId++}`;
  const value = baseValue(item);
  const dueTick = world.meta.tick + termTicks;

  // The goods LEAVE your hands now. That is the whole risk: you are holding a
  // promise instead of an object. Remove ONE unit — a factor carrying three
  // salt blocks and consigning one keeps two.
  const inventory = [...(actor.inventory ?? [])];
  inventory.splice(inventory.indexOf(ref), 1);
  actor.inventory = inventory;

  state.obligations.push({
    id,
    itemId: item.id,
    counterparty: counterparty.id,
    value,
    dueTick,
    issuedTick: world.meta.tick,
    status: 'open',
  });

  return [
    makeEvent(action, 'merchant.contract.consigned', {
      obligationId: id,
      itemId: item.id,
      itemName: item.name,
      counterparty: counterparty.id,
      counterpartyName: counterparty.name,
      value,
      dueTick,
      termTicks,
    }, { targetIds: [counterparty.id] }),
  ];
}

// ── underwrite ──────────────────────────────────────────────────────────────

function underwriteHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can underwrite.');

  const targetId = action.targetIds?.[0];
  const target = targetId ? world.entities[targetId] : undefined;
  if (!target) return reject(action, 'underwrite whose risk?', 'underwrite <npc-id>');

  if (resource(actor, 'lien') >= SEIZURE_THRESHOLD) {
    return reject(
      action,
      'nobody will accept your guarantee at this lien',
      'Pay down what you owe first.',
      { lien: resource(actor, 'lien') },
    );
  }

  // Premium scales with your standing — a well-vouched factor is worth paying.
  // Exposure scales with the premium: the better the fee, the worse the claim.
  const premium = 6 + (actor.stats.standing ?? 0) * 2;
  const exposure = premium * 2;

  const state = mutable(world);
  const id = `pol-${state.nextId++}`;
  state.underwritten.push({
    id,
    counterparty: target.id,
    premium,
    exposure,
    issuedTick: world.meta.tick,
    claimed: false,
  });

  adjust(actor, 'liquidity', premium, 100);

  return [
    makeEvent(action, 'merchant.risk.underwritten', {
      policyId: id,
      counterparty: target.id,
      counterpartyName: target.name,
      premium,
      exposure,
    }, { targetIds: [target.id] }),
  ];
}

// ── audit ───────────────────────────────────────────────────────────────────

function auditHandler(action: ActionIntent, world: WorldState, catalog: ItemCatalog): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can audit.');

  if (!holdsVerbGrantingItem(actor, catalog, 'audit')) {
    return reject(action, 'no ledger book to audit from', 'You need your ledger book in hand.');
  }

  const state = getContractState(world);
  const tick = world.meta.tick;
  const open = state.obligations.filter((o) => o.status === 'open');
  const overdue = open.filter((o) => tick > o.dueTick);
  const receivable = open.reduce((sum, o) => sum + o.value, 0);
  const exposure = state.underwritten
    .filter((p) => !p.claimed)
    .reduce((sum, p) => sum + p.exposure, 0);

  // The player-facing verifier. Engine-internal only — this reconciles the
  // factor's OWN books. A ledger driver hearing `merchant.audit.requested`
  // performs the on-chain reconcile separately, outside the tick.
  const discrepancies: string[] = [];
  for (const o of overdue) {
    discrepancies.push(`${o.id}: ${o.itemId} to ${o.counterparty} overdue by ${tick - o.dueTick} tick(s)`);
  }
  if (resource(actor, 'lien') >= SEIZURE_THRESHOLD) {
    discrepancies.push(`lien ${resource(actor, 'lien')} is at or past the seizure threshold ${SEIZURE_THRESHOLD}`);
  }

  return [
    makeEvent(action, 'merchant.audit.requested', {
      districtZoneId: actor.zoneId ?? null,
      openCount: open.length,
      overdueCount: overdue.length,
      receivable,
      underwritingExposure: exposure,
      coin: resource(actor, 'coin'),
      liquidity: resource(actor, 'liquidity'),
      lien: resource(actor, 'lien'),
      discrepancies,
      balanced: discrepancies.length === 0,
    }),
  ];
}

// ── The obligation clock: accrual, honour, default, seizure ─────────────────

/**
 * Advance the obligation clock one step and return the events it produced.
 *
 * Called off the world's own event stream (see `register`), never on a timer.
 * Every decision here is deterministic:
 *   - lien accrues by `overdueTicks * value / 10`, floored, per overdue item
 *   - an obligation honoured on time pays its value and clears
 *   - seizure at lien >= SEIZURE_THRESHOLD takes the obligation whose itemId
 *     sorts LOWEST, not the first in iteration order and not a random pick
 */
export function tickObligations(world: WorldState, tick: number): ResolvedEvent[] {
  const state = peek(world);
  if (!state || !Array.isArray(state.obligations) || state.obligations.length === 0) return [];

  const player = world.entities[world.playerId];
  if (!player) return [];

  const events: ResolvedEvent[] = [];
  const base = (type: string, payload: Record<string, unknown>): ResolvedEvent => ({
    id: '', tick, type, actorId: world.playerId, payload,
  });

  // The lien BEFORE any consequence lands this step. Both thresholds are
  // evaluated against this, not against the running value — otherwise the
  // ordering silently disables the more severe consequence: seizure at 70 eases
  // the lien, so a factor arriving at exactly 90 would drop to ~80 and the
  // revocation check below could NEVER fire. The thresholds are meant to
  // escalate (70 costs you an asset, 90 costs you the seal); at 90 both are
  // owed. Caught by the revocation test, which would otherwise have pinned an
  // unreachable branch as working.
  const lienAtEntry = resource(player, 'lien');

  // 1. Accrue lien on everything overdue.
  for (const o of state.obligations) {
    if (o.status !== 'open' || tick <= o.dueTick) continue;
    const overdueTicks = tick - o.dueTick;
    const accrual = Math.floor((overdueTicks * o.value) / 10);
    if (accrual <= 0) continue;
    const before = resource(player, 'lien');
    adjust(player, 'lien', accrual, 100);
    const after = resource(player, 'lien');
    if (after !== before) {
      events.push(base('merchant.lien.accrued', {
        obligationId: o.id, itemId: o.itemId, overdueTicks, accrued: after - before, lien: after,
      }));
    }
  }

  // 2. Seizure. Deterministic victim: lowest itemId among open obligations.
  if (lienAtEntry >= SEIZURE_THRESHOLD) {
    const open = state.obligations.filter((o) => o.status === 'open');
    if (open.length > 0) {
      const victim = [...open].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))[0];
      victim.status = 'seized';
      // Seizure eases the lien it was taken against — the Guild is collecting,
      // not punishing.
      adjust(player, 'lien', -Math.min(20, victim.value), 100);
      events.push(base('merchant.instrument.seized', {
        obligationId: victim.id, itemId: victim.itemId, value: victim.value, lien: resource(player, 'lien'),
      }));
    }
  }

  // 3. Revocation — the soft fail. Announced once, and gated on the ENTRY
  //    lien so step 2's collection cannot suppress it.
  if (lienAtEntry >= REVOCATION_THRESHOLD && !world.globals['seal-revoked']) {
    world.globals['seal-revoked'] = true;
    const held = (player.inventory ?? []).includes('guild-seal');
    if (held) player.inventory = (player.inventory ?? []).filter((i) => i !== 'guild-seal');
    events.push(base('merchant.seal.revoked', {
      lien: resource(player, 'lien'), threshold: REVOCATION_THRESHOLD, sealTaken: held,
    }));
  }

  return events;
}

/**
 * Honour an obligation: the counterparty pays, the factor is made whole.
 * Exported so quests/dialogue can resolve a specific contract; the module also
 * honours nothing automatically (a promise kept is a thing that happens TO you).
 */
export function honourObligation(world: WorldState, obligationId: string, tick: number): ResolvedEvent[] {
  const state = peek(world);
  const obligation = state?.obligations.find((o) => o.id === obligationId && o.status === 'open');
  if (!state || !obligation) return [];
  const player = world.entities[world.playerId];
  if (!player) return [];

  obligation.status = 'honoured';
  adjust(player, 'coin', obligation.value);
  adjust(player, 'liquidity', Math.floor(obligation.value / 2), 100);

  return [{
    id: '', tick, type: 'merchant.contract.honoured', actorId: world.playerId,
    payload: {
      obligationId: obligation.id,
      itemId: obligation.itemId,
      counterparty: obligation.counterparty,
      value: obligation.value,
      onTime: tick <= obligation.dueTick,
    },
  }];
}

/** Default an obligation: it lapses unpaid. Standing suffers; lien lands. */
export function defaultObligation(world: WorldState, obligationId: string, tick: number): ResolvedEvent[] {
  const state = peek(world);
  const obligation = state?.obligations.find((o) => o.id === obligationId && o.status === 'open');
  if (!state || !obligation) return [];
  const player = world.entities[world.playerId];
  if (!player) return [];

  obligation.status = 'defaulted';
  adjust(player, 'lien', Math.floor(obligation.value / 2), 100);

  return [{
    id: '', tick, type: 'merchant.contract.defaulted', actorId: world.playerId,
    payload: {
      obligationId: obligation.id,
      itemId: obligation.itemId,
      counterparty: obligation.counterparty,
      value: obligation.value,
      lien: resource(player, 'lien'),
    },
  }];
}

// ── The module ──────────────────────────────────────────────────────────────

/**
 * contract-core — obligations, liens, and the five commerce verbs.
 *
 * Registers `appraise`, `haggle`, `consign`, `underwrite`, `audit`, and drives
 * the obligation clock off the world's own event stream. Emits the checkpoint
 * event vocabulary a ledger driver can subscribe to, while knowing nothing
 * about ledgers.
 *
 * ── Checkpoint event vocabulary (the entire coupling surface) ───────────────
 *   merchant.books.opened        — registration complete (a driver's enable())
 *   merchant.contract.consigned  — obligation created (an escrow mirror)
 *   merchant.contract.honoured   — obligation paid (an escrow finish)
 *   merchant.contract.defaulted  — obligation lapsed (an escrow cancel)
 *   merchant.instrument.seized   — asset taken at the lien threshold (a burn)
 *   merchant.audit.requested     — the player ran the verifier
 *   merchant.lien.accrued        — pressure moved
 *   merchant.seal.revoked        — the soft fail
 *   merchant.item.appraised / merchant.price.haggled / merchant.risk.underwritten
 */
export function createContractCore(config: ContractCoreConfig): EngineModule {
  const termTicks = config.termTicks ?? DEFAULT_TERM_TICKS;

  return {
    id: 'contract-core',
    version: '1.0.0',
    dependsOn: ['status-core'],

    register(ctx) {
      ctx.actions.registerVerb('appraise', (action, world) => appraiseHandler(action, world, config.catalog));
      ctx.actions.registerVerb('haggle', (action, world) => haggleHandler(action, world));
      ctx.actions.registerVerb('consign', (action, world) => consignHandler(action, world, config.catalog, termTicks));
      ctx.actions.registerVerb('underwrite', (action, world) => underwriteHandler(action, world));
      ctx.actions.registerVerb('audit', (action, world) => auditHandler(action, world, config.catalog));

      // The obligation clock rides zone entry — the moment a factor moves is
      // the moment the world gets to notice what they owe. Deliberately NOT a
      // per-tick hook: there is no tick event to subscribe to (advanceTick only
      // increments meta.tick), and hanging this off movement keeps it on the
      // resolved event stream where replay reproduces it exactly.
      ctx.events.on('world.zone.entered', (event, world) => {
        for (const produced of tickObligations(world, event.tick)) {
          world.eventLog.push(produced);
        }
      });

      // NO registered namespace default. A world where nothing is ever
      // consigned never materialises world.modules['contract-core'] at all —
      // the npc-agency / item-chronicle-core contract, which keeps a pack that
      // merely INCLUDES this module byte-identical to one that does not until
      // the first obligation actually exists.
    },
  };
}
