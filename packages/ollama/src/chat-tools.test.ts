// Tests — chat tool registry: tool lookup and execution with mock client

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import type { ChatToolParams } from './chat-types.js';
import type { DesignSession } from './session.js';
import { findToolForIntent, getAllTools } from './chat-tools.js';
import { createSession, addThemes } from './session.js';

function mockClient(response: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: true, text: response };
    },
  };
}

function failingClient(): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: false, error: 'connection refused' };
    },
  };
}

function makeSession(): DesignSession {
  const s = createSession('test-session');
  addThemes(s, ['cyberpunk', 'noir']);
  return s;
}

function makeParams(overrides: Partial<ChatToolParams> = {}): ChatToolParams {
  return {
    client: mockClient('mock response'),
    session: makeSession(),
    sessionContext: 'Test session context',
    projectRoot: '/tmp/test-project',
    params: {},
    userMessage: 'test message',
    ...overrides,
  };
}

// --- Tool lookup ---

describe('findToolForIntent', () => {
  it('finds suggest-next tool', () => {
    const tool = findToolForIntent('suggest_next');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('suggest-next');
  });

  it('finds session-info tool', () => {
    const tool = findToolForIntent('session_info');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('session-info');
  });

  it('finds scaffold tool', () => {
    const tool = findToolForIntent('scaffold');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('scaffold');
  });

  it('finds critique tool', () => {
    const tool = findToolForIntent('critique');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('critique');
  });

  it('finds improve tool', () => {
    const tool = findToolForIntent('improve');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('improve');
  });

  it('finds compare-replays tool', () => {
    const tool = findToolForIntent('compare_replays');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('compare-replays');
  });

  it('finds analyze-replay tool', () => {
    const tool = findToolForIntent('analyze_replay');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('analyze-replay');
  });

  it('finds plan-district tool', () => {
    const tool = findToolForIntent('plan');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('plan-district');
  });

  it('finds explain-why tool', () => {
    const tool = findToolForIntent('explain_why');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('explain-why');
  });

  it('finds explain-state tool', () => {
    const tool = findToolForIntent('explain_state');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('explain-state');
  });

  it('finds apply-content tool', () => {
    const tool = findToolForIntent('apply_content');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('apply-content');
    expect(tool!.mutates).toBe(true);
  });

  it('finds help tool', () => {
    const tool = findToolForIntent('help');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('help');
  });

  it('returns undefined for unknown intent', () => {
    const tool = findToolForIntent('unknown');
    expect(tool).toBeUndefined();
  });

  it('returns undefined for nonexistent intent', () => {
    const tool = findToolForIntent('dance_party');
    expect(tool).toBeUndefined();
  });

  // v1.2 new tools
  it('finds context-info tool', () => {
    const tool = findToolForIntent('context_info');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('context-info');
  });

  it('finds smart-plan tool', () => {
    const tool = findToolForIntent('show_plan');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('smart-plan');
  });

  it('finds recommend tool', () => {
    const tool = findToolForIntent('recommend');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('recommend');
  });
});

