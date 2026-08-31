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
import { detectColorEnabled, makePalette, stripAnsi, type Palette } from './styles.js';
import {
  applyGlyphPunctuation,
  detectAsciiOnly,
  glyphsFor,
  withGlyphs,
} from './glyphs.js';

/** Visible width of every rule line the renderer emits. */
export const SCREEN_WIDTH = 60;
/** Body copy indent — scene lines, HUD, log, dialogue, journal hooks. */
export const BODY_INDENT = '  ';

/** Flush-left frame rule: one character, SCREEN_WIDTH columns, indent 0. */
export function frameRule(opts?: { ascii?: boolean }): string {
  return glyphsFor(opts).rule.repeat(SCREEN_WIDTH);
}

/** Ellipsis `text` so its visible length is at most `width`. */
export function clipToWidth(
  text: string,
  width: number = SCREEN_WIDTH,
  opts?: { ascii?: boolean },
): string {
  if (text.length <= width) return text;
  if (width <= 0) return '';
  const ellipsis = glyphsFor(opts).ellipsis;
  if (width < ellipsis.length) return ellipsis.slice(0, width);
  return text.slice(0, width - ellipsis.length) + ellipsis;
}

/**
 * Wrap a body line to `width` visible columns. Continuation lines use
 * `indent` (default two spaces) so a 60-col pane never bisects a meter or
 * a sentence at the terminal edge. Operates on the visible (stripAnsi) form;
 * a line that already fits is returned unchanged, ANSI codes included.
 */
export function wrapToWidth(
  text: string,
  width: number = SCREEN_WIDTH,
  indent: string = BODY_INDENT,
): string[] {
  const vis = stripAnsi(text);
  if (vis.length <= width) return [text];

  const leading = vis.match(/^ */)?.[0] ?? '';
  let rest = vis.slice(leading.length);
  const lines: string[] = [];
  let prefix = leading;

  while (rest.length > 0) {
    const budget = Math.max(1, width - prefix.length);
    if (rest.length <= budget) {
      lines.push(prefix + rest);
      break;
    }
    let breakAt = rest.lastIndexOf(' ', budget);
    if (breakAt <= 0) breakAt = budget;
    lines.push(prefix + rest.slice(0, breakAt).trimEnd());
    rest = rest.slice(breakAt).trimStart();
    prefix = indent;
  }
  return lines.length > 0 ? lines : [text];
}

/** Right-aligned `[ 9]` / `[10]` — one padStart width for the whole range. */
export function paddedMenuIndex(index: number, count: number): string {
  const width = String(Math.max(count, 1)).length;
  return `[${String(index + 1).padStart(width)}]`;
}

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
  /**
   * Explicit ASCII-glyph override. Omitted → auto-detect via detectAsciiOnly():
   * ASCII_ONLY / TERM=dumb. NO_COLOR does not flip this.
   */
  ascii?: boolean;
  /**
   * F-dc8a82be / F-b30e754a: the CLI-composed party status line (menu.ts's
   * buildPartyStatusLine, wrapping modules' formatPartyStatusLine) — plain
   * text, already carrying its own two-space indent. Rendered as one more
   * Status HUD line, after Equipped. Omitted (or the composer's own
   * undefined for an empty party) renders nothing — no empty "Party:" label
   * ever appears, and the HUD is byte-identical to before this option
   * existed.
   */
  partyLine?: string;
};

function paletteFor(opts?: RenderOptions): Palette {
  return makePalette(opts?.color ?? detectColorEnabled());
}

/** A full-width plain rule (screen closer, unlabeled separators). */
function rule(pal: Palette): string {
  return pal.dim(frameRule());
}

/**
 * equipment/chronicle-core.ts's persisted namespace key, duplicated as a
 * literal ON PURPOSE.
 *
 * This package depends on core/presentation/audio-director/soundpack-core and
 * NOT on @ai-rpg-engine/equipment, and adding that dependency to render a
 * name would be a real coupling bought for a cosmetic gain. The ledger
 * adapter's equipment-snapshot.ts already set this precedent for the sibling
 * 'equipment-core' namespace: duplicate the key, declare the shape you read
 * locally, treat the namespace as plain data. The chronicle module persists a
 * precomputed summary specifically so consumers can do this without ever
 * calling evaluateRelicGrowth.
 *
 * Reading is tolerant and non-attaching: a world with no chronicle (any pack
 * that has not wired the module) yields nothing and the HUD renders exactly
 * as it did before.
 */
