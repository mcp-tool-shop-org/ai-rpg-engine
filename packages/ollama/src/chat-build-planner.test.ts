// Tests — chat build planner: session-aware plan-first build workflows

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateBuildPlan,
  createBuildState,
  nextPendingStep,
  markStepExecuted,
  markStepFailed,
  isBuildComplete,
  finalizeBuild,
  formatBuildPlan,
  formatBuildPreview,
  formatBuildStatus,
  buildDiagnostics,
  formatBuildDiagnostics,
  detectTemplate,
} from './chat-build-planner.js';
import type { BuildPlan, BuildState } from './chat-build-planner.js';
import type { DesignSession } from './session.js';

// --- Helpers ---

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'build-test',
    model: 'test',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    themes: ['dark fantasy'],
    constraints: [],
    artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    issues: [],
    acceptedSuggestions: [],
    history: [],
    ...overrides,
  } as DesignSession;
}

function makePlan(goal = 'test goal'): BuildPlan {
  return generateBuildPlan(goal, makeSession());
}

// ========================================
// Template detection
// ========================================

describe('detectTemplate', () => {
  it('detects district keywords', () => {
    expect(detectTemplate('market district').name).toBe('district');
    expect(detectTemplate('underground zone').name).toBe('district');
    expect(detectTemplate('merchant quarter').name).toBe('district');
    expect(detectTemplate('harbor area').name).toBe('district');
  });

  it('detects scenario keywords', () => {
    expect(detectTemplate('haunted chapel scenario').name).toBe('scenario');
    expect(detectTemplate('heist adventure').name).toBe('scenario');
    expect(detectTemplate('rescue mission').name).toBe('scenario');
    expect(detectTemplate('dungeon crawl').name).toBe('scenario');
  });

  it('detects faction keywords', () => {
    expect(detectTemplate('thieves guild').name).toBe('faction network');
    expect(detectTemplate('spy network').name).toBe('faction network');
    expect(detectTemplate('merchants syndicate').name).toBe('faction network');
  });

  it('defaults to district for unknown goals', () => {
    expect(detectTemplate('something completely different').name).toBe('district');
  });
});

// ========================================
// Plan generation
// ========================================

describe('generateBuildPlan — basic', () => {
  it('generates a district plan with correct steps', () => {
    const plan = generateBuildPlan('rumor-driven market district', makeSession());
    expect(plan.goal).toBe('rumor-driven market district');
    expect(plan.steps.length).toBeGreaterThanOrEqual(5);
    expect(plan.estimatedSteps).toBe(plan.steps.length);

    // Should include district, factions, packs, critique, suggest
    const commands = plan.steps.map(s => s.command);
    expect(commands).toContain('create-district');
    expect(commands).toContain('create-faction');
    expect(commands).toContain('create-location-pack');
    expect(commands).toContain('create-encounter-pack');
    expect(commands).toContain('critique-content');
    expect(commands).toContain('suggest-next');
  });

  it('generates a scenario plan with quest', () => {
    const plan = generateBuildPlan('cyberpunk heist scenario', makeSession());
    const commands = plan.steps.map(s => s.command);
    expect(commands).toContain('create-quest');
    expect(commands).toContain('create-district');
    expect(commands).toContain('create-encounter-pack');
    expect(commands).toContain('create-room');
  });

  it('generates a faction plan with three factions', () => {
    const plan = generateBuildPlan('thieves guild network', makeSession());
    const factionSteps = plan.steps.filter(s => s.command === 'create-faction');
    expect(factionSteps).toHaveLength(3);
    // primary, opposing, neutral
    expect(factionSteps.some(s => s.description.includes('primary'))).toBe(true);
    expect(factionSteps.some(s => s.description.includes('opposing'))).toBe(true);
    expect(factionSteps.some(s => s.description.includes('neutral'))).toBe(true);
  });

  it('includes goal in step params', () => {
    const plan = generateBuildPlan('dark market district', makeSession());
    const districtStep = plan.steps.find(s => s.command === 'create-district');
    expect(districtStep?.params.theme).toContain('dark market district');
  });

  it('assigns sequential IDs', () => {
    const plan = makePlan();
    for (let i = 0; i < plan.steps.length; i++) {
      expect(plan.steps[i].id).toBe(i + 1);
    }
  });

  it('sets dependencies between steps', () => {
    const plan = generateBuildPlan('dark market district', makeSession());
    // First step has no deps
    expect(plan.steps[0].dependencies).toEqual([]);
    // Critique depends on previous step
    const critiqueStep = plan.steps.find(s => s.command === 'critique-content');
    expect(critiqueStep!.dependencies.length).toBeGreaterThan(0);
  });

  it('marks critique steps with usePriorContent', () => {
    const plan = generateBuildPlan('dark market district', makeSession());
    const critiqueStep = plan.steps.find(s => s.command === 'critique-content');
    expect(critiqueStep?.usePriorContent).toBe(true);
    // Scaffold steps should not use prior content
    const scaffoldStep = plan.steps.find(s => s.command === 'create-district');
    expect(scaffoldStep?.usePriorContent).toBe(false);
  });

  it('all steps have valid intents', () => {
    const plan = makePlan();
    for (const step of plan.steps) {
      expect(['scaffold', 'critique', 'suggest_next', 'improve']).toContain(step.intent);
    }
  });
});

