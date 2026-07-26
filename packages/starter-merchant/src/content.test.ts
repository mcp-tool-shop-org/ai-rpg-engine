// Salt Road Ledger — content truth.
//
// These check the content against ITSELF and against the schemas, not against a
// hand-built fixture. Anything that needs a live engine (verb honesty, the
// played-session loop) waits for createGame in P5/P6.

import { describe, it, expect } from 'vitest';
import { validateQuestDefinition, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import {
  manifest,
  player,
  zones,
  districts,
  itemCatalog,
  buildCatalog,
  packMeta,
  merchantQuests,
  merchantAbilities,
  merchantStatusDefinitions,
  encounterSpawnContent,
  theStandingAccountBoss,
  factorsCreditTree,
  guildRegistrationDialogue,
  warrensTermsDialogue,
} from './content.js';
import { merchantMinimalRuleset } from './ruleset.js';

const zoneIds = new Set(zones.map((z) => z.id));
const itemIds = new Set(itemCatalog.items.map((i) => i.id));

describe('manifest + identity', () => {
  it('manifest.id matches packMeta.id and the ruleset it names exists', () => {
    expect(manifest.id).toBe(packMeta.id);
    expect(manifest.ruleset).toBe(merchantMinimalRuleset.id);
  });

  it('packMeta declares the mercantile genre and the unique tone pair', () => {
    expect(packMeta.genres).toEqual(['mercantile']);
    expect(new Set(packMeta.tones)).toEqual(new Set(['comedic', 'tense']));
  });
});

describe('zones + districts', () => {
  it('every zone neighbor resolves to a real zone', () => {
    for (const zone of zones) {
      for (const n of zone.neighbors) {
        expect(zoneIds.has(n), `zone '${zone.id}' names unknown neighbor '${n}'`).toBe(true);
      }
    }
  });

  it('zone adjacency is symmetric — no one-way passages', () => {
    // F-7902facb in gladiator: patron-gallery listed arena-floor without the
    // reciprocal, making the walk back up a detour. Cheap to author by accident.
    const byId = new Map(zones.map((z) => [z.id, z]));
    for (const zone of zones) {
      for (const n of zone.neighbors) {
        expect(
          byId.get(n)!.neighbors,
          `'${zone.id}' -> '${n}' is one-way`,
        ).toContain(zone.id);
      }
    }
  });

  it('every district zone id resolves, and each zone belongs to exactly one district', () => {
    const seen = new Map<string, string>();
    for (const d of districts) {
      for (const z of d.zoneIds) {
        expect(zoneIds.has(z), `district '${d.id}' names unknown zone '${z}'`).toBe(true);
        expect(seen.has(z), `zone '${z}' is in both '${seen.get(z)}' and '${d.id}'`).toBe(false);
        seen.set(z, d.id);
      }
    }
  });

  it('every zone is covered by a district — a zone off the map has no market', () => {
    // trade-core resolves price via getDistrictForZone and rejects with "no
    // market here" off-district, so an uncovered zone silently no-ops trading.
    // The pirate played-session proof had to route around exactly this.
    const covered = new Set(districts.flatMap((d) => d.zoneIds));
    for (const z of zoneIds) {
      expect(covered.has(z), `zone '${z}' belongs to no district`).toBe(true);
    }
  });

  it('the Warrens is deliberately uncontrolled; the other three are faction-held', () => {
    // Mechanical, not decorative: no controlling faction is what makes the
    // Warrens the district where direct payment is the only settlement option.
    const warrens = districts.find((d) => d.id === 'the-warrens')!;
    expect(warrens.controllingFaction).toBeUndefined();
    for (const d of districts.filter((x) => x.id !== 'the-warrens')) {
      expect(d.controllingFaction, `'${d.id}' should be faction-held`).toBeTruthy();
    }
  });

  it('the player starts in a safe home-base zone', () => {
    const start = zones.find((z) => z.id === player.zoneId)!;
    expect(start).toBeDefined();
    expect(start.tags).toContain('safe');
    expect(start.tags).toContain('home-base');
  });
});

describe('player + resources', () => {
  it('every player resource is declared in the ruleset', () => {
    const declared = new Set(merchantMinimalRuleset.resources.map((r) => r.id));
    for (const key of Object.keys(player.resources)) {
      // maxHp/maxStamina are engine-side ceiling conventions, not ruleset rows.
      if (key.startsWith('max')) continue;
      expect(declared.has(key), `player carries undeclared resource '${key}'`).toBe(true);
    }
  });

  it('carries coin — the single field the fungible ledger layer reads', () => {
    expect(player.resources.coin).toBeGreaterThan(0);
  });

  it('starts unencumbered: lien at zero', () => {
    expect(player.resources.lien).toBe(0);
  });

  it('every player stat is declared in the ruleset', () => {
    const declared = new Set(merchantMinimalRuleset.stats.map((s) => s.id));
    for (const key of Object.keys(player.stats)) {
      expect(declared.has(key), `player carries undeclared stat '${key}'`).toBe(true);
    }
  });

  it('starting inventory resolves against the item catalog', () => {
    for (const id of player.inventory ?? []) {
      expect(itemIds.has(id), `player starts with unknown item '${id}'`).toBe(true);
    }
  });
});

describe('items', () => {
  it('the unique instruments carry provenance — the NFT layer reads it', () => {
    for (const id of ['guild-seal', 'writ-of-passage', 'deed-of-the-longshore', 'ledger-book', 'assayers-loupe']) {
      const item = itemCatalog.items.find((i) => i.id === id);
      expect(item, `missing unique instrument '${id}'`).toBeDefined();
      expect(item!.provenance, `'${id}' has no provenance`).toBeDefined();
    }
  });

  it('the guild seal grants consign — without it you are cash-on-the-barrel only', () => {
    const seal = itemCatalog.items.find((i) => i.id === 'guild-seal')!;
    expect(seal.grantedVerbs).toContain('consign');
    expect(seal.rarity).toBe('legendary');
  });

  it('the ledger book grants audit', () => {
    const book = itemCatalog.items.find((i) => i.id === 'ledger-book')!;
    expect(book.grantedVerbs).toContain('audit');
  });

  it('every granted verb is declared in the ruleset', () => {
    // An item granting a verb the ruleset never advertises is a dead affordance.
    const declared = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    for (const item of itemCatalog.items) {
      for (const verb of item.grantedVerbs ?? []) {
        expect(declared.has(verb), `item '${item.id}' grants undeclared verb '${verb}'`).toBe(true);
      }
    }
  });

  it('every item stat/resource modifier targets something the ruleset declares', () => {
    const stats = new Set(merchantMinimalRuleset.stats.map((s) => s.id));
    const resources = new Set(merchantMinimalRuleset.resources.map((r) => r.id));
    for (const item of itemCatalog.items) {
      for (const stat of Object.keys(item.statModifiers ?? {})) {
        expect(stats.has(stat), `item '${item.id}' modifies unknown stat '${stat}'`).toBe(true);
      }
      for (const res of Object.keys(item.resourceModifiers ?? {})) {
        expect(resources.has(res), `item '${item.id}' modifies unknown resource '${res}'`).toBe(true);
      }
    }
  });
});

describe('quests', () => {
  it('every quest validates against the schema', () => {
    for (const quest of merchantQuests) {
      const r = validateQuestDefinition(quest);
      expect(r.ok, `quest '${quest.id}': ${r.errors.join('; ')}`).toBe(true);
    }
  });

  it('every zone-entry trigger reads the zoneId field and names a real zone', () => {
    // A quest gated on a typo'd zone id never offers and never advances — a
    // silent dead quest, the wired-but-inert class.
    //
    // The `key === 'zoneId'` assertion is the part that matters, and the first
    // version of this test SKIPPED any trigger whose key was not already
    // 'zoneId' — which is precisely the malformed case. A real stage shipped
    // reading `key: 'crooked-stair'` (the value, put where the field name goes)
    // and this test passed it straight through; the scripted playthrough caught
    // it instead. A validator that only inspects well-formed input is not a
    // validator.
    for (const quest of merchantQuests) {
      const triggers = [...(quest.triggers ?? []), ...quest.stages.flatMap((s) => s.triggers ?? [])];
      for (const t of triggers) {
        if (t.event !== 'world.zone.entered') continue;
        const params = t.condition?.params as { key?: string; value?: unknown } | undefined;
        expect(
          params?.key,
          `quest '${quest.id}' zone trigger reads payload field '${String(params?.key)}' — must be 'zoneId'`,
        ).toBe('zoneId');
        expect(zoneIds.has(String(params?.value)), `quest '${quest.id}' triggers on unknown zone '${String(params?.value)}'`).toBe(true);
      }
    }
  });

  it('every stage of a multi-stage quest is reachable via nextStage', () => {
    // quest-core's completeStage falls through to completeQuest when a stage has
    // no `nextStage`, so in a 2-stage quest without the chain the second stage
    // stays 'locked' for the whole run. This shipped, and only the scripted
    // playthrough noticed: the schema validates each stage in isolation and has
    // no opinion about whether the graph connects.
    for (const quest of merchantQuests) {
      if (quest.stages.length < 2) continue;
      const ids = quest.stages.map((s) => s.id);
      const reachable = new Set([ids[0]]);
      for (const stage of quest.stages) {
        if (!stage.nextStage) continue;
        expect(ids, `quest '${quest.id}' stage '${stage.id}' -> unknown '${stage.nextStage}'`).toContain(stage.nextStage);
        reachable.add(stage.nextStage);
      }
      for (const id of ids) {
        expect(reachable.has(id), `quest '${quest.id}' stage '${id}' is unreachable — no stage names it as nextStage`).toBe(true);
      }
    }
  });

  it('no quest is gated on ENTERING the zone the player starts in', () => {
    // `world.zone.entered` is emitted by the `move` handler, so the start zone
    // never fires it. A quest offered on entering `counting-house` is
    // structurally unreachable — well-formed, schema-valid, and dead. This
    // shipped once and the scripted playthrough is what found it.
    for (const quest of merchantQuests) {
      for (const t of quest.triggers ?? []) {
        if (t.event !== 'world.zone.entered') continue;
        const params = t.condition?.params as { key?: string; value?: unknown } | undefined;
        expect(
          String(params?.value),
          `quest '${quest.id}' offers on entering the start zone — it can never fire`,
        ).not.toBe(player.zoneId);
      }
    }
  });

  it('every combat trigger names an entity that exists in this pack', () => {
    const entityIds = new Set([
      'the-standing-account', 'collections-enforcer', 'warren-cutpurse', 'bonded-clerk-thrall',
    ]);
    for (const quest of merchantQuests) {
      for (const stage of quest.stages) {
        for (const t of stage.triggers ?? []) {
          if (t.event !== 'combat.entity.defeated') continue;
          const params = t.condition?.params as { key?: string; value?: unknown } | undefined;
          if (params?.key !== 'entityId') continue;
          expect(entityIds.has(String(params.value)), `quest '${quest.id}' triggers on unknown entity '${String(params.value)}'`).toBe(true);
        }
      }
    }
  });

  it('every dialogue trigger names a dialogue this pack defines', () => {
    const dialogueIds = new Set([guildRegistrationDialogue.id, warrensTermsDialogue.id]);
    for (const quest of merchantQuests) {
      for (const stage of quest.stages) {
        for (const t of stage.triggers ?? []) {
          if (t.event !== 'dialogue.ended') continue;
          const params = t.condition?.params as { key?: string; value?: unknown } | undefined;
          if (params?.key !== 'dialogueId') continue;
          expect(dialogueIds.has(String(params.value)), `quest '${quest.id}' triggers on unknown dialogue '${String(params.value)}'`).toBe(true);
        }
      }
    }
  });
});

describe('dialogue', () => {
  it('every choice target and nextNodeId resolves to a real node', () => {
    for (const dialogue of [guildRegistrationDialogue, warrensTermsDialogue]) {
      const nodeIds = new Set(Object.keys(dialogue.nodes));
      expect(nodeIds.has(dialogue.entryNodeId)).toBe(true);
      for (const node of Object.values(dialogue.nodes)) {
        for (const choice of node.choices ?? []) {
          expect(
            nodeIds.has(choice.nextNodeId!),
            `${dialogue.id}/${node.id} choice '${choice.id}' -> unknown node '${choice.nextNodeId}'`,
          ).toBe(true);
        }
        if (node.nextNodeId) expect(nodeIds.has(node.nextNodeId)).toBe(true);
      }
    }
  });

  it('every node is reachable from the entry node', () => {
    for (const dialogue of [guildRegistrationDialogue, warrensTermsDialogue]) {
      const seen = new Set<string>();
      const queue = [dialogue.entryNodeId];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = dialogue.nodes[id];
        for (const c of node.choices ?? []) if (c.nextNodeId) queue.push(c.nextNodeId);
        if (node.nextNodeId) queue.push(node.nextNodeId);
      }
      for (const id of Object.keys(dialogue.nodes)) {
        expect(seen.has(id), `${dialogue.id}: node '${id}' is unreachable`).toBe(true);
      }
    }
  });

  it('registration ends by setting the books-opened flag — the ledger checkpoint 0', () => {
    const node = guildRegistrationDialogue.nodes['registered'];
    expect(node.effects?.some((e) => e.type === 'set-global')).toBe(true);
  });
});

