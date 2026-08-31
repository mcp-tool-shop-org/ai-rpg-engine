import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultReplayProducer, loadProjectPack, type EngineConstructor } from './replay-producer.js';
import { runExperiment } from './chat-experiments.js';
import { getStatusDefinition, clearStatusRegistry } from '@ai-rpg-engine/modules';

describe('createDefaultReplayProducer (F-fc88ce5e)', () => {
  it('runs an injected Engine and returns parseable replay JSON', () => {
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: (n?: number) => unknown[];
      queryEvents: () => Array<{ tick: number; type: string }>;
    }, options: { seed?: number }) {
      this.store = { state: { globals: { seed: options.seed ?? 0 } } };
      this.advanceRound = () => [];
      this.queryEvents = () => [{ tick: 0, type: 'round.advanced' }];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    const replay = producer(7, { alertGain: 0.4 }, 5);
    const parsed = JSON.parse(replay) as Array<{ tick: number }>;
    expect(parsed).toHaveLength(5);
    expect(parsed[0].tick).toBe(0);
  });

  it('is injectable: runExperiment uses the producer it is given', () => {
    const producer = createDefaultReplayProducer({
      Engine: function Stub(this: {
        store: { state: { globals: Record<string, string | number | boolean> } };
        advanceRound: () => unknown[];
        queryEvents: () => [];
      }) {
        this.store = { state: { globals: {} } };
        this.advanceRound = () => [];
        this.queryEvents = () => [];
      } as unknown as EngineConstructor,
    });
    const summary = runExperiment({ id: 't', label: 't', runs: 3, seedStart: 1, tickLimit: 4 }, producer);
    expect(summary.completedRuns).toBe(3);
    expect(summary.failedRuns).toBe(0);
    expect(summary.runs).toHaveLength(3);
  });

  it('falls back to synthetic ticks when Engine construction throws', () => {
    const Boom = function Boom() {
      throw new Error('no engine');
    } as unknown as EngineConstructor;
    const producer = createDefaultReplayProducer({ Engine: Boom });
    const replay = producer(1, undefined, 3);
    const parsed = JSON.parse(replay) as Array<{ tick: number }>;
    expect(parsed).toHaveLength(3);
  });

  it('derives metrics from store globals instead of the synthetic seed formula', () => {
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => Array<{ tick: number; type: string }>;
    }, options: { seed?: number }) {
      this.store = { state: { globals: { seed: options.seed ?? 0 } } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    const parsed = JSON.parse(producer(7, { alertGain: 0.4 }, 5)) as Array<{
      tick: number;
      alertPressure: number;
    }>;
    // Synthetic formula at t=0, seed 7, alertGain 0.4 was 0.45. Derived globals stay 0.4.
    expect(parsed[0].alertPressure).toBe(0.4);
    expect(parsed[0].alertPressure).not.toBeCloseTo(0.45);
  });

  it('loads a project pack.json and applies it before ticking', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-pack-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      entities: [{ id: 'chapel_guard', type: 'npc', name: 'Guard' }],
      zones: [{ id: 'nave', name: 'Nave' }],
    }));
    let applied: unknown = null;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }) {
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({
      Engine: FakeEngine,
      projectRoot: root,
      applyContentPack: (_engine, pack) => { applied = pack; },
    });
    producer(1, undefined, 2);
    expect(applied).toEqual(expect.objectContaining({
      entities: [expect.objectContaining({ id: 'chapel_guard' })],
    }));
    expect(loadProjectPack(root)).toEqual(expect.objectContaining({
      zones: [expect.objectContaining({ id: 'nave' })],
    }));
    rmSync(root, { recursive: true, force: true });
  });

  it('registers combat-core, cognition, district-core, and encounter-spawn', () => {
    let seen: Array<{ id?: string }> | undefined;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { modules?: Array<{ id?: string }> }) {
      seen = options.modules;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    producer(1, undefined, 1);
    const ids = (seen ?? []).map((m) => m.id);
    expect(ids).toContain('combat-core');
    expect(ids).toContain('inventory-core');
    expect(ids).toContain('cognition-core');
    expect(ids).toContain('district-core');
    expect(ids).toContain('encounter-spawn');
  });

  it('constructs progression-core from pack.progressionTrees', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-trees-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      progressionTrees: [{
        id: 'combat_mastery',
        name: 'Combat Mastery',
        currency: 'xp',
        nodes: [{ id: 'toughened', name: 'Toughened', cost: 10, effects: [{ type: 'resource-boost', params: { resource: 'hp', amount: 5 } }] }],
      }],
    }));
    let seen: Array<{ id?: string }> | undefined;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { modules?: Array<{ id?: string }> }) {
      seen = options.modules;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    const ids = (seen ?? []).map((m) => m.id);
    expect(ids).toContain('progression-core');
    rmSync(root, { recursive: true, force: true });
  });

  // F-b85931bb: createAbilityCore/registerStatusDefinitions were never wired
  // from the loaded pack, and manifest.ruleset was hardcoded to 'test' even
  // when the pack carried its own ruleset id.
  it('registers ability-core from pack.abilities', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-abilities-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      abilities: [{ id: 'fireball', verb: 'use-ability', target: { type: 'single' } }],
    }));
    let seen: Array<{ id?: string }> | undefined;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { modules?: Array<{ id?: string }> }) {
      seen = options.modules;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    const ids = (seen ?? []).map((m) => m.id);
    expect(ids).toContain('ability-core');
    rmSync(root, { recursive: true, force: true });
  });

  it('registers status definitions from pack.statuses into the shared registry', () => {
    clearStatusRegistry();
    const root = mkdtempSync(join(tmpdir(), 'replay-statuses-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      statuses: [{ id: 'poisoned', stacking: 'refresh', tags: ['poison'] }],
    }));
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }) {
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    expect(getStatusDefinition('poisoned')).toBeDefined();
    rmSync(root, { recursive: true, force: true });
  });

  it('binds pack.ruleset.id into the engine manifest instead of the hardcoded "test" (realistic: pack.ruleset is a full RulesetDefinition object)', () => {
    // intake.ts:1005-1018's SessionContent.ruleset doc comment: "Pack-authored
    // RulesetDefinition" — this is what assembleContentPack/create-ruleset
    // actually produce, NOT a bare string. The manifest's ruleset field is a
    // string, so it binds pack.ruleset.id.
    const root = mkdtempSync(join(tmpdir(), 'replay-ruleset-obj-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      ruleset: {
        id: 'fantasy-minimal',
        name: 'Fantasy Minimal',
        version: '0.1.0',
        stats: [], resources: [], verbs: [], formulas: [],
        defaultModules: [], progressionModels: [],
      },
    }));
    let seenRuleset: string | undefined;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { manifest: { ruleset: string } }) {
      seenRuleset = options.manifest.ruleset;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    expect(seenRuleset).toBe('fantasy-minimal');
    rmSync(root, { recursive: true, force: true });
  });

  it('also accepts a bare ruleset id string defensively', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-ruleset-str-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      ruleset: 'fantasy-minimal',
    }));
    let seenRuleset: string | undefined;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { manifest: { ruleset: string } }) {
      seenRuleset = options.manifest.ruleset;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    expect(seenRuleset).toBe('fantasy-minimal');
    rmSync(root, { recursive: true, force: true });
  });

  it('falls back to the "test" ruleset when the pack has none', () => {
    let seenRuleset: string | undefined;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { manifest: { ruleset: string } }) {
      seenRuleset = options.manifest.ruleset;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    producer(1, undefined, 1);
    expect(seenRuleset).toBe('test');
  });

  // Coordinator work order (wave 4): completes the wave-2 F-b85931bb
  // recommendation. The tests above prove the manifest binds pack.ruleset's
  // string id, but engine.ts:27's EngineOptions.ruleset?: RulesetDefinition
  // is the slot the documented contract means by "bind it at Engine
  // construction" ("Bind it at Engine construction" — content-schema's
  // SessionContent.ruleset doc comment) and it never received the authored
  // definition. The manifest id binding stays exactly as it is; the full
  // object is ALSO threaded through EngineOptions.ruleset when pack.ruleset
  // is well-shaped (id/name/stats/resources/verbs present — the same shape
  // classifyDocument's own standalone-ruleset detection uses, F-8ec253bf).
  it('also passes the full RulesetDefinition as EngineOptions.ruleset when pack.ruleset is well-shaped', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-ruleset-opt-obj-'));
    mkdirSync(join(root, 'content'));
    const rulesetDef = {
      id: 'fantasy-minimal',
      name: 'Fantasy Minimal',
      version: '0.1.0',
      stats: [], resources: [], verbs: [], formulas: [],
      defaultModules: [], progressionModels: [],
    };
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({ ruleset: rulesetDef }));
    let seenRulesetOption: unknown = 'unset';
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { manifest: { ruleset: string }; ruleset?: unknown }) {
      seenRulesetOption = options.ruleset;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    expect(seenRulesetOption).toEqual(rulesetDef);
    rmSync(root, { recursive: true, force: true });
  });

  it('does not pass EngineOptions.ruleset when pack.ruleset is a bare string id', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-ruleset-opt-str-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({ ruleset: 'fantasy-minimal' }));
    let seenRulesetOption: unknown = 'unset';
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { manifest: { ruleset: string }; ruleset?: unknown }) {
      seenRulesetOption = options.ruleset;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine, projectRoot: root });
    producer(1, undefined, 1);
    expect(seenRulesetOption).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });

  it('does not pass EngineOptions.ruleset when the pack has none', () => {
    let seenRulesetOption: unknown = 'unset';
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }, options: { manifest: { ruleset: string }; ruleset?: unknown }) {
      seenRulesetOption = options.ruleset;
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    producer(1, undefined, 1);
    expect(seenRulesetOption).toBeUndefined();
  });
});