// ========================================
// No session warnings
// ========================================

describe('generateBuildPlan — no session', () => {
  it('warns when no session active', () => {
    const plan = generateBuildPlan('test district', null);
    expect(plan.warnings.some(w => w.includes('No active session'))).toBe(true);
  });

  it('still generates steps without a session', () => {
    const plan = generateBuildPlan('test district', null);
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});

describe('generateBuildPlan — session warnings', () => {
  it('warns when session has no themes', () => {
    const session = makeSession({ themes: [] });
    const plan = generateBuildPlan('test district', session);
    expect(plan.warnings.some(w => w.includes('no themes'))).toBe(true);
  });
});

// ========================================
// Smart skip — existing artifacts
// ========================================

describe('generateBuildPlan — artifact skipping', () => {
  it('skips district if session already has a matching one', () => {
    const session = makeSession({
      artifacts: { districts: ['market_district'], factions: [], quests: [], rooms: [], packs: [] },
    });
    const plan = generateBuildPlan('market district zone', session);
    const districtStep = plan.steps.find(s => s.command === 'create-district');
    expect(districtStep).toBeUndefined();
    expect(plan.warnings.some(w => w.includes('Skipped') && w.includes('districts'))).toBe(true);
  });

  it('skips factions if session already has matching ones', () => {
    const session = makeSession({
      artifacts: { districts: [], factions: ['market_guild'], quests: [], rooms: [], packs: [] },
    });
    const plan = generateBuildPlan('market district', session);
    const factionSteps = plan.steps.filter(s => s.command === 'create-faction');
    // Should have fewer faction steps due to skip
    expect(factionSteps.length).toBeLessThan(2);
  });

  it('does not skip when artifacts are unrelated', () => {
    const session = makeSession({
      artifacts: { districts: ['neon_alley'], factions: [], quests: [], rooms: [], packs: [] },
    });
    const plan = generateBuildPlan('haunted chapel scenario', session);
    const districtStep = plan.steps.find(s => s.command === 'create-district');
    expect(districtStep).toBeDefined();
  });
});

// ========================================
// Issue-aware step injection
// ========================================

describe('generateBuildPlan — issue-aware injection', () => {
  it('warns about RUMOR_ issues addressed by existing plan steps', () => {
    const session = makeSession({
      issues: [
        { code: 'RUMOR_DEAD_DROP', target: 'bar', severity: 'high', status: 'open', summary: 'Rumor dead drop broken' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    // Template already has create-faction, so no extra step is injected — just a warning
    expect(plan.warnings.some(w => w.includes('RUMOR_') && w.includes('existing plan steps'))).toBe(true);
  });

  it('injects encounter step for FACTION_ issues', () => {
    const session = makeSession({
      issues: [
        { code: 'FACTION_NO_RIVAL', target: 'guild', severity: 'medium', status: 'open', summary: 'No rival faction' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    const injected = plan.steps.filter(s => s.description.includes('faction interaction'));
    expect(injected.length).toBeGreaterThan(0);
  });

  it('warns about GAP_ issues addressed by existing plan steps', () => {
    const session = makeSession({
      issues: [
        { code: 'GAP_LOCATIONS', target: 'district', severity: 'low', status: 'open', summary: 'Not enough locations' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    // Template already has create-location-pack, so no extra step — just a warning
    expect(plan.warnings.some(w => w.includes('GAP_') && w.includes('existing plan steps'))).toBe(true);
  });

  it('warns about replay regression issues', () => {
    const session = makeSession({
      issues: [
        { code: 'REPLAY_STALE', target: 'sim', severity: 'medium', status: 'open', summary: 'Stale replay' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    expect(plan.warnings.some(w => w.includes('replay/regression'))).toBe(true);
  });

  it('does not inject for resolved issues', () => {
    const session = makeSession({
      issues: [
        { code: 'RUMOR_DEAD_DROP', target: 'bar', severity: 'high', status: 'resolved', summary: 'Fixed' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    const injected = plan.steps.filter(s => s.description.includes('issue-driven'));
    expect(injected).toHaveLength(0);
  });
});

// ========================================
// Replay-aware step injection
// ========================================

describe('generateBuildPlan — replay-aware injection', () => {
  it('injects encounter-pack for never_triggered replay findings', () => {
    const session = makeSession({
      history: [
        { timestamp: '2025-01-01', kind: 'replay_compared', detail: 'Replay: never_triggered event on chapel' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    const replayStep = plan.steps.find(s => s.description.includes('replay-driven'));
    expect(replayStep).toBeDefined();
    expect(replayStep?.command).toBe('create-encounter-pack');
  });

  it('injects encounter-pack for regression replay findings', () => {
    const session = makeSession({
      history: [
        { timestamp: '2025-01-01', kind: 'replay_compared', detail: 'regression detected in guard behavior' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    const replayStep = plan.steps.find(s => s.description.includes('replay-driven'));
    expect(replayStep).toBeDefined();
  });

  it('does not inject for clean replays', () => {
    const session = makeSession({
      history: [
        { timestamp: '2025-01-01', kind: 'replay_compared', detail: 'All scenarios passed' },
      ],
    });
    const plan = generateBuildPlan('test district', session);
    const replayStep = plan.steps.find(s => s.description.includes('replay-driven'));
    expect(replayStep).toBeUndefined();
  });

  it('does not inject without replay history', () => {
    const session = makeSession({ history: [] });
    const plan = generateBuildPlan('test district', session);
    const replayStep = plan.steps.find(s => s.description.includes('replay-driven'));
    expect(replayStep).toBeUndefined();
  });
});

// ========================================
// Build state management
// ========================================

describe('createBuildState', () => {
  it('initializes with planned status', () => {
    const state = createBuildState(makePlan());
    expect(state.status).toBe('planned');
    expect(state.startedAt).toBeTruthy();
    expect(state.completedAt).toBeUndefined();
    expect(state.generatedContent).toEqual([]);
  });
});

describe('nextPendingStep', () => {
  it('returns the first pending step', () => {
    const state = createBuildState(makePlan());
    const step = nextPendingStep(state);
    expect(step?.id).toBe(1);
    expect(step?.status).toBe('pending');
  });

  it('respects dependencies', () => {
    const plan = makePlan();
    const state = createBuildState(plan);
    // Find a step with dependencies
    const depStep = plan.steps.find(s => s.dependencies.length > 0);
    if (depStep) {
      // Without completing the dependency, nextPendingStep should not return it
      // (it should return an earlier step first)
      const next = nextPendingStep(state);
      expect(next!.id).toBeLessThanOrEqual(depStep.id);
    }
  });

  it('returns null when all steps are done', () => {
    const plan = generateBuildPlan('test district', makeSession());
    const state = createBuildState(plan);
    for (const step of state.plan.steps) {
      step.status = 'executed';
    }
    expect(nextPendingStep(state)).toBeNull();
  });

  it('skips executed steps', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'executed';
    const next = nextPendingStep(state);
    expect(next?.id).not.toBe(1);
  });

  it('skips failed steps', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'failed';
    const next = nextPendingStep(state);
    expect(next?.id).not.toBe(1);
  });
});

describe('markStepExecuted', () => {
  it('marks step as executed with summary', () => {
    const state = createBuildState(makePlan());
    markStepExecuted(state, 1, 'Created district successfully');
    const step = state.plan.steps.find(s => s.id === 1);
    expect(step?.status).toBe('executed');
    expect(step?.result).toBe('Created district successfully');
  });

  it('accumulates generated content', () => {
    const state = createBuildState(makePlan());
    markStepExecuted(state, 1, 'Done', 'id: test_district\nname: Test');
    expect(state.generatedContent).toHaveLength(1);
    expect(state.generatedContent[0]).toContain('test_district');
  });

  it('sets status to executing', () => {
    const state = createBuildState(makePlan());
    expect(state.status).toBe('planned');
    markStepExecuted(state, 1, 'Done');
    expect(state.status).toBe('executing');
  });

  it('does nothing for nonexistent step ID', () => {
    const state = createBuildState(makePlan());
    markStepExecuted(state, 999, 'Done');
    expect(state.plan.steps.every(s => s.status === 'pending')).toBe(true);
  });
});

describe('markStepFailed', () => {
  it('marks step as failed with error message', () => {
    const state = createBuildState(makePlan());
    markStepFailed(state, 1, 'LLM timeout');
    const step = state.plan.steps.find(s => s.id === 1);
    expect(step?.status).toBe('failed');
    expect(step?.error).toBe('LLM timeout');
  });

  it('skips dependent steps when a step fails', () => {
    const plan = generateBuildPlan('dark market district', makeSession());
    const state = createBuildState(plan);
    // Find a step that others depend on
    const step1 = state.plan.steps[0];
    markStepFailed(state, step1.id, 'Failed');

    // Steps that depend on step1 should be skipped
    const dependentSteps = state.plan.steps.filter(s =>
      s.dependencies.includes(step1.id) && s.id !== step1.id
    );
    for (const dep of dependentSteps) {
      expect(dep.status).toBe('skipped');
      expect(dep.error).toContain('dependency');
    }
  });
});

describe('isBuildComplete', () => {
  it('returns false when steps are pending', () => {
    const state = createBuildState(makePlan());
    expect(isBuildComplete(state)).toBe(false);
  });

  it('returns true when all steps are done', () => {
    const state = createBuildState(makePlan());
    for (const step of state.plan.steps) {
      step.status = 'executed';
    }
    expect(isBuildComplete(state)).toBe(true);
  });

  it('returns true when all steps are failed/skipped', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'failed';
    for (const step of state.plan.steps.slice(1)) {
      step.status = 'skipped';
    }
    expect(isBuildComplete(state)).toBe(true);
  });
});

describe('finalizeBuild', () => {
  it('sets completedAt timestamp', () => {
    const state = createBuildState(makePlan());
    for (const step of state.plan.steps) step.status = 'executed';
    finalizeBuild(state);
    expect(state.completedAt).toBeTruthy();
  });

  it('sets status to completed when all succeed', () => {
    const state = createBuildState(makePlan());
    for (const step of state.plan.steps) step.status = 'executed';
    finalizeBuild(state);
    expect(state.status).toBe('completed');
  });

  it('sets status to failed when any step failed', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'failed';
    for (const step of state.plan.steps.slice(1)) step.status = 'executed';
    finalizeBuild(state);
    expect(state.status).toBe('failed');
  });
});

// ========================================
// Formatting
// ========================================

describe('formatBuildPlan', () => {
  it('includes the goal', () => {
    const plan = generateBuildPlan('haunted market district', makeSession());
    const output = formatBuildPlan(plan);
    expect(output).toContain('haunted market district');
  });

  it('lists all steps numbered', () => {
    const plan = generateBuildPlan('haunted market district', makeSession());
    const output = formatBuildPlan(plan);
    for (const step of plan.steps) {
      expect(output).toContain(`${step.id}.`);
    }
  });

  it('includes estimated steps count', () => {
    const plan = makePlan();
    const output = formatBuildPlan(plan);
    expect(output).toContain(`Estimated steps: ${plan.steps.length}`);
  });

  it('shows warnings with ⚠ prefix', () => {
    const plan = generateBuildPlan('test', null);
    const output = formatBuildPlan(plan);
    expect(output).toContain('⚠');
  });

  it('shows available commands', () => {
    const output = formatBuildPlan(makePlan());
    expect(output).toContain('/preview');
    expect(output).toContain('/step');
    expect(output).toContain('/execute');
    expect(output).toContain('/status');
  });
});

describe('formatBuildPreview', () => {
  it('includes step commands', () => {
    const plan = generateBuildPlan('market district', makeSession());
    const output = formatBuildPreview(plan);
    expect(output).toContain('create-district');
    expect(output).toContain('create-faction');
  });

  it('shows theme and kind for scaffold steps', () => {
    const plan = generateBuildPlan('market district', makeSession());
    const output = formatBuildPreview(plan);
    expect(output).toContain('Theme:');
    expect(output).toContain('Kind:');
  });

  it('shows artifact outputs', () => {
    const plan = generateBuildPlan('market district', makeSession());
    const output = formatBuildPreview(plan);
    expect(output).toContain('Produces:');
  });

  it('includes total steps count', () => {
    const plan = makePlan();
    const output = formatBuildPreview(plan);
    expect(output).toContain(`Total steps: ${plan.steps.length}`);
  });

  it('shows warnings in preview', () => {
    const plan = generateBuildPlan('test', null);
    const output = formatBuildPreview(plan);
    expect(output).toContain('Warnings:');
    expect(output).toContain('⚠');
  });
});

describe('formatBuildStatus', () => {
  it('shows planned status', () => {
    const state = createBuildState(makePlan());
    const output = formatBuildStatus(state);
    expect(output).toContain('Status: planned');
    expect(output).toContain('Progress: 0/');
  });

  it('shows status icons for each step', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'executed';
    state.plan.steps[0].result = 'Generated district';
    const output = formatBuildStatus(state);
    expect(output).toContain('●'); // executed
    expect(output).toContain('○'); // pending
    expect(output).toContain('Generated district');
  });

  it('shows failed status with error', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'failed';
    state.plan.steps[0].error = 'LLM timeout';
    const output = formatBuildStatus(state);
    expect(output).toContain('✗'); // failed
    expect(output).toContain('LLM timeout');
  });

  it('shows progress fraction', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'executed';
    state.plan.steps[1].status = 'executed';
    const output = formatBuildStatus(state);
    expect(output).toContain(`Progress: 2/${state.plan.steps.length}`);
  });

  it('shows completedAt when finished', () => {
    const state = createBuildState(makePlan());
    for (const step of state.plan.steps) step.status = 'executed';
    finalizeBuild(state);
    const output = formatBuildStatus(state);
    expect(output).toContain('Completed:');
  });
});

// ========================================
// Diagnostics
// ========================================

describe('buildDiagnostics', () => {
  it('reports step counts', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'executed';
    state.plan.steps[1].status = 'failed';
    state.plan.steps[2].status = 'skipped';
    const diag = buildDiagnostics(state, makeSession());
    expect(diag[0]).toContain('1 executed');
    expect(diag[0]).toContain('1 failed');
    expect(diag[0]).toContain('1 skipped');
  });

  it('reports open issues after build', () => {
    const state = createBuildState(makePlan());
    const session = makeSession({
      issues: [
        { code: 'PACING', target: 'bar', severity: 'high', status: 'open', summary: 'Too slow' },
      ],
    });
    const diag = buildDiagnostics(state, session);
    const issueLines = diag.filter(d => d.includes('issue'));
    expect(issueLines.length).toBeGreaterThan(0);
  });

  it('reports generated content volume', () => {
    const state = createBuildState(makePlan());
    state.generatedContent.push('id: test\nname: Test District\nrooms: []');
    const diag = buildDiagnostics(state, makeSession());
    expect(diag.some(d => d.includes('artifact(s)'))).toBe(true);
  });

  it('suggests retry for failed builds', () => {
    const state = createBuildState(makePlan());
    state.plan.steps[0].status = 'failed';
    const diag = buildDiagnostics(state, makeSession());
    expect(diag.some(d => d.includes('retry'))).toBe(true);
  });

  it('reports missing artifact categories', () => {
    const state = createBuildState(makePlan());
    const session = makeSession({
      artifacts: { districts: ['d1'], factions: [], quests: [], rooms: [], packs: [] },
    });
    const diag = buildDiagnostics(state, session);
    expect(diag.some(d => d.includes('factions'))).toBe(true);
  });

  it('works with null session', () => {
    const state = createBuildState(makePlan());
    const diag = buildDiagnostics(state, null);
    expect(diag.length).toBeGreaterThan(0);
  });
});

describe('formatBuildDiagnostics', () => {
  it('returns no-diagnostics message for empty array', () => {
    expect(formatBuildDiagnostics([])).toContain('No diagnostics');
  });

  it('formats diagnostics with header', () => {
    const output = formatBuildDiagnostics(['Steps: 3 executed, 0 failed, 0 skipped']);
    expect(output).toContain('Build Diagnostics');
    expect(output).toContain('3 executed');
  });
});

// ========================================
// Router integration
// ========================================

describe('build_goal intent routing', () => {
  // These test the keyword patterns from chat-router
  // We import classifyByKeywords and check build_goal classification
  let classifyByKeywords: (msg: string) => { intent: string; confidence: string; params: Record<string, string> } | null;

  // Dynamic import to avoid circular deps
  beforeAll(async () => {
    const mod = await import('./chat-router.js');
    classifyByKeywords = mod.classifyByKeywords as typeof classifyByKeywords;
  });

  it('classifies "build a rumor-driven market district" as build_goal', () => {
    const result = classifyByKeywords('build a rumor-driven market district');
    expect(result?.intent).toBe('build_goal');
    expect(result?.params.goal).toContain('rumor-driven market district');
  });

  it('classifies "build a haunted chapel scenario" as build_goal', () => {
    const result = classifyByKeywords('build a haunted chapel scenario');
    expect(result?.intent).toBe('build_goal');
  });

  it('classifies "build a cyberpunk heist encounter" as build_goal', () => {
    const result = classifyByKeywords('build a cyberpunk heist encounter');
    expect(result?.intent).toBe('build_goal');
  });

  it('classifies "/build something cool" as build_goal', () => {
    const result = classifyByKeywords('/build something cool');
    expect(result?.intent).toBe('build_goal');
  });

  it('does NOT classify "build a district" as build_goal (scaffold catches it)', () => {
    const result = classifyByKeywords('build a district');
    // scaffold should catch this first
    expect(result?.intent).toBe('scaffold');
  });

  it('does NOT classify "create a room" as build_goal', () => {
    const result = classifyByKeywords('create a room about ghosts');
    expect(result?.intent).toBe('scaffold');
  });
});

// ========================================
// Tool integration
// ========================================

describe('build_goal tool', () => {
  it('build-plan tool is registered for build_goal intent', async () => {
    const { findToolForIntent } = await import('./chat-tools.js');
    const tool = findToolForIntent('build_goal');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('build-plan');
  });

  it('build-plan tool does not mutate', async () => {
    const { findToolForIntent } = await import('./chat-tools.js');
    const tool = findToolForIntent('build_goal');
    expect(tool!.mutates).toBe(false);
  });
});

// ========================================
// Edge cases
// ========================================

describe('edge cases', () => {
  it('handles empty goal string', () => {
    const plan = generateBuildPlan('', null);
    // Should still generate steps (defaults to district template)
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('handles very long goal string', () => {
    const goal = 'a '.repeat(200) + 'district';
    const plan = generateBuildPlan(goal, makeSession());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('handles session with many open issues', () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      code: `RUMOR_${i}`,
      target: `target_${i}`,
      severity: 'medium' as const,
      status: 'open' as const,
      summary: `Issue ${i}`,
    }));
    const session = makeSession({ issues });
    const plan = generateBuildPlan('test district', session);
    // Should not explode or add excessive steps
    expect(plan.steps.length).toBeLessThan(20);
  });

  it('nextPendingStep returns correct step when dependencies form a chain', () => {
    const plan = generateBuildPlan('dark market district', makeSession());
    const state = createBuildState(plan);

    // Execute steps in order
    let step = nextPendingStep(state);
    const executedIds: number[] = [];
    while (step) {
      // Verify all dependencies are satisfied
      for (const dep of step.dependencies) {
        expect(executedIds).toContain(dep);
      }
      markStepExecuted(state, step.id, 'done');
      executedIds.push(step.id);
      step = nextPendingStep(state);
    }

    // All steps should be executed
    expect(isBuildComplete(state)).toBe(true);
  });
});

// ========================================
// Session event types
// ========================================

describe('session event types', () => {
  it('build event kinds are valid SessionEventKind values', async () => {
    // Just type-check that the new event kinds compile
    const { recordEvent, createSession } = await import('./session.js');
    const session = createSession('test');
    recordEvent(session, 'build_plan_created', 'Plan created');
    recordEvent(session, 'build_step_executed', 'Step 1 done');
    recordEvent(session, 'build_step_failed', 'Step 2 failed');
    recordEvent(session, 'build_plan_completed', 'Build done');
    expect(session.history).toHaveLength(5); // 1 start + 4 build events
  });
});