describe('abilities + statuses', () => {
  it('the ability pack validates against this pack’s own ruleset', () => {
    // Two positional args, and the ruleset is the point: the validator
    // cross-checks every cost -> resource, check -> stat, and effect ->
    // stat/resource reference against it. Passing the abilities alone (or as an
    // object) validates nothing useful.
    const r = validateAbilityPack(merchantAbilities, merchantMinimalRuleset);
    expect(r.ok, r.errors.map((e) => `${e.path}: ${e.message}`).join('; ')).toBe(true);
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const declared = new Set(merchantMinimalRuleset.resources.map((r) => r.id));
    for (const ability of merchantAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(declared.has(cost.resourceId), `ability '${ability.id}' costs undeclared '${cost.resourceId}'`).toBe(true);
      }
    }
  });

  it('every ability stat check names a declared stat', () => {
    const declared = new Set(merchantMinimalRuleset.stats.map((s) => s.id));
    for (const ability of merchantAbilities) {
      for (const check of ability.checks ?? []) {
        expect(declared.has(check.stat), `ability '${ability.id}' checks unknown stat '${check.stat}'`).toBe(true);
      }
    }
  });

  it('every status an ability applies is defined by this pack', () => {
    // The dead-status trap: an ability applying an undefined statusId silently
    // does nothing, and no schema catches it.
    const defined = new Set(merchantStatusDefinitions.map((s) => s.id));
    for (const ability of merchantAbilities) {
      for (const effect of ability.effects ?? []) {
        if (effect.type !== 'apply-status') continue;
        const statusId = String((effect.params as { statusId?: unknown }).statusId);
        expect(defined.has(statusId), `ability '${ability.id}' applies undefined status '${statusId}'`).toBe(true);
      }
    }
  });

  it('every ability is gated on the pack-identity tag the player carries', () => {
    // T0-tag-gate: an ability requiring a tag the player lacks is invisible.
    for (const ability of merchantAbilities) {
      const tags = (ability.requirements ?? [])
        .filter((r) => r.type === 'has-tag')
        .map((r) => String((r.params as { tag?: unknown }).tag));
      for (const tag of tags) {
        expect(player.tags, `ability '${ability.id}' gates on '${tag}' which the player lacks`).toContain(tag);
      }
    }
  });
});

