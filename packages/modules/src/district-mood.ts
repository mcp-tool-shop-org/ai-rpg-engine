// district-mood — expressive mood derivation from raw district metrics
// v1.4: pure functions — no state, just computation
// Derives safety/prosperity/spirit from 7 raw metrics with tag-driven weighting.
// Produces compact descriptors for narration and gameplay modifiers for leverage/rumor/pressure.

import type { WorldState } from '@ai-rpg-engine/core';
import type { DistrictState, DistrictDefinition, DistrictMetrics } from './district-core.js';
import {
  getAllDistrictIds,
  getDistrictState,
  getDistrictDefinition,
} from './district-core.js';

// --- Types ---

export type DistrictMood = {
  /** Safety feeling, 0-100 (from alertPressure inverse + stability) */
  safety: number;
  /** Economic well-being, 0-100 (from commerce + stability) */
  prosperity: number;
  /** Populace spirit, 0-100 (from morale + surveillance inverse) */
  spirit: number;
  /** Compact atmospheric phrase (3-5 words) */
  descriptor: string;
  /** Dominant emotional tone */
  tone: 'calm' | 'tense' | 'prosperous' | 'grim' | 'volatile' | 'oppressive';
};

export type DistrictModifiers = {
  /** Multiplier for leverage action costs (0.7-1.3) */
  leverageCostScale: number;
  /** Multiplier for rumor spread rate (0.7-1.5) */
  rumorSpreadScale: number;
  /** NPC cooperation bias (-20 to +20, added to trust for checks) */
  npcCooperationBias: number;
  /** Pressure spawn urgency modifier (0-0.15) */
  pressureUrgencyBias: number;
  /** Trade price scale from scarcity/surplus balance (0.8-2.0) */
  tradePriceScale: number;
};

// --- Tag Weights ---

type MoodAxisWeights = { safety: number; prosperity: number; spirit: number };

const TAG_WEIGHTS: Record<string, Partial<MoodAxisWeights>> = {
  sacred:      { spirit: 1.5, safety: 0.8 },
  public:      { prosperity: 1.3, spirit: 1.1 },
  secure:      { safety: 1.5, prosperity: 0.7 },
  underground: { safety: 0.7, spirit: 0.8, prosperity: 0.8 },
  networked:   { safety: 1.1, prosperity: 1.2 },
  cursed:      { safety: 0.6, spirit: 0.5 },
  exterior:    { prosperity: 1.1 },
};

// --- Mood Computation ---

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Compute expressive mood from raw district metrics and district tags. */
export function computeDistrictMood(state: DistrictState, tags: string[]): DistrictMood {
  // Base derivation from raw metrics
  let safety = clamp(0, 100, (100 - state.alertPressure) * 0.5 + state.stability * 5);
  let prosperity = clamp(0, 100, state.commerce * 0.6 + state.stability * 4);
  let spirit = clamp(0, 100, state.morale * 0.6 + (100 - state.surveillance) * 0.2 + state.stability * 2);

  // Apply tag-driven weights
  const weights: MoodAxisWeights = { safety: 1, prosperity: 1, spirit: 1 };
  for (const tag of tags) {
    const tw = TAG_WEIGHTS[tag];
    if (tw) {
      if (tw.safety !== undefined) weights.safety *= tw.safety;
      if (tw.prosperity !== undefined) weights.prosperity *= tw.prosperity;
      if (tw.spirit !== undefined) weights.spirit *= tw.spirit;
    }
  }

  safety = clamp(0, 100, Math.round(safety * weights.safety));
  prosperity = clamp(0, 100, Math.round(prosperity * weights.prosperity));
  spirit = clamp(0, 100, Math.round(spirit * weights.spirit));

  const descriptor = deriveDescriptor(safety, prosperity, spirit);
  const tone = deriveTone(safety, prosperity, spirit);

  return { safety, prosperity, spirit, descriptor, tone };
}

// --- Descriptor Cascade ---

function deriveDescriptor(safety: number, prosperity: number, spirit: number): string {
  // Priority cascade — first match wins
  if (safety < 20 && spirit < 30) return 'dangerous and despairing';
  if (prosperity < 30 && safety < 40) return 'desperate and volatile';
  if (safety < 30) return 'on edge, jumpy';
  if (spirit < 30) return 'subdued, fearful';
  if (prosperity < 30) return 'sparse and struggling';
  if (prosperity > 70 && spirit > 60) return 'busy and cheerful';
  if (prosperity > 70) return 'bustling but cold';
  if (spirit > 70) return 'lively despite everything';
  if (safety > 70 && spirit > 50) return 'calm and watchful';
  if (safety > 70) return 'quiet and controlled';
  if (spirit > 50) return 'steady, cautious';
  return 'unremarkable';
}

