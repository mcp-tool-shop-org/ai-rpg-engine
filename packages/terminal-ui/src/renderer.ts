// Terminal renderer — scene, event log, command display

import type { WorldState, ResolvedEvent, ZoneState, EntityState } from '@ai-rpg-engine/core';

const DIVIDER = '─'.repeat(60);
const THIN_DIVIDER = '·'.repeat(60);

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
      const hpStr = hp !== undefined ? ` (HP: ${hp})` : '';
      const statusStr = entity.statuses.length > 0
        ? ` [${entity.statuses.map(s => s.statusId).join(', ')}]`
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
      lines.push(`  Status: ${player.statuses.map(s => s.statusId).join(', ')}`);
    }
    if (player.inventory && player.inventory.length > 0) {
      lines.push(`  Items: ${player.inventory.join(', ')}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function renderEventLog(events: ResolvedEvent[], limit = 8): string {
  const recent = events.slice(-limit);
  if (recent.length === 0) return '';

  const lines: string[] = [];
  for (const event of recent) {
    const formatted = formatEvent(event);
    if (formatted) {
      lines.push(`  ${formatted}`);
    }
  }
  return lines.join('\n') + '\n';
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
  if (parts.length === 0) return null;

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

function formatEvent(event: ResolvedEvent): string | null {
  switch (event.type) {
    case 'world.zone.entered':
      return `> Entered ${event.payload.zoneName}`;
    case 'combat.contact.hit':
      return `> Hit!`;
    case 'combat.contact.miss':
      return `> Miss.`;
    case 'combat.damage.applied':
      return `> ${event.payload.damage} damage dealt (HP: ${event.payload.currentHp})`;
    case 'combat.entity.defeated':
      return `> ${event.payload.entityName} defeated!`;
    case 'status.applied':
      return `> Status: ${event.payload.statusId} applied`;
    case 'status.removed':
      return `> Status: ${event.payload.statusId} removed`;
    case 'status.expired':
      return `> Status: ${event.payload.statusId} expired`;
    case 'item.used':
      return `> Used ${event.payload.itemId}`;
    case 'item.acquired':
      return `> Acquired ${event.payload.itemId}`;
    case 'resource.changed':
      return `> ${event.payload.resource}: ${event.payload.previous} → ${event.payload.current}`;
    case 'dialogue.started':
      return `> Speaking with ${event.payload.speakerName}`;
    case 'dialogue.node.entered':
      return null; // Rendered separately in dialogue display
    case 'dialogue.choice.selected':
      return `> "${event.payload.choiceText}"`;
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

export function renderDialogue(world: WorldState): string | null {
  const dState = world.modules['dialogue-core'] as { activeDialogue: string | null } | undefined;
  if (!dState?.activeDialogue) {
    // Show the last spoken line briefly if dialogue just ended
    const endedEvent = [...world.eventLog].reverse().find(e => e.type === 'dialogue.ended');
    if (endedEvent) {
      const lastNode = [...world.eventLog].reverse().find(
        e => e.type === 'dialogue.node.entered' && e.tick <= endedEvent.tick
      );
      if (lastNode && endedEvent.tick === world.meta.tick - 1) {
        return `  ${lastNode.payload.speaker}: "${lastNode.payload.text}"\n`;
      }
    }
    return null;
  }

  // Find the most recent dialogue.node.entered event
  const nodeEvent = [...world.eventLog].reverse().find(e => e.type === 'dialogue.node.entered');
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

  const eventLog = renderEventLog(recentEvents);
  if (eventLog) {
    lines.push(DIVIDER);
    lines.push(eventLog);
  }

  lines.push(DIVIDER);
  lines.push(renderActions(world));
  lines.push(DIVIDER);

  return lines.join('\n');
}