describe('getAllTools', () => {
  it('returns all 35 registered tools', () => {
    const tools = getAllTools();
    expect(tools.length).toBe(35);
  });

  it('returns a copy (not the internal array)', () => {
    const t1 = getAllTools();
    const t2 = getAllTools();
    expect(t1).not.toBe(t2);
    expect(t1).toEqual(t2);
  });

  it('every tool has required properties', () => {
    for (const tool of getAllTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.intents.length).toBeGreaterThan(0);
      expect(typeof tool.mutates).toBe('boolean');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('only apply-content, emit-pack, and tune-apply declare mutates=true', () => {
    const mutating = getAllTools().filter(t => t.mutates);
    expect(mutating.length).toBe(3);
    const names = mutating.map(t => t.name).sort();
    expect(names).toEqual(['apply-content', 'emit-pack', 'tune-apply']);
  });
});

// --- Tool execution ---

describe('help tool', () => {
  it('returns help text with no client needed', async () => {
    const tool = findToolForIntent('help')!;
    const result = await tool.execute(makeParams());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Design:');
    expect(result.summary).toContain('Iterate:');
    expect(result.summary).toContain('Analyze:');
    expect(result.summary).toContain('Session:');
    expect(result.summary).toContain('Apply:');
    expect(result.actions.length).toBe(0);
  });
});

describe('session-info tool', () => {
  it('returns session status when session exists', async () => {
    const tool = findToolForIntent('session_info')!;
    const result = await tool.execute(makeParams());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('test-session');
  });

  it('returns message when no session', async () => {
    const tool = findToolForIntent('session_info')!;
    const result = await tool.execute(makeParams({ session: null }));
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('No active session');
  });
});

describe('suggest-next tool', () => {
  it('returns suggestions when session exists', async () => {
    const yamlResponse = `Looking at your session, here are recommendations.

## Next Actions

- priority: high
  command: create-room --theme "noir safehouse"
  code: SCAFFOLD_001
  reason: Session has themes but no rooms yet

## Summary
Start by creating core rooms to establish the district mood.`;

    const tool = findToolForIntent('suggest_next')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yamlResponse),
    }));
    expect(result.ok).toBe(true);
    expect(result.actions.length).toBe(1);
    expect(result.actions[0].status).toBe('executed');
    expect(result.sessionEvents).toBeDefined();
  });

  it('fails without session', async () => {
    const tool = findToolForIntent('suggest_next')!;
    const result = await tool.execute(makeParams({ session: null }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('No active session');
  });
});

