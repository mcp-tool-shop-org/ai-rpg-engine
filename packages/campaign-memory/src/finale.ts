// finale — build structured campaign conclusion from journal, arcs, and world state
// v2.0: deterministic, pure functions, no LLM calls

import type { CampaignRecord, RecordCategory } from './types.js';
import type { CampaignJournal } from './journal.js';

// --- Types ---

/** Imported resolution/arc types are passed as parameters to avoid cross-package dependency */

export type NpcFate = {
  npcId: string;
  name: string;
  finalBreakpoint: string; // LoyaltyBreakpoint from modules
  outcome: 'allied' | 'enemy' | 'departed' | 'dead' | 'neutral' | 'betrayed';
  lastSignificantEvent?: string;
};

export type FactionFate = {
  factionId: string;
  playerReputation: number;
  cohesion: number;
  outcome: 'dominant' | 'weakened' | 'destroyed' | 'allied' | 'hostile' | 'neutral';
};

export type DistrictFate = {
  districtId: string;
  name: string;
  stability: number;
  controllingFaction?: string;
  economyTone: string;
};

export type LegacyEntry = {
  label: string;
  significance: number;
  category: 'deed' | 'reputation' | 'relationship' | 'consequence';
};

export type FinaleNpcInput = {
  npcId: string;
  name: string;
  breakpoint: string;
  isCompanion: boolean;
};

export type FinaleFactionInput = {
  factionId: string;
  playerReputation: number;
  alertLevel: number;
  cohesion: number;
};

export type FinaleDistrictInput = {
  districtId: string;
  name: string;
  stability: number;
  controllingFaction?: string;
  economyTone: string;
};

export type FinaleOutline = {
  resolutionClass: string;
  dominantArc: string | null;
  campaignDuration: number;
  totalChronicleEvents: number;
  /** Top 10 most significant events */
  keyMoments: CampaignRecord[];
  npcFates: NpcFate[];
  factionFates: FactionFate[];
  districtFates: DistrictFate[];
  companionFates: NpcFate[];
  /** What the player will be remembered for */
  legacy: LegacyEntry[];
  /** Structured epilogue data points for LLM narration */
  epilogueSeeds: string[];
};

// --- Internal Helpers ---

function breakpointToOutcome(breakpoint: string): NpcFate['outcome'] {
  switch (breakpoint) {
    case 'allied': return 'allied';
    case 'favorable': return 'allied';
    case 'hostile': return 'enemy';
    case 'compromised': return 'betrayed';
    case 'wavering': return 'neutral';
    default: return 'neutral';
  }
}

function factionOutcome(rep: number, cohesion: number, alertLevel: number): FactionFate['outcome'] {
  if (cohesion < 20) return 'destroyed';
  if (rep > 40 && cohesion > 50) return 'allied';
  if (rep > 40) return 'dominant';
  if (rep < -40) return 'hostile';
  if (cohesion < 40) return 'weakened';
  return 'neutral';
}

function deriveLegacy(journal: CampaignJournal): LegacyEntry[] {
  const entries: LegacyEntry[] = [];
  const records = journal.serialize();

  // Count categories
  const categoryCounts: Partial<Record<RecordCategory, number>> = {};
  for (const record of records) {
    categoryCounts[record.category] = (categoryCounts[record.category] ?? 0) + 1;
  }

  // Derive legacy titles from category patterns
  const kills = categoryCounts['kill'] ?? 0;
  const alliances = categoryCounts['alliance'] ?? 0;
  const betrayals = categoryCounts['betrayal'] ?? 0;
  const rescues = categoryCounts['rescue'] ?? 0;
  const discoveries = categoryCounts['discovery'] ?? 0;
  const thefts = categoryCounts['theft'] ?? 0;
  const completedOpps = categoryCounts['opportunity-completed'] ?? 0;

  if (kills >= 5) {
    entries.push({ label: 'Warrior', significance: 0.8, category: 'deed' });
  }
  if (alliances >= 3) {
    entries.push({ label: 'Diplomat', significance: 0.7, category: 'relationship' });
  }
  if (betrayals >= 2) {
    entries.push({ label: 'Betrayer', significance: 0.9, category: 'consequence' });
  }
  if (rescues >= 2) {
    entries.push({ label: 'Protector', significance: 0.7, category: 'deed' });
  }
  if (discoveries >= 5) {
    entries.push({ label: 'Explorer', significance: 0.6, category: 'deed' });
  }
  if (thefts >= 3) {
    entries.push({ label: 'Thief', significance: 0.7, category: 'reputation' });
  }
  if (completedOpps >= 5) {
    entries.push({ label: 'Contractor', significance: 0.6, category: 'deed' });
  }

  // High-significance event legacy
  const highSig = records.filter((r) => r.significance >= 0.8);
  if (highSig.length >= 3) {
    entries.push({ label: 'Legend', significance: 1.0, category: 'reputation' });
  }

  // Sort by significance
  entries.sort((a, b) => b.significance - a.significance);
  return entries.slice(0, 5);
}

