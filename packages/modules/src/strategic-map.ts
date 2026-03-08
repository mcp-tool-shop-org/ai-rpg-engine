// strategic-map — aggregate world state into a player-facing strategic overview
// Pure query functions. No state mutation. Reads from districts, factions, pressures, rumors.

import type { WorldState } from '@ai-rpg-engine/core';
import type { PlayerRumor, RumorValence } from './player-rumor.js';
import type { WorldPressure, PressureKind } from './pressure-system.js';
import type { FactionActionResult } from './faction-agency.js';
import {
  getAllDistrictIds,
  getDistrictDefinition,
  getDistrictState,
  getDistrictThreatLevel,
} from './district-core.js';
import { computeDistrictMood } from './district-mood.js';
import { getFactionCognition } from './faction-cognition.js';
import { getRumorsInDistrict } from './player-rumor.js';
import { deriveStance } from './social-consequence.js';

// --- Types ---

export type DistrictStrategicView = {
  districtId: string;
  name: string;
  controllingFaction: string | undefined;
  threatLevel: number;
  stability: number;
  surveillance: number;
  moodDescriptor: string;
  activePressureKinds: PressureKind[];
  factionPresence: { factionId: string; strength: 'dominant' | 'present' | 'weak' }[];
  hotspotTags: string[];
};

export type FactionStrategicView = {
  factionId: string;
  playerReputation: number;
  stance: string;
  alertLevel: number;
  cohesion: number;
  recentActions: string[];
  vulnerability: string | undefined;
};

export type StrategicMap = {
  districts: DistrictStrategicView[];
  factions: FactionStrategicView[];
  hotRumors: { claim: string; spreadCount: number; valence: RumorValence }[];
  activePressureSummary: string[];
};

// --- Build ---

export function buildStrategicMap(
  world: WorldState,
  playerRumors: PlayerRumor[],
  activePressures: WorldPressure[],
  playerReputations: { factionId: string; value: number }[],
  lastFactionActions: FactionActionResult[],
): StrategicMap {
  // Districts
  const districts: DistrictStrategicView[] = [];
  for (const districtId of getAllDistrictIds(world)) {
    const def = getDistrictDefinition(world, districtId);
    const state = getDistrictState(world, districtId);
    if (!def || !state) continue;

    const threatLevel = getDistrictThreatLevel(world, districtId);
    const districtRumors = getRumorsInDistrict(playerRumors, districtId);
    const districtPressures = activePressures.filter(
      (p) => p.tags?.includes(districtId),
    );

    // Faction presence
    const factionPresence: { factionId: string; strength: 'dominant' | 'present' | 'weak' }[] = [];
    if (def.controllingFaction) {
      factionPresence.push({ factionId: def.controllingFaction, strength: 'dominant' });
    }

    // Hotspot tags
    const hotspotTags: string[] = [];
    if (districtRumors.length >= 3) hotspotTags.push('rumor-hot');
    if (state.stability < 20) hotspotTags.push('unstable');
    if (state.alertPressure > 30) hotspotTags.push('high-alert');
    if (state.surveillance > 40) hotspotTags.push('heavily-watched');

    const mood = computeDistrictMood(state, def.tags);

    districts.push({
      districtId,
      name: def.name,
      controllingFaction: def.controllingFaction,
      threatLevel,
      stability: state.stability,
      surveillance: state.surveillance,
      moodDescriptor: mood.descriptor,
      activePressureKinds: districtPressures.map((p) => p.kind),
      factionPresence,
      hotspotTags,
    });
  }

  // Factions
  const factions: FactionStrategicView[] = [];
  for (const factionId of Object.keys(world.factions)) {
    const repEntry = playerReputations.find((r) => r.factionId === factionId);
    const rep = repEntry?.value ?? 0;
    const cog = getFactionCognition(world, factionId);
    const stance = deriveStance(rep, { morale: 50, suspicion: cog.alertLevel }, cog.alertLevel);

    // Recent actions
    const recentActions = lastFactionActions
      .filter((a) => a.action.factionId === factionId)
      .map((a) => a.action.description);

    // Vulnerability analysis
    let vulnerability: string | undefined;
    if (cog.cohesion < 0.4) vulnerability = 'low cohesion — internal fractures';
    else if (cog.alertLevel > 70) vulnerability = 'overextended — alert fatigue';

    factions.push({
      factionId,
      playerReputation: rep,
      stance,
      alertLevel: cog.alertLevel,
      cohesion: cog.cohesion,
      recentActions,
      vulnerability,
    });
  }

  // Hot rumors (top 5 by spread count)
  const hotRumors = [...playerRumors]
    .filter((r) => r.confidence > 0.3)
    .sort((a, b) => b.spreadTo.length - a.spreadTo.length)
    .slice(0, 5)
    .map((r) => ({
      claim: r.claim,
      spreadCount: r.spreadTo.length,
      valence: r.valence,
    }));

  // Pressure summary
  const activePressureSummary = activePressures.map(
    (p) => `${p.kind}: ${p.description} (${p.turnsRemaining} turns)`,
  );

  return { districts, factions, hotRumors, activePressureSummary };
}