describe('scaffold tool', () => {
  it('generates a room and returns pending write', async () => {
    const yaml = 'id: haunted-library\ntype: room\nname: Haunted Library\ntags: [horror]';
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'room', theme: 'a haunted library' },
    }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('haunted-library');
    expect(result.pendingWrite).toBeDefined();
    expect(result.pendingWrite!.suggestedPath).toContain('haunted-library');
    expect(result.actions[0].status).toBe('executed');
    expect(result.sessionEvents).toBeDefined();
  });

  it('generates a faction', async () => {
    const yaml = 'id: shadowed-guild\ntype: faction\nname: Shadowed Guild';
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'faction', theme: 'thieves' },
    }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('shadowed-guild');
  });

  it('fails on unknown kind', async () => {
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      params: { kind: 'spaceship', theme: 'test' },
    }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('Unknown kind');
    expect(result.summary).toContain('dialogue');
    expect(result.summary).toContain('entity');
    expect(result.summary).toContain('item');
    expect(result.summary).toContain('hazard');
  });

  it('generates a dialogue and maps the artifact bucket', async () => {
    const yaml = [
      'id: pilgrim_talk',
      'speakers:',
      '  - pilgrim',
      'entryNodeId: greeting',
      'nodes:',
      '  greeting:',
      '    id: greeting',
      '    speaker: pilgrim',
      '    text: Hello.',
    ].join('\n');
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'dialogue', theme: 'chapel pilgrim' },
    }));
    expect(result.ok).toBe(true);
    expect(result.pendingWrite).toBeDefined();
    expect(result.sessionEvents?.[0]?.detail).toContain('dialogues/');
  });

  it('generates an item and maps the items bucket', async () => {
    const yaml = 'id: worn_blade\nname: Worn Blade\nslot: weapon\nrarity: common';
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'item', theme: 'rusted sword' },
    }));
    expect(result.ok).toBe(true);
    expect(result.sessionEvents?.[0]?.detail).toContain('items/');
  });

  it('generates a hazard and maps the hazards bucket', async () => {
    const yaml = [
      'id: chapel_fire',
      'trigger: on-enter',
      'effects:',
      '  - kind: damage',
      '    amount: 2',
    ].join('\n');
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'hazard', theme: 'altar flames' },
    }));
    expect(result.ok).toBe(true);
    expect(result.sessionEvents?.[0]?.detail).toContain('hazards/');
  });

  it('passes repair:true so an invalid first draft triggers a second generate', async () => {
    let calls = 0;
    const client: OllamaTextClient = {
      async generate(): Promise<PromptResult> {
        calls++;
        if (calls === 1) return { ok: true, text: 'id: broken_room' };
        return {
          ok: true,
          text: [
            'id: ruined_chapel',
            'name: Ruined Chapel',
            'zones:',
            '  - id: nave',
            '    name: Nave',
          ].join('\n'),
        };
      },
    };
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client,
      params: { kind: 'room', theme: 'chapel' },
    }));
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(result.output).toContain('ruined_chapel');
  });

  it('fails when client errors', async () => {
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: failingClient(),
      params: { kind: 'room', theme: 'test' },
    }));
    expect(result.ok).toBe(false);
    expect(result.actions[0].status).toBe('failed');
  });

  // v2.6 Stage C F-b8d1a6e3 — the chat scaffold path used to throw the
  // command's validation result away entirely: the user was invited to save
  // schema-invalid YAML with zero indication anything was wrong, and the
  // failure re-appeared at strict engine load, far from its cause. The
  // summary must now carry the warnings and point at the one capability
  // built to explain them (explain-validation-error).
  it('surfaces validation warnings in the summary for schema-invalid output', async () => {
    const invalidYaml = 'id: bare-room'; // missing name/zones — fails room schema
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(invalidYaml),
      params: { kind: 'room', theme: 'minimal' },
    }));

    expect(result.ok).toBe(true); // draft still emitted (warn, not refuse)
    expect(result.summary).toMatch(/validation issue/i);
    expect(result.summary).toContain('explain-validation-error');
    // Still offers the save flow — the warning informs, it does not block.
    expect(result.pendingWrite).toBeDefined();
  });

  it('adds no validation warning when the generated content is schema-valid', async () => {
    const validYaml = [
      'id: ruined_chapel',
      'name: Ruined Chapel',
      'zones:',
      '  - id: nave',
      '    name: Nave',
      '  - id: crypt',
      '    name: Crypt',
    ].join('\n');
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(validYaml),
      params: { kind: 'room', theme: 'a ruined chapel' },
    }));

    expect(result.ok).toBe(true);
    expect(result.summary).not.toMatch(/validation issue/i);
    expect(result.summary).not.toContain('explain-validation-error');
  });

  // F-8ec253bf: CHARGEN_STEPS' new head step dispatches kind:'ruleset'
  // through intent:'scaffold' (findToolForIntent -> scaffoldTool) — without
  // this case the step would always fail with "Unknown kind".
  it('generates a ruleset', async () => {
    const yaml = [
      'id: fantasy-minimal',
      'name: Fantasy Minimal',
      'version: 0.1.0',
      'stats:',
      '  - id: vigor',
      '    name: Vigor',
      '    default: 5',
      'resources:',
      '  - id: hp',
      '    name: HP',
      '    default: 20',
      'verbs:',
      '  - id: move',
      '    name: Move',
      'formulas: []',
      'defaultModules: []',
      'progressionModels: []',
    ].join('\n');
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'ruleset', theme: 'gritty fantasy' },
    }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('fantasy-minimal');
  });

  // F-0bf295ac
  it('generates a rule profile and maps the ruleProfiles bucket', async () => {
    const yaml = 'id: veteran_soldier\nstatMapping:\n  attack: strength\n  precision: dexterity\n  resolve: willpower';
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'rule-profile', theme: 'veteran soldier' },
    }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('veteran_soldier');
    expect(result.sessionEvents?.[0]?.detail).toContain('ruleProfiles/');
  });

  it('honors a caller-supplied --id for a rule profile', async () => {
    const yaml = 'statMapping:\n  attack: strength\n  precision: dexterity\n  resolve: willpower';
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: mockClient(yaml),
      params: { kind: 'rule-profile', theme: 'veteran soldier', id: 'veteran_soldier' },
    }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('id: veteran_soldier');
  });

  // F-bd8034ea
  it('generates an item placement', async () => {
    const tool = findToolForIntent('scaffold')!;
    const result = await tool.execute(makeParams({
      client: failingClient(),
      params: { kind: 'item-placement', theme: 'chapel key', item: 'rusty_key', entityId: 'chapel_guard' },
    }));
    expect(result.ok).toBe(true);
    expect(result.output).toBe('itemId: rusty_key\nentityId: chapel_guard\n');
  });
});

