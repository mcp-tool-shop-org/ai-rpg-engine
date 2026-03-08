// pressure-resolution — structured pressure resolution + fallout generation
// Pure functions + types. No module registration.
// When a pressure resolves (player action, expiry, faction action),
// computeFallout() returns structured effects: rep changes, rumors, chain pressures.
// Product layer applies effects. Claude narrates from the structure.

import type { PressureKind, PressureVisibility, WorldPressure } from './pressure-system.js';
import type { RumorValence } from './player-rumor.js';

// --- Types ---

export type ResolutionType =
  | 'resolved-by-player'
  | 'resolved-by-faction'
  | 'escalated'
  | 'failed'
  | 'transformed'
  | 'superseded'
  | 'expired-ignored';

export type PressureResolution = {
  pressureId: string;
  pressureKind: PressureKind;
  resolutionType: ResolutionType;
  /** 'player' | factionId | 'expiry' */
  resolvedBy: string;
  resolvedAtTick: number;
  /** How widely the resolution is known */
  resolutionVisibility: PressureVisibility;
};

export type FalloutEffect =
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'alert'; factionId: string; delta: number }
  | { type: 'district'; districtId: string; metric: string; delta: number }
  | { type: 'rumor'; claim: string; valence: RumorValence; spreadTo: string[] }
  | { type: 'spawn-pressure'; kind: PressureKind; sourceFactionId: string;
      description: string; urgency: number; tags: string[] }
  | { type: 'milestone-tag'; tag: string }
  | { type: 'title-trigger'; tag: string };

export type PressureFallout = {
  resolution: PressureResolution;
  effects: FalloutEffect[];
  /** One-line summary for director mode */
  summary: string;
};

export type FalloutContext = {
  resolvedBy: string;
  currentTick: number;
  playerDistrictId?: string;
  resolutionVisibility?: PressureVisibility;
};

// --- Main Entry ---

/**
 * Compute structured fallout from a resolved pressure.
 * Pure function — returns effects for the product layer to apply.
 */
export function computeFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  genre: string,
  ctx: FalloutContext,
): PressureFallout {
  const resolution: PressureResolution = {
    pressureId: pressure.id,
    pressureKind: pressure.kind,
    resolutionType,
    resolvedBy: ctx.resolvedBy,
    resolvedAtTick: ctx.currentTick,
    resolutionVisibility: ctx.resolutionVisibility ?? pressure.visibility,
  };

  // Collect effects from universal + genre tables
  const effects: FalloutEffect[] = [
    ...getUniversalFallout(pressure, resolutionType, ctx),
    ...getGenreFallout(pressure, resolutionType, genre, ctx),
  ];

  const summary = buildFalloutSummary(pressure, resolutionType);

  return { resolution, effects, summary };
}

// --- Universal Fallout ---

function getUniversalFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  ctx: FalloutContext,
): FalloutEffect[] {
  const effects: FalloutEffect[] = [];
  const faction = pressure.sourceFactionId;

  switch (pressure.kind) {
    case 'bounty-issued':
      switch (resolutionType) {
        case 'resolved-by-player':
          effects.push({ type: 'reputation', factionId: faction, delta: 20 });
          effects.push({
            type: 'rumor', claim: 'cleared the bounty',
            valence: 'heroic', spreadTo: [faction],
          });
          effects.push({ type: 'title-trigger', tag: 'bounty-survivor' });
          break;
        case 'expired-ignored':
          effects.push({ type: 'reputation', factionId: faction, delta: -10 });
          effects.push({ type: 'alert', factionId: faction, delta: 10 });
          effects.push({
            type: 'spawn-pressure', kind: 'revenge-attempt',
            sourceFactionId: faction,
            description: `${faction} sends hunters after the player`,
            urgency: 0.6, tags: ['hostile', 'chain'],
          });
          break;
        case 'failed':
          effects.push({ type: 'reputation', factionId: faction, delta: -5 });
          effects.push({
            type: 'rumor', claim: 'escaped the hunters',
            valence: 'fearsome', spreadTo: [faction],
          });
          break;
        case 'resolved-by-faction':
          effects.push({ type: 'alert', factionId: faction, delta: -10 });
          break;
      }
      break;

    case 'investigation-opened':
      switch (resolutionType) {
        case 'resolved-by-player':
          effects.push({ type: 'reputation', factionId: faction, delta: 10 });
          effects.push({ type: 'alert', factionId: faction, delta: -20 });
          break;
        case 'expired-ignored':
          effects.push({
            type: 'spawn-pressure', kind: 'bounty-issued',
            sourceFactionId: faction,
            description: `${faction} issues a bounty after inconclusive investigation`,
            urgency: 0.7, tags: ['hostile', 'chain', 'escalation'],
          });
          break;
        case 'escalated':
          effects.push({
            type: 'spawn-pressure', kind: 'bounty-issued',
            sourceFactionId: faction,
            description: `${faction} escalates investigation to active bounty`,
            urgency: 0.7, tags: ['hostile', 'chain', 'escalation'],
          });
          effects.push({ type: 'alert', factionId: faction, delta: 15 });
          break;
        case 'failed':
          effects.push({ type: 'reputation', factionId: faction, delta: -10 });
          effects.push({
            type: 'rumor', claim: 'fled from investigation',
            valence: 'fearsome', spreadTo: [faction],
          });
          break;
      }
      break;

    case 'merchant-blacklist':
      switch (resolutionType) {
        case 'resolved-by-player':
          effects.push({ type: 'reputation', factionId: faction, delta: 15 });
          effects.push({
            type: 'rumor', claim: 'made amends with the merchants',
            valence: 'heroic', spreadTo: [faction],
          });
          break;
        case 'expired-ignored':
          if (ctx.playerDistrictId) {
            effects.push({
              type: 'district', districtId: ctx.playerDistrictId,
              metric: 'stability', delta: -10,
            });
          }
          break;
      }
      break;

    case 'faction-summons':
      switch (resolutionType) {
        case 'resolved-by-player':
          effects.push({ type: 'reputation', factionId: faction, delta: 10 });
          break;
        case 'expired-ignored':
          effects.push({ type: 'reputation', factionId: faction, delta: -20 });
          effects.push({
            type: 'rumor', claim: `ignored summons from ${faction}`,
            valence: 'fearsome', spreadTo: [faction],
          });
          break;
      }
      break;

    case 'revenge-attempt':
      switch (resolutionType) {
        case 'resolved-by-player':
          effects.push({ type: 'reputation', factionId: faction, delta: -10 });
          effects.push({
            type: 'rumor', claim: 'fought off the avengers',
            valence: 'fearsome', spreadTo: [faction],
          });
          effects.push({ type: 'milestone-tag', tag: 'survival' });
          break;
        case 'failed':
          effects.push({ type: 'milestone-tag', tag: 'defeat' });
          effects.push({
            type: 'rumor', claim: 'was bested by avengers',
            valence: 'tragic', spreadTo: [faction],
          });
          break;
        case 'expired-ignored':
          effects.push({ type: 'alert', factionId: faction, delta: -5 });
          break;
      }
      break;
  }

  return effects;
}

// --- Genre Fallout ---

function getGenreFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  genre: string,
  ctx: FalloutContext,
): FalloutEffect[] {
  switch (genre) {
    case 'fantasy':
      return getFantasyFallout(pressure, resolutionType, ctx);
    case 'mystery':
      return getMysteryFallout(pressure, resolutionType, ctx);
    case 'pirate':
      return getPirateFallout(pressure, resolutionType, ctx);
    case 'horror':
    case 'post-apocalyptic':
      return getHorrorFallout(pressure, resolutionType, ctx);
    case 'cyberpunk':
      return getCyberpunkFallout(pressure, resolutionType, ctx);
    default:
      return [];
  }
}

function getFantasyFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  _ctx: FalloutContext,
): FalloutEffect[] {
  const effects: FalloutEffect[] = [];
  const faction = pressure.sourceFactionId;

  switch (pressure.kind) {
    case 'heresy-whisper':
      if (resolutionType === 'expired-ignored') {
        effects.push({
          type: 'spawn-pressure', kind: 'chapel-sanction',
          sourceFactionId: faction,
          description: `the ${faction} formally sanctions the player for unanswered heresy`,
          urgency: 0.7, tags: ['religious', 'fantasy', 'chain', 'escalation'],
        });
      } else if (resolutionType === 'resolved-by-player') {
        effects.push({ type: 'reputation', factionId: faction, delta: 10 });
        effects.push({
          type: 'rumor', claim: 'answered the whispers of heresy',
          valence: 'heroic', spreadTo: [faction],
        });
      }
      break;

    case 'chapel-sanction':
      if (resolutionType === 'resolved-by-player') {
        effects.push({
          type: 'rumor', claim: 'vindicated before the chapel',
          valence: 'heroic', spreadTo: [faction],
        });
        effects.push({ type: 'title-trigger', tag: 'faith-tested' });
        effects.push({ type: 'reputation', factionId: faction, delta: 15 });
      } else if (resolutionType === 'expired-ignored') {
        effects.push({ type: 'reputation', factionId: faction, delta: -15 });
        effects.push({
          type: 'rumor', claim: 'stands condemned by the chapel',
          valence: 'fearsome', spreadTo: [faction],
        });
      }
      break;
  }

  return effects;
}

function getMysteryFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  _ctx: FalloutContext,
): FalloutEffect[] {
  const effects: FalloutEffect[] = [];
  const faction = pressure.sourceFactionId;

  switch (pressure.kind) {
    case 'case-opened':
      if (resolutionType === 'expired-ignored') {
        effects.push({
          type: 'spawn-pressure', kind: 'witness-vanished',
          sourceFactionId: faction,
          description: `a key witness disappears as the case goes cold`,
          urgency: 0.7, tags: ['investigation', 'mystery', 'chain', 'escalation'],
        });
      } else if (resolutionType === 'resolved-by-player') {
        effects.push({ type: 'alert', factionId: faction, delta: -15 });
        effects.push({ type: 'milestone-tag', tag: 'case-closed' });
      }
      break;

    case 'witness-vanished':
      if (resolutionType === 'resolved-by-player') {
        effects.push({ type: 'milestone-tag', tag: 'detective' });
        effects.push({
          type: 'rumor', claim: 'found the vanished witness',
          valence: 'heroic', spreadTo: [faction],
        });
        effects.push({ type: 'reputation', factionId: faction, delta: 15 });
      } else if (resolutionType === 'expired-ignored') {
        effects.push({ type: 'alert', factionId: faction, delta: 10 });
        effects.push({
          type: 'rumor', claim: 'the witness was never found',
          valence: 'tragic', spreadTo: [faction],
        });
      }
      break;
  }

  return effects;
}

function getPirateFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  _ctx: FalloutContext,
): FalloutEffect[] {
  const effects: FalloutEffect[] = [];
  const faction = pressure.sourceFactionId;

  switch (pressure.kind) {
    case 'mutiny-brewing':
      if (resolutionType === 'expired-ignored') {
        effects.push({
          type: 'spawn-pressure', kind: 'merchant-blacklist',
          sourceFactionId: faction,
          description: `the mutinous crew has deposed the player from command`,
          urgency: 0.6, tags: ['social', 'pirate', 'chain'],
        });
        effects.push({
          type: 'rumor', claim: 'lost command of their crew',
          valence: 'tragic', spreadTo: [faction],
        });
      } else if (resolutionType === 'resolved-by-player') {
        effects.push({ type: 'reputation', factionId: faction, delta: 15 });
        effects.push({
          type: 'rumor', claim: 'crushed the mutiny',
          valence: 'fearsome', spreadTo: [faction],
        });
        effects.push({ type: 'title-trigger', tag: 'iron-captain' });
      }
      break;

    case 'navy-bounty':
      if (resolutionType === 'resolved-by-player') {
        effects.push({
          type: 'rumor', claim: 'evaded the fleet',
          valence: 'fearsome', spreadTo: [faction],
        });
        effects.push({ type: 'milestone-tag', tag: 'seafarer' });
      } else if (resolutionType === 'expired-ignored') {
        effects.push({ type: 'alert', factionId: faction, delta: -10 });
      }
      break;
  }

  return effects;
}

function getHorrorFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  ctx: FalloutContext,
): FalloutEffect[] {
  const effects: FalloutEffect[] = [];
  const faction = pressure.sourceFactionId;

  switch (pressure.kind) {
    case 'infection-suspicion':
      if (resolutionType === 'expired-ignored') {
        if (ctx.playerDistrictId) {
          effects.push({
            type: 'district', districtId: ctx.playerDistrictId,
            metric: 'stability', delta: -15,
          });
        }
        effects.push({
          type: 'spawn-pressure', kind: 'camp-panic',
          sourceFactionId: faction,
          description: `fear of infection spreads unchecked through the settlement`,
          urgency: 0.6, tags: ['social', 'horror', 'chain', 'panic'],
        });
      } else if (resolutionType === 'resolved-by-player') {
        effects.push({ type: 'reputation', factionId: faction, delta: 10 });
        effects.push({
          type: 'rumor', claim: 'proved they were clean',
          valence: 'heroic', spreadTo: [faction],
        });
      }
      break;

    case 'camp-panic':
      if (resolutionType === 'resolved-by-player') {
        effects.push({ type: 'milestone-tag', tag: 'leader' });
        effects.push({ type: 'reputation', factionId: faction, delta: 15 });
        effects.push({
          type: 'rumor', claim: 'calmed the settlement',
          valence: 'heroic', spreadTo: [faction],
        });
        effects.push({ type: 'title-trigger', tag: 'steadfast' });
      } else if (resolutionType === 'expired-ignored') {
        if (ctx.playerDistrictId) {
          effects.push({
            type: 'district', districtId: ctx.playerDistrictId,
            metric: 'stability', delta: -20,
          });
        }
        effects.push({
          type: 'rumor', claim: 'did nothing while the camp fell apart',
          valence: 'tragic', spreadTo: [faction],
        });
      }
      break;
  }

  return effects;
}

