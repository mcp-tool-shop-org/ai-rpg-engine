// pursuit-core — the six verbs behind Hue and Cry, and the pursuit state.
//
// PACK-LOCAL BY DESIGN, for the reason contract-core states in its own header
// (DECOMPOSE_BY_SECRETS: one consumer, no promotion until there are two). If a
// second pack wants thief-taking, that is the moment to lift it.
//
// ── THE DOCTRINE THIS IS BUILT ON, NOT AROUND ───────────────────────────────
// world-tick's heat contract is untouchable and this pack is authored WITH it:
// heat decides whether the world is paying attention RIGHT NOW and drains on
// quiet; reputation and faction alert are memory and do not. Nothing here
// writes a parallel pursuit clock. `pursuitState` is a pure DERIVATION over
// those two existing numbers, and `lay-low` is the doctrine expressed as a
// player verb — the quiet the engine already rewards, made choosable.
//
// ── RG-4, THE PARTS THAT BECAME CODE ────────────────────────────────────────
//   Rockstar 2013 (GTA V wanted levels): evasion has to be a legible state
//     machine with visible transitions. → HUNTED / SEARCHED / COLD, named, with
//     the trigger for every transition reported in the event payload.
//   DCSS 2021 (the Zot clock): a hidden pursuit clock reads as unfair; the fix
//     was making it deterministic and numerically visible. → every number here
//     is derived from world state and printed, and lying low is never punished.
//   Švelch 2020 (Should the Monster Play Fair?): players accept pursuit that
//     follows learnable rules. → the thresholds are constants, exported, and
//     shown.
//   CCP/EVE (bounties removed 2020): a bounty that grants the hunter no rights
//     and verifies no kill becomes wallpaper. → `collar` requires warrant and
//     produces a VERIFIED taking; `impeach` is what converts it to payment.
//     Neither is a damage roll with a payout attached.
//   Rare 2020 (Sea of Thieves emissaries): opt-in wager — visible status for
//     multiplied reward. → `informant` buys the location AND tells the street
//     you are looking; `post-bounty` spends your own legal cover to make your
//     grudge into other people's work.
//
// ── DETERMINISM ─────────────────────────────────────────────────────────────
// No Math.random, no Date.now, no wall clock. Prices are pure functions of
// world state. Sorting is by id everywhere a choice is made among several.