// F-35cc73ce: the guided /build path never called assembleContentPack/
// emit-pack — the default ReplayProducer loads only from content/pack.json,
// so a host who only ran /build ticked an empty world. emitPackTool is the
// new tail step's tool (intent 'emit_pack').
describe('emit-pack tool', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'chat-emit-pack-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('is registered under the emit_pack intent', () => {
    const tool = findToolForIntent('emit_pack');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('emit-pack');
  });

  it('assembles the project pack and stages it as a pendingWrite to content/pack.json', async () => {
    await writeFile(join(root, 'guard.yaml'), 'id: chapel_guard\ntype: npc\nname: Chapel Guard\n');
    const tool = findToolForIntent('emit_pack')!;
    const result = await tool.execute(makeParams({ projectRoot: root }));
    expect(result.ok).toBe(true);
    expect(result.pendingWrite).toBeDefined();
    expect(result.pendingWrite!.suggestedPath).toBe('content/pack.json');
    const written = JSON.parse(result.pendingWrite!.content);
    expect(written.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'chapel_guard' })]),
    );
    expect(result.sessionEvents?.[0]?.kind).toBe('pack_emitted');
    // Nothing is written until the pendingWrite is confirmed.
    await expect(readFile(join(root, 'content', 'pack.json'), 'utf-8')).rejects.toThrow();
  });

  it('refuses to stage a pendingWrite when the assembled pack fails loadContent, surfacing the errors', async () => {
    // A placement with no matching entity/zone anywhere in the pack is a
    // dangling-reference ERROR (validateRefs, refs.ts) — a deterministic,
    // guaranteed loadContent failure independent of the yaml-ish parser.
    await writeFile(join(root, 'ghost.yaml'), 'entityId: ghost\nzoneId: nowhere\n');
    const tool = findToolForIntent('emit_pack')!;
    const result = await tool.execute(makeParams({ projectRoot: root }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('ghost');
    expect(result.pendingWrite).toBeUndefined();
  });
});

describe('critique tool', () => {
  it('requires content', async () => {
    const tool = findToolForIntent('critique')!;
    const result = await tool.execute(makeParams());
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('need content');
  });

  it('returns critique when content provided', async () => {
    const critiqueResponse = `Review of the room:

## Issues
- severity: warning
  code: STRUCT_001
  summary: Missing required tags field

## Suggestions
- Replace generic description with something atmospheric

## Summary
Room needs tags field and better description.`;

    const tool = findToolForIntent('critique')!;
    const result = await tool.execute(makeParams({
      client: mockClient(critiqueResponse),
      params: { content: 'id: test\nname: Test Room' },
    }));
    expect(result.ok).toBe(true);
    expect(result.actions[0].status).toBe('executed');
  });
});

