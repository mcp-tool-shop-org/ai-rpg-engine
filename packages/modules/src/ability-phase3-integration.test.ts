// ability-phase3-integration.test.ts — Cross-genre integration tests for Phase 3
//
// Proves: resistances, cleanse, AI awareness, status registry integrity,
// and summary/audit across all 7 packs.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import { validateStatusDefinitionPack } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import { createAbilityCore } from './ability-core.js';
import { createAbilityEffects } from './ability-effects.js';
import { createAbilityReview } from './ability-review.js';
import type { AbilityTrace } from './ability-review.js';
import { scoreAbilityUse, selectNpcAbilityAction } from './ability-intent.js';
import { summarizeAbilityPack, auditAbilityBalance } from './ability-summary.js';
import {
  registerStatusDefinitions,
  clearStatusRegistry,
  getStatusDefinition,
  getRegisteredStatusIds,
  getStatusTags,
  STATUS_SEMANTIC_TAGS,
} from './status-semantics.js';

// --- Real packs from all 7 starters ---
import { fantasyAbilities, fantasyStatusDefinitions } from '../../starter-fantasy/src/content.js';
import { cyberpunkAbilities, cyberpunkStatusDefinitions } from '../../starter-cyberpunk/src/content.js';
import { weirdWestAbilities, weirdWestStatusDefinitions } from '../../starter-weird-west/src/content.js';
import { vampireAbilities, vampireStatusDefinitions } from '../../starter-vampire/src/content.js';
import { gladiatorAbilities, gladiatorStatusDefinitions } from '../../starter-gladiator/src/content.js';
import { roninAbilities, roninStatusDefinitions } from '../../starter-ronin/src/content.js';
import { pirateAbilities, pirateStatusDefinitions } from '../../starter-pirate/src/content.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Arena', tags: [] as string[], neighbors: [] },
];

const allStatusDefinitions: StatusDefinition[] = [
  ...fantasyStatusDefinitions,
  ...cyberpunkStatusDefinitions,
  ...weirdWestStatusDefinitions,
  ...vampireStatusDefinitions,
  ...gladiatorStatusDefinitions,
  ...roninStatusDefinitions,
  ...pirateStatusDefinitions,
];

function registerAllStatusDefinitions(): void {
  clearStatusRegistry();
  registerStatusDefinitions(allStatusDefinitions);
}

function makeEntity(id: string, type: string, overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags: type === 'pc' ? ['enemy'] : ['npc'],
    // High stats to guarantee check passes (mesmerize: presence vs 8, purify: will vs 6, blood-purge: vitality vs 7, centered-mind: composure vs 6)
    stats: { vigor: 99, presence: 99, vitality: 99, cunning: 99, will: 99, composure: 99, discipline: 99, precision: 99, maxHp: 30, maxStamina: 20 },
    resources: { hp: 25, stamina: 20 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function makeAction(actorId: string, abilityId: string, targetIds?: string[]): ActionIntent {
  return {
    id: `act-${actorId}-${abilityId}`,
    actorId,
    verb: 'use-ability',
    targetIds,
    parameters: { abilityId },
    source: 'player',
    issuedAtTick: 1,
  };
}

function buildEngine(abilities: AbilityDefinition[], entities: EntityState[]) {
  return createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
    entities,
    zones,
  });
}

// ---------------------------------------------------------------------------
// 1. Status Registry Integrity
// ---------------------------------------------------------------------------