import type { ActionIntent, EngineModule, EntityState, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import { getActivePressures } from '@ai-rpg-engine/modules';

/** Persisted namespace key (world.modules[PURSUIT_STATE_KEY]). */
export const PURSUIT_STATE_KEY = 'pursuit-core';

// --- The pursuit state machine ---------------------------------------------

/**
 * Where you stand with the cry, in three words a player can hold in their head.
 *
 * COLD      nobody is looking. Work is cheap and doors open.
 * SEARCHED  someone raised the cry and it has not died yet. Faces turn.
 * HUNTED    the cry is up and a faction is actively moving on it.
 */
export type PursuitState = 'COLD' | 'SEARCHED' | 'HUNTED';

/** Heat at or above this and the cry has been raised. Below it, nobody looks. */
export const SEARCHED_HEAT = 10;
/**
 * Heat at or above this — OR a faction alert at or above ALERT_HUNTED — and
 * you are being actively pursued.
 *
 * 25 is not a new number: it is world-tick's own HEAT_ESCALATION_THRESHOLD, the
 * point the engine already treats as "sustained violence sharpens every active
 * pressure". Re-deriving a different one would have given the player two
 * pursuit clocks that disagree.
 */
export const HUNTED_HEAT = 25;
/** Faction alert at or above this counts as active pursuit regardless of heat. */
export const ALERT_HUNTED = 60;

/** The player's current heat — world-tick's own global, read not written. */
export function currentHeat(world: WorldState): number {
  const value = world.globals['player_heat'];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The highest alert any faction currently holds against the player. */
export function highestAlert(world: WorldState): { factionId: string; level: number } | undefined {
  let best: { factionId: string; level: number } | undefined;
  for (const key of Object.keys(world.globals).sort()) {
    if (!key.startsWith('faction_alert_')) continue;
    const level = Number(world.globals[key] ?? 0);
    if (!Number.isFinite(level)) continue;
    if (!best || level > best.level) {
      best = { factionId: key.slice('faction_alert_'.length), level };
    }
  }
  return best;
}

/**
 * Derive the pursuit state, and the ONE thing that put you there.
 *
 * The reason is not decoration. Švelch's finding is that pursuit reads as fair
 * when it follows learnable rules, and a state with no stated cause is not a
 * rule the player can learn — it is a mood. Every transition this pack narrates
 * carries the number that caused it.
 */
export function pursuitState(world: WorldState): { state: PursuitState; because: string } {
  const heat = currentHeat(world);
  const alert = highestAlert(world);

  if (alert && alert.level >= ALERT_HUNTED) {
    return {
      state: 'HUNTED',
      because: `${alert.factionId} is at alert ${alert.level} (${ALERT_HUNTED}+ is active pursuit)`,
    };
  }
  if (heat >= HUNTED_HEAT) {
    return { state: 'HUNTED', because: `heat ${heat} (${HUNTED_HEAT}+ is active pursuit)` };
  }
  if (heat >= SEARCHED_HEAT) {
    return { state: 'SEARCHED', because: `heat ${heat} (${SEARCHED_HEAT}+ and the cry is up)` };
  }
  return { state: 'COLD', because: `heat ${heat} — nobody is looking` };
}

/** Player-facing line for the pursuit state. Shown, per DCSS's Zot lesson. */
export function formatPursuitForNarrator(world: WorldState): string {
  const { state, because } = pursuitState(world);
  const gloss = state === 'HUNTED'
    ? 'The cry is up and somebody is walking it down.'
    : state === 'SEARCHED'
      ? 'Somebody raised the cry. Faces turn when you pass.'
      : 'Nobody is looking for you today.';
  return `[${state}] ${gloss} (${because})`;
}

// --- Persisted state -------------------------------------------------------

export type MarkRecord = {
  /** The entity taken. */
  entityId: string;
  /** Tick of the collar. */
  takenAtTick: number;
  /** True once `impeach` has converted the taking into a conviction. */
  convicted: boolean;
};

export type PursuitModuleState = {
  /** Marks collared, oldest first. The office pays against this list. */
  marks: MarkRecord[];
  /** Names this thief-taker has posted a price on, sorted. */
  posted: string[];
  /** Whereabouts bought from informants, keyed by mark id. */
  words: Record<string, string>;
  /** The last pursuit state narrated, so transitions can be detected. */
  lastState?: PursuitState;
};

function freshState(): PursuitModuleState {
  return { marks: [], posted: [], words: {} };
}

/** Non-attaching read. Absent namespace → an empty state, never a write. */
export function getPursuitState(world: WorldState): PursuitModuleState {
  const ns = world.modules[PURSUIT_STATE_KEY];
  if (!ns || typeof ns !== 'object' || Array.isArray(ns)) return freshState();
  const typed = ns as Partial<PursuitModuleState>;
  return {
    marks: Array.isArray(typed.marks) ? typed.marks : [],
    posted: Array.isArray(typed.posted) ? typed.posted : [],
    words: typed.words && typeof typed.words === 'object' ? typed.words : {},
    ...(typed.lastState ? { lastState: typed.lastState } : {}),
  };
}

function setPursuitState(world: WorldState, state: PursuitModuleState): void {
  world.modules[PURSUIT_STATE_KEY] = state;
}

// --- Prices, all pure functions of world state ------------------------------

/** Base coin a word costs before the street's read of you is applied. */
export const INFORMANT_BASE_PRICE = 12;
/**
 * The street charges strangers more. At infamy 0 a word costs double base; at
 * 100 it costs half. Linear, deterministic, and printed in the rejection when
 * you cannot afford it — the player should never wonder what a word costs.
 */
export function informantPrice(infamy: number): number {
  const clamped = Math.min(100, Math.max(0, infamy));
  return Math.max(1, Math.round(INFORMANT_BASE_PRICE * (2 - clamped / 100)));
}

/** Warrant a lawful taking spends. Below this, `collar` is refused. */
export const COLLAR_WARRANT_COST = 10;
/** Warrant posting your own price on a name costs. */
export const POST_BOUNTY_WARRANT_COST = 15;
/** Warrant a conviction returns — testifying is how the office restocks you. */
export const IMPEACH_WARRANT_GAIN = 20;
/** Infamy a fenced lot buys you with the other half of the city. */
export const FENCE_INFAMY_GAIN = 6;
/** Infamy testifying costs you. The street remembers who talks. */
export const IMPEACH_INFAMY_COST = 8;
/** Infamy a bought word costs you — asking around is itself a signal. */
export const INFORMANT_INFAMY_GAIN = 3;
/** Heat a day out of sight sheds. */
export const LAY_LOW_HEAT_RELIEF = 6;
/** Stamina a day out of sight restores — lying low is rest, not limbo. */
export const LAY_LOW_STAMINA_GAIN = 6;

// --- Helpers ---------------------------------------------------------------

function reject(action: ActionIntent, reason: string, hint: string, extra?: Record<string, unknown>): ResolvedEvent[] {
  return [{
    id: `${action.actorId}-${action.verb}-rejected`,
    type: 'action.rejected',
    tick: 0,
    actorId: action.actorId,
    payload: { verb: action.verb, reason, hint, ...extra },
  } as unknown as ResolvedEvent];
}

function event(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
): ResolvedEvent {
  return {
    id: `${action.actorId}-${type}`,
    type,
    tick: 0,
    actorId: action.actorId,
    payload,
    presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
  } as unknown as ResolvedEvent;
}

function resource(entity: EntityState, id: string): number {
  const value = entity.resources?.[id];
  return typeof value === 'number' ? value : 0;
}

function adjust(entity: EntityState, id: string, delta: number, min = 0, max = 100): void {
  entity.resources = {
    ...(entity.resources ?? {}),
    [id]: Math.min(max, Math.max(min, resource(entity, id) + delta)),
  };
}

/** Everyone in the actor's zone who is not the actor. */
function coLocated(world: WorldState, actor: EntityState): EntityState[] {
  return Object.values(world.entities)
    .filter((e) => e.id !== actor.id && e.zoneId === actor.zoneId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// --- The six verbs ---------------------------------------------------------

/**
 * `collar` — take a mark alive under warrant.
 *
 * The EVE lesson in one handler: a bounty that verifies nothing is wallpaper.
 * This does not roll damage and pay out. It requires legal cover, requires the
 * mark to be genuinely beaten down first, and produces a RECORD — which is the
 * thing `impeach` later converts into money and standing. Taking someone is
 * not the same as being paid for them, and the pack refuses to blur that.
 */
function collarHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can collar a mark.');

  const targetId = action.targetIds?.[0] ?? action.toolId;
  if (!targetId) {
    return reject(action, 'no mark named', 'collar <mark> — name who you are taking.');
  }
  const target = world.entities[targetId];
  if (!target || target.zoneId !== actor.zoneId) {
    return reject(action, `${targetId} is not here`, 'You have to be standing over them.', { targetId });
  }

  const warrant = resource(actor, 'warrant');
  if (warrant < COLLAR_WARRANT_COST) {
    return reject(
      action,
      `not enough warrant (${warrant}/${COLLAR_WARRANT_COST})`,
      'Without legal cover this is not a taking, it is an assault. Impeach a mark you already hold to restock.',
      { targetId, warrant, required: COLLAR_WARRANT_COST },
    );
  }

  // ALIVE, and barely standing. A mark at full strength is not collared, they
  // are fought — which is the loud, expensive path this verb exists to avoid.
  const hp = resource(target, 'hp');
  const maxHp = resource(target, 'maxHp') || hp;
  if (hp <= 0) {
    return reject(action, `${target.name} is dead`, 'The office pays for people, not bodies.', { targetId });
  }
  if (maxHp > 0 && hp > Math.ceil(maxHp / 2)) {
    return reject(
      action,
      `${target.name} is still on their feet (${hp}/${maxHp})`,
      'Wear them down first. A collar is what you do to someone who has stopped running.',
      { targetId, hp, maxHp },
    );
  }

  const state = getPursuitState(world);
  if (state.marks.some((m) => m.entityId === targetId && !m.convicted)) {
    return reject(action, `${target.name} is already in hand`, 'Impeach them before taking another.', { targetId });
  }

  adjust(actor, 'warrant', -COLLAR_WARRANT_COST);
  setPursuitState(world, {
    ...state,
    marks: [...state.marks, { entityId: targetId, takenAtTick: world.meta.tick, convicted: false }],
  });

  return [event(action, 'pursuit.mark.collared', {
    markId: targetId,
    markName: target.name,
    warrantSpent: COLLAR_WARRANT_COST,
    warrantRemaining: resource(actor, 'warrant'),
  })];
}

/**
 * `impeach` — testify against a mark you took.
 *
 * The conversion step, and the one that makes the double life cost something.
 * A conviction pays warrant (the office trusts a thief-taker who follows
 * through) and costs infamy (the street watches who talks). You cannot have
 * both halves of this city.
 */
function impeachHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can testify.');

  const state = getPursuitState(world);
  const targetId = action.targetIds?.[0] ?? action.toolId;
  const held = state.marks.filter((m) => !m.convicted);
  const mark = targetId
    ? held.find((m) => m.entityId === targetId)
    : [...held].sort((a, b) => a.takenAtTick - b.takenAtTick)[0];

  if (!mark) {
    return reject(
      action,
      targetId ? `you are not holding ${targetId}` : 'you are holding nobody',
      'Collar a mark before you testify against them.',
      ...(targetId ? [{ targetId }] : []),
    );
  }

  const name = world.entities[mark.entityId]?.name ?? mark.entityId;
  adjust(actor, 'warrant', IMPEACH_WARRANT_GAIN);
  adjust(actor, 'infamy', -IMPEACH_INFAMY_COST);
  setPursuitState(world, {
    ...state,
    marks: state.marks.map((m) => (m.entityId === mark.entityId ? { ...m, convicted: true } : m)),
  });

  return [event(action, 'pursuit.mark.convicted', {
    markId: mark.entityId,
    markName: name,
    heldForTicks: world.meta.tick - mark.takenAtTick,
    warrantGained: IMPEACH_WARRANT_GAIN,
    infamyLost: IMPEACH_INFAMY_COST,
  })];
}

/**
 * `informant` — buy a mark's whereabouts.
 *
 * The opt-in wager (Sea of Thieves' emissary trade, at street scale): you get
 * the location, and the street learns you are looking. Price is a printed
 * function of your own standing with them, so a player can always answer "why
 * did that cost that".
 */
function informantHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can buy a word.');

  const targetId = action.targetIds?.[0] ?? action.toolId;
  if (!targetId) {
    return reject(action, 'no mark named', 'informant <mark> — name who you are asking after.');
  }

  const price = informantPrice(resource(actor, 'infamy'));
  const coin = resource(actor, 'coin');
  if (coin < price) {
    return reject(
      action,
      `a word on that name costs ${price} and you have ${coin}`,
      'The street charges strangers more. Fence something, or become better known down here.',
      { targetId, price, coin },
    );
  }

  const mark = world.entities[targetId];
  const whereabouts = mark?.zoneId ?? 'nobody has seen them';

  adjust(actor, 'coin', -price, 0, 9999);
  adjust(actor, 'infamy', INFORMANT_INFAMY_GAIN);
  const state = getPursuitState(world);
  setPursuitState(world, { ...state, words: { ...state.words, [targetId]: whereabouts } });

  return [event(action, 'pursuit.word.bought', {
    markId: targetId,
    markName: mark?.name ?? targetId,
    whereabouts,
    price,
    infamyGained: INFORMANT_INFAMY_GAIN,
  })];
}

/**
 * `post-bounty` — put your own price on a name.
 *
 * Spends warrant, because posting a price is an exercise of the standing the
 * office lends you. The Wild texture: a thief-taker who can post bounties is
 * running a business, not doing a job.
 */
function postBountyHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can post a price.');

  const targetId = action.targetIds?.[0] ?? action.toolId;
  if (!targetId) {
    return reject(action, 'no name given', 'post-bounty <name> — whose head are you pricing?');
  }

  const warrant = resource(actor, 'warrant');
  if (warrant < POST_BOUNTY_WARRANT_COST) {
    return reject(
      action,
      `not enough warrant (${warrant}/${POST_BOUNTY_WARRANT_COST})`,
      'The office lends its name to thief-takers in good standing. Bring in a conviction first.',
      { targetId, warrant, required: POST_BOUNTY_WARRANT_COST },
    );
  }

  const state = getPursuitState(world);
  if (state.posted.includes(targetId)) {
    return reject(action, `there is already a price on ${targetId}`, 'One price per name.', { targetId });
  }

  adjust(actor, 'warrant', -POST_BOUNTY_WARRANT_COST);
  setPursuitState(world, { ...state, posted: [...state.posted, targetId].sort() });

  return [event(action, 'pursuit.bounty.posted', {
    markId: targetId,
    markName: world.entities[targetId]?.name ?? targetId,
    warrantSpent: POST_BOUNTY_WARRANT_COST,
  })];
}