// --- Formatting ---

const DIVIDER = '─'.repeat(60);

export function formatStrategicMapForDirector(map: StrategicMap): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(DIVIDER);
  lines.push('  STRATEGIC MAP');
  lines.push(DIVIDER);

  // Districts
  if (map.districts.length > 0) {
    lines.push('');
    lines.push('  DISTRICTS');
    for (const d of map.districts) {
      const tags = d.hotspotTags.length > 0 ? ` [${d.hotspotTags.join(', ')}]` : '';
      lines.push(`    ${d.name} (${d.districtId}) — "${d.moodDescriptor}"`);
      lines.push(`      Threat: ${d.threatLevel} | Stability: ${d.stability} | Surveillance: ${d.surveillance}${tags}`);
      if (d.controllingFaction) {
        lines.push(`      Controlled by: ${d.controllingFaction}`);
      }
      if (d.activePressureKinds.length > 0) {
        lines.push(`      Active pressures: ${d.activePressureKinds.join(', ')}`);
      }
    }
  }

  // Factions
  if (map.factions.length > 0) {
    lines.push('');
    lines.push('  FACTIONS');
    for (const f of map.factions) {
      lines.push(`    ${f.factionId}`);
      lines.push(`      Stance: ${f.stance} | Rep: ${f.playerReputation} | Alert: ${f.alertLevel} | Cohesion: ${(f.cohesion * 100).toFixed(0)}%`);
      if (f.vulnerability) {
        lines.push(`      Vulnerability: ${f.vulnerability}`);
      }
      if (f.recentActions.length > 0) {
        lines.push(`      Recent: ${f.recentActions[0]}`);
      }
    }
  }

  // Hot rumors
  if (map.hotRumors.length > 0) {
    lines.push('');
    lines.push('  HOT RUMORS');
    for (const r of map.hotRumors) {
      lines.push(`    "${r.claim}" (${r.valence}, spread: ${r.spreadCount})`);
    }
  }

  // Pressures
  if (map.activePressureSummary.length > 0) {
    lines.push('');
    lines.push('  ACTIVE PRESSURES');
    for (const p of map.activePressureSummary) {
      lines.push(`    ${p}`);
    }
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}

export function formatStrategicMapForPlayer(map: StrategicMap): string {
  const parts: string[] = [];

  // Most dangerous district
  const hotDistrict = map.districts.find((d) => d.hotspotTags.length > 0);
  if (hotDistrict) {
    parts.push(`${hotDistrict.name} feels ${hotDistrict.hotspotTags.join(' and ')}`);
  }

  // Most hostile faction
  const hostile = map.factions.find((f) => f.stance === 'hostile' || f.alertLevel > 60);
  if (hostile) {
    parts.push(`The ${hostile.factionId} are on high alert`);
  }

  return parts.slice(0, 2).join('. ');
}
