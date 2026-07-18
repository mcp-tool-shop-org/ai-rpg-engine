import { describe, it, expect } from 'vitest';
import { CampaignJournal } from './journal.js';
import {
  buildFinaleOutline,
  formatFinaleForDirector,
  formatFinaleForTerminal,
  type FinaleNpcInput,
  type FinaleFactionInput,
  type FinaleDistrictInput,
} from './finale.js';

function makeJournal(): CampaignJournal {
  const journal = new CampaignJournal();

  journal.record({ tick: 1, category: 'discovery', actorId: 'player', description: 'Entered the chapel', significance: 0.5, witnesses: [], data: {} });
  journal.record({ tick: 3, category: 'combat', actorId: 'player', targetId: 'bandit1', description: 'Battle at the gate', significance: 0.6, witnesses: [], data: {} });
  journal.record({ tick: 5, category: 'kill', actorId: 'player', targetId: 'bandit1', description: 'Defeated the bandit leader', significance: 0.8, witnesses: ['guard1'], data: {} });
  journal.record({ tick: 7, category: 'alliance', actorId: 'player', targetId: 'merchant-guild', description: 'Formed alliance with merchants', significance: 0.7, witnesses: [], data: {} });
  journal.record({ tick: 10, category: 'opportunity-completed', actorId: 'player', description: 'Completed medicine delivery', significance: 0.6, witnesses: [], data: {} });
  journal.record({ tick: 15, category: 'betrayal', actorId: 'rival1', targetId: 'player', description: 'Rival betrayed trust', significance: 0.9, witnesses: ['companion1'], data: {} });
  journal.record({ tick: 20, category: 'companion-joined', actorId: 'companion1', description: 'Elena joined the party', significance: 0.5, witnesses: [], data: {} });

  return journal;
}

const npcs: FinaleNpcInput[] = [
  { npcId: 'guard1', name: 'Captain Aldric', breakpoint: 'allied', isCompanion: false },
  { npcId: 'rival1', name: 'Vex the Deceiver', breakpoint: 'hostile', isCompanion: false },
  { npcId: 'companion1', name: 'Elena', breakpoint: 'favorable', isCompanion: true },
];

const factions: FinaleFactionInput[] = [
  { factionId: 'merchant-guild', playerReputation: 45, alertLevel: 10, cohesion: 70 },
  { factionId: 'thieves-den', playerReputation: -45, alertLevel: 80, cohesion: 30 },
];

const districts: FinaleDistrictInput[] = [
  { districtId: 'd1', name: 'Market Quarter', stability: 65, controllingFaction: 'merchant-guild', economyTone: 'prosperous' },
  { districtId: 'd2', name: 'Dockside', stability: 30, economyTone: 'scarce' },
];