/**
 * `fence` — move recovered goods through the crooked market.
 *
 * Coin now, and the underworld counts you a friend. The mirror of `impeach`:
 * every run of this pack is a series of small votes about which half of the
 * city you belong to, and these two verbs are where the vote is cast.
 */
function fenceHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can fence.');

  const itemId = action.toolId ?? action.targetIds?.[0];
  if (!itemId) {
    return reject(action, 'nothing named', 'fence <item> — what are you moving?');
  }
  const inventory = actor.inventory ?? [];
  if (!inventory.includes(itemId)) {
    return reject(action, `you are not carrying ${itemId}`, 'You can only fence what is in your hands.', { itemId });
  }

  // A fence needs a fence. Someone unbonded has to be standing here.
  const buyer = coLocated(world, actor).find((e) => e.tags.includes('fence'));
  if (!buyer) {
    return reject(
      action,
      'nobody here buys quietly',
      'Find the crooked market. A fence is a person, not a menu.',
      { itemId },
    );
  }

  // Price is deterministic: the crooked market pays a flat, poor rate, and the
  // point is the infamy, not the coin. A player who fences for money is doing
  // it wrong and the numbers should say so.
  const paid = 8;
  actor.inventory = inventory.filter((i) => i !== itemId);
  adjust(actor, 'coin', paid, 0, 9999);
  adjust(actor, 'infamy', FENCE_INFAMY_GAIN);

  return [event(action, 'pursuit.goods.fenced', {
    itemId,
    buyerId: buyer.id,
    buyerName: buyer.name,
    paid,
    infamyGained: FENCE_INFAMY_GAIN,
  })];
}

