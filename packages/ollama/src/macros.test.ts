// Unit tests — macro framework and workflow macros
// No live Ollama needed. Client is mocked.

import { describe, it, expect } from 'vitest';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import {
  createMacroProgress,
  startMacro,
  advanceStep,
  failStep,
  buildMacroResult,
  scaffoldAndCritique,
  compareAndFix,
  planAndGenerate,
} from './macros.js';
import type { MacroProgress } from './macros.js';

// --- Mock helpers ---

function mockClient(response: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: true, text: response };
    },
  };
}

function failingClient(error: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: false, error };
    },
  };
}

/** Returns a client that gives different responses per call. */
function sequenceClient(...responses: string[]): OllamaTextClient {
  let callIndex = 0;
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      const text = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return { ok: true, text };
    },
  };
}

// --- Framework tests ---

describe('macro framework', () => {
  describe('createMacroProgress', () => {
    it('creates progress with all steps pending', () => {
      const p = createMacroProgress('test-macro', ['Step A', 'Step B', 'Step C']);
      expect(p.name).toBe('test-macro');
      expect(p.totalSteps).toBe(3);
      expect(p.currentStep).toBe(0);
      expect(p.steps).toHaveLength(3);
      expect(p.steps.every(s => s.status === 'pending')).toBe(true);
    });
  });

  describe('startMacro', () => {
    it('marks first step as running', () => {
      const p = createMacroProgress('test', ['A', 'B']);
      startMacro(p);
      expect(p.steps[0].status).toBe('running');
      expect(p.steps[1].status).toBe('pending');
    });

    it('calls progress callback', () => {
      const p = createMacroProgress('test', ['A']);
      let called = false;
      startMacro(p, () => { called = true; });
      expect(called).toBe(true);
    });
  });

  describe('advanceStep', () => {
    it('marks current step done and next step running', () => {
      const p = createMacroProgress('test', ['A', 'B', 'C']);
      startMacro(p);
      advanceStep(p, 'output-A');
      expect(p.steps[0].status).toBe('done');
      expect(p.steps[0].output).toBe('output-A');
      expect(p.steps[1].status).toBe('running');
      expect(p.currentStep).toBe(1);
    });

    it('handles advancing past last step', () => {
      const p = createMacroProgress('test', ['A']);
      startMacro(p);
      advanceStep(p, 'done');
      expect(p.steps[0].status).toBe('done');
      expect(p.currentStep).toBe(1);
    });
  });

  describe('failStep', () => {
    it('marks current step as failed with error', () => {
      const p = createMacroProgress('test', ['A', 'B']);
      startMacro(p);
      failStep(p, 'something broke');
      expect(p.steps[0].status).toBe('failed');
      expect(p.steps[0].error).toBe('something broke');
    });
  });

  describe('buildMacroResult', () => {
    it('returns ok when all steps done', () => {
      const p = createMacroProgress('test', ['A', 'B']);
      startMacro(p);
      advanceStep(p, 'a');
      advanceStep(p, 'b');
      const result = buildMacroResult(p);
      expect(result.ok).toBe(true);
      expect(result.name).toBe('test');
      expect(result.summary).toContain('2/2 steps completed');
    });

    it('returns not-ok when a step failed', () => {
      const p = createMacroProgress('test', ['A', 'B']);
      startMacro(p);
      failStep(p, 'oops');
      const result = buildMacroResult(p);
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('1 step(s) failed');
    });

    it('returns not-ok when no steps completed', () => {
      const p = createMacroProgress('test', ['A']);
      startMacro(p);
      const result = buildMacroResult(p);
      expect(result.ok).toBe(false);
    });
  });
});

// --- Macro: scaffold-and-critique ---