describe('finale', () => {
  describe('buildFinaleOutline', () => {
    it('builds a complete outline', () => {
      const outline = buildFinaleOutline(
        'victory', 'rising-power', makeJournal(),
        npcs, factions, districts, 25,
      );

      expect(outline.resolutionClass).toBe('victory');
      expect(outline.dominantArc).toBe('rising-power');
      expect(outline.campaignDuration).toBe(25);
      expect(outline.totalChronicleEvents).toBe(7);
      expect(outline.keyMoments.length).toBeLessThanOrEqual(10);
      expect(outline.keyMoments[0].significance).toBeGreaterThanOrEqual(outline.keyMoments[1].significance);
    });

    it('maps NPC breakpoints to outcomes', () => {
      const outline = buildFinaleOutline(
        'victory', null, makeJournal(),
        npcs, factions, districts, 25,
      );

      const aldric = outline.npcFates.find((f) => f.npcId === 'guard1');
      expect(aldric?.outcome).toBe('allied');

      const vex = outline.npcFates.find((f) => f.npcId === 'rival1');
      expect(vex?.outcome).toBe('enemy');
    });

    it('separates companion fates', () => {
      const outline = buildFinaleOutline(
        'victory', null, makeJournal(),
        npcs, factions, districts, 25,
      );

      expect(outline.companionFates.length).toBe(1);
      expect(outline.companionFates[0].name).toBe('Elena');
    });

    it('maps faction reputations to outcomes', () => {
      const outline = buildFinaleOutline(
        'victory', null, makeJournal(),
        npcs, factions, districts, 25,
      );

      const merchants = outline.factionFates.find((f) => f.factionId === 'merchant-guild');
      expect(merchants?.outcome).toBe('allied');

      const thieves = outline.factionFates.find((f) => f.factionId === 'thieves-den');
      expect(thieves?.outcome).toBe('hostile'); // rep -45 < -40 → hostile
    });

    it('includes district fates', () => {
      const outline = buildFinaleOutline(
        'victory', null, makeJournal(),
        npcs, factions, districts, 25,
      );

      expect(outline.districtFates.length).toBe(2);
      expect(outline.districtFates[0].name).toBe('Market Quarter');
    });

    it('generates epilogue seeds', () => {
      const outline = buildFinaleOutline(
        'victory', 'rising-power', makeJournal(),
        npcs, factions, districts, 25,
      );

      expect(outline.epilogueSeeds.length).toBeGreaterThan(0);
      expect(outline.epilogueSeeds[0]).toContain('victory');
    });

    it('derives legacy from journal patterns', () => {
      const journal = new CampaignJournal();
      for (let i = 0; i < 6; i++) {
        journal.record({ tick: i, category: 'kill', actorId: 'player', description: `Kill ${i}`, significance: 0.7, witnesses: [], data: {} });
      }

      const outline = buildFinaleOutline(
        'victory', null, journal,
        [], [], [], 20,
      );

      const warrior = outline.legacy.find((l) => l.label === 'Warrior');
      expect(warrior).toBeDefined();
    });
  });

  // F-3c079d7e: factionOutcome(rep, cohesion, alertLevel) accepted alertLevel
  // — threaded all the way from FinaleFactionInput.alertLevel — but never
  // referenced it, so a faction the rest of the simulation already treats as
  // mobilized-against-the-player (packages/modules/faction-agency.ts defines
  // `isEnemy = alertLevel >= 40 && playerReputation <= -20` for live
  // gameplay) could still narrate as 'neutral' purely because its raw
  // reputation number hadn't yet cratered past -40.
  describe('faction outcome — alertLevel actually affects the result (F-3c079d7e)', () => {
    it('a highly-alerted faction resolves hostile even when reputation/cohesion alone would say neutral', () => {
      const alertedFactions: FinaleFactionInput[] = [
        { factionId: 'watchers', playerReputation: -25, alertLevel: 50, cohesion: 45 },
      ];
      const outline = buildFinaleOutline('victory', null, makeJournal(), [], alertedFactions, [], 25);
      expect(outline.factionFates.find((f) => f.factionId === 'watchers')?.outcome).toBe('hostile');
    });

    it('low alert does not push a genuinely neutral faction into hostile', () => {
      const calmFactions: FinaleFactionInput[] = [
        { factionId: 'quiet-folk', playerReputation: 0, alertLevel: 5, cohesion: 60 },
      ];
      const outline = buildFinaleOutline('victory', null, makeJournal(), [], calmFactions, [], 25);
      expect(outline.factionFates.find((f) => f.factionId === 'quiet-folk')?.outcome).toBe('neutral');
    });

    it('high alert never overrides an already-earned allied outcome', () => {
      const stillAllied: FinaleFactionInput[] = [
        { factionId: 'loyalists', playerReputation: 60, alertLevel: 90, cohesion: 80 },
      ];
      const outline = buildFinaleOutline('victory', null, makeJournal(), [], stillAllied, [], 25);
      expect(outline.factionFates.find((f) => f.factionId === 'loyalists')?.outcome).toBe('allied');
    });
  });

  // F-ac4df69b: the faction-seed switch in buildEpilogueSeeds had no case for
  // 'neutral' (one of FactionFate['outcome']'s six values), and the
  // companion-seed switch had no cases for 'enemy' or 'neutral' (two of
  // NpcFate['outcome']'s six values, both reachable — breakpointToOutcome
  //('hostile') returns 'enemy', and 'neutral' is the wavering/default
  // fallthrough). Both are dramatically significant campaign endings that
  // were silently dropped from epilogueSeeds with no signal.
  describe('epilogue seeds cover every outcome (F-ac4df69b)', () => {
    it('includes an epilogue seed for a neutral faction outcome', () => {
      const neutralFactions: FinaleFactionInput[] = [
        { factionId: 'fence-sitters', playerReputation: 0, alertLevel: 0, cohesion: 60 },
      ];
      const outline = buildFinaleOutline('victory', null, makeJournal(), [], neutralFactions, [], 25);
      expect(outline.factionFates.find((f) => f.factionId === 'fence-sitters')?.outcome).toBe('neutral');
      expect(outline.epilogueSeeds.some((s) => s.includes('fence-sitters'))).toBe(true);
    });

    it('includes an epilogue seed for a companion who ended as an enemy', () => {
      const enemyCompanion: FinaleNpcInput[] = [
        { npcId: 'turncoat', name: 'Bryn', breakpoint: 'hostile', isCompanion: true },
      ];
      const outline = buildFinaleOutline('victory', null, makeJournal(), enemyCompanion, [], [], 25);
      expect(outline.companionFates.find((f) => f.npcId === 'turncoat')?.outcome).toBe('enemy');
      expect(outline.epilogueSeeds.some((s) => s.includes('Bryn'))).toBe(true);
    });

    it('includes an epilogue seed for a companion who ended neutral', () => {
      const neutralCompanion: FinaleNpcInput[] = [
        { npcId: 'drifter', name: 'Sable', breakpoint: 'wavering', isCompanion: true },
      ];
      const outline = buildFinaleOutline('victory', null, makeJournal(), neutralCompanion, [], [], 25);
      expect(outline.companionFates.find((f) => f.npcId === 'drifter')?.outcome).toBe('neutral');
      expect(outline.epilogueSeeds.some((s) => s.includes('Sable'))).toBe(true);
    });
  });

  describe('formatting', () => {
    it('formatFinaleForDirector includes key sections', () => {
      const outline = buildFinaleOutline(
        'victory', 'rising-power', makeJournal(),
        npcs, factions, districts, 25,
      );

      const text = formatFinaleForDirector(outline);
      expect(text).toContain('victory');
      expect(text).toContain('rising-power');
      expect(text).toContain('NPC Fates');
      expect(text).toContain('Faction Fates');
    });

    it('formatFinaleForTerminal includes dividers and sections', () => {
      const outline = buildFinaleOutline(
        'exile', null, makeJournal(),
        npcs, factions, districts, 25,
      );

      const text = formatFinaleForTerminal(outline);
      expect(text).toContain('CAMPAIGN CONCLUSION');
      expect(text).toContain('EXILE');
      expect(text).toContain('KEY MOMENTS');
      expect(text).toContain('FACTION OUTCOMES');
      expect(text).toContain('COMPANIONS');
    });
  });
});