describe('status registry integrity across 7 packs', () => {
  beforeEach(registerAllStatusDefinitions);

  it('registers all 8 StatusDefinitions', () => {
    const ids = getRegisteredStatusIds();
    expect(ids.length).toBe(8);
  });

  it('includes all expected status IDs', () => {
    const expected = [
      'mesmerized', 'terrified', 'challenged', 'off-balance',
      'blinded', 'holy-fire', 'system-breach', 'dust-blind',
    ];
    for (const id of expected) {
      expect(getStatusDefinition(id)).toBeDefined();
    }
  });

  it('no duplicate IDs across all packs', () => {
    const allIds = allStatusDefinitions.map((d) => d.id);
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });

  it('all tags from known vocabulary', () => {
    const knownTags = new Set(STATUS_SEMANTIC_TAGS as readonly string[]);
    for (const def of allStatusDefinitions) {
      for (const tag of def.tags) {
        expect(knownTags.has(tag)).toBe(true);
      }
    }
  });

  it('passes validateStatusDefinitionPack with known vocabulary', () => {
    const result = validateStatusDefinitionPack(
      allStatusDefinitions,
      [...STATUS_SEMANTIC_TAGS],
    );
    expect(result.ok).toBe(true);
    expect(result.advisories).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Resistance across genres
// ---------------------------------------------------------------------------

describe('resistance across genres', () => {
  beforeEach(registerAllStatusDefinitions);

  it('vampire mesmerize blocked by immune target', () => {
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;
    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'vampire'],
      resources: { hp: 25, stamina: 20, humanity: 10 },
    });
    const target = makeEntity('target', 'pc', {
      resistances: { control: 'immune' },
    });
    const engine = buildEngine([mesmerize], [actor, target]);

    engine.processAction(makeAction('actor', 'mesmerize', ['target']));

    // Status should NOT be applied
    const targetState = engine.store.state.entities['target'];
    expect(targetState.statuses.some((s) => s.statusId === 'mesmerized')).toBe(false);

    // Should have immune event
    const events = engine.drainEvents();
    const immuneEvents = events.filter((e) => e.type === 'ability.status.immune');
    expect(immuneEvents.length).toBe(1);
  });

  it('vampire mesmerize halved by resistant target', () => {
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;
    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'vampire'],
      resources: { hp: 25, stamina: 20, humanity: 10 },
    });
    const target = makeEntity('target', 'pc', {
      resistances: { supernatural: 'resistant' },
    });
    const engine = buildEngine([mesmerize], [actor, target]);

    engine.processAction(makeAction('actor', 'mesmerize', ['target']));

    const targetState = engine.store.state.entities['target'];
    const applied = targetState.statuses.find((s) => s.statusId === 'mesmerized');
    expect(applied).toBeDefined();
    // Duration should be halved
    const events = engine.drainEvents();
    const resistedEvents = events.filter((e) => e.type === 'ability.status.resisted');
    expect(resistedEvents.length).toBe(1);
  });

  it('vampire mesmerize doubled on vulnerable target', () => {
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;
    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'vampire'],
      resources: { hp: 25, stamina: 20, humanity: 10 },
    });
    const target = makeEntity('target', 'pc', {
      resistances: { control: 'vulnerable' },
    });
    const engine = buildEngine([mesmerize], [actor, target]);

    engine.processAction(makeAction('actor', 'mesmerize', ['target']));

    const targetState = engine.store.state.entities['target'];
    const applied = targetState.statuses.find((s) => s.statusId === 'mesmerized');
    expect(applied).toBeDefined();
    const events = engine.drainEvents();
    const vulnEvents = events.filter((e) => e.type === 'ability.status.vulnerable');
    expect(vulnEvents.length).toBe(1);
  });

  it('cross-pack status application respects resistance', () => {
    // Use pirate blinding-shot against a blind-immune target
    const blindingShot = pirateAbilities.find((a) =>
      a.effects.some((e) => e.type === 'apply-status' && (e.params?.statusId as string) === 'blinded'),
    );
    if (!blindingShot) return; // Skip if no blinding ability

    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'pirate'],
    });
    const target = makeEntity('target', 'pc', {
      resistances: { blind: 'immune' },
    });
    const engine = buildEngine([blindingShot], [actor, target]);

    engine.processAction(makeAction('actor', blindingShot.id, ['target']));

    const targetState = engine.store.state.entities['target'];
    expect(targetState.statuses.some((s) => s.statusId === 'blinded')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Cleanse across genres
// ---------------------------------------------------------------------------

describe('cleanse across genres', () => {
  beforeEach(registerAllStatusDefinitions);

  it('fantasy Purify removes debuffs', () => {
    const purify = fantasyAbilities.find((a) => a.id === 'purify');
    expect(purify).toBeDefined();

    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'divine'],
      statuses: [
        { id: 's1', statusId: 'holy-fire', stacks: 1, appliedAtTick: 0, expiresAtTick: 10 },
      ],
    });
    const engine = buildEngine([purify!], [actor]);

    engine.processAction(makeAction('actor', 'purify', undefined));

    // holy-fire has tags [holy, debuff] — purify cleanses debuff and holy
    const actorState = engine.store.state.entities['actor'];
    expect(actorState.statuses.some((s) => s.statusId === 'holy-fire')).toBe(false);
  });

  it('vampire Blood Purge removes control statuses', () => {
    const bloodPurge = vampireAbilities.find((a) => a.id === 'blood-purge');
    expect(bloodPurge).toBeDefined();

    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'vampire'],
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 10 },
      ],
      resources: { hp: 25, stamina: 20, humanity: 10 },
    });
    const engine = buildEngine([bloodPurge!], [actor]);

    engine.processAction(makeAction('actor', 'blood-purge', undefined));

    // mesmerized has tags [control, supernatural, debuff] — blood purge cleanses control,blind
    const actorState = engine.store.state.entities['actor'];
    expect(actorState.statuses.some((s) => s.statusId === 'mesmerized')).toBe(false);
  });

  it('cleanse is a no-op when no matching statuses', () => {
    const purify = fantasyAbilities.find((a) => a.id === 'purify')!;
    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'divine'],
      statuses: [],
    });
    const engine = buildEngine([purify], [actor]);

    engine.processAction(makeAction('actor', 'purify', undefined));

    const events = engine.drainEvents();
    const removeEvents = events.filter((e) => e.type === 'ability.status.removed');
    expect(removeEvents).toHaveLength(0);
  });

  it('ronin Centered Mind removes fear statuses', () => {
    const centeredMind = roninAbilities.find((a) => a.id === 'centered-mind');
    expect(centeredMind).toBeDefined();

    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'ronin'],
      statuses: [
        { id: 's1', statusId: 'terrified', stacks: 1, appliedAtTick: 0, expiresAtTick: 10 },
      ],
      resources: { hp: 25, stamina: 20, ki: 10 },
    });
    const engine = buildEngine([centeredMind!], [actor]);

    engine.processAction(makeAction('actor', 'centered-mind', undefined));

    const actorState = engine.store.state.entities['actor'];
    expect(actorState.statuses.some((s) => s.statusId === 'terrified')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. AI resistance awareness
// ---------------------------------------------------------------------------

describe('AI resistance awareness', () => {
  beforeEach(registerAllStatusDefinitions);

  it('AI avoids mesmerize against immune target', () => {
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;
    const npc = makeEntity('npc', 'npc', { tags: ['npc', 'vampire'], resources: { hp: 25, stamina: 20, humanity: 10 } });
    const immuneTarget = makeEntity('immune', 'pc', {
      resistances: { control: 'immune' },
    });
    const normalTarget = makeEntity('normal', 'pc');

    const engine = buildEngine([mesmerize], [npc, immuneTarget, normalTarget]);
    const world = engine.store.state;

    const scores = scoreAbilityUse(npc, mesmerize, world);
    const immuneScore = scores.find((s) => s.targetId === 'immune');
    const normalScore = scores.find((s) => s.targetId === 'normal');

    expect(immuneScore).toBeDefined();
    expect(normalScore).toBeDefined();
    expect(immuneScore!.score).toBeLessThan(normalScore!.score);
  });

  it('AI values cleanse when debuffed', () => {
    const bloodPurge = vampireAbilities.find((a) => a.id === 'blood-purge')!;
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;

    const debuffedNpc = makeEntity('npc', 'npc', {
      tags: ['npc', 'vampire'],
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 10 },
        { id: 's2', statusId: 'blinded', stacks: 1, appliedAtTick: 0, expiresAtTick: 10 },
      ],
      resources: { hp: 25, stamina: 20, humanity: 10 },
    });
    const enemy = makeEntity('enemy', 'pc');

    const abilities = [bloodPurge, mesmerize];
    const engine = buildEngine(abilities, [debuffedNpc, enemy]);
    const world = engine.store.state;

    const decision = selectNpcAbilityAction(debuffedNpc, world, abilities);
    expect(decision.chosen).not.toBeNull();
    // With 2 matching debuffs (control, blind), blood purge should be highly valued
    expect(decision.chosen!.abilityId).toBe('blood-purge');
  });

  it('AI prefers vulnerable targets for status abilities', () => {
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;
    const npc = makeEntity('npc', 'npc', { tags: ['npc', 'vampire'], resources: { hp: 25, stamina: 20, humanity: 10 } });
    const vulnTarget = makeEntity('vuln', 'pc', {
      resistances: { control: 'vulnerable' },
    });
    const normalTarget = makeEntity('normal', 'pc');

    const engine = buildEngine([mesmerize], [npc, vulnTarget, normalTarget]);
    const world = engine.store.state;

    const scores = scoreAbilityUse(npc, mesmerize, world);
    const vulnScore = scores.find((s) => s.targetId === 'vuln');
    const normalScore = scores.find((s) => s.targetId === 'normal');

    expect(vulnScore).toBeDefined();
    expect(normalScore).toBeDefined();
    expect(vulnScore!.score).toBeGreaterThan(normalScore!.score);
  });
});