function getCyberpunkFallout(
  pressure: WorldPressure,
  resolutionType: ResolutionType,
  _ctx: FalloutContext,
): FalloutEffect[] {
  const effects: FalloutEffect[] = [];
  const faction = pressure.sourceFactionId;

  switch (pressure.kind) {
    case 'corp-manhunt':
      if (resolutionType === 'expired-ignored') {
        effects.push({
          type: 'spawn-pressure', kind: 'ice-escalation',
          sourceFactionId: faction,
          description: `${faction} upgrades defenses after failed manhunt`,
          urgency: 0.5, tags: ['digital', 'cyberpunk', 'chain', 'escalation'],
        });
      } else if (resolutionType === 'resolved-by-player') {
        effects.push({
          type: 'rumor', claim: 'survived the corporate manhunt',
          valence: 'fearsome', spreadTo: [faction],
        });
        effects.push({ type: 'alert', factionId: faction, delta: -15 });
        effects.push({ type: 'title-trigger', tag: 'ghost' });
      }
      break;

    case 'ice-escalation':
      if (resolutionType === 'resolved-by-player') {
        effects.push({
          type: 'rumor', claim: 'cracked the ICE',
          valence: 'heroic', spreadTo: [faction],
        });
        effects.push({ type: 'milestone-tag', tag: 'netrunner' });
        effects.push({ type: 'reputation', factionId: faction, delta: -5 });
      } else if (resolutionType === 'expired-ignored') {
        effects.push({ type: 'alert', factionId: faction, delta: 5 });
      }
      break;
  }

  return effects;
}

// --- Formatting ---

const DIVIDER = '─'.repeat(60);

/** Format a single fallout record for the director /world view. */
export function formatFalloutForDirector(fallout: PressureFallout): string {
  const r = fallout.resolution;
  const parts: string[] = [
    `  [${r.pressureKind}] → ${r.resolutionType}`,
    `    Resolved by: ${r.resolvedBy} at tick ${r.resolvedAtTick}`,
    `    Visibility: ${r.resolutionVisibility}`,
    `    Summary: ${fallout.summary}`,
  ];

  if (fallout.effects.length > 0) {
    parts.push('    Effects:');
    for (const e of fallout.effects) {
      parts.push(`      - ${formatEffectBrief(e)}`);
    }
  }

  return parts.join('\n');
}

/** Compact summary for narrator prompt injection (~20 tokens). */
export function formatFalloutForNarrator(fallout: PressureFallout): string {
  return `${fallout.resolution.pressureKind} ${fallout.resolution.resolutionType}: ${fallout.summary}`;
}

function formatEffectBrief(effect: FalloutEffect): string {
  switch (effect.type) {
    case 'reputation':
      return `rep ${effect.delta > 0 ? '+' : ''}${effect.delta} with ${effect.factionId}`;
    case 'alert':
      return `alert ${effect.delta > 0 ? '+' : ''}${effect.delta} for ${effect.factionId}`;
    case 'district':
      return `${effect.metric} ${effect.delta > 0 ? '+' : ''}${effect.delta} in ${effect.districtId}`;
    case 'rumor':
      return `rumor: "${effect.claim}" (${effect.valence})`;
    case 'spawn-pressure':
      return `chain: ${effect.kind} from ${effect.sourceFactionId}`;
    case 'milestone-tag':
      return `milestone tag: ${effect.tag}`;
    case 'title-trigger':
      return `title trigger: ${effect.tag}`;
  }
}

// --- Helpers ---

function buildFalloutSummary(pressure: WorldPressure, resolutionType: ResolutionType): string {
  const kindLabel = pressure.kind.replace(/-/g, ' ');
  switch (resolutionType) {
    case 'resolved-by-player':
      return `${kindLabel} resolved by the player`;
    case 'resolved-by-faction':
      return `${kindLabel} resolved by ${pressure.sourceFactionId}`;
    case 'escalated':
      return `${kindLabel} escalated`;
    case 'failed':
      return `${kindLabel} — player failed to resolve`;
    case 'transformed':
      return `${kindLabel} transformed into something new`;
    case 'superseded':
      return `${kindLabel} superseded by larger events`;
    case 'expired-ignored':
      return `${kindLabel} expired without resolution`;
  }
}