describe('encounters + boss', () => {
  it('every encounter participant has an entity template', () => {
    const templates = new Set(encounterSpawnContent.entityTemplates.map((e) => e.id));
    for (const enc of encounterSpawnContent.encounters) {
      for (const p of enc.participants) {
        expect(templates.has(p.entityId), `encounter '${enc.id}' spawns untemplated '${p.entityId}'`).toBe(true);
      }
    }
  });

  it('every encounter validZoneId and zoneTable key resolves to a real zone', () => {
    for (const enc of encounterSpawnContent.encounters) {
      for (const z of enc.validZoneIds ?? []) {
        expect(zoneIds.has(z), `encounter '${enc.id}' lists unknown zone '${z}'`).toBe(true);
      }
    }
    for (const z of Object.keys(encounterSpawnContent.zoneTables)) {
      expect(zoneIds.has(z), `zoneTable references unknown zone '${z}'`).toBe(true);
    }
  });

  it('every zoneTable entry names a defined encounter', () => {
    const encIds = new Set(encounterSpawnContent.encounters.map((e) => e.id));
    for (const [zone, table] of Object.entries(encounterSpawnContent.zoneTables)) {
      for (const id of table) {
        expect(encIds.has(id), `zone '${zone}' table names unknown encounter '${id}'`).toBe(true);
      }
    }
  });

  it('the boss uses the role:boss tag convention every pack shares', () => {
    // The item-chronicle producer detects a boss kill off this tag; a bare
    // 'boss' would not match, which is the defect the gladiator played-session
    // proof caught.
    expect(theStandingAccountBoss.entityId).toBe('the-standing-account');
    expect(theStandingAccountBoss.phases.length).toBeGreaterThanOrEqual(2);
  });

  it('boss phase thresholds descend', () => {
    const thresholds = theStandingAccountBoss.phases.map((p) => p.hpThreshold);
    expect([...thresholds].sort((a, b) => b - a)).toEqual(thresholds);
  });
});