const ITEM_CHRONICLE_NAMESPACE = 'item-chronicle';

/**
 * equipment-core.ts's EQUIPMENT_STATE_KEY, duplicated for the same reason as
 * the key above. The ledger adapter's equipment-snapshot.ts duplicates this
 * exact literal and declares `{ loadouts?: Record<string, Loadout> }` locally
 * rather than importing the package — same trade, same call.
 */
const EQUIPMENT_NAMESPACE = 'equipment-core';

/**
 * What the player currently has in their slots, as `[slot, itemId]` pairs in
 * a stable slot order. Empty when equipment-core is not wired or this entity
 * has never equipped anything.
 *
 * This exists because growth is invisible without it: equipping MOVES an item
 * out of `entity.inventory` and into the persisted loadout, so a weapon that
 * earns its name by being wielded is precisely the item the old `Items:` line
 * could never show. Surfacing the chronicle without surfacing slots would put
 * epithets only on gear sitting unused in a pack.
 */
function equippedPairs(world: WorldState, entityId: string): Array<[string, string]> {
  const ns = world.modules[EQUIPMENT_NAMESPACE];
  if (!ns || typeof ns !== 'object' || Array.isArray(ns)) return [];
  const loadouts = (ns as { loadouts?: unknown }).loadouts;
  if (!loadouts || typeof loadouts !== 'object') return [];

  const loadout = (loadouts as Record<string, unknown>)[entityId];
  if (!loadout || typeof loadout !== 'object') return [];
  const equipped = (loadout as { equipped?: unknown }).equipped;
  if (!equipped || typeof equipped !== 'object') return [];

  return Object.entries(equipped as Record<string, unknown>)
    .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1].length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Earned relic names by item id — `{}` when the chronicle is absent,
 * malformed, or the item has not grown. Only entries carrying a real epithet
 * are returned: an item at tier 0 has become nothing yet, and echoing its
 * plain catalog name here would just be a second spelling of the id.
 */
function relicDisplayNames(world: WorldState): Record<string, string> {
  const ns = world.modules[ITEM_CHRONICLE_NAMESPACE];
  if (!ns || typeof ns !== 'object' || Array.isArray(ns)) return {};
  const summaries = (ns as { summaries?: unknown }).summaries;
  if (!summaries || typeof summaries !== 'object' || Array.isArray(summaries)) return {};

  const names: Record<string, string> = {};
  for (const [itemId, summary] of Object.entries(summaries as Record<string, unknown>)) {
    if (!summary || typeof summary !== 'object') continue;
    const { epithet, displayName } = summary as { epithet?: unknown; displayName?: unknown };
    if (typeof epithet === 'string' && epithet.length > 0 && typeof displayName === 'string') {
      names[itemId] = displayName;
    }
  }
  return names;
}

/**
 * A labeled section rule: `── Label ───────…` padded to SCREEN_WIDTH visible
 * characters. The label is bold, the rule dim — the label carries the
 * information; the weight difference is only emphasis.
 */