describe('scaffoldAndCritique', () => {
  const roomYaml = 'id: chapel\nname: Ruined Chapel\nzones:\n  - id: nave\n    name: Nave';
  const critiqueYaml = [
    'Good room overall.',
    '',
    '```yaml',
    'issues:',
    '  - code: NO_HAZARDS',
    '    severity: medium',
    '    location: zones.nave',
    '    summary: No hazards in zone.',
    '    simulation_impact: Alert stays flat.',
    'suggestions:',
    '  - code: ADD_TRAP',
    '    priority: medium',
    '    action: Add a trap.',
    'summary: Needs more depth.',
    '```',
  ].join('\n');
  const suggestYaml = [
    'Next steps.',
    '',
    '```yaml',
    'actions:',
    '  - code: RUN_SIM',
    '    priority: high',
    '    command: "analyze-replay < chapel.json"',
    '    reason: "Test the room in simulation."',
    'summary: Simulate next.',
    '```',
  ].join('\n');

  it('completes 3-step pipeline with session context', async () => {
    const client = sequenceClient(roomYaml, critiqueYaml, suggestYaml);
    const steps: string[] = [];
    const result = await scaffoldAndCritique(client, {
      kind: 'room',
      theme: 'ruined chapel',
      sessionContext: 'Themes: gothic',
    }, (p) => { steps.push(`${p.currentStep}:${p.steps[p.currentStep]?.status}`); });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('scaffold-and-critique');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].status).toBe('done');
    expect(result.steps[0].output).toContain('chapel');
    expect(result.steps[1].status).toBe('done');
    expect(result.steps[2].status).toBe('done');
    expect(steps.length).toBeGreaterThan(0);
  });

  it('skips suggest-next step without session context', async () => {
    const client = sequenceClient(roomYaml, critiqueYaml);
    const result = await scaffoldAndCritique(client, {
      kind: 'room',
      theme: 'ruined chapel',
    });

    expect(result.ok).toBe(true);
    expect(result.steps[2].status).toBe('skipped');
    expect(result.steps[2].output).toContain('skipped');
  });

  it('fails early if scaffold fails', async () => {
    const client = failingClient('model not found');
    const result = await scaffoldAndCritique(client, {
      kind: 'room',
      theme: 'test',
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toContain('model not found');
  });

  it('fails if critique step fails', async () => {
    let callCount = 0;
    const client: OllamaTextClient = {
      async generate(_input: PromptInput): Promise<PromptResult> {
        callCount++;
        if (callCount === 1) return { ok: true, text: roomYaml };
        return { ok: false, error: 'critique failed' };
      },
    };
    const result = await scaffoldAndCritique(client, {
      kind: 'room',
      theme: 'test',
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0].status).toBe('done');
    expect(result.steps[1].status).toBe('failed');
  });

  it('dispatches all scaffold kinds', async () => {
    const kinds = ['room', 'faction', 'district', 'location-pack', 'encounter-pack'] as const;
    for (const kind of kinds) {
      const client = sequenceClient('id: test\nname: Test', critiqueYaml);
      const result = await scaffoldAndCritique(client, { kind, theme: 'test' });
      expect(result.steps[0].status).toBe('done');
    }
  });
});

// --- Macro: compare-and-fix ---

describe('compareAndFix', () => {
  const compareYaml = [
    'After revision, dynamics improved.',
    '',
    '```yaml',
    'improvements:',
    '  - area: market',
    '    description: "Trade routes now function."',
    'regressions:',
    '  - area: chapel',
    '    description: "Stability dropped."',
    'unchanged:',
    '  - area: crypt',
    '    description: "No change."',
    'verdict: improved',
    'summary: "Net improvement."',
    '```',
  ].join('\n');
  const suggestYaml = [
    'Fix suggestions.',
    '',
    '```yaml',
    'actions:',
    '  - code: FIX_CHAPEL',
    '    priority: high',
    '    command: "improve-content < chapel.yaml --goal stability"',
    '    reason: "Chapel stability regression."',
    'summary: Fix chapel.',
    '```',
  ].join('\n');

  it('completes 2-step compare-then-fix pipeline', async () => {
    const client = sequenceClient(compareYaml, suggestYaml);
    const result = await compareAndFix(client, {
      before: '{"ticks": 50}',
      after: '{"ticks": 50}',
    });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('compare-and-fix');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('done');
    expect(result.steps[0].output).toContain('improved');
    expect(result.steps[1].status).toBe('done');
    expect(result.steps[1].output).toContain('FIX_CHAPEL');
  });

  it('fails early if compare step fails', async () => {
    const client = failingClient('compare failed');
    const result = await compareAndFix(client, {
      before: '{}',
      after: '{}',
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0].status).toBe('failed');
  });

  it('fails if suggest step fails', async () => {
    let callCount = 0;
    const client: OllamaTextClient = {
      async generate(_input: PromptInput): Promise<PromptResult> {
        callCount++;
        if (callCount === 1) return { ok: true, text: compareYaml };
        return { ok: false, error: 'suggest failed' };
      },
    };
    const result = await compareAndFix(client, {
      before: '{}',
      after: '{}',
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0].status).toBe('done');
    expect(result.steps[1].status).toBe('failed');
  });
});

// --- Macro: plan-and-generate ---