describe('improve tool', () => {
  it('requires content', async () => {
    const tool = findToolForIntent('improve')!;
    const result = await tool.execute(makeParams({
      params: { goal: 'make it scarier' },
    }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('need content');
  });

  it('returns improved content with pending write', async () => {
    const improved = 'id: test\nname: Test Room\ntags: [horror, dark]';
    const tool = findToolForIntent('improve')!;
    const result = await tool.execute(makeParams({
      client: mockClient(improved),
      params: { content: 'id: test\nname: Test Room', goal: 'make it scarier' },
    }));
    expect(result.ok).toBe(true);
    expect(result.pendingWrite).toBeDefined();
    expect(result.output).toContain('test');
  });
});

describe('apply-content tool', () => {
  it('requires both content and path', async () => {
    const tool = findToolForIntent('apply_content')!;
    const r1 = await tool.execute(makeParams({ params: {} }));
    expect(r1.ok).toBe(false);
    expect(r1.summary).toContain('No content');

    const r2 = await tool.execute(makeParams({ params: { content: 'hi' } }));
    expect(r2.ok).toBe(false);
    expect(r2.summary).toContain('file path');
  });

  it('returns preview and pending write', async () => {
    const tool = findToolForIntent('apply_content')!;
    const result = await tool.execute(makeParams({
      params: { content: 'id: chapel\nname: Chapel', targetPath: 'chapel.yaml' },
    }));
    expect(result.ok).toBe(true);
    expect(result.pendingWrite).toBeDefined();
    expect(result.pendingWrite!.suggestedPath).toBe('chapel.yaml');
    expect(result.actions[0].requiresConfirmation).toBe(true);
  });
});

describe('explain-state tool', () => {
  it('fails without session', async () => {
    const tool = findToolForIntent('explain_state')!;
    const result = await tool.execute(makeParams({ session: null }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('No active session');
  });

  it('returns state analysis when session exists', async () => {
    const tool = findToolForIntent('explain_state')!;
    const result = await tool.execute(makeParams({
      client: mockClient('The session has cyberpunk and noir themes. No artifacts yet.'),
    }));
    expect(result.ok).toBe(true);
    expect(result.actions[0].status).toBe('executed');
  });
});

describe('plan tool', () => {
  it('returns plan with steps', async () => {
    const planResponse = `Here's a plan for your smuggling district.

## Steps
- order: 1
  command: create-district --theme "smuggling docks"
  description: Create the district shell
  dependsOn: []
- order: 2
  command: create-room --theme "warehouse"
  description: Create a warehouse room
  dependsOn: [1]

## Rationale
Start with the district, then fill in locations.`;

    const tool = findToolForIntent('plan')!;
    const result = await tool.execute(makeParams({
      client: mockClient(planResponse),
      params: { theme: 'smuggling docks' },
    }));
    expect(result.ok).toBe(true);
    expect(result.actions[0].status).toBe('executed');
    expect(result.sessionEvents).toBeDefined();
  });

  it('requires a theme', async () => {
    const tool = findToolForIntent('plan')!;
    const result = await tool.execute(makeParams({
      params: { theme: '' },
      userMessage: '',
    }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('theme');
  });
});

describe('explain-why tool', () => {
  it('requires state data', async () => {
    const tool = findToolForIntent('explain_why')!;
    const result = await tool.execute(makeParams({
      params: { question: 'why did guards not escalate' },
    }));
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('simulation state');
  });

  it('returns explanation with state', async () => {
    const tool = findToolForIntent('explain_why')!;
    const result = await tool.execute(makeParams({
      client: mockClient('Guards did not escalate because the alert threshold was not reached.'),
      params: { question: 'why no escalation', state: '{"alertLevel": 2, "threshold": 5}' },
    }));
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Guards');
  });
});

describe('experiment-run tool (F-fc88ce5e)', () => {
  it('executes runExperiment with the injected producer and returns a summary', async () => {
    const tool = findToolForIntent('experiment_run')!;
    const producer = (seed: number) => JSON.stringify([{ tick: 0, alertPressure: seed * 0.01 }]);
    const result = await tool.execute(makeParams({
      params: { runs: '3', label: 'batch' },
      replayProducer: producer,
    }));
    expect(result.ok).toBe(true);
    expect(result.summary).not.toContain('Use the experiment runner API');
    expect(result.output).toBeDefined();
    const parsed = JSON.parse(result.output!) as { spec?: { runs: number }; completedRuns?: number };
    expect(parsed.spec?.runs).toBe(3);
    expect(parsed.completedRuns).toBe(3);
  });
});