function sectionRule(label: string, pal: Palette): string {
  // `── ` + label + ` ` + fill  === SCREEN_WIDTH. Clamp the label so fill
  // is never forced to 0 by an over-long zone name (F-9916b83c).
  const rule = glyphsFor().rule;
  const clipped = clipToWidth(label, SCREEN_WIDTH - 4);
  const fill = Math.max(0, SCREEN_WIDTH - 4 - clipped.length);
  return pal.dim(`${rule}${rule} `) + pal.bold(clipped) + pal.dim(` ${rule.repeat(fill)}`);
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
function paintedBar(current: number, max: number, pal: Palette, width = 10): string {
  const bar = textBar(current, max, width);
  if (!bar) return '';
  const ratio = max > 0 ? current / max : 0;
  if (ratio <= LOW_HP_RATIO) return pal.red(bar);
  if (ratio <= 0.5) return pal.yellow(bar);
  return pal.green(bar);
}

type EntityKind = 'enemy' | 'ally' | 'npc' | 'item' | 'other';

/**
 * Classify an entity for the scene list. Explicit hostility (the `enemy` /
 * `hostile` tags — F-7e0ff4be: the same explicit-hostility convention
 * turns.ts's listHostilesInPlayerZone and menu.ts's menuTargetable use) wins
 * over everything; party membership comes from the `ally` / `companion`
 * tags. Faction is deliberately NOT used here — factions define combat
 * sides, not who travels with you.
 */
function entityKind(entity: EntityState): EntityKind {
  if (entity.tags.includes('enemy') || entity.tags.includes('hostile')) return 'enemy';
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
  const dot = glyphsFor().midDot;
  const line = `  ${defeated ? pal.dim(name) : paintedName}${parts.map(p => ` ${pal.dim(dot)} ${defeated ? pal.dim(p) : p}`).join('')}`;
  return line;
}

/**
 * Join resource chips onto indented lines that never exceed SCREEN_WIDTH.
 * Used for the vitals overflow (stamina/mana/xp/level) so the HP bar on
 * line 1 cannot be bisected by terminal wrap (F-1d24d0ce).
 */
function wrapJoined(parts: string[], width: number = SCREEN_WIDTH, indent: string = BODY_INDENT): string[] {
  if (parts.length === 0) return [];
  const lines: string[] = [];
  let current = indent;
  let vis = indent.length;
  for (const part of parts) {
    const partVis = stripAnsi(part).length;
    const sep = vis === indent.length ? '' : '  ';
    if (vis > indent.length && vis + sep.length + partVis > width) {
      lines.push(current);
      const clipped = partVis > width - indent.length
        ? clipToWidth(stripAnsi(part), width - indent.length)
        : part;
      current = indent + clipped;
      vis = indent.length + stripAnsi(clipped).length;
    } else {
      current += sep + part;
      vis += sep.length + partVis;
      if (vis > width) {
        const clipped = clipToWidth(stripAnsi(current.slice(indent.length)), width - indent.length);
        current = indent + clipped;
        vis = indent.length + clipped.length;
      }
    }
  }
  if (current.length > indent.length) lines.push(current);
  return lines;
}

/** HP + bar + optional (low) on its own line, shrinking the bar if needed. */
function hpVitalsLine(player: EntityState, pal: Palette): string {
  const hp = player.resources.hp ?? 0;
  const maxHp = maxOf(player, 'hp');
  if (maxHp === undefined) return `${BODY_INDENT}HP ${hp}`;
  const low = hp / maxHp <= LOW_HP_RATIO;
  const lowMark = low ? ` ${pal.red('(low)')}` : '';
  let barWidth = 10;
  while (barWidth >= 0) {
    const bar = barWidth > 0 ? ` ${paintedBar(hp, maxHp, pal, barWidth)}` : '';
    const line = `${BODY_INDENT}HP ${hp}/${maxHp}${bar}${lowMark}`;
    if (stripAnsi(line).length <= SCREEN_WIDTH) return line;
    barWidth -= 1;
  }
  return clipToWidth(`${BODY_INDENT}HP ${hp}/${maxHp}${lowMark}`, SCREEN_WIDTH);
}

/**
 * The player vitals block: HP + bar + `(low)` on line 1; remaining
 * resources wrap onto indented follow-on lines so no Status line exceeds
 * SCREEN_WIDTH and the ASCII bar never splits (F-1d24d0ce).
 */
function playerStatChips(player: EntityState): string[] {
  const chips: string[] = [];
  for (const [stat, value] of Object.entries(player.stats)) {
    if (stat.startsWith('max')) continue;
    if (typeof value !== 'number') continue;
    chips.push(`${humanizeStateId(stat)} ${value}`);
  }
  return chips;
}

function playerIdentityParts(player: EntityState): string[] {
  const custom = player.custom;
  if (!custom) return [];
  const parts: string[] = [];
  const title = custom.title;
  if (typeof title === 'string' && title.trim() !== '') parts.push(humanizeStateId(title));
  const archetypeId = custom.archetypeId;
  if (typeof archetypeId === 'string' && archetypeId.trim() !== '') {
    parts.push(humanizeStateId(archetypeId));
  }
  return parts;
}

function playerVitals(player: EntityState, pal: Palette): string {
  const rest: string[] = [];
  for (const [resource, value] of Object.entries(player.resources)) {
    if (resource === 'hp' || resource.startsWith('max')) continue;
    const max = maxOf(player, resource);
    const label = humanizeStateId(resource);
    rest.push(max !== undefined ? `${label} ${value}/${max}` : `${label} ${value}`);
  }
  return [hpVitalsLine(player, pal), ...wrapJoined(rest)].join('\n');
}

export function renderScene(world: WorldState, opts?: RenderOptions): string {
  const pal = paletteFor(opts);
  const ascii = opts?.ascii ?? detectAsciiOnly();
  return withGlyphs(ascii, () => renderSceneInner(world, pal, opts?.partyLine));
}

function renderSceneInner(world: WorldState, pal: Palette, partyLine?: string): string {
  const zone = world.zones[world.locationId];
  if (!zone) {
    return `${sectionRule('Scene', pal)}\n  You are nowhere.\n`;
  }

  // Scene body — groups joined by single blank lines, empty groups skipped.
  const groups: string[] = [];

  if (zone.tags.length > 0) {
    groups.push(wrapToWidth(`  ${pal.dim(`[${zone.tags.join(', ')}]`)}`).join('\n'));
  }

  const entities = Object.values(world.entities).filter(
    e => e.zoneId === zone.id && e.id !== world.playerId
  );
  if (entities.length > 0) {
    groups.push(entities.map(e => wrapToWidth(entityLine(e, pal)).join('\n')).join('\n'));
  }

  if (zone.interactables && zone.interactables.length > 0) {
    groups.push(zone.interactables.map(item => wrapToWidth(`  * ${item}`).join('\n')).join('\n'));
  }

  if (zone.neighbors.length > 0) {
    const names = zone.neighbors.map(n => world.zones[n]?.name ?? n).join(', ');
    groups.push(wrapToWidth(`  Exits: ${names}`).join('\n'));
  }

  const lines: string[] = [sectionRule(zone.name, pal)];
  if (groups.length > 0) {
    lines.push(groups.join('\n\n'));
  }

  // Player HUD — its own labeled section so status reads at a glance.
  const player = world.entities[world.playerId];
  if (player) {
    const hud: string[] = playerVitals(player, pal).split('\n');
    const statChips = playerStatChips(player);
    if (statChips.length > 0) hud.push(...wrapJoined(statChips));
    const identity = playerIdentityParts(player);
    if (identity.length > 0) {
      hud.push(...wrapToWidth(`${BODY_INDENT}Identity: ${identity.join(' · ')}`));
    }
    if (player.statuses.length > 0) {
      hud.push(...wrapToWidth(
        `${BODY_INDENT}Status: ${player.statuses.map(s => humanizeStateId(s.statusId)).join(', ')}`,
      ));
    }
    const relicNames = relicDisplayNames(world);
    if (player.inventory && player.inventory.length > 0) {
      // Grown epithets win; ungrown ids are title-cased the same way
      // statuses are (rusted-mace → Rusted Mace) so the HUD never leaks
      // kebab catalog keys (F-bfd20ef8).
      const names = player.inventory.map(id => relicNames[id] ?? humanizeStateId(id));
      hud.push(...wrapToWidth(`${BODY_INDENT}Items: ${names.join(', ')}`));
    }
    // Gated on there being something in a slot, so a pack that never wires
    // equipment-core — or a player who has equipped nothing — renders the
    // HUD exactly as before rather than gaining an empty label.
    const equipped = equippedPairs(world, player.id);
    if (equipped.length > 0) {
      const names = equipped.map(
        ([slot, id]) => `${humanizeStateId(slot)}: ${relicNames[id] ?? humanizeStateId(id)}`,
      );
      hud.push(...wrapToWidth(`${BODY_INDENT}Equipped: ${names.join(', ')}`));
    }
    // F-dc8a82be: party is whole-player-state information like the rest of
    // the Status section, but least tied to the player's own body, so it
    // closes out the block. formatPartyStatusLine's own output already
    // carries the same two-space indent every other HUD line uses.
    if (partyLine) hud.push(...wrapToWidth(partyLine));
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
  const ascii = opts?.ascii ?? detectAsciiOnly();
  return withGlyphs(ascii, () => renderEventLogInner(events, limit, pal));
}

function renderEventLogInner(events: ResolvedEvent[], limit: number, pal: Palette): string {
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
      for (const wrapped of wrapToWidth(`${BODY_INDENT}${formatted}`)) {
        lines.push(paintEventLine(events[i].type, wrapped, pal));
      }
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
      // F-fea7bb72: `hostile` is offered exactly like `enemy` — the same
      // convention turns.ts's listHostilesInPlayerZone, menu.ts's
      // menuTargetable, and endgame.ts's detectBaseOutcome already use.
      if ((entity.tags.includes('enemy') || entity.tags.includes('hostile')) && (entity.resources.hp ?? 0) > 0) {
        actions.push({ verb: 'attack', targetIds: [entity.id], label: `Attack ${entity.name}`, group: 'interact' });
      }
      actions.push({ verb: 'inspect', targetIds: [entity.id], label: `Inspect ${entity.name}`, group: 'interact' });
    }

    // Items in player inventory — labels are humanized; toolId stays the raw id.
    const player = world.entities[world.playerId];
    if (player?.inventory) {
      const relicNames = relicDisplayNames(world);
      for (const itemId of player.inventory) {
        const name = relicNames[itemId] ?? humanizeStateId(itemId);
        actions.push({ verb: 'use', toolId: itemId, label: `Use ${name}`, group: 'items' });
      }
    }
  }

  // Inspect current zone — always available, even from nowhere.
  actions.push({ verb: 'inspect', label: 'Look around', group: 'system' });

  return actions;
}