/**
 * `lay-low` — spend a day out of sight.
 *
 * The heat doctrine as a VERB. The engine already drains heat on quiet rounds
 * (QUIET_ROUNDS_BEFORE_DECAY, HEAT_DECAY_PER_QUIET_TICK); this makes that
 * choosable instead of merely available, which is Booth's relax valley handed
 * to the player. Refused when there is nothing to hide from — a verb that
 * always "works" teaches nothing about when it matters.
 */
function layLowHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return reject(action, 'actor not found', 'Only a live entity can lie low.');

  const before = pursuitState(world);
  if (before.state === 'COLD') {
    return reject(
      action,
      'nobody is looking for you',
      'Lying low costs a day. Spend it when the cry is actually up.',
      { pursuit: before.state, because: before.because },
    );
  }

  const heat = currentHeat(world);
  world.globals['player_heat'] = Math.max(0, heat - LAY_LOW_HEAT_RELIEF);
  adjust(actor, 'stamina', LAY_LOW_STAMINA_GAIN, 0, 40);

  const after = pursuitState(world);
  const state = getPursuitState(world);
  setPursuitState(world, { ...state, lastState: after.state });

  return [event(action, 'pursuit.state.changed', {
    from: before.state,
    to: after.state,
    // The named trigger every transition carries — GTA V's visible state
    // machine, and Švelch's learnable rule.
    trigger: 'lay-low',
    heatBefore: heat,
    heatAfter: currentHeat(world),
    because: after.because,
  })];
}