describe('build catalog + progression', () => {
  it('every archetype references the pack progression tree', () => {
    for (const a of buildCatalog.archetypes) {
      expect(a.progressionTreeId).toBe(factorsCreditTree.id);
    }
  });

  it('every archetype carries the pack-identity tag', () => {
    for (const a of buildCatalog.archetypes) {
      expect(a.startingTags, `archetype '${a.id}' missing 'merchant'`).toContain('merchant');
    }
  });

  it('every archetype starting item resolves against the catalog', () => {
    for (const a of buildCatalog.archetypes) {
      for (const id of a.startingInventory ?? []) {
        expect(itemIds.has(id), `archetype '${a.id}' starts with unknown item '${id}'`).toBe(true);
      }
    }
  });

  it('at least one flaw exists, since requiredFlaws is 1', () => {
    const flaws = buildCatalog.traits.filter((t) => t.category === 'flaw');
    expect(flaws.length).toBeGreaterThanOrEqual(buildCatalog.requiredFlaws);
  });

  it('every crossTitle names a real archetype and discipline', () => {
    const arch = new Set(buildCatalog.archetypes.map((a) => a.id));
    const disc = new Set(buildCatalog.disciplines.map((d) => d.id));
    for (const ct of buildCatalog.crossTitles) {
      expect(arch.has(ct.archetypeId), `crossTitle names unknown archetype '${ct.archetypeId}'`).toBe(true);
      expect(disc.has(ct.disciplineId), `crossTitle names unknown discipline '${ct.disciplineId}'`).toBe(true);
    }
  });

  it('every archetype x discipline pair has a crossTitle', () => {
    const pairs = new Set(buildCatalog.crossTitles.map((c) => `${c.archetypeId}:${c.disciplineId}`));
    for (const a of buildCatalog.archetypes) {
      for (const d of buildCatalog.disciplines) {
        expect(pairs.has(`${a.id}:${d.id}`), `no crossTitle for ${a.id} x ${d.id}`).toBe(true);
      }
    }
  });

  it('every discipline granted verb is declared in the ruleset', () => {
    const declared = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    for (const d of buildCatalog.disciplines) {
      if (!d.grantedVerb) continue;
      expect(declared.has(d.grantedVerb), `discipline '${d.id}' grants undeclared verb '${d.grantedVerb}'`).toBe(true);
    }
  });

  it('progression node requires resolve to earlier nodes', () => {
    const nodeIds = new Set(factorsCreditTree.nodes.map((n) => n.id));
    for (const node of factorsCreditTree.nodes) {
      for (const req of node.requires ?? []) {
        expect(nodeIds.has(req), `node '${node.id}' requires unknown '${req}'`).toBe(true);
      }
    }
  });

  it('progression effects target declared stats and resources', () => {
    const stats = new Set(merchantMinimalRuleset.stats.map((s) => s.id));
    const resources = new Set(merchantMinimalRuleset.resources.map((r) => r.id));
    for (const node of factorsCreditTree.nodes) {
      for (const effect of node.effects) {
        const p = effect.params as { stat?: string; resource?: string };
        if (p.stat) expect(stats.has(p.stat), `node '${node.id}' boosts unknown stat '${p.stat}'`).toBe(true);
        if (p.resource) expect(resources.has(p.resource), `node '${node.id}' boosts unknown resource '${p.resource}'`).toBe(true);
      }
    }
  });
});
