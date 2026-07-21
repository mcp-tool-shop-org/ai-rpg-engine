// F1b — win / lose / ending. The engine could detect campaign resolutions
// (endgame-detection) and narrate a finale (campaign-memory/finale) but the
// CLI never called either: a player at 0 HP soft-locked in a prompt loop that
// rejected every action, and killing the boss printed one line and kept
// prompting. This module is the bridge:
//
//   detectBaseOutcome     — the two session-ending facts every pack has:
//                           player downed (defeat) / all bosses downed (victory)
//   evaluateSessionEnd    — base outcome + the campaign-layer resolution when
//                           evaluateEndgame's richer thresholds fire
//   renderSessionEnd      — end banner + narrator line + full finale epilogue
//
// The loop in bin.ts calls evaluateSessionEnd after every resolved action and
// ends the session cleanly (new game / quit) instead of looping forever.

import type { Engine, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import {
  evaluateEndgame,
  buildArcSnapshot,
  formatEndgameForNarrator,
  getCurrency,
  type EndgameInputs,
  type EndgameTrigger,
} from '@ai-rpg-engine/modules';
import {
  CampaignJournal,
  buildFinaleOutline,
  formatFinaleForTerminal,
  type FinaleNpcInput,
  type FinaleFactionInput,
} from '@ai-rpg-engine/campaign-memory';

export type SessionEndKind = 'defeat' | 'victory';

export type SessionEnd = {
  kind: SessionEndKind;
  /** Resolution label for the finale screen — campaign trigger's class when one fired, else defeat/victory. */
  resolutionClass: string;
  /** One-line narrator framing (formatEndgameForNarrator when a trigger fired). */
  narratorLine: string;
  /** The campaign-layer trigger, when evaluateEndgame's thresholds actually fired. */
  trigger: EndgameTrigger | null;
};

/**
 * The two base outcomes every pack supports, read straight from world state:
 *
 *  - defeat: the player entity is missing or downed (hp <= 0)
 *  - victory: the pack's bosses (`role:boss` + explicit-hostile tag) are all
 *    downed. Packs without a boss (external packs) fall back to "every hostile
 *    is downed" — with at least one hostile authored, so an empty pacifist
 *    pack is not an instant win.
 *
 * Defeat is checked first: dying to the boss's death throes is still dying.
 */
export function detectBaseOutcome(world: WorldState): SessionEndKind | null {
  const player = world.entities[world.playerId];
  if (!player || (player.resources.hp ?? 0) <= 0) return 'defeat';

  const hostiles = Object.values(world.entities).filter(
    (e) => e.id !== world.playerId && (e.tags.includes('enemy') || e.tags.includes('hostile')),
  );
  const bosses = hostiles.filter((e) => e.tags.includes('role:boss'));

  if (bosses.length > 0) {
    if (bosses.every((b) => (b.resources.hp ?? 0) <= 0)) return 'victory';
    return null;
  }
  if (hostiles.length > 0 && hostiles.every((e) => (e.resources.hp ?? 0) <= 0)) {
    return 'victory';
  }
  return null;
}

/**
 * Best-effort EndgameInputs from live world state. The starters wire a
 * fraction of the campaign layer (no leverage, pressures, or companions), so
 * the unavailable axes are passed as their empty/zero shapes — evaluateEndgame
 * simply finds those thresholds unmet. Faction alert/cohesion come from the
 * faction-cognition module when present; player reputation from world.factions.
 */
export function buildEndgameInputs(world: WorldState): EndgameInputs {
  const player = world.entities[world.playerId];
  const playerHp = player?.resources.hp ?? 0;
  const playerMaxHp = player?.resources.maxHp ?? Math.max(playerHp, 1);

  const factionCog = (world.modules['faction-cognition'] as
    | { factionCognition?: Record<string, { alertLevel?: number; cohesion?: number }> }
    | undefined)?.factionCognition ?? {};

  const factionIds = new Set<string>([
    ...Object.keys(world.factions ?? {}),
    ...Object.keys(factionCog),
  ]);

  const factionStates = [...factionIds].sort().map((factionId) => {
    const cog = factionCog[factionId];
    return {
      factionId,
      alertLevel: cog?.alertLevel ?? 0,
      // faction-cognition stores cohesion 0-1; endgame thresholds read 0-100.
      cohesion: Math.round((cog?.cohesion ?? 0.5) * 100),
    };
  });

  const playerReputations = Object.values(world.factions ?? {}).map((f) => ({
    factionId: f.id,
    value: f.reputation,
  }));

  const arcInputs = {
    factionStates,
    playerReputations,
    playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0 },
    activePressures: [],
    npcProfiles: [],
    npcObligations: new Map(),
    companions: [],
    districtEconomies: new Map(),
    activeOpportunities: [],
    resolvedPressures: [],
    resolvedOpportunities: [],
    playerHp,
    playerMaxHp,
    playerLevel: 1,
    totalTurns: world.meta.tick,
    currentTick: world.meta.tick,
  };

  return {
    ...arcInputs,
    arcSnapshot: buildArcSnapshot(arcInputs),
    playerHp,
    playerMaxHp,
    previousTriggers: [],
  };
}