/**
 * An appended menu entry rendered AFTER the base action list, continuing its
 * numbering (P8-PS-005). The embedder (the CLI's ability/journal/director
 * layer) owns what the entries DO — the renderer only needs a label and a
 * group for blank-line separation, exactly like ActionOption's `group`.
 */
export type ExtraMenuEntry = { label: string; group?: string };

export function renderActions(
  world: WorldState,
  opts?: RenderOptions & { extras?: readonly ExtraMenuEntry[] },
): string {
  const pal = paletteFor(opts);
  const ascii = opts?.ascii ?? detectAsciiOnly();
  return withGlyphs(ascii, () => renderActionsInner(world, pal, opts?.extras ?? []));
}

function renderActionsInner(
  world: WorldState,
  pal: Palette,
  extras: readonly ExtraMenuEntry[],
): string {
  const actions = buildActionList(world);
  // Right-align numbers when the menu reaches double digits: [ 9] / [10].
  // ONE width for the whole numbered range — base and appended entries share
  // it, so the seam can never misalign ('[8] Look around' vs '[ 9] Rally')
  // the way the two-renderer split did (P8-PS-005).
  const total = actions.length + extras.length;
  const lines: string[] = [];
  let prevGroup: string | undefined;
  const push = (label: string, group: string, index: number) => {
    if (prevGroup !== undefined && group !== prevGroup) {
      lines.push('');
    }
    prevGroup = group;
    const num = paddedMenuIndex(index, total);
    lines.push(`  ${pal.cyan(num)} ${label}`);
  };
  actions.forEach((action, i) => push(action.label, action.group, i));
  // Appended entries continue the numbering — the same numbers
  // parseExtraSelection (the CLI's extras router) resolves. Group separation
  // follows the base list's rule; the base-to-extras seam always separates
  // because no extras group shares a name with an ActionGroup.
  extras.forEach((extra, i) => push(extra.label, extra.group ?? 'extra', actions.length + i));
  return lines.join('\n') + '\n';
}

