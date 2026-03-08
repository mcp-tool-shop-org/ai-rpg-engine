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