/**
 * Decide whether the session is over, and how to frame it.
 *
 * The session ENDS only on a base outcome (player downed / bosses downed) —
 * campaign turning points alone don't stop play. When the campaign layer's
 * evaluateEndgame also fired (rich long-game state crossing its thresholds),
 * its resolution class + formatEndgameForNarrator line take over the framing;
 * otherwise the base outcome is framed plainly. The advisor runs guarded: a
 * throwing scorer can degrade the framing, never mask the ending.
 */
export function evaluateSessionEnd(engine: Engine): SessionEnd | null {
  const world = engine.world;
  const kind = detectBaseOutcome(world);
  if (!kind) return null;

  let trigger: EndgameTrigger | null = null;
  try {
    trigger = evaluateEndgame(buildEndgameInputs(world));
  } catch {
    trigger = null; // advisory only — never let scoring mask the ending itself
  }

  if (trigger) {
    return {
      kind,
      resolutionClass: trigger.resolutionClass,
      narratorLine: formatEndgameForNarrator(trigger),
      trigger,
    };
  }

  return {
    kind,
    resolutionClass: kind,
    narratorLine:
      kind === 'defeat'
        ? 'The world closes over the place where you fell. This story ends here.'
        : 'The last of what stood against you is down. This story is yours now.',
    trigger: null,
  };
}

// ---------------------------------------------------------------------------
// Session stats — the run in numbers
// ---------------------------------------------------------------------------

/** The finale's tally of the run, derived from the event log (see computeSessionStats). */
export type SessionStats = {
  /** Rounds survived — the engine's turn counter (world.meta.tick). */
  rounds: number;
  /** Hostiles downed (combat.entity.defeated, excluding the player and non-hostiles). */
  enemiesDefeated: number;
  /** Damage the player dealt (combat.damage.applied where the player attacked). */
  damageDealt: number;
  /** Damage the player took (combat.damage.applied on the player + DoT ticks). */
  damageTaken: number;
  /** Abilities the player used (ability.used with the player as actor). */
  abilitiesUsed: number;
  /** Total XP earned: final balance plus what unlock spends consumed. */
  xpEarned: number;
  /** Progression nodes the player unlocked (progression.node.unlocked). */
  unlocks: number;
};

/**
 * Tally the session from the events the engine actually emitted — the same
 * vocabulary the log renders (formatEventLine), no invented event types:
 *
 *  - enemiesDefeated: `combat.entity.defeated` for a non-player entity that is
 *    hostile by the scene list's convention (`enemy`/`hostile` tag). Entities
 *    already gone from world state still count (they were downed, not the player).
 *  - damageDealt/Taken: `combat.damage.applied` attributed via its
 *    attackerId/targetId payload; DoT ticks (`status.periodic.damage`, whose
 *    actor IS the afflicted entity) add to damage taken.
 *  - abilitiesUsed / unlocks: `ability.used` / `progression.node.unlocked`
 *    with the player as actor.
 *  - xpEarned: XP accrual emits NO event (progression-core's addCurrency is
 *    silent), so "earned" is reconstructed as the HUD's own balance authority
 *    (getCurrency, same as buildHudWorld) plus the cost of every unlocked node
 *    resolvable in the pack's trees — balance + spent = earned.
 */
