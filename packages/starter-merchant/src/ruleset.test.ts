import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { merchantMinimalRuleset } from './ruleset.js';

describe('merchantMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(merchantMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares `coin` — the one field the opt-in ledger layer reads', () => {
    // snapshotFromWorld reads entity.resources.coin and nothing else for the
    // fungible layer, so a pack meant to showcase settlement that omitted it
    // would silently settle nothing. Five shipped packs declare it in the
    // ruleset; pirate carries it on the entity only. This pack does both.
    const resIds = merchantMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('coin');
  });

  it('declares liquidity and lien — the rubric-distinct pressure axes', () => {
    const resIds = new Set(merchantMinimalRuleset.resources.map((r) => r.id));
    expect(resIds.has('liquidity')).toBe(true);
    expect(resIds.has('lien')).toBe(true);
  });

  it('lien is an INVERSE resource — it starts empty and fills toward ruin', () => {
    // The failure mode. Unlike hp/stamina/liquidity (which start high and drain),
    // lien starts at 0 and accrues; a default of anything else would mean the
    // factor begins already encumbered.
    const lien = merchantMinimalRuleset.resources.find((r) => r.id === 'lien')!;
    expect(lien.default).toBe(0);
    expect(lien.min).toBe(0);
    expect(lien.max).toBeGreaterThan(0);
  });

  it('the five pack-native commerce verbs are declared', () => {
    // Rubric dimension 1 (distinct verbs): each of these is unique across the
    // catalog — none appears in any other pack's verb list. Handler wiring is
    // P4/P5; content-truth.test.ts enforces verb-honesty against
    // getAvailableActions() once createGame exists.
    const verbIds = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    for (const verb of ['appraise', 'haggle', 'consign', 'underwrite', 'audit']) {
      expect(verbIds.has(verb), `missing pack-native verb '${verb}'`).toBe(true);
    }
  });

  it('every formula input references a declared stat, resource, or an authored namespace', () => {
    // Catches the copy-paste-a-sibling-pack's-formula bug the gladiator suite
    // pins (F-e83a091f): a formula describing stats this pack does not have.
    const known = new Set([
      ...merchantMinimalRuleset.stats.map((s) => s.id),
      ...merchantMinimalRuleset.resources.map((r) => r.id),
    ]);
    // Namespaces the pack authors itself rather than reading off an entity.
    const authored = ['item.', 'obligation.'];
    for (const formula of merchantMinimalRuleset.formulas) {
      for (const input of formula.inputs) {
        if (authored.some((prefix) => input.startsWith(prefix))) continue;
        const bare = input.replace(/^(actor|target)\./, '');
        expect(known.has(bare), `formula '${formula.id}' reads unknown '${input}'`).toBe(true);
      }
    }
  });

  it('combat is a bad trade — HP tops out below every other starter', () => {
    // Design intent, pinned: a factor is not a fighter. If a later edit raises
    // this ceiling to fantasy/gladiator levels, the pack has quietly become a
    // combat game and the lien-on-victory mechanic stops reading as a cost.
    const hp = merchantMinimalRuleset.resources.find((r) => r.id === 'hp')!;
    expect(hp.max).toBeLessThanOrEqual(24);
  });
});