function deriveTone(
  safety: number, prosperity: number, spirit: number,
): DistrictMood['tone'] {
  if (safety < 20 && spirit < 30) return 'grim';
  if (safety < 30) return 'volatile';
  if (spirit < 30 && safety < 50) return 'oppressive';
  if (prosperity > 60 && spirit > 50) return 'prosperous';
  if (safety > 60 && spirit > 50) return 'calm';
  return 'tense';
}

// --- Gameplay Modifiers ---

/** Compute gameplay modifiers from district mood. */
export function computeDistrictModifiers(mood: DistrictMood): DistrictModifiers {
  // Leverage costs: dangerous districts cost more, safe districts cost less
  const leverageCostScale = mood.safety < 30 ? 1.3
    : mood.safety > 70 ? 0.85
    : 1.0;

  // Rumor spread: anxious populations spread rumors faster
  const rumorSpreadScale = mood.spirit < 30 ? 1.5
    : mood.spirit > 70 ? 0.7
    : 1.0;

  // NPC cooperation: prosperity makes people more willing to deal
  const npcCooperationBias = Math.round((mood.prosperity - 50) / 5);

  // Pressure urgency: degraded districts spawn more urgent pressures
  const pressureUrgencyBias = (mood.safety < 30 && mood.spirit < 30) ? 0.15 : 0;

  // Trade price scale: low prosperity = inflated, high prosperity = fair
  const tradePriceScale = mood.prosperity < 30 ? 2.0
    : mood.prosperity < 50 ? 1.3
    : mood.prosperity > 70 ? 0.8
    : 1.0;

  return { leverageCostScale, rumorSpreadScale, npcCooperationBias, pressureUrgencyBias, tradePriceScale };
}

// --- Formatting ---

/** Single-line narrator format: "Chapel Grounds: calm and watchful" (~8 tokens). */
export function formatDistrictMoodForNarrator(mood: DistrictMood, districtName: string): string {
  return `${districtName}: ${mood.descriptor}`;
}

/** Multi-line director format for a single district. */
export function formatDistrictForDirector(
  districtId: string,
  def: DistrictDefinition,
  state: DistrictState,
  mood: DistrictMood,
  modifiers: DistrictModifiers,
): string {
  const lines: string[] = [];
  const DIVIDER = '─'.repeat(60);

  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  DISTRICT: ${def.name}`);
  lines.push(DIVIDER);
  lines.push('');
  lines.push(`  Mood: ${mood.descriptor} (tone: ${mood.tone})`);
  lines.push(`  Safety: ${mood.safety} | Prosperity: ${mood.prosperity} | Spirit: ${mood.spirit}`);
  lines.push('');
  lines.push('  Raw Metrics:');
  lines.push(`    alertPressure: ${state.alertPressure} | rumorDensity: ${state.rumorDensity} | intruderLikelihood: ${state.intruderLikelihood}`);
  lines.push(`    surveillance: ${state.surveillance} | stability: ${state.stability.toFixed(1)} | commerce: ${state.commerce} | morale: ${state.morale}`);
  lines.push('');
  lines.push('  Modifiers:');
  lines.push(`    Leverage cost: ×${modifiers.leverageCostScale} | Rumor spread: ×${modifiers.rumorSpreadScale}`);
  lines.push(`    NPC cooperation: ${modifiers.npcCooperationBias >= 0 ? '+' : ''}${modifiers.npcCooperationBias} | Pressure urgency: +${modifiers.pressureUrgencyBias}`);
  lines.push('');
  lines.push(`  Tags: ${def.tags.join(', ') || 'none'}`);
  lines.push(`  Controlling faction: ${def.controllingFaction ?? 'none'}`);
  lines.push(`  Zones: ${def.zoneIds.join(', ')}`);
  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}

/** Compact overview of all districts with mood. */
export function formatAllDistrictsForDirector(world: WorldState): string {
  const districtIds = getAllDistrictIds(world);
  if (districtIds.length === 0) return '  No districts defined.';

  const lines: string[] = [];
  const DIVIDER = '─'.repeat(60);

  lines.push('');
  lines.push(DIVIDER);
  lines.push('  DISTRICTS');
  lines.push(DIVIDER);
  lines.push('');

  for (const dId of districtIds) {
    const def = getDistrictDefinition(world, dId);
    const state = getDistrictState(world, dId);
    if (!def || !state) continue;

    const mood = computeDistrictMood(state, def.tags);
    const factionStr = def.controllingFaction ? `Faction: ${def.controllingFaction}` : 'Faction: none';

    lines.push(`  ${def.name} (${dId}) — "${mood.descriptor}"`);
    lines.push(`    Safety: ${mood.safety} | Prosperity: ${mood.prosperity} | Spirit: ${mood.spirit}`);
    lines.push(`    Raw: alert=${state.alertPressure} rumor=${state.rumorDensity} intruder=${state.intruderLikelihood} surveillance=${state.surveillance} stability=${state.stability.toFixed(1)} commerce=${state.commerce} morale=${state.morale}`);
    lines.push(`    Tags: ${def.tags.join(', ') || 'none'} | ${factionStr}`);
    lines.push('');
  }

  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}