export function computeSessionStats(
  world: WorldState,
  trees: ProgressionTreeDefinition[] = [],
): SessionStats {
  const playerId = world.playerId;
  const stats: SessionStats = {
    rounds: world.meta.tick,
    enemiesDefeated: 0,
    damageDealt: 0,
    damageTaken: 0,
    abilitiesUsed: 0,
    xpEarned: 0,
    unlocks: 0,
  };

  // Same currency authority as the HUD (buildHudWorld): first tree's currency,
  // 'xp' when no trees are wired.
  const currencyId = trees[0]?.currency ?? 'xp';
  const nodeCost = new Map<string, number>();
  for (const tree of trees) {
    if (tree.currency !== currencyId) continue;
    for (const node of tree.nodes) nodeCost.set(`${tree.id} ${node.id}`, node.cost);
  }

  let xpSpent = 0;
  for (const event of world.eventLog as ResolvedEvent[]) {
    const p = event.payload;
    switch (event.type) {
      case 'combat.entity.defeated': {
        const id = typeof p.entityId === 'string' ? p.entityId : undefined;
        if (!id || id === playerId) break;
        const entity = world.entities[id];
        if (!entity || entity.tags.includes('enemy') || entity.tags.includes('hostile')) {
          stats.enemiesDefeated++;
        }
        break;
      }
      case 'combat.damage.applied': {
        const damage = typeof p.damage === 'number' ? p.damage : 0;
        if (p.attackerId === playerId) stats.damageDealt += damage;
        if (p.targetId === playerId) stats.damageTaken += damage;
        break;
      }
      case 'status.periodic.damage': {
        if (event.actorId === playerId && typeof p.amount === 'number') {
          stats.damageTaken += p.amount;
        }
        break;
      }
      case 'ability.used': {
        if (event.actorId === playerId) stats.abilitiesUsed++;
        break;
      }
      case 'progression.node.unlocked': {
        if (event.actorId !== playerId) break;
        stats.unlocks++;
        if (typeof p.treeId === 'string' && typeof p.nodeId === 'string') {
          xpSpent += nodeCost.get(`${p.treeId} ${p.nodeId}`) ?? 0;
        }
        break;
      }
    }
  }

  stats.xpEarned = getCurrency(world, playerId, currencyId) + xpSpent;
  return stats;
}

const STATS_RULE = '─'.repeat(60);

