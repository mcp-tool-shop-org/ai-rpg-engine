// Terminal renderer — scene, event log, command display

import type { WorldState, ResolvedEvent, ZoneState, EntityState } from '@ai-rpg-engine/core';

const DIVIDER = '─'.repeat(60);
const THIN_DIVIDER = '·'.repeat(60);

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

export function renderScene(world: WorldState): string {
  const zone = world.zones[world.locationId];
  if (!zone) return '  You are nowhere.\n';

  const lines: string[] = [];

  // Zone header
  lines.push(`  ${zone.name}`);
  lines.push(`  ${THIN_DIVIDER}`);

  // Tags
  if (zone.tags.length > 0) {
    lines.push(`  [${zone.tags.join(', ')}]`);
  }

  // Entities present
  const entities = Object.values(world.entities).filter(
    e => e.zoneId === zone.id && e.id !== world.playerId
  );
  if (entities.length > 0) {
    lines.push('');
    for (const entity of entities) {
      const hp = entity.resources.hp;
      // CS-C amend: a corpse used to render "! Crypt Warden (HP: 0)
      // [combat:fleeing]" — a dead entity advertising live combat state.
      // Defeated entities show "(defeated)" and suppress their status tags.
      const defeated = hp !== undefined && hp <= 0;
      const hpStr = hp !== undefined ? (defeated ? ' (defeated)' : ` (HP: ${hp})`) : '';
      const statusStr = !defeated && entity.statuses.length > 0
        ? ` [${entity.statuses.map(s => humanizeStateId(s.statusId)).join(', ')}]`
        : '';
      lines.push(`  ${entityIcon(entity)} ${entity.name}${hpStr}${statusStr}`);
    }
  }

  // Interactables
  if (zone.interactables && zone.interactables.length > 0) {
    lines.push('');
    for (const item of zone.interactables) {
      lines.push(`  * ${item}`);
    }
  }

  // Exits
  if (zone.neighbors.length > 0) {
    lines.push('');
    lines.push(`  Exits: ${zone.neighbors.map(n => {
      const z = world.zones[n];
      return z ? z.name : n;
    }).join(', ')}`);
  }

  // Player status
  const player = world.entities[world.playerId];
  if (player) {
    lines.push('');
    lines.push(`  ${THIN_DIVIDER}`);
    const hp = player.resources.hp ?? 0;
    const stamina = player.resources.stamina ?? 0;
    lines.push(`  HP: ${hp}  Stamina: ${stamina}`);
    if (player.statuses.length > 0) {
      lines.push(`  Status: ${player.statuses.map(s => humanizeStateId(s.statusId)).join(', ')}`);
    }
    if (player.inventory && player.inventory.length > 0) {
      lines.push(`  Items: ${player.inventory.join(', ')}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * How many of the most-recent events renderEventLog scans for renderable
 * lines. Same bounded-scan discipline as DIALOGUE_LOOKBACK (F-4b7e6f01):
 * cost is O(lookback) regardless of total log length.
 */
export const EVENT_LOG_LOOKBACK = 100;

export function renderEventLog(events: ResolvedEvent[], limit = 8): string {
  // CS-C-004: filter to renderable events FIRST, then take the last `limit`.
  // The old order (slice(-limit), then format) let unrenderable bookkeeping —
  // defeat fallout, flag changes, audio cues — occupy window slots and push
  // the killing blow "X defeated!" out, so a victory turn rendered as an
  // empty divider. `limit` now counts LINES THE PLAYER SEES.
  const scanStart = Math.max(0, events.length - EVENT_LOG_LOOKBACK);
  const lines: string[] = [];
  for (let i = scanStart; i < events.length; i++) {
    const formatted = formatEvent(events[i]);
    if (formatted) {
      lines.push(`  ${formatted}`);
    }
  }

  const recent = lines.slice(-limit);
  // '' (not '\n') when nothing is renderable, so renderFullScreen skips the
  // section instead of printing a divider over a blank line.
  if (recent.length === 0) return '';
  return recent.join('\n') + '\n';
}

export function renderActions(world: WorldState): string {
  const zone = world.zones[world.locationId];
  const lines: string[] = [];
  let idx = 1;

  // Movement options
  if (zone?.neighbors) {
    for (const neighborId of zone.neighbors) {
      const neighbor = world.zones[neighborId];
      const name = neighbor?.name ?? neighborId;
      lines.push(`  [${idx}] Move to ${name}`);
      idx++;
    }
  }

  // Entities in zone for interaction
  const entities = Object.values(world.entities).filter(
    e => e.zoneId === zone?.id && e.id !== world.playerId
  );
  for (const entity of entities) {
    if (entity.tags.includes('npc')) {
      lines.push(`  [${idx}] Speak to ${entity.name}`);
      idx++;
    }
    if (entity.tags.includes('enemy') && (entity.resources.hp ?? 0) > 0) {
      lines.push(`  [${idx}] Attack ${entity.name}`);
      idx++;
    }
    lines.push(`  [${idx}] Inspect ${entity.name}`);
    idx++;
  }

  // Items in player inventory
  const player = world.entities[world.playerId];
  if (player?.inventory) {
    for (const itemId of player.inventory) {
      lines.push(`  [${idx}] Use ${itemId}`);
      idx++;
    }
  }

  // Inspect current zone
  lines.push(`  [${idx}] Look around`);

  return lines.join('\n') + '\n';
}

/** Parse a numbered action selection into verb + targets */
export function parseActionSelection(
  input: string,
  world: WorldState,
): { verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, import('@ai-rpg-engine/core').ScalarValue> } | null {
  const zone = world.zones[world.locationId];
  if (!zone) return null;

  // Build the same action list to map index → action
  const actions: Array<{ verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, import('@ai-rpg-engine/core').ScalarValue> }> = [];

  for (const neighborId of zone.neighbors) {
    actions.push({ verb: 'move', targetIds: [neighborId] });
  }

  const entities = Object.values(world.entities).filter(
    e => e.zoneId === zone.id && e.id !== world.playerId
  );
  for (const entity of entities) {
    if (entity.tags.includes('npc')) {
      actions.push({ verb: 'speak', targetIds: [entity.id] });
    }
    if (entity.tags.includes('enemy') && (entity.resources.hp ?? 0) > 0) {
      actions.push({ verb: 'attack', targetIds: [entity.id] });
    }
    actions.push({ verb: 'inspect', targetIds: [entity.id] });
  }

  const player = world.entities[world.playerId];
  if (player?.inventory) {
    for (const itemId of player.inventory) {
      actions.push({ verb: 'use', toolId: itemId });
    }
  }

  actions.push({ verb: 'inspect' });

  // Number selection
  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= actions.length) {
    return actions[num - 1];
  }

  return null;
}

/** Parse freeform text input into verb + targets */
export function parseTextInput(
  input: string,
  world: WorldState,
): { verb: string; targetIds?: string[]; toolId?: string; parameters?: Record<string, import('@ai-rpg-engine/core').ScalarValue> } | null {
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

function formatEvent(event: ResolvedEvent): string | null {
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

function entityIcon(entity: EntityState): string {
  if (entity.tags.includes('enemy')) return '!';
  if (entity.tags.includes('npc')) return '?';
  if (entity.tags.includes('item')) return '*';
  return '-';
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

export function renderDialogue(world: WorldState): string | null {
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
        return `  ${lastNode.payload.speaker}: "${lastNode.payload.text}"\n`;
      }
    }
    return null;
  }

  // Find the most recent dialogue.node.entered event
  const nodeEvent = findRecentEvent(world.eventLog, e => e.type === 'dialogue.node.entered');
  if (!nodeEvent) return null;

  const lines: string[] = [];
  lines.push(`  ${nodeEvent.payload.speaker}: "${nodeEvent.payload.text}"`);

  const choices = nodeEvent.payload.choices as Array<{ id: string; text: string; index: number }> | undefined;
  if (choices && choices.length > 0) {
    lines.push('');
    for (const choice of choices) {
      lines.push(`  [${choice.index + 1}] ${choice.text}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function renderFullScreen(world: WorldState, recentEvents: ResolvedEvent[]): string {
  const lines: string[] = [];

  lines.push(DIVIDER);
  lines.push(renderScene(world));

  // Check for active dialogue
  const dialogueDisplay = renderDialogue(world);
  if (dialogueDisplay) {
    lines.push(DIVIDER);
    lines.push(dialogueDisplay);
  }

  // CS-C-004 (part 2): render the log from the world's own eventLog when it
  // has one. The CLI passes `world.eventLog.slice(-8)` — a RAW window, so a
  // defeat followed by 8+ bookkeeping events never even reaches
  // renderEventLog's filter-first fix via the argument. `world` is the same
  // object the caller sliced from, so sourcing here repairs the loop without
  // touching the caller. `recentEvents` remains the fallback for hand-built
  // worlds / curated replays that pass an explicit list.
  const eventSource = world.eventLog && world.eventLog.length > 0 ? world.eventLog : recentEvents;
  const eventLog = renderEventLog(eventSource);
  if (eventLog) {
    lines.push(DIVIDER);
    lines.push(eventLog);
  }

  lines.push(DIVIDER);
  lines.push(renderActions(world));
  lines.push(DIVIDER);

  return lines.join('\n');
}
