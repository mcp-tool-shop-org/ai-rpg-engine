// Tests — chat tool registry: tool lookup and execution with mock client

import { describe, it, expect } from 'vitest';
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
  it('returns all 25 registered tools', () => {
    const tools = getAllTools();
    expect(tools.length).toBe(25);
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

  it('only apply-content and tune-apply declare mutates=true', () => {
    const mutating = getAllTools().filter(t => t.mutates);
    expect(mutating.length).toBe(2);
    const names = mutating.map(t => t.name).sort();
    expect(names).toEqual(['apply-content', 'tune-apply']);
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