/** The stats block for the finale screen, in the epilogue's section style. */
export function renderSessionStats(stats: SessionStats): string {
  const lines: string[] = [];
  lines.push(`  ${STATS_RULE}`);
  lines.push('  THE RUN IN NUMBERS');
  lines.push(`  ${STATS_RULE}`);
  lines.push('');
  lines.push(`  Rounds Survived: ${stats.rounds}`);
  lines.push(`  Enemies Defeated: ${stats.enemiesDefeated}`);
  lines.push(`  Damage Dealt: ${stats.damageDealt}`);
  lines.push(`  Damage Taken: ${stats.damageTaken}`);
  lines.push(`  Abilities Used: ${stats.abilitiesUsed}`);
  lines.push(`  XP Earned: ${stats.xpEarned}`);
  lines.push(`  Advancements Unlocked: ${stats.unlocks}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Finale rendering
// ---------------------------------------------------------------------------

/**
 * Rebuild a campaign journal from the engine's event log so the finale has
 * key moments to narrate. The CLI keeps no live journal; kills, zone
 * discoveries, and progression unlocks are the signal worth replaying.
 */
export function journalFromEventLog(world: WorldState): CampaignJournal {
  const journal = new CampaignJournal();
  const nameOf = (id: unknown): string =>
    typeof id === 'string' ? world.entities[id]?.name ?? id : 'someone';

  const seenZones = new Set<string>();

  for (const event of world.eventLog as ResolvedEvent[]) {
    if (event.type === 'combat.entity.defeated') {
      const defeatedId = event.payload.entityId as string | undefined;
      if (!defeatedId) continue;
      const boss = world.entities[defeatedId]?.tags.includes('role:boss') ?? false;
      journal.record({
        tick: event.tick,
        category: 'kill',
        actorId: event.actorId ?? world.playerId,
        targetId: defeatedId,
        description: `${nameOf(event.actorId)} defeated ${nameOf(defeatedId)}${boss ? ' — the boss falls' : ''}`,
        significance: boss ? 1.0 : 0.7,
        witnesses: [],
        data: {},
      });
    } else if (event.type === 'world.zone.entered' && event.actorId === world.playerId) {
      const zoneId = event.payload.zoneId as string | undefined;
      if (!zoneId || seenZones.has(zoneId)) continue;
      seenZones.add(zoneId);
      journal.record({
        tick: event.tick,
        category: 'discovery',
        actorId: world.playerId,
        zoneId,
        description: `Entered ${world.zones[zoneId]?.name ?? zoneId}`,
        significance: 0.3,
        witnesses: [],
        data: {},
      });
    } else if (event.type === 'progression.node.unlocked') {
      journal.record({
        tick: event.tick,
        category: 'action',
        actorId: event.actorId ?? world.playerId,
        description: `Unlocked ${String(event.payload.nodeId ?? 'an advancement')}`,
        significance: 0.5,
        witnesses: [],
        data: {},
      });
    }
  }

  return journal;
}

const END_RULE = '═'.repeat(60);

/**
 * The full end screen: banner, narrator line, the run's stats tally
 * (computeSessionStats — the audit's "Chronicle Events: 2" finale was too
 * thin a goodbye), then the finale epilogue (campaign-memory
 * buildFinaleOutline → formatFinaleForTerminal) with NPC and faction fates
 * derived from live world state. `trees` (the pack's progression trees)
 * sharpens the XP tally; omitted, XP falls back to the raw balance.
 */
export function renderSessionEnd(
  end: SessionEnd,
  world: WorldState,
  trees: ProgressionTreeDefinition[] = [],
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${END_RULE}`);
  lines.push(`  ${end.kind === 'victory' ? 'VICTORY' : 'DEFEAT'}`);
  lines.push(`  ${END_RULE}`);
  lines.push('');
  lines.push(`  ${end.narratorLine}`);
  lines.push('');
  lines.push(renderSessionStats(computeSessionStats(world, trees)));

  const npcs: FinaleNpcInput[] = Object.values(world.entities)
    .filter((e) => e.id !== world.playerId && (e.tags.includes('npc') || e.tags.includes('enemy')))
    .map((e) => ({
      npcId: e.id,
      name: e.name,
      breakpoint: e.tags.includes('enemy') ? 'hostile' : 'neutral',
      isCompanion: e.tags.includes('companion') || e.tags.includes('ally'),
    }));

  const inputs = buildEndgameInputs(world);
  const factions: FinaleFactionInput[] = inputs.factionStates.map((f) => ({
    factionId: f.factionId,
    playerReputation:
      inputs.playerReputations.find((r) => r.factionId === f.factionId)?.value ?? 0,
    alertLevel: f.alertLevel,
    cohesion: f.cohesion,
  }));

  const outline = buildFinaleOutline(
    end.resolutionClass,
    end.trigger?.dominantArc ?? null,
    journalFromEventLog(world),
    npcs,
    factions,
    [], // districts: starters don't wire district economies into world state
    world.meta.tick,
  );

  lines.push(formatFinaleForTerminal(outline));
  return lines.join('\n');
}