/** Parse a numbered action selection into verb + targets */
export function parseActionSelection(
  input: string,
  world: WorldState,
): { verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, ScalarValue> } | null {
  const actions = buildActionList(world);

  // F-7d5f3da9: whole-token digits only — parseInt('1a'/'1.5'/'1e2', 10)
  // prefix-parses as 1 and would fire action 1. Same gate as parseExtraSelection.
  const token = input.trim();
  if (!/^\d+$/.test(token)) return null;
  const num = parseInt(token, 10);
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

  // F-ENG008: equip/unequip take an ITEM argument, never a target. Without
  // this branch the inventory fallthrough below rewrote `equip trident` into
  // `use` — and inventory-core consumed the item. The handler resolves ids
  // itself (bare-equip auto-resolve, structured rejections listing what's
  // carried/equipped); prefix-matching for equip mirrors the `use` argument
  // affordance. Unequip passes raw: equipped items have left the inventory.
  if (verb === 'equip' || verb === 'unequip') {
    if (!rest) return { verb };
    let itemId = rest;
    const player = world.entities[world.playerId];
    if (verb === 'equip' && player?.inventory) {
      const exact = player.inventory.find(i => i.toLowerCase() === rest);
      const prefix = player.inventory.find(i => i.toLowerCase().startsWith(rest));
      const substring = player.inventory.find(i => i.toLowerCase().includes(rest));
      itemId = exact ?? prefix ?? substring ?? rest;
    }
    return { verb, parameters: { itemId } };
  }

  // Resolve target by name
  const zone = world.zones[world.locationId];
  if (!zone) return { verb };

  if (rest) {
    const restLower = rest.toLowerCase();

    const resolveEntity = (): { verb: string; targetIds?: string[]; toolId?: string } | null => {
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
      return null;
    };

    const resolveZone = (): { verb: string; targetIds: string[] } | null => {
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
      return null;
    };

    // P8-PS-003: resolution is verb-aware. Travel verbs try neighbor ZONES
    // first — 'move crypt' next to exit 'Crypt Antechamber' must never be
    // hijacked by a name-shadowing entity (the dead Crypt Stalker), which
    // turned the most common free-text command into a burned round wherever
    // an enemy shares a prefix with a destination. Entities keep first claim
    // for every other verb ('attack crypt' still finds the Stalker) — same
    // branch-per-verb shape as the equip/unequip special case above.
    const TRAVEL_VERBS = new Set(['move', 'go', 'travel']);
    if (TRAVEL_VERBS.has(verb)) {
      const zoneMatch = resolveZone();
      if (zoneMatch) return zoneMatch;
      const entityMatch = resolveEntity();
      if (entityMatch) return entityMatch;
    } else {
      const entityMatch = resolveEntity();
      if (entityMatch) return entityMatch;
      const zoneMatch = resolveZone();
      if (zoneMatch) return zoneMatch;
    }

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
  const line = formatEventLineRaw(event);
  return line === null ? null : applyGlyphPunctuation(line);
}

function formatEventLineRaw(event: ResolvedEvent): string | null {
  const p = event.payload;
  switch (event.type) {
    case 'world.zone.entered': {
      // F-fdc1f590 (R4): moodHint is a district-mood aside appended verbatim
      // in parens — formatDistrictMoodForNarrator already emits its own
      // 'District: descriptor' shape, so a period separates the two clauses
      // rather than concatenating them without one. Omitted, this is
      // byte-identical to the line before this hint existed.
      const moodHint = payloadString(p, 'moodHint');
      return moodHint ? `> Entered ${p.zoneName}. (${moodHint})` : `> Entered ${p.zoneName}`;
    }

    // C3/P2 — the "show the lock" doctrine, rendered. A gate that refuses
    // silently is a door the player concludes is broken; the AUTHORED reason is
    // the whole point of carrying `reason` across the wire (charter Pillar 2:
    // access stays rule-bound while traversal feel is client-authored — the
    // client has to be TOLD why). Two cases rather than one because the
    // difference between "you cannot" and "you probably should not" is exactly
    // what `mode` encodes, and collapsing them would discard it.
    case 'world.zone.gate.refused':
      return `> ${p.reason}`;
    case 'world.zone.gate.warned':
      return `> ${p.reason} (you press on anyway)`;
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
      // F-fdc1f590 (R4): one more labeled clause, same shape as its
      // You-see/Points-of-interest/Hazards siblings above. Omitted, this is
      // byte-identical to the line before this hint existed.
      const situationHint = payloadString(p, 'situationHint');
      if (situationHint) {
        parts.push(`Situation: ${situationHint}.`);
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
    // F-ENG005: zone-entry encounter spawns (encounter-spawn module). Label is
    // the composition kind (Ambush/Patrol/Horde/Challenge/Encounter);
    // description is the authored trigger hook, terminal punctuation stripped.
    case 'encounter.spawned': {
      const label = payloadString(p, 'label') ?? 'Encounter';
      const desc = payloadString(p, 'description') ?? 'something moves against you';
      return `> ${label}: ${desc}.`;
    }

    // F-ENG005: the quest loop (quest-core). Telegraph lines in the
    // pressure/encounter family: the module authors display-ready strings
    // (names, stage hooks, reward summaries) onto the payload; every field
    // falls back so a sparse payload still renders a complete sentence.
    case 'quest.offered': {
      const name = payloadString(p, 'questName') ?? payloadString(p, 'questId') ?? 'A new undertaking';
      const hook = payloadString(p, 'stageDescription') ?? payloadString(p, 'stageName');
      return hook ? `> New quest — ${name}: ${hook}.` : `> New quest — ${name}.`;
    }
    case 'quest.stage.advanced': {
      const name = payloadString(p, 'questName') ?? payloadString(p, 'questId') ?? 'The quest';
      const hook = payloadString(p, 'stageDescription') ?? payloadString(p, 'stageName');
      // The fail branch is a turn for the worse, not progress — say so.
      if (p.via === 'fail') {
        return hook ? `> The quest turns — ${name}: ${hook}.` : `> The quest turns — ${name}.`;
      }
      return hook ? `> Quest advanced — ${name}: ${hook}.` : `> Quest advanced — ${name}.`;
    }
    case 'quest.completed': {
      const name = payloadString(p, 'questName') ?? payloadString(p, 'questId') ?? 'A quest';
      const rewards = Array.isArray(p.rewardSummary)
        ? (p.rewardSummary as unknown[]).filter((r): r is string => typeof r === 'string' && r.length > 0)
        : [];
      return rewards.length > 0
        ? `> Quest complete — ${name}. Reward: ${rewards.join(', ')}.`
        : `> Quest complete — ${name}.`;
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

/** A numbered dialogue choice currently printed on the Dialogue section. */
export type DialogueChoiceOnScreen = { id: string; text: string; index: number };

/**
 * F-c7ac6a7c: the choices renderDialogue would number on this frame — the
 * same `dialogue.node.entered` payload, the same lookback. Empty when
 * dialogue is not active, when the node is out of the lookback window, or
 * when the node has no choices (the original dialogue-trap: no numbers on
 * screen, the Actions section is the live menu). CLI routing uses this so a
 * rejected `choose` cannot fall through into parseActionSelection while
 * these numbers own the frame.
 */
export function visibleDialogueChoices(world: WorldState): DialogueChoiceOnScreen[] {
  const dState = world.modules['dialogue-core'] as { activeDialogue?: string | null } | undefined;
  if (!dState?.activeDialogue) return [];
  const nodeEvent = findRecentEvent(world.eventLog, e => e.type === 'dialogue.node.entered');
  if (!nodeEvent) return [];
  const choices = nodeEvent.payload.choices as DialogueChoiceOnScreen[] | undefined;
  return Array.isArray(choices) && choices.length > 0 ? choices : [];
}

export function renderDialogue(world: WorldState, opts?: RenderOptions): string | null {
  const pal = paletteFor(opts);
  const ascii = opts?.ascii ?? detectAsciiOnly();
  return withGlyphs(ascii, () => renderDialogueInner(world, pal));
}

function renderDialogueInner(world: WorldState, pal: Palette): string | null {
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

  const payload = nodeEvent.payload;
  const lines: string[] = [];

  // F-fdc1f590 (R4): textureHint — its own line, verbatim, ABOVE the speaker
  // line (already a complete clause; npc-agency's generateNpcTextures).
  const textureHint = payloadString(payload, 'textureHint');
  if (textureHint) lines.push(...wrapToWidth(`${BODY_INDENT}${textureHint}`));

  // dialogueBias — its own line, verbatim, between textureHint and speaker
  // (social-consequence.ts already produces complete sentences).
  const dialogueBias = payloadString(payload, 'dialogueBias');
  if (dialogueBias) lines.push(...wrapToWidth(`${BODY_INDENT}${dialogueBias}`));

  const speaker = String(payload.speaker);
  const spoken = String(payload.text);
  // dialogueHint — a stage-direction FRAGMENT, not a sentence: a
  // parenthetical appended to the speaker name on the SAME line.
  const dialogueHint = payloadString(payload, 'dialogueHint');
  const speakerLabel = dialogueHint ? `${speaker} (${dialogueHint})` : speaker;
  const spokenLines = wrapToWidth(`${BODY_INDENT}${speakerLabel}: "${spoken}"`);
  spokenLines.forEach((line, i) => {
    lines.push(i === 0 ? line.replace(`${speakerLabel}:`, `${pal.bold(speakerLabel)}:`) : line);
  });

  const choices = payload.choices as Array<{ id: string; text: string; index: number }> | undefined;
  if (choices && choices.length > 0) {
    lines.push('');
    const count = Math.max(choices.length, ...choices.map(c => c.index + 1));
    for (const choice of choices) {
      const num = paddedMenuIndex(choice.index, count);
      lines.push(...wrapToWidth(`  ${pal.cyan(num)} ${choice.text}`));
    }
  }

  // partyPresence / pressureHint / opportunityHint — world/party-scoped
  // asides unrelated to the immediate speaker turn: a trailing footer block
  // AFTER the numbered choices, each independently gated, each its own
  // line. Labels ("Meanwhile:", "Unfinished business:") are this renderer's
  // own framing; the hint STRINGS themselves render verbatim (producer-owned
  // punctuation — no invented trailing periods).
  const footer: string[] = [];
  const partyPresence = payloadString(payload, 'partyPresence');
  if (partyPresence) footer.push(...wrapToWidth(`${BODY_INDENT}(${partyPresence})`));
  const pressureHint = payloadString(payload, 'pressureHint');
  if (pressureHint) footer.push(...wrapToWidth(`${BODY_INDENT}(Meanwhile: ${pressureHint})`));
  const opportunityHint = payloadString(payload, 'opportunityHint');
  if (opportunityHint) footer.push(...wrapToWidth(`${BODY_INDENT}(Unfinished business: ${opportunityHint})`));
  if (footer.length > 0) {
    lines.push('');
    lines.push(...footer);
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
  /**
   * Appended menu entries (the CLI's ability/unlock/journal/director layer),
   * rendered INSIDE the Actions section continuing its numbering — below the
   * base list, above the screen-closing rule (P8-PS-005: the old embedder
   * pattern printed them after renderFullScreen's return, so the closing rule
   * bisected the menu on every frame and the two number columns misaligned at
   * the seam). Suppressed together with the Actions section (dialogue frames,
   * `actions: false`) — the extras belong to the menu, never to a corpse.
   */
  extraActions?: readonly ExtraMenuEntry[];
};

export function renderFullScreen(world: WorldState, recentEvents: ResolvedEvent[], opts?: FullScreenOptions): string {
  // Resolve color AND glyphs ONCE per screen so every section renders under
  // the same decision — no mid-frame flips if the environment changes under us.
  const pal = paletteFor(opts);
  const ascii = opts?.ascii ?? detectAsciiOnly();
  const resolved: RenderOptions = { color: pal.enabled, ascii, partyLine: opts?.partyLine };

  return withGlyphs(ascii, () => {
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

  // The numbered Actions section is suppressed while dialogue CHOICES are
  // on screen: those numbers own the frame, and rendering both lists put
  // two colliding `[1]`/`[2]` columns on one (the input router resolves
  // numbers to dialogue choices first, so the base menu's numbers were
  // lying). The original trap (activeDialogue set, no visible choices) and
  // the just-ended echo frame (activeDialogue null) keep the action menu —
  // F-c7ac6a7c: fall-through to parseActionSelection is only honest when
  // this list is actually rendered. Callers can also suppress explicitly
  // via `actions: false` (end frames).
  const showActions = (opts?.actions ?? true) && visibleDialogueChoices(world).length === 0;
  if (showActions) {
    sections.push(
      `${sectionRule('Actions', pal)}\n${renderActions(world, { ...resolved, extras: opts?.extraActions })}`,
    );
  }

  // Sections each end with '\n'; joining with '\n' yields exactly one blank
  // line between blocks. The closing rule sits tight under the last line.
  return sections.join('\n') + rule(pal);
  });
}