// --- Module ----------------------------------------------------------------

export type PursuitCoreConfig = {
  /** Ids treated as lawful marks — the office will pay for these. */
  wantedIds?: string[];
};

/**
 * The pack's own module. Registers six verbs and NO namespace default: a run
 * in which nothing is ever collared, posted, bought or fenced never
 * materialises `world.modules['pursuit-core']` at all, so a world that merely
 * INCLUDES this module is byte-identical to one that does not. Same contract
 * contract-core states for itself.
 */
export function createPursuitCore(config: PursuitCoreConfig = {}): EngineModule {
  void config;
  return {
    id: 'pursuit-core',
    version: '1.0.0',
    dependsOn: ['status-core'],

    register(ctx) {
      ctx.actions.registerVerb('collar', collarHandler);
      ctx.actions.registerVerb('impeach', impeachHandler);
      ctx.actions.registerVerb('informant', informantHandler);
      ctx.actions.registerVerb('post-bounty', postBountyHandler);
      ctx.actions.registerVerb('fence', fenceHandler);
      ctx.actions.registerVerb('lay-low', layLowHandler);
    },
  };
}

/**
 * Pressures currently bearing on the player, for the Director's pursuit line.
 * Reads world-tick's own accessor — this pack adds no pressure store.
 */
export function pursuingPressureCount(world: WorldState): number {
  return getActivePressures(world).length;
}