describe('planAndGenerate', () => {
  const planYaml = [
    'Build a thieves quarter.',
    '',
    '```yaml',
    'steps:',
    '  - order: 1',
    '    command: "create-district --theme thieves_quarter"',
    '    produces: "district YAML"',
    '    description: "Foundation district"',
    '  - order: 2',
    '    command: "create-room --theme hidden_passage"',
    '    produces: "room definition"',
    '    description: "Secret route"',
    '    dependsOn: [1]',
    '  - order: 3',
    '    command: "critique-content < thieves_quarter.yaml"',
    '    produces: "critique report"',
    '    description: "Quality check"',
    '    dependsOn: [1]',
    'rationale: "Start with structure, then fill."',
    '```',
  ].join('\n');
  const districtYaml = 'id: thieves_quarter\nname: Thieves Quarter\nzoneIds:\n  - alley\ntags:\n  - crime';
  const critiqueYaml = 'Good district. No issues.';

  it('plans and auto-executes first scaffold step', async () => {
    const client = sequenceClient(planYaml, districtYaml, critiqueYaml);
    const result = await planAndGenerate(client, {
      theme: 'thieves quarter',
      autoExecute: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('plan-and-generate');
    // 3 steps: plan + execute step 1 + critique
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].status).toBe('done'); // plan
    expect(result.steps[0].output).toContain('create-district');
    expect(result.steps[1].status).toBe('done'); // execute
    expect(result.steps[1].output).toContain('thieves_quarter');
    expect(result.steps[2].status).toBe('done'); // critique
  });

  it('skips non-scaffold commands during auto-execute', async () => {
    // Plan with a pipe command (critique-content) as step 1
    const pipeFirstPlan = [
      'Plan.',
      '',
      '```yaml',
      'steps:',
      '  - order: 1',
      '    command: "critique-content < existing.yaml"',
      '    produces: "critique report"',
      '    description: "Review first"',
      'rationale: "Review before building."',
      '```',
    ].join('\n');
    const client = sequenceClient(pipeFirstPlan);
    const result = await planAndGenerate(client, {
      theme: 'review-first',
      autoExecute: 1,
    });

    expect(result.ok).toBe(true);
    // Step 1 = plan, Step 2 = skipped (pipe command), Step 3 = critique skipped (no artifact)
    expect(result.steps[1].status).toBe('skipped');
    expect(result.steps[1].output).toContain('Cannot auto-execute');
  });

  it('respects autoExecute limit', async () => {
    const client = sequenceClient(planYaml, districtYaml, 'id: room\nname: Room', critiqueYaml);
    const result = await planAndGenerate(client, {
      theme: 'thieves quarter',
      autoExecute: 2,
    });

    // 4 steps: plan + 2 execute + critique
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0].status).toBe('done'); // plan
    expect(result.steps[1].status).toBe('done'); // execute step 1 (district)
    expect(result.steps[2].status).toBe('done'); // execute step 2 (room)
  });

  it('caps auto-execute at 3', async () => {
    const longPlan = [
      'Plan.',
      '',
      '```yaml',
      'steps:',
      '  - order: 1',
      '    command: "create-district --theme a"',
      '    produces: x',
      '    description: a',
      '  - order: 2',
      '    command: "create-room --theme b"',
      '    produces: x',
      '    description: b',
      '  - order: 3',
      '    command: "create-room --theme c"',
      '    produces: x',
      '    description: c',
      '  - order: 4',
      '    command: "create-room --theme d"',
      '    produces: x',
      '    description: d',
      'rationale: ok',
      '```',
    ].join('\n');
    const client = sequenceClient(longPlan, 'id: a\nname: A', 'id: b\nname: B', 'id: c\nname: C', 'Critique ok');
    const result = await planAndGenerate(client, {
      theme: 'big-plan',
      autoExecute: 10, // should be capped to 3
    });

    // 5 steps: plan + 3 execute + critique
    expect(result.steps).toHaveLength(5);
  });

  it('fails early if plan step fails', async () => {
    const client = failingClient('plan failed');
    const result = await planAndGenerate(client, { theme: 'test' });

    expect(result.ok).toBe(false);
    expect(result.steps[0].status).toBe('failed');
  });

  it('skips critique when no artifact was generated', async () => {
    const emptyPlan = [
      'No steps needed.',
      '',
      '```yaml',
      'steps: []',
      'rationale: "Nothing to do."',
      '```',
    ].join('\n');
    const client = sequenceClient(emptyPlan);
    const result = await planAndGenerate(client, {
      theme: 'minimal',
      autoExecute: 0,
    });

    expect(result.ok).toBe(true);
    // 2 steps: plan + critique (skipped)
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].status).toBe('skipped');
    expect(result.steps[1].output).toContain('No artifact');
  });
});
