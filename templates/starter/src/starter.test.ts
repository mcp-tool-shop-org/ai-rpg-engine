import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition, validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack, AbilityDefinition, DialogueDefinition } from '@ai-rpg-engine/content-schema';
import { myRuleset } from './ruleset.js';
import { createGame } from './setup.js';

describe('starter template', () => {
    it('ruleset validates against schema', () => {
        const r = validateRulesetDefinition(myRuleset);
        expect(r.ok).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('declares combat stats mapped in buildCombatStack', () => {
        const statIds = myRuleset.stats.map((s) => s.id);
        expect(statIds).toContain('power');
        expect(statIds).toContain('speed');
        expect(statIds).toContain('grit');
    });

    it('declares a starter-specific resource', () => {
        const resIds = myRuleset.resources.map((r) => r.id);
        expect(resIds).toContain('tension');
    });

    it('createGame boots without throwing', () => {
        const engine = createGame(1);
        expect(engine).toBeDefined();
    });

    it('tension rises when combat damage lands (tension-pressure fires)', () => {
        const engine = createGame(1);
        expect(engine.world.entities['player']?.resources.tension).toBe(0);

        // Walk into the danger zone and fight. combat-core emits
        // 'combat.damage.applied' whenever a hit lands — that is the event
        // the tension-pressure module listens on.
        engine.submitAction('move', { targetIds: ['danger-zone'] });
        for (let i = 0; i < 8; i++) {
            engine.submitAction('attack', { targetIds: ['grunt'] });
            if ((engine.world.entities['player']?.resources.tension ?? 0) > 0) break;
        }

        // Meta-test property: deleting the tension-pressure listener in
        // setup.ts turns this RED — nothing else writes the tension resource.
        expect(engine.world.entities['player']?.resources.tension).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-REFERENCE INTEGRITY
// The schema test above checks each piece in isolation. These tests check
// the connections BETWEEN pieces: dangling zone neighbors, duplicate ids,
// dialogue speakers that name an entity's display name instead of its id,
// abilities that reference undeclared stats/resources. They validate the
// REAL composed game (createGame()'s world state), so they automatically
// cover content you add — as long as you keep the two lists below in sync.
//
// Why this matters: dialogue-core finds a dialogue by matching its
// speakers[] against the target ENTITY ID. Writing the display name
// ('Grunt') instead of the id ('grunt') doesn't error — "talk to NPC"
// just silently reports "has nothing to say". validateGameContent catches
// exactly that class of bug at test time.
// ═══════════════════════════════════════════════════════════════════
describe('starter template — cross-reference integrity', () => {
    // Register your DialogueDefinitions here as you write them. Remember:
    // speakers: ['grunt'] (entity id), never speakers: ['Grunt'] (name).
    const myDialogues: DialogueDefinition[] = [];
    // Register your AbilityDefinitions here as you write them.
    const myAbilities: AbilityDefinition[] = [];

    function builtContentPack(): ContentPack {
        const engine = createGame(1);
        return {
            zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
            entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
            dialogues: myDialogues,
            abilities: myAbilities,
        };
    }

    it('zones, entities, dialogues, and abilities have no dangling references or duplicate ids', () => {
        const result = validateGameContent(builtContentPack());
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('has no one-way zone passages (neighbor symmetry advisory)', () => {
        // A zone listing a neighbor that doesn't list it back is legal but
        // almost always a mistake — the player can walk in and never back out.
        const result = validateGameContent(builtContentPack());
        expect(result.advisories).toEqual([]);
    });

    it('abilities reference only stats/resources declared in the ruleset', () => {
        const result = validateAbilityPack(myAbilities, myRuleset);
        expect(result.errors).toEqual([]);
    });
});