function buildEpilogueSeeds(
  resolutionClass: string,
  factionFates: FactionFate[],
  companionFates: NpcFate[],
  dominantArc: string | null,
  legacy: LegacyEntry[],
): string[] {
  const seeds: string[] = [];

  // Resolution seed
  const label = resolutionClass.replace(/-/g, ' ');
  seeds.push(`The campaign concluded in ${label}.`);

  // Faction seeds
  for (const f of factionFates) {
    switch (f.outcome) {
      case 'allied':
        seeds.push(`${f.factionId} stands with the player, their bond forged through shared struggle.`);
        break;
      case 'hostile':
        seeds.push(`${f.factionId} remembers only enmity. Their grudge will outlast this tale.`);
        break;
      case 'destroyed':
        seeds.push(`${f.factionId} is no more — scattered, broken, dissolved.`);
        break;
      case 'weakened':
        seeds.push(`${f.factionId} endures, diminished, a shadow of what they were.`);
        break;
      case 'dominant':
        seeds.push(`${f.factionId} emerges as the dominant power.`);
        break;
    }
  }

  // Companion seeds
  for (const c of companionFates) {
    switch (c.outcome) {
      case 'allied':
        seeds.push(`${c.name} stood loyal until the end.`);
        break;
      case 'departed':
        seeds.push(`${c.name} left before the end came.`);
        break;
      case 'dead':
        seeds.push(`${c.name} did not survive.`);
        break;
      case 'betrayed':
        seeds.push(`${c.name} turned against everything you built together.`);
        break;
    }
  }

  // Arc seed
  if (dominantArc) {
    const arcLabel = dominantArc.replace(/-/g, ' ');
    seeds.push(`The story's dominant thread was one of ${arcLabel}.`);
  }

  // Legacy seed
  if (legacy.length > 0) {
    const titles = legacy.map((l) => l.label).join(', ');
    seeds.push(`History will remember: ${titles}.`);
  }

  return seeds;
}

// --- Public Functions ---

/**
 * Build a structured finale outline from campaign state.
 * Pure function — no side effects, no LLM calls.
 */
export function buildFinaleOutline(
  resolutionClass: string,
  dominantArc: string | null,
  journal: CampaignJournal,
  npcs: FinaleNpcInput[],
  factions: FinaleFactionInput[],
  districts: FinaleDistrictInput[],
  campaignDuration: number,
  playerTitle?: string,
  playerLevel?: number,
): FinaleOutline {
  // Top 10 most significant events
  const allRecords = journal.serialize();
  const keyMoments = [...allRecords]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, 10);

  // NPC fates
  const npcFates: NpcFate[] = [];
  const companionFates: NpcFate[] = [];

  for (const npc of npcs) {
    // Find last significant event involving this NPC
    const npcRecords = journal.getInvolving(npc.npcId);
    const lastEvent = npcRecords.length > 0
      ? npcRecords[npcRecords.length - 1].description
      : undefined;

    // Check if NPC died in chronicle
    const diedRecord = npcRecords.find((r) => r.category === 'death' && r.targetId === npc.npcId);
    const departedRecord = npcRecords.find((r) =>
      r.category === 'companion-departed' && (r.actorId === npc.npcId || r.targetId === npc.npcId),
    );

    let outcome = breakpointToOutcome(npc.breakpoint);
    if (diedRecord) outcome = 'dead';
    else if (departedRecord && !npc.isCompanion) outcome = 'departed';

    const fate: NpcFate = {
      npcId: npc.npcId,
      name: npc.name,
      finalBreakpoint: npc.breakpoint,
      outcome,
      lastSignificantEvent: lastEvent,
    };

    npcFates.push(fate);
    if (npc.isCompanion) {
      companionFates.push(fate);
    }
  }

  // Faction fates
  const factionFates: FactionFate[] = factions.map((f) => ({
    factionId: f.factionId,
    playerReputation: f.playerReputation,
    cohesion: f.cohesion,
    outcome: factionOutcome(f.playerReputation, f.cohesion, f.alertLevel),
  }));

  // District fates
  const districtFates: DistrictFate[] = districts.map((d) => ({
    districtId: d.districtId,
    name: d.name,
    stability: d.stability,
    controllingFaction: d.controllingFaction,
    economyTone: d.economyTone,
  }));

  // Legacy
  const legacy = deriveLegacy(journal);

  // Epilogue seeds
  const epilogueSeeds = buildEpilogueSeeds(
    resolutionClass, factionFates, companionFates, dominantArc, legacy,
  );

  return {
    resolutionClass,
    dominantArc,
    campaignDuration,
    totalChronicleEvents: allRecords.length,
    keyMoments,
    npcFates,
    factionFates,
    districtFates,
    companionFates,
    legacy,
    epilogueSeeds,
  };
}

