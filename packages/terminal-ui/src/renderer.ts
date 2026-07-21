// Terminal renderer — scene, event log, command display
//
// Stage D visual system (one coherent layer, built on Stage C's event work):
//   - Labeled section rules — `── Town Square ────…`, `── Status ────…`,
//     `── Log ────…`, `── Actions ────…` — frame each block so the screen
//     scans top-to-bottom: where am I, how am I, what happened, what can I do.
//   - HUD: `HP 12/20 [######----]` — plain-text bar plus a `(low)` marker at
//     ≤25%. Bars and colors are always redundant; the numbers carry the truth.
//   - One shared action-list builder feeds BOTH renderActions and
//     parseActionSelection, so the menu the player sees and the numbers the
//     parser accepts can never drift apart again.
//   - Optional ANSI color via styles.ts. Auto-detected (interactive TTY
//     only), disabled by NO_COLOR / piped output / TERM=dumb, forceable per
//     call via { color }. Stripping the codes yields the byte-identical
//     plain screen (tested), so nothing is ever communicated by color alone.

import type { WorldState, ResolvedEvent, EntityState, ScalarValue } from '@ai-rpg-engine/core';
import { detectColorEnabled, makePalette, type Palette } from './styles.js';

/** Visible width of every rule line the renderer emits. */
export const SCREEN_WIDTH = 60;
const RULE_CHAR = '─';

/** Below this fraction of max HP the HUD appends a plain-text `(low)` marker. */
const LOW_HP_RATIO = 0.25;

/** Per-call render options. Omitted fields fall back to auto-detection. */
export type RenderOptions = {
  /**
   * Explicit color override. Omitted → auto-detect via detectColorEnabled():
   * color only on an interactive TTY, never when NO_COLOR is set, never when
   * output is piped or captured.
   */
  color?: boolean;
};

function paletteFor(opts?: RenderOptions): Palette {
  return makePalette(opts?.color ?? detectColorEnabled());
}

/** A full-width plain rule (screen closer, unlabeled separators). */
function rule(pal: Palette): string {
  return pal.dim(RULE_CHAR.repeat(SCREEN_WIDTH));
}

/**
 * A labeled section rule: `── Label ───────…` padded to SCREEN_WIDTH visible
 * characters. The label is bold, the rule dim — the label carries the
 * information; the weight difference is only emphasis.
 */
function sectionRule(label: string, pal: Palette): string {
  const fill = Math.max(0, SCREEN_WIDTH - 4 - label.length);
  return pal.dim(`${RULE_CHAR}${RULE_CHAR} `) + pal.bold(label) + pal.dim(` ${RULE_CHAR.repeat(fill)}`);
}

/**
 * CS-C amend (medium): raw machine ids leaked straight into the HUD —
 * "Status: engagement:isolated", "[combat:fleeing]" — the player was reading
 * module-internal state keys. Humanize: strip the `namespace:` prefix, split
 * on `_`/`-`, and title-case each word (combat:off_balance → "Off Balance",
 * engagement:isolated → "Isolated", burning → "Burning").
 */
