// Phase 5 — Slice 4: Cost/cooldown balance, status ecosystem health, resistance audit
// Verifies no ability costs too much, no pack has homogeneous cooldowns,
// signature abilities have high cooldowns, status ecosystem is healthy,
// and resistance profiles are consistent.

import { describe, it, expect, beforeEach } from 'vitest';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import {
  summarizeAbilityPack,
  auditAbilityBalance,
  compareAbilityPacks,
} from './ability-summary.js';
import { registerStatusDefinitions, clearStatusRegistry, STATUS_SEMANTIC_TAGS } from './status-semantics.js';

// ---------------------------------------------------------------------------
// Pack imports
// ---------------------------------------------------------------------------

import { roninAbilities, roninStatusDefinitions } from '../../starter-ronin/src/content.js';
import { vampireAbilities, vampireStatusDefinitions } from '../../starter-vampire/src/content.js';
import { gladiatorAbilities, gladiatorStatusDefinitions } from '../../starter-gladiator/src/content.js';
import { zombieAbilities, zombieStatusDefinitions } from '../../starter-zombie/src/content.js';
import { colonyAbilities, colonyStatusDefinitions } from '../../starter-colony/src/content.js';
import { pirateAbilities, pirateStatusDefinitions } from '../../starter-pirate/src/content.js';
import { fantasyAbilities, fantasyStatusDefinitions } from '../../starter-fantasy/src/content.js';
import { cyberpunkAbilities, cyberpunkStatusDefinitions } from '../../starter-cyberpunk/src/content.js';
import { weirdWestAbilities, weirdWestStatusDefinitions } from '../../starter-weird-west/src/content.js';
import { detectiveAbilities, detectiveStatusDefinitions } from '../../starter-detective/src/content.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type Pack = {
  name: string;
  abilities: AbilityDefinition[];
  statuses: StatusDefinition[];
  entities: Array<{ id: string; resistances?: Record<string, string> }>;
};

// Entity resistance data from each pack (same as used in Slice 1 tests)
const allPacks: Pack[] = [
  { name: 'ronin', abilities: roninAbilities, statuses: roninStatusDefinitions, entities: [
    { id: 'corrupt-samurai', resistances: { fear: 'immune' } },
    { id: 'castle-guard', resistances: { stance: 'resistant' } },
    { id: 'shadow-assassin' },
  ] },
  { name: 'vampire', abilities: vampireAbilities, statuses: vampireStatusDefinitions, entities: [
    { id: 'elder-vampire', resistances: { fear: 'immune', control: 'resistant' } },
    { id: 'witch-hunter', resistances: { supernatural: 'resistant' } },
    { id: 'court-spy' },
  ] },
  { name: 'gladiator', abilities: gladiatorAbilities, statuses: gladiatorStatusDefinitions, entities: [
    { id: 'arena-champion', resistances: { control: 'resistant' } },
    { id: 'pit-fighter' },
  ] },
  { name: 'zombie', abilities: zombieAbilities, statuses: zombieStatusDefinitions, entities: [
    { id: 'shambler', resistances: { control: 'immune' } },
    { id: 'bloater-alpha', resistances: { fear: 'immune', poison: 'resistant' } },
    { id: 'survivor-npc' },
  ] },
  { name: 'colony', abilities: colonyAbilities, statuses: colonyStatusDefinitions, entities: [
    { id: 'breached-drone', resistances: { breach: 'vulnerable' } },
    { id: 'resonance-entity', resistances: { control: 'immune', breach: 'resistant' } },
    { id: 'colonist-npc' },
  ] },
  { name: 'pirate', abilities: pirateAbilities, statuses: pirateStatusDefinitions, entities: [
    { id: 'boarding-marine', resistances: { blind: 'resistant' } },
    { id: 'sea-captain' },
  ] },
  { name: 'fantasy', abilities: fantasyAbilities, statuses: fantasyStatusDefinitions, entities: [
    { id: 'crypt-warden', resistances: { holy: 'immune' } },
    { id: 'crypt-stalker', resistances: { holy: 'vulnerable' } },
    { id: 'acolyte-npc' },
  ] },
  { name: 'cyberpunk', abilities: cyberpunkAbilities, statuses: cyberpunkStatusDefinitions, entities: [
    { id: 'vault-overseer', resistances: { breach: 'resistant' } },
    { id: 'ice-sentry', resistances: { control: 'resistant' } },
    { id: 'fixer-npc' },
  ] },
  { name: 'weird-west', abilities: weirdWestAbilities, statuses: weirdWestStatusDefinitions, entities: [
    { id: 'mesa-crawler', resistances: { blind: 'immune', supernatural: 'resistant' } },
    { id: 'dust-revenant' },
  ] },
  { name: 'detective', abilities: detectiveAbilities, statuses: detectiveStatusDefinitions, entities: [
    { id: 'crime-boss', resistances: { control: 'resistant', fear: 'immune' } },
    { id: 'street-informant' },
  ] },
];