const HEAVY_DIVIDER = '═'.repeat(62);
const DIVIDER = '─'.repeat(62);

/**
 * Format finale for director mode.
 */
export function formatFinaleForDirector(outline: FinaleOutline): string {
  const lines: string[] = [];
  lines.push(`  Resolution: ${outline.resolutionClass}`);
  if (outline.dominantArc) lines.push(`  Dominant Arc: ${outline.dominantArc}`);
  lines.push(`  Duration: ${outline.campaignDuration} turns, ${outline.totalChronicleEvents} events`);
  lines.push('');
  lines.push('  Key Moments:');
  for (const m of outline.keyMoments.slice(0, 5)) {
    lines.push(`    [${m.tick}] ${m.description} (${m.category}, sig: ${m.significance.toFixed(1)})`);
  }
  lines.push('');
  lines.push('  NPC Fates:');
  for (const f of outline.npcFates) {
    lines.push(`    ${f.name}: ${f.outcome} (${f.finalBreakpoint})`);
  }
  lines.push('');
  lines.push('  Faction Fates:');
  for (const f of outline.factionFates) {
    lines.push(`    ${f.factionId}: ${f.outcome} (rep: ${f.playerReputation}, cohesion: ${f.cohesion})`);
  }
  lines.push('');
  lines.push('  Legacy:');
  for (const l of outline.legacy) {
    lines.push(`    ${l.label} — ${l.category}`);
  }
  return lines.join('\n');
}

/**
 * Format finale for terminal display — full-width epilogue.
 */
export function formatFinaleForTerminal(outline: FinaleOutline): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${HEAVY_DIVIDER}`);
  lines.push('  CAMPAIGN CONCLUSION');
  lines.push(`  ${HEAVY_DIVIDER}`);
  lines.push('');

  const label = outline.resolutionClass.replace(/-/g, ' ').toUpperCase();
  lines.push(`  Resolution: ${label}`);
  if (outline.dominantArc) {
    lines.push(`  Dominant Arc: ${outline.dominantArc.replace(/-/g, ' ')}`);
  }
  lines.push(`  Campaign Duration: ${outline.campaignDuration} turns`);
  lines.push(`  Chronicle Events: ${outline.totalChronicleEvents}`);

  lines.push('');
  lines.push(`  ${DIVIDER}`);
  lines.push('  KEY MOMENTS');
  lines.push(`  ${DIVIDER}`);
  lines.push('');
  for (const m of outline.keyMoments) {
    lines.push(`  Turn ${m.tick}: ${m.description}`);
  }

  if (outline.factionFates.length > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  FACTION OUTCOMES');
    lines.push(`  ${DIVIDER}`);
    lines.push('');
    for (const f of outline.factionFates) {
      lines.push(`  ${f.factionId}: ${f.outcome}`);
    }
  }

  if (outline.companionFates.length > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  COMPANIONS');
    lines.push(`  ${DIVIDER}`);
    lines.push('');
    for (const c of outline.companionFates) {
      lines.push(`  ${c.name}: ${c.outcome}`);
    }
  }

  if (outline.districtFates.length > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  DISTRICTS');
    lines.push(`  ${DIVIDER}`);
    lines.push('');
    for (const d of outline.districtFates) {
      lines.push(`  ${d.name}: stability ${d.stability}, ${d.economyTone}`);
    }
  }

  if (outline.legacy.length > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  LEGACY');
    lines.push(`  ${DIVIDER}`);
    lines.push('');
    for (const l of outline.legacy) {
      lines.push(`  ${l.label}`);
    }
  }

  lines.push('');
  lines.push(`  ${HEAVY_DIVIDER}`);
  lines.push('');

  return lines.join('\n');
}