export function humanizeStateId(id: string): string {
  const base = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return base
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Resolve an entity's maximum for a resource, following the engine
 * convention (see ability-intent.ts): `resources.maxHp` first, then the
 * legacy `stats.maxHp` fallback. Returns undefined when the world simply
 * doesn't track a max — the HUD then shows the bare current value and never
 * invents a denominator.
 */
function maxOf(entity: EntityState, resource: string): number | undefined {
  const key = `max${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
  const value = entity.resources[key] ?? entity.stats[key];
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/**
 * Plain-text meter: `[######----]`. Two readability clamps: an alive entity
 * never shows a fully empty bar (1 HP of 100 still shows one tick), and a
 * damaged entity never shows a fully full bar (19/20 shows nine ticks) — the
 * bar always agrees with the question "am I untouched / am I about to die?".
 * Purely decorative reinforcement: the `cur/max` numbers next to it are the
 * source of truth.
 */
export function textBar(current: number, max: number, width = 10): string {
  if (!(max > 0) || width <= 0) return '';
  const clamped = Math.max(0, Math.min(current, max));
  let filled = Math.round((clamped / max) * width);
  if (clamped > 0 && filled === 0) filled = 1;
  if (clamped < max && filled === width) filled = width - 1;
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

/** Color the HP bar by remaining fraction — redundant with the numbers. */
function paintedBar(current: number, max: number, pal: Palette): string {
  const bar = textBar(current, max);
  const ratio = max > 0 ? current / max : 0;
  if (ratio <= LOW_HP_RATIO) return pal.red(bar);
  if (ratio <= 0.5) return pal.yellow(bar);
  return pal.green(bar);
}

type EntityKind = 'enemy' | 'ally' | 'npc' | 'item' | 'other';

/**
 * Classify an entity for the scene list. Explicit hostility (the `enemy`
 * tag) wins over everything; party membership comes from the `ally` /
 * `companion` tags. Faction is deliberately NOT used here — factions define
 * combat sides, not who travels with you.
 */
function entityKind(entity: EntityState): EntityKind {
  if (entity.tags.includes('enemy')) return 'enemy';
  if (entity.tags.includes('ally') || entity.tags.includes('companion')) return 'ally';
  if (entity.tags.includes('npc')) return 'npc';
  if (entity.tags.includes('item')) return 'item';
  return 'other';
}

const ENTITY_ICONS: Record<EntityKind, string> = {
  enemy: '!',
  ally: '+',
  npc: '?',
  item: '*',
  other: '-',
};

/**
 * One scene line per entity: `! Wolf · HP 8/10 · Off Balance`.
 * HP shows only for combat-relevant kinds (enemy/ally) — a merchant with a
 * hit-point readout is noise. CS-C amend preserved: defeated entities show
 * `· defeated` and suppress live status tags, and never a raw `HP 0`.
 */
function entityLine(entity: EntityState, pal: Palette): string {
  const kind = entityKind(entity);
  const hp = entity.resources.hp;
  const defeated = hp !== undefined && hp <= 0;

  const parts: string[] = [];
  if (defeated) {
    parts.push('defeated');
  } else {
    if ((kind === 'enemy' || kind === 'ally') && hp !== undefined) {
      const max = maxOf(entity, 'hp');
      parts.push(max !== undefined ? `HP ${hp}/${max}` : `HP ${hp}`);
    }
    if (entity.statuses.length > 0) {
      parts.push(entity.statuses.map(s => humanizeStateId(s.statusId)).join(', '));
    }
  }

  const name = `${ENTITY_ICONS[kind]} ${entity.name}`;
  const paintedName =
    kind === 'enemy' ? pal.red(name)
    : kind === 'ally' ? pal.green(name)
    : kind === 'npc' ? pal.cyan(name)
    : name;
  const line = `  ${defeated ? pal.dim(name) : paintedName}${parts.map(p => ` ${pal.dim('·')} ${defeated ? pal.dim(p) : p}`).join('')}`;
  return line;
}

/**
 * The player vitals line: `HP 18/20 [#########-]  Stamina 10/12  Mana 4`.
 * HP leads with its bar; every other (non-max) resource the world actually
 * tracks follows with `cur/max` when a max is known, bare value otherwise.
 * At ≤25% of a known max HP, a plain-text `(low)` marker appears — the
 * warning is words, the red is emphasis.
 */
function playerVitals(player: EntityState, pal: Palette): string {
  const parts: string[] = [];
  const hp = player.resources.hp ?? 0;
  const maxHp = maxOf(player, 'hp');
  if (maxHp !== undefined) {
    const low = hp / maxHp <= LOW_HP_RATIO;
    parts.push(`HP ${hp}/${maxHp} ${paintedBar(hp, maxHp, pal)}${low ? ` ${pal.red('(low)')}` : ''}`);
  } else {
    parts.push(`HP ${hp}`);
  }
  for (const [resource, value] of Object.entries(player.resources)) {
    if (resource === 'hp' || resource.startsWith('max')) continue;
    const max = maxOf(player, resource);
    const label = humanizeStateId(resource);
    parts.push(max !== undefined ? `${label} ${value}/${max}` : `${label} ${value}`);
  }
  return `  ${parts.join('  ')}`;
}

export function renderScene(world: WorldState, opts?: RenderOptions): string {
  const pal = paletteFor(opts);
  const zone = world.zones[world.locationId];
  if (!zone) {
    return `${sectionRule('Scene', pal)}\n  You are nowhere.\n`;
  }

  // Scene body — groups joined by single blank lines, empty groups skipped.
  const groups: string[] = [];

  if (zone.tags.length > 0) {
    groups.push(`  ${pal.dim(`[${zone.tags.join(', ')}]`)}`);
  }

  const entities = Object.values(world.entities).filter(
    e => e.zoneId === zone.id && e.id !== world.playerId
  );
  if (entities.length > 0) {
    groups.push(entities.map(e => entityLine(e, pal)).join('\n'));
  }

  if (zone.interactables && zone.interactables.length > 0) {
    groups.push(zone.interactables.map(item => `  * ${item}`).join('\n'));
  }

  if (zone.neighbors.length > 0) {
    const names = zone.neighbors.map(n => world.zones[n]?.name ?? n).join(', ');
    groups.push(`  Exits: ${names}`);
  }

  const lines: string[] = [sectionRule(zone.name, pal)];
  if (groups.length > 0) {
    lines.push(groups.join('\n\n'));
  }

  // Player HUD — its own labeled section so status reads at a glance.
  const player = world.entities[world.playerId];
  if (player) {
    const hud: string[] = [playerVitals(player, pal)];
    if (player.statuses.length > 0) {
      hud.push(`  Status: ${player.statuses.map(s => humanizeStateId(s.statusId)).join(', ')}`);
    }
    if (player.inventory && player.inventory.length > 0) {
      hud.push(`  Items: ${player.inventory.join(', ')}`);
    }
    lines.push('');
    lines.push(sectionRule('Status', pal));
    lines.push(hud.join('\n'));
  }

  return lines.join('\n') + '\n';
}

/**
 * How many of the most-recent events renderEventLog scans for renderable
 * lines. Same bounded-scan discipline as DIALOGUE_LOOKBACK (F-4b7e6f01):
 * cost is O(lookback) regardless of total log length.
 */
export const EVENT_LOG_LOOKBACK = 100;

// Event categories for the color layer. Membership only affects emphasis —
// the formatted text is identical either way.
const DAMAGE_EVENTS = new Set(['combat.damage.applied', 'status.periodic.damage']);
const HEAL_EVENTS = new Set(['status.periodic.heal']);
const ALERT_EVENTS = new Set(['combat.entity.defeated', 'combat.guard.broken', 'combat.companion.intercepted']);
const REJECT_EVENTS = new Set(['action.rejected', 'ability.rejected', 'ability.check.failed', 'combat.disengage.fail']);
const MUTED_EVENTS = new Set(['combat.contact.miss', 'status.removed', 'status.expired', 'status.periodic.expired', 'dialogue.ended']);

function paintEventLine(type: string, line: string, pal: Palette): string {
  if (!pal.enabled) return line;
  if (DAMAGE_EVENTS.has(type)) return pal.red(line);
  if (HEAL_EVENTS.has(type)) return pal.green(line);
  if (ALERT_EVENTS.has(type)) return pal.bold(line);
  if (REJECT_EVENTS.has(type)) return pal.yellow(line);
  if (MUTED_EVENTS.has(type)) return pal.dim(line);
  return line;
}

export function renderEventLog(events: ResolvedEvent[], limit = 8, opts?: RenderOptions): string {
  const pal = paletteFor(opts);
  // CS-C-004: filter to renderable events FIRST, then take the last `limit`.
  // The old order (slice(-limit), then format) let unrenderable bookkeeping —
  // defeat fallout, flag changes, audio cues — occupy window slots and push
  // the killing blow "X defeated!" out, so a victory turn rendered as an
  // empty divider. `limit` now counts LINES THE PLAYER SEES.
  const scanStart = Math.max(0, events.length - EVENT_LOG_LOOKBACK);
  const lines: string[] = [];
  for (let i = scanStart; i < events.length; i++) {
    const formatted = formatEventLine(events[i]);
    if (formatted) {
      lines.push(`  ${paintEventLine(events[i].type, formatted, pal)}`);
    }
  }

  const recent = lines.slice(-limit);
  // '' (not '\n') when nothing is renderable, so renderFullScreen skips the
  // section instead of printing a divider over a blank line.
  if (recent.length === 0) return '';
  return recent.join('\n') + '\n';
}

/** Menu groups, in display order. Grouping is visual only — never renumbers. */
type ActionGroup = 'travel' | 'interact' | 'items' | 'system';

export type ActionOption = {
  verb: string;
  targetIds?: string[];
  toolId?: string;
  parameters?: Record<string, ScalarValue>;
  /** Player-facing menu label ("Move to Back Alley"). */
  label: string;
  /** Menu group — drives blank-line separation in renderActions only. */
  group: ActionGroup;
};

/**
 * The ONE source of truth for the numbered action menu. renderActions
 * displays this list; parseActionSelection indexes into it. They previously
 * built the same list independently — a classic drift bug waiting to happen
 * (any ordering change in one silently remapped the player's numbers in the
 * other). Shared now; a test pins the agreement.
 */
export function buildActionList(world: WorldState): ActionOption[] {
  const zone = world.zones[world.locationId];
  const actions: ActionOption[] = [];

  if (zone) {
    // Movement options
    for (const neighborId of zone.neighbors) {
      const name = world.zones[neighborId]?.name ?? neighborId;
      actions.push({ verb: 'move', targetIds: [neighborId], label: `Move to ${name}`, group: 'travel' });
    }

    // Entities in zone for interaction
    const entities = Object.values(world.entities).filter(
      e => e.zoneId === zone.id && e.id !== world.playerId
    );
    for (const entity of entities) {
      if (entity.tags.includes('npc')) {
        actions.push({ verb: 'speak', targetIds: [entity.id], label: `Speak to ${entity.name}`, group: 'interact' });
      }
      if (entity.tags.includes('enemy') && (entity.resources.hp ?? 0) > 0) {
        actions.push({ verb: 'attack', targetIds: [entity.id], label: `Attack ${entity.name}`, group: 'interact' });
      }
      actions.push({ verb: 'inspect', targetIds: [entity.id], label: `Inspect ${entity.name}`, group: 'interact' });
    }

    // Items in player inventory
    const player = world.entities[world.playerId];
    if (player?.inventory) {
      for (const itemId of player.inventory) {
        actions.push({ verb: 'use', toolId: itemId, label: `Use ${itemId}`, group: 'items' });
      }
    }
  }

  // Inspect current zone — always available, even from nowhere.
  actions.push({ verb: 'inspect', label: 'Look around', group: 'system' });

  return actions;
}

export function renderActions(world: WorldState, opts?: RenderOptions): string {
  const pal = paletteFor(opts);
  const actions = buildActionList(world);
  // Right-align numbers when the menu reaches double digits: [ 9] / [10].
  const width = String(actions.length).length;
  const lines: string[] = [];
  let prevGroup: ActionGroup | undefined;
  actions.forEach((action, i) => {
    if (prevGroup !== undefined && action.group !== prevGroup) {
      lines.push('');
    }
    prevGroup = action.group;
    const num = `[${String(i + 1).padStart(width)}]`;
    lines.push(`  ${pal.cyan(num)} ${action.label}`);
  });
  return lines.join('\n') + '\n';
}

/** Parse a numbered action selection into verb + targets */
export function parseActionSelection(
  input: string,
  world: WorldState,
): { verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, ScalarValue> } | null {
  const actions = buildActionList(world);

  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= actions.length) {
    const action = actions[num - 1];
    const result: { verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, ScalarValue> } = {
      verb: action.verb,
    };
    if (action.targetIds) result.targetIds = action.targetIds;
    if (action.toolId) result.toolId = action.toolId;
    if (action.parameters) result.parameters = action.parameters;
    return result;
  }

  return null;
}

/** Parse freeform text input into verb + targets */
export function parseTextInput(
  input: string,
  world: WorldState,
): { verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, ScalarValue> } | null {
  const parts = input.trim().toLowerCase().split(/\s+/);
  // F-1de46432: `String.prototype.split` on a regex never returns an empty
  // array — for '' or whitespace-only input it returns [''], a one-element
  // array containing an empty string, so `parts.length === 0` here was
  // unreachable dead code. Blank input fell through with verb === '',
  // skipped every special-verb check, and returned a real `{ verb: '' }`
  // action instead of the null no-op this guard was meant to produce.
  if (parts[0] === '') return null;

  const verb = parts[0];
  const rest = parts.slice(1).join(' ');

  // Special verbs
  if (verb === 'look' || verb === 'l') return { verb: 'inspect' };
  if (verb === 'save') return { verb: 'save' };
  if (verb === 'quit' || verb === 'exit') return { verb: 'quit' };

  // Resolve target by name
  const zone = world.zones[world.locationId];
  if (!zone) return { verb };

  if (rest) {
    const restLower = rest.toLowerCase();

    const entities = Object.values(world.entities).filter(e => e.zoneId === zone.id);
    const entityResult = (entity: EntityState) =>
      verb === 'use' ? { verb, toolId: entity.id } : { verb, targetIds: [entity.id] };

    let prefixEntity: EntityState | undefined;
    let substringEntity: EntityState | undefined;
    for (const entity of entities) {
      const nameLower = entity.name.toLowerCase();
      const idLower = entity.id.toLowerCase();
      if (nameLower === restLower || idLower === restLower) {
        return entityResult(entity);
      }
      if (!prefixEntity && (nameLower.startsWith(restLower) || idLower.startsWith(restLower))) {
        prefixEntity = entity;
      }
      if (!substringEntity && (nameLower.includes(restLower) || idLower.includes(restLower))) {
        substringEntity = entity;
      }
    }
    if (prefixEntity) return entityResult(prefixEntity);
    if (substringEntity) return entityResult(substringEntity);

    let prefixZone: string | undefined;
    let substringZone: string | undefined;
    for (const neighborId of zone.neighbors) {
      const neighbor = world.zones[neighborId];
      const nameLower = neighbor?.name.toLowerCase();
      const idLower = neighborId.toLowerCase();
      if (nameLower === restLower || idLower === restLower) {
        return { verb, targetIds: [neighborId] };
      }
      if (!prefixZone && ((nameLower && nameLower.startsWith(restLower)) || idLower.startsWith(restLower))) {
        prefixZone = neighborId;
      }
      if (!substringZone && ((nameLower && nameLower.includes(restLower)) || idLower.includes(restLower))) {
        substringZone = neighborId;
      }
    }
    if (prefixZone) return { verb, targetIds: [prefixZone] };
    if (substringZone) return { verb, targetIds: [substringZone] };

    const player = world.entities[world.playerId];
    if (player?.inventory) {
      let prefixItem: string | undefined;
      let substringItem: string | undefined;
      for (const itemId of player.inventory) {
        const idLower = itemId.toLowerCase();
        if (idLower === restLower) return { verb: 'use', toolId: itemId };
        if (!prefixItem && idLower.startsWith(restLower)) prefixItem = itemId;
        if (!substringItem && idLower.includes(restLower)) substringItem = itemId;
      }
      if (prefixItem) return { verb: 'use', toolId: prefixItem };
      if (substringItem) return { verb: 'use', toolId: substringItem };
    }
  }

  return { verb };
}

/** Read a non-empty string field off an event payload, or undefined. */
function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Modules are starting to author player-grade `description` strings on
 * status-lifecycle events. Prefer those verbatim; the typed fallbacks below
 * keep every event renderable whether or not the metadata is present.
 */
function describedOr(payload: Record<string, unknown>, fallback: string): string {
  const description = payloadString(payload, 'description');
  return description ? `> ${description}` : fallback;
}

/**
 * Format one resolved event as its player-facing log line (`> Hit!`), or null
 * for events with no text rendering (bookkeeping, flags, audio cues).
 * Exported for the narration layer (presentation.ts), which reuses these
 * exact lines as NarrationPlan scene text so the spoken/streamed narration
 * can never drift from the printed log.
 */
export function formatEventLine(event: ResolvedEvent): string | null {
  const p = event.payload;
  switch (event.type) {
    case 'world.zone.entered':
      return `> Entered ${p.zoneName}`;
    case 'combat.contact.hit':
      return `> Hit!`;
    case 'combat.contact.miss':
      return `> Miss.`;
    case 'combat.damage.applied':
      return `> ${p.damage} damage dealt (HP: ${p.currentHp})`;
    case 'combat.entity.defeated':
      return `> ${p.entityName} defeated!`;

    // CS-C-002: rejections used to render null — a typo, "not enough
    // stamina", "cannot reach X from Y", or attacking a corpse all redrew an
    // identical screen with zero feedback. The modules already author
    // player-grade reason strings; surface them.
    case 'action.rejected': {
      const reason = payloadString(p, 'reason');
      return reason ? `> You can't do that: ${reason}` : `> You can't do that.`;
    }
    case 'ability.rejected': {
      const name = payloadString(p, 'abilityName') ?? payloadString(p, 'abilityId') ?? 'that ability';
      const reason = payloadString(p, 'reason');
      return reason ? `> You can't use ${name}: ${reason}` : `> You can't use ${name}.`;
    }
    case 'ability.check.failed': {
      const name = payloadString(p, 'abilityName') ?? payloadString(p, 'abilityId') ?? 'The ability';
      return `> ${name} fails!`;
    }
    case 'ability.used': {
      const name = payloadString(p, 'abilityName') ?? payloadString(p, 'abilityId') ?? 'an ability';
      const actor = payloadString(p, 'actorName') ?? 'Someone';
      const targetNames = Array.isArray(p.targetNames)
        ? (p.targetNames as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
        : [];
      const ui = p.ui as { text?: string } | undefined;
      const flavor = typeof ui?.text === 'string' && ui.text.length > 0 ? ` ${ui.text}` : '';
      const targets = targetNames.length > 0 ? ` on ${targetNames.join(', ')}` : '';
      return `> ${actor} uses ${name}${targets}.${flavor}`;
    }

    // CS-C-003: the renderer's own "[N] Look around" / "[N] Inspect X" menu
    // items emit these — they used to render null, a visible no-op.
    case 'world.zone.inspected': {
      const parts: string[] = [`> You look around ${p.zoneName ?? 'the area'}.`];
      const entities = Array.isArray(p.entities)
        ? (p.entities as Array<{ id?: string; name?: string }>).filter(
            e => typeof e?.name === 'string' && e.name.length > 0 && e.id !== event.actorId,
          )
        : [];
      if (entities.length > 0) {
        parts.push(`You see: ${entities.map(e => e.name).join(', ')}.`);
      }
      const interactables = Array.isArray(p.interactables)
        ? (p.interactables as unknown[]).filter((i): i is string => typeof i === 'string')
        : [];
      if (interactables.length > 0) {
        parts.push(`Points of interest: ${interactables.join(', ')}.`);
      }
      const hazards = Array.isArray(p.hazards)
        ? (p.hazards as unknown[]).filter((h): h is string => typeof h === 'string')
        : [];
      if (hazards.length > 0) {
        parts.push(`Hazards: ${hazards.map(humanizeStateId).join(', ')}.`);
      }
      return parts.join(' ');
    }
    case 'world.entity.inspected': {
      const name = payloadString(p, 'name') ?? p.entityId ?? 'It';
      const resources = (p.resources ?? {}) as Record<string, number | undefined>;
      const hp = resources.hp;
      const maxHp = resources.maxHp;
      const statuses = Array.isArray(p.statuses)
        ? (p.statuses as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      if (hp !== undefined && hp <= 0) {
        // A corpse gets no live combat-state readout.
        return `> ${name} — defeated.`;
      }
      const hpStr = hp !== undefined ? ` — HP: ${hp}${maxHp !== undefined ? `/${maxHp}` : ''}` : '';
      const statusStr = statuses.length > 0 ? `. Status: ${statuses.map(humanizeStateId).join(', ')}` : '';
      return `> ${name}${hpStr}${statusStr}`;
    }

    // Guard / disengage / interception — visible state changes that used to
    // render nothing.
    case 'combat.guard.start':
      return `> ${p.entityName} takes a guarded stance.`;
    case 'combat.guard.absorbed':
      return `> ${p.entityName}'s guard absorbs the blow (${p.originalDamage} → ${p.reducedDamage} damage).`;
    case 'combat.guard.broken':
      return `> ${p.attackerName} breaks through ${p.targetName}'s guard!`;
    case 'combat.counter.off_balance': {
      const by = payloadString(p, 'causedByName');
      return by
        ? `> ${p.entityName} is knocked off balance by ${by}!`
        : `> ${p.entityName} is knocked off balance!`;
    }
    case 'combat.companion.intercepted':
      return `> ${p.interceptorName} intercepts the blow meant for ${p.targetName} (${p.damage} damage)!`;
    case 'combat.disengage.success':
      return `> ${p.entityName} breaks away from the fight.`;
    case 'combat.disengage.fail':
      return `> ${p.entityName} tries to break away but fails!`;

    case 'status.applied': {
      const label = humanizeStateId(String(p.statusId ?? ''));
      return describedOr(p, `> Status: ${label} applied`);
    }
    case 'status.removed': {
      const label = humanizeStateId(String(p.statusId ?? ''));
      return describedOr(p, `> Status: ${label} removed`);
    }
    case 'status.expired': {
      const label = humanizeStateId(String(p.statusId ?? ''));
      return describedOr(p, `> Status: ${label} expired`);
    }

    // DoT/HoT lifecycle — "burning: -3 HP", "regenerating: +2 HP", "X wore
    // off". Rendered by type regardless of whether the modules attached
    // description metadata (preferred when present).
    case 'status.periodic.damage': {
      const label = humanizeStateId(String(p.statusId ?? ''));
      return describedOr(p, `> ${label}: -${p.amount} HP`);
    }
    case 'status.periodic.heal': {
      const label = humanizeStateId(String(p.statusId ?? ''));
      const resource = payloadString(p, 'resource') ?? 'hp';
      const resourceLabel = resource === 'hp' ? 'HP' : resource;
      const amount = typeof p.actual === 'number' ? p.actual : p.amount;
      return describedOr(p, `> ${label}: +${amount} ${resourceLabel}`);
    }
    case 'status.periodic.expired': {
      const label = humanizeStateId(String(p.statusId ?? ''));
      return describedOr(p, `> ${label} wore off.`);
    }

    case 'item.used':
      return `> Used ${p.itemId}`;
    case 'item.acquired':
      return `> Acquired ${p.itemId}`;
    case 'resource.changed':
      return `> ${p.resource}: ${p.previous} → ${p.current}`;

    // F-0a572dd7: progression.node.unlocked rendered null, so a successful
    // XP spend narrated "All is quiet." — an affirmative "nothing happened"
    // right after the player bought an upgrade. Name the unlock; surface
    // rejection reasons the same way action.rejected does.
    case 'progression.node.unlocked': {
      const node = payloadString(p, 'nodeId');
      return `> Unlocked ${node ? humanizeStateId(node) : 'an advancement'}`;
    }
    case 'progression.unlock.rejected': {
      const node = payloadString(p, 'nodeId');
      const label = node ? humanizeStateId(node) : 'that';
      const reason = payloadString(p, 'reason');
      return reason ? `> You can't unlock ${label}: ${reason}` : `> You can't unlock ${label}.`;
    }

    // F-ENG005: world-tick pressure lifecycle — the world reacting to the
    // player's accumulated heat. Hidden pressures render null (the world
    // knows; the player doesn't — the reveal event is their narrated debut).
    // Descriptions are pressure-system's own structured claims, verbatim.
    case 'pressure.spawned': {
      if (p.visibility === 'hidden') return null;
      const desc = payloadString(p, 'description') ?? 'something stirs against you';
      if (payloadString(p, 'chainedFrom')) return `> Consequence: ${desc}.`;
      if (p.visibility === 'public') return `> Proclaimed: ${desc}.`;
      if (p.visibility === 'known') return `> Word is out: ${desc}.`;
      return `> Rumor spreads: ${desc}.`;
    }
    case 'pressure.revealed': {
      const desc = payloadString(p, 'description') ?? 'something has been moving against you';
      return `> Whispers reach you: ${desc}.`;
    }
    case 'pressure.escalated': {
      const desc = payloadString(p, 'description') ?? 'the pressure against you';
      return p.band === 'urgent'
        ? `> It can no longer be ignored: ${desc}.`
        : `> Pressure mounts: ${desc}.`;
    }
    case 'pressure.expired': {
      if (p.visibility === 'hidden') return null;
      const summary = payloadString(p, 'summary') ?? 'a pressure has run its course';
      return `> The moment passes: ${summary}.`;
    }

    case 'dialogue.started':
      return `> Speaking with ${p.speakerName}`;
    case 'dialogue.node.entered':
      return null; // Rendered separately in dialogue display
    case 'dialogue.choice.selected':
      return `> "${p.choiceText}"`;
    case 'dialogue.ended':
      return `> Conversation ended`;
    case 'world.flag.changed':
      return null; // Silent
    case 'audio.cue.requested':
      return null; // Audio, not text
    default:
      return null;
  }
}

/**
 * How many of the most-recent events renderDialogue may scan per lookup.
 *
 * F-4b7e6f01: renderDialogue used to do up to three full
 * `[...world.eventLog].reverse().find(...)` passes per render — each one
 * copying and reversing the ENTIRE event log, which core never caps or trims,
 * on every turn via the CLI's render loop, whether or not dialogue was even
 * active. renderEventLog's caller already used the bounded pattern
 * (`eventLog.slice(-8)`); this constant gives dialogue lookups the same
 * discipline. The events renderDialogue wants are always near the tail (the
 * active node was entered at most a few turns ago, and the "just ended" line
 * only renders when the dialogue ended on the PREVIOUS tick), so the window
 * is deliberately generous — wide enough to survive a busy modules stack
 * emitting dozens of ambient events per turn. If a game's per-turn event
 * volume ever outgrows it, widen this constant explicitly; never fall back
 * to scanning the full log.
 */
export const DIALOGUE_LOOKBACK = 100;

/**
 * Scan backward over at most `limit` most-recent events — no copy, no
 * reverse, O(limit) worst case regardless of total log length.
 */
function findRecentEvent(
  log: readonly ResolvedEvent[],
  predicate: (e: ResolvedEvent) => boolean,
  limit = DIALOGUE_LOOKBACK,
): ResolvedEvent | undefined {
  const stop = Math.max(0, log.length - limit);
  for (let i = log.length - 1; i >= stop; i--) {
    const event = log[i];
    if (predicate(event)) return event;
  }
  return undefined;
}

export function renderDialogue(world: WorldState, opts?: RenderOptions): string | null {
  const pal = paletteFor(opts);
  const dState = world.modules['dialogue-core'] as { activeDialogue: string | null } | undefined;
  if (!dState?.activeDialogue) {
    // Show the last spoken line briefly if dialogue just ended. The tick
    // check runs BEFORE the second scan: same observable behavior as
    // checking it after (both conditions must hold to render), but a stale
    // ended-event no longer pays for a node lookup.
    const endedEvent = findRecentEvent(world.eventLog, e => e.type === 'dialogue.ended');
    if (endedEvent && endedEvent.tick === world.meta.tick - 1) {
      const lastNode = findRecentEvent(
        world.eventLog,
        e => e.type === 'dialogue.node.entered' && e.tick <= endedEvent.tick,
      );
      if (lastNode) {
        return `  ${pal.bold(String(lastNode.payload.speaker))}: "${lastNode.payload.text}"\n`;
      }
    }
    return null;
  }

  // Find the most recent dialogue.node.entered event
  const nodeEvent = findRecentEvent(world.eventLog, e => e.type === 'dialogue.node.entered');
  if (!nodeEvent) return null;

  const lines: string[] = [];
  lines.push(`  ${pal.bold(String(nodeEvent.payload.speaker))}: "${nodeEvent.payload.text}"`);

  const choices = nodeEvent.payload.choices as Array<{ id: string; text: string; index: number }> | undefined;
  if (choices && choices.length > 0) {
    lines.push('');
    for (const choice of choices) {
      lines.push(`  ${pal.cyan(`[${choice.index + 1}]`)} ${choice.text}`);
    }
  }

  return lines.join('\n') + '\n';
}

/** Full-screen options: per-section switches on top of the shared render options. */
export type FullScreenOptions = RenderOptions & {
  /**
   * Render the numbered Actions section. Default true. Callers rendering a
   * frame the player can no longer act on (the session-end screen — F1b's
   * finale flow) pass false so a corpse is not offered an action menu.
   */
  actions?: boolean;
};

export function renderFullScreen(world: WorldState, recentEvents: ResolvedEvent[], opts?: FullScreenOptions): string {
  // Resolve color ONCE per screen so every section renders under the same
  // decision — no mid-frame flips if the environment changes under us.
  const pal = paletteFor(opts);
  const resolved: RenderOptions = { color: pal.enabled };

  const sections: string[] = [];

  sections.push(renderScene(world, resolved));

  // Check for active dialogue
  const dialogueDisplay = renderDialogue(world, resolved);
  if (dialogueDisplay) {
    sections.push(`${sectionRule('Dialogue', pal)}\n${dialogueDisplay}`);
  }

  // CS-C-004 (part 2): render the log from the world's own eventLog when it
  // has one. The CLI passes `world.eventLog.slice(-8)` — a RAW window, so a
  // defeat followed by 8+ bookkeeping events never even reaches
  // renderEventLog's filter-first fix via the argument. `world` is the same
  // object the caller sliced from, so sourcing here repairs the loop without
  // touching the caller. `recentEvents` remains the fallback for hand-built
  // worlds / curated replays that pass an explicit list.
  const eventSource = world.eventLog && world.eventLog.length > 0 ? world.eventLog : recentEvents;
  const eventLog = renderEventLog(eventSource, 8, resolved);
  if (eventLog) {
    sections.push(`${sectionRule('Log', pal)}\n${eventLog}`);
  }

  // The numbered Actions section is suppressed while a dialogue is ACTIVE:
  // the numbers on screen belong to the dialogue choices, and rendering both
  // lists put two colliding `[1]`/`[2]` columns on one frame (the input
  // router resolves numbers to dialogue choices first, so the base menu's
  // numbers were lying). The just-ended echo frame (activeDialogue null,
  // last spoken line shown) keeps its menu — no choices are on screen there.
  // Callers can also suppress explicitly via `actions: false` (end frames).
  const dState = world.modules['dialogue-core'] as { activeDialogue?: string | null } | undefined;
  const showActions = (opts?.actions ?? true) && !dState?.activeDialogue;
  if (showActions) {
    sections.push(`${sectionRule('Actions', pal)}\n${renderActions(world, resolved)}`);
  }

  // Sections each end with '\n'; joining with '\n' yields exactly one blank
  // line between blocks. The closing rule sits tight under the last line.
  return sections.join('\n') + rule(pal);
}