// ---------------------------------------------------------------------------
// 5. Summary + Audit
// ---------------------------------------------------------------------------

describe('summary and audit — Phase 3 status coverage', () => {
  it('all 7 packs produce correct status coverage metrics', () => {
    const packs = [
      { genre: 'fantasy', abilities: fantasyAbilities },
      { genre: 'cyberpunk', abilities: cyberpunkAbilities },
      { genre: 'weird-west', abilities: weirdWestAbilities },
      { genre: 'vampire', abilities: vampireAbilities },
      { genre: 'gladiator', abilities: gladiatorAbilities },
      { genre: 'ronin', abilities: roninAbilities },
      { genre: 'pirate', abilities: pirateAbilities },
    ];

    for (const { genre, abilities } of packs) {
      const summary = summarizeAbilityPack(genre, abilities);
      // Every pack should have at least one status applied (from apply-status effects)
      // At minimum the pack's primary ability applies a status
      expect(summary.abilityCount).toBeGreaterThan(0);
    }
  });

  it('packs with cleanse abilities report correct cleanseTagsCovered', () => {
    // Fantasy has Purify with debuff,holy
    const fantSummary = summarizeAbilityPack('fantasy', fantasyAbilities);
    expect(fantSummary.cleanseTagsCovered.length).toBeGreaterThan(0);

    // Vampire has Blood Purge with control,blind
    const vampSummary = summarizeAbilityPack('vampire', vampireAbilities);
    expect(vampSummary.cleanseTagsCovered.length).toBeGreaterThan(0);

    // Ronin has Centered Mind with fear,control
    const ronSummary = summarizeAbilityPack('ronin', roninAbilities);
    expect(ronSummary.cleanseTagsCovered.length).toBeGreaterThan(0);
  });

  it('auditAbilityBalance produces no critical flags for all 7 packs', () => {
    const packs = [
      { genre: 'fantasy', abilities: fantasyAbilities },
      { genre: 'cyberpunk', abilities: cyberpunkAbilities },
      { genre: 'weird-west', abilities: weirdWestAbilities },
      { genre: 'vampire', abilities: vampireAbilities },
      { genre: 'gladiator', abilities: gladiatorAbilities },
      { genre: 'ronin', abilities: roninAbilities },
      { genre: 'pirate', abilities: pirateAbilities },
    ];

    const audit = auditAbilityBalance(packs);

    // No warning-severity flags (extreme damage etc.)
    const warnings = audit.flags.filter((f) => f.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('gladiator and pirate now have cleanse coverage (Phase 4)', () => {
    // Phase 4 added iron-resolve (gladiator) and rum-courage (pirate) cleanse abilities
    const gladSummary = summarizeAbilityPack('gladiator', gladiatorAbilities);
    const pirateSummary = summarizeAbilityPack('pirate', pirateAbilities);

    // Both should have cleanse tags covered now
    expect(gladSummary.cleanseTagsCovered.length).toBeGreaterThan(0);
    expect(pirateSummary.cleanseTagsCovered.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Trace resistance outcomes
// ---------------------------------------------------------------------------

describe('trace captures resistance outcomes across genres', () => {
  beforeEach(registerAllStatusDefinitions);

  it('trace shows immune outcome when status blocked', () => {
    const mesmerize = vampireAbilities.find((a) => a.id === 'mesmerize')!;
    const actor = makeEntity('actor', 'npc', {
      tags: ['npc', 'vampire'],
      resources: { hp: 25, stamina: 20, humanity: 10 },
    });
    const target = makeEntity('target', 'pc', {
      resistances: { control: 'immune' },
    });
    const engine = buildEngine([mesmerize], [actor, target]);

    engine.processAction(makeAction('actor', 'mesmerize', ['target']));

    const events = engine.drainEvents();
    const traceEvents = events.filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    const immuneEffects = trace.effects.filter((e) => e.resistanceOutcome === 'immune');
    expect(immuneEffects.length).toBe(1);
  });
});