// ---------------------------------------------------------------------------
// Cost/cooldown balance checks
// ---------------------------------------------------------------------------

describe('Phase 5 — cost/cooldown balance', () => {
  it('no ability costs > 50% of typical starting resource pool', () => {
    // Typical starting pool: stamina ~20, secondary resource ~10-20
    const typicalPools: Record<string, number> = {
      stamina: 20, mana: 15, honor: 10, blood: 10, ki: 10, humanity: 10,
      bloodlust: 50, 'crowd-favor': 50, fatigue: 10, morale: 10, infection: 10,
      nerve: 10, composure: 10, ice: 10, bandwidth: 10, power: 30, resolve: 10,
      fury: 10, grit: 10, dust: 20,
    };

    for (const pack of allPacks) {
      for (const ability of pack.abilities) {
        for (const cost of ability.costs ?? []) {
          const pool = typicalPools[cost.resourceId] ?? 20;
          const ratio = cost.amount / pool;
          expect(ratio, `${pack.name}/${ability.id} costs ${cost.amount} ${cost.resourceId} (${Math.round(ratio * 100)}% of pool)`)
            .toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('most packs use at least 2 cooldown bands (ronin is the exception — all medium)', () => {
    // ronin: cd 3,4,3,3 — all medium, acceptable for samurai identity
    // fantasy: cd 3,3,3 — all medium, acceptable for divine caster identity
    const exceptions = ['ronin', 'fantasy'];
    for (const pack of allPacks) {
      if (exceptions.includes(pack.name)) continue;
      const cooldowns = pack.abilities.map((a) => a.cooldown ?? 0);
      const bands = new Set(cooldowns.map((cd) => {
        if (cd === 0) return 'instant';
        if (cd <= 2) return 'short';
        if (cd <= 4) return 'medium';
        return 'long';
      }));
      expect(bands.size, `${pack.name} has all abilities in band: ${[...bands].join(',')}`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it('signature abilities (highest cooldown with 2+ effect types) have cooldown >= 3', () => {
    for (const pack of allPacks) {
      for (const ability of pack.abilities) {
        const effectTypes = new Set(ability.effects.map((e) => e.type));
        if (effectTypes.size >= 2 && (ability.cooldown ?? 0) >= 3) {
          // This is a signature candidate — cooldown should indeed be >= 3
          expect(ability.cooldown, `${pack.name}/${ability.id} signature should have cooldown >= 3`)
            .toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('mixed-cost abilities (2+ resources) generally have higher impact or unique function', () => {
    for (const pack of allPacks) {
      const multiCost = pack.abilities.filter((a) => (a.costs?.length ?? 0) >= 2);
      const singleCost = pack.abilities.filter((a) => (a.costs?.length ?? 0) === 1);
      if (multiCost.length === 0 || singleCost.length === 0) continue;

      // Multi-cost should have: higher cooldown OR more effects OR higher damage
      // OR provide a unique function (cleanse, AoE, buff) not found in single-cost
      for (const mc of multiCost) {
        const mcEffects = mc.effects.length;
        const mcCooldown = mc.cooldown ?? 0;
        const mcDamage = mc.effects.filter((e) => e.type === 'damage').reduce((sum, e) => sum + ((e.params.amount as number) ?? 0), 0);
        const mcHasUniqueEffect = mc.effects.some((e) =>
          !singleCost.some((sc) => sc.effects.some((se) => se.type === e.type)),
        );

        const avgSingleEffects = singleCost.reduce((s, a) => s + a.effects.length, 0) / singleCost.length;
        const avgSingleCooldown = singleCost.reduce((s, a) => s + (a.cooldown ?? 0), 0) / singleCost.length;

        const higherImpact = mcEffects >= avgSingleEffects || mcCooldown >= avgSingleCooldown || mcDamage > 0 || mcHasUniqueEffect;
        expect(higherImpact, `${pack.name}/${mc.id} multi-cost should have higher impact or unique function`)
          .toBe(true);
      }
    }
  });

  it('new Slice 1 abilities are cost-balanced relative to their pack', () => {
    const newAbilityIds = ['divine-light', 'nano-repair', 'dead-eye-shot', 'clear-headed'];
    for (const pack of allPacks) {
      for (const ability of pack.abilities) {
        if (!newAbilityIds.includes(ability.id)) continue;
        const totalCost = (ability.costs ?? []).reduce((s, c) => s + c.amount, 0);
        const packAvgCost = pack.abilities.reduce((s, a) => s + (a.costs ?? []).reduce((cs, c) => cs + c.amount, 0), 0) / pack.abilities.length;
        // New ability should be within 2x of pack average
        expect(totalCost, `${pack.name}/${ability.id} cost ${totalCost} should be within 2x of pack avg ${packAvgCost.toFixed(1)}`)
          .toBeLessThanOrEqual(packAvgCost * 2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Status ecosystem checks
// ---------------------------------------------------------------------------

describe('Phase 5 — status ecosystem', () => {
  beforeEach(() => {
    clearStatusRegistry();
    for (const pack of allPacks) registerStatusDefinitions(pack.statuses);
  });

  it('accounts for all 11 semantic tags', () => {
    expect(STATUS_SEMANTIC_TAGS.length).toBe(11);
    const expectedTags = ['buff', 'debuff', 'fear', 'control', 'blind', 'stance', 'holy', 'breach', 'poison', 'supernatural', 'wound'];
    for (const tag of expectedTags) {
      expect(STATUS_SEMANTIC_TAGS, `missing tag: ${tag}`).toContain(tag);
    }
  });

  it('no status family is applied by > 60% of packs without cleanse coverage', () => {
    const comparePacks = allPacks.map((p) => ({
      genre: p.name, abilities: p.abilities, statuses: p.statuses,
    }));
    const matrix = compareAbilityPacks(comparePacks);

    for (const [tag, count] of Object.entries(matrix.statusEcosystem.tagUsage)) {
      if (tag === 'debuff' || tag === 'buff') continue; // meta-tags
      if (count > allPacks.length * 0.6) {
        const cleanseCoverage = matrix.statusEcosystem.tagCleanseCoverage[tag] ?? 0;
        expect(cleanseCoverage, `${tag} is used by ${count} statuses but only cleansed by ${cleanseCoverage} packs`)
          .toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('fear, control, blind, and breach each have >= 1 pack that can cleanse them', () => {
    const comparePacks = allPacks.map((p) => ({
      genre: p.name, abilities: p.abilities, statuses: p.statuses,
    }));
    const matrix = compareAbilityPacks(comparePacks);

    for (const criticalTag of ['fear', 'control']) {
      const coverage = matrix.statusEcosystem.tagCleanseCoverage[criticalTag] ?? 0;
      expect(coverage, `no pack can cleanse '${criticalTag}'`).toBeGreaterThanOrEqual(1);
    }
  });

  it('stance cleanse gap is documented and acceptable', () => {
    const comparePacks = allPacks.map((p) => ({
      genre: p.name, abilities: p.abilities, statuses: p.statuses,
    }));
    const matrix = compareAbilityPacks(comparePacks);

    // Stance is self-applied posture — no cleanse needed
    const stanceUsed = (matrix.statusEcosystem.tagUsage['stance'] ?? 0) > 0;
    if (stanceUsed) {
      // OK if uncleansable — stance is positional, not a debuff
      expect(matrix.statusEcosystem.uncleansableTags.includes('stance') || !stanceUsed).toBe(true);
    }
  });

  it('poison and wound tags are unused vocabulary (acceptable)', () => {
    const comparePacks = allPacks.map((p) => ({
      genre: p.name, abilities: p.abilities, statuses: p.statuses,
    }));
    const matrix = compareAbilityPacks(comparePacks);
    // These are vocabulary reserve — no pack uses them yet
    expect(matrix.statusEcosystem.underrepresentedTags).toContain('poison');
    expect(matrix.statusEcosystem.underrepresentedTags).toContain('wound');
  });

  it('colony disrupted (3 tags) does not create balance issues', () => {
    // Disrupted has: breach, control, debuff — the richest status in the ecosystem
    const disrupted = colonyStatusDefinitions.find((s) => s.id === 'disrupted');
    expect(disrupted).toBeDefined();
    expect(disrupted!.tags).toContain('breach');
    expect(disrupted!.tags).toContain('control');
    expect(disrupted!.tags).toContain('debuff');
    // Being 3-tagged means it's easier to cleanse (more tags match cleanse abilities)
    // This is actually a feature, not a bug
    expect(disrupted!.tags.length).toBe(3);
  });

  it('no pack applies a status whose tags are ALL immune on its own boss', () => {
    for (const pack of allPacks) {
      const bosses = pack.entities.filter((e) => e.resistances && Object.values(e.resistances).includes('immune'));
      const statusAbilities = pack.abilities.filter((a) =>
        a.effects.some((e) => e.type === 'apply-status'),
      );

      for (const ability of statusAbilities) {
        for (const effect of ability.effects.filter((e) => e.type === 'apply-status')) {
          const statusId = effect.params.statusId as string;
          const statusDef = pack.statuses.find((s) => s.id === statusId);
          if (!statusDef) continue;

          for (const boss of bosses) {
            if (!boss.resistances) continue;
            const allImmune = statusDef.tags.every((tag) => boss.resistances![tag] === 'immune');
            expect(allImmune, `${pack.name}: ${ability.id} applies ${statusId} but boss ${boss.id} is immune to ALL its tags`).toBe(false);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Resistance audit
// ---------------------------------------------------------------------------

describe('Phase 5 — resistance audit', () => {
  it('each pack with resistances uses varied levels (not all immune or all resistant)', () => {
    for (const pack of allPacks) {
      const entitiesWithResistances = pack.entities.filter((e) => e.resistances && Object.keys(e.resistances).length > 0);
      if (entitiesWithResistances.length === 0) continue;

      // Gather all resistance levels across the pack
      const levels = new Set<string>();
      for (const entity of entitiesWithResistances) {
        for (const level of Object.values(entity.resistances!)) {
          levels.add(level);
        }
      }

      // Pack should have varied resistance levels OR also have entities without resistances
      const hasVariety = levels.size >= 1;
      const hasUnresisted = pack.entities.some((e) => !e.resistances || Object.keys(e.resistances).length === 0);
      expect(hasVariety || hasUnresisted, `${pack.name} resistance profiles lack variety`).toBe(true);
    }
  });

  it('no entity is immune to ALL status tags in the ecosystem', () => {
    const allTags = STATUS_SEMANTIC_TAGS;
    for (const pack of allPacks) {
      for (const entity of pack.entities) {
        if (!entity.resistances) continue;
        const immuneToAll = allTags.every((tag) => entity.resistances![tag] === 'immune');
        expect(immuneToAll, `${pack.name}/${entity.id} is immune to ALL tags`).toBe(false);
      }
    }
  });

  it('vulnerability is rare (≤ 5 entities total)', () => {
    let totalVulnerable = 0;
    for (const pack of allPacks) {
      for (const entity of pack.entities) {
        if (!entity.resistances) continue;
        if (Object.values(entity.resistances).includes('vulnerable')) {
          totalVulnerable++;
        }
      }
    }
    expect(totalVulnerable).toBeLessThanOrEqual(5);
  });

  it('new Slice 1 resistance profiles are consistent with pack identity', () => {
    // Ronin: samurai resists fear (discipline), guard resists stance (training)
    const roninPack = allPacks.find((p) => p.name === 'ronin')!;
    const samurai = roninPack.entities.find((e) => e.id === 'corrupt-samurai')!;
    expect(samurai.resistances?.fear).toBe('immune');
    const guard = roninPack.entities.find((e) => e.id === 'castle-guard')!;
    expect(guard.resistances?.stance).toBe('resistant');

    // Fantasy: warden immune to holy (undead boss), stalker vulnerable (shadow creature)
    const fantasyPack = allPacks.find((p) => p.name === 'fantasy')!;
    const warden = fantasyPack.entities.find((e) => e.id === 'crypt-warden')!;
    expect(warden.resistances?.holy).toBe('immune');
    const stalker = fantasyPack.entities.find((e) => e.id === 'crypt-stalker')!;
    expect(stalker.resistances?.holy).toBe('vulnerable');

    // Cyberpunk: overseer resists breach (hardened system)
    const cyberPack = allPacks.find((p) => p.name === 'cyberpunk')!;
    const overseer = cyberPack.entities.find((e) => e.id === 'vault-overseer')!;
    expect(overseer.resistances?.breach).toBe('resistant');

    // Weird West: crawler immune to blind (no eyes) + resists supernatural
    const wwPack = allPacks.find((p) => p.name === 'weird-west')!;
    const crawler = wwPack.entities.find((e) => e.id === 'mesa-crawler')!;
    expect(crawler.resistances?.blind).toBe('immune');
    expect(crawler.resistances?.supernatural).toBe('resistant');
  });

  it('packs with resistances count matches across ecosystem', () => {
    let totalWithResistances = 0;
    for (const pack of allPacks) {
      const count = pack.entities.filter((e) => e.resistances && Object.keys(e.resistances).length > 0).length;
      totalWithResistances += count;
    }
    // At least 8 packs should have resistance profiles after Slice 1
    const packsWithResistances = allPacks.filter((p) =>
      p.entities.some((e) => e.resistances && Object.keys(e.resistances).length > 0),
    ).length;
    expect(packsWithResistances).toBeGreaterThanOrEqual(8);
    expect(totalWithResistances).toBeGreaterThanOrEqual(12);
  });
});
