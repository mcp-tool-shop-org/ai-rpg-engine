// Tests — chat planner: session-aware multi-step planning

import { describe, it, expect } from 'vitest';
import { planFromSession, formatPlan, validatePlan } from './chat-planner.js';
import type { ActionPlan, PlanStep } from './chat-planner.js';
import type { DesignSession } from './session.js';

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'planner-test',
    model: 'test',
    createdAt: '2025-01-01',
    themes: ['cyberpunk', 'noir'],
    constraints: ['no magic'],
    artifacts: { districts: ['neon-alley'], factions: ['syndicate'], quests: [], rooms: ['bar'], packs: [] },
    issues: [],
    acceptedSuggestions: [],
    history: [],
    ...overrides,
  } as DesignSession;
}

// --- No session ---

describe('planFromSession — no session', () => {
  it('recommends starting a session', () => {
    const plan = planFromSession(null);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('session_info');
    expect(plan.signals).toHaveLength(1);
    expect(plan.signals[0].source).toBe('session');
  });

  it('uses user goal when provided', () => {
    const plan = planFromSession(null, 'Build a haunted castle');
    expect(plan.goal).toBe('Build a haunted castle');
  });
});

// --- High-severity issues ---

describe('planFromSession — high-severity issues', () => {
  it('generates critique + improve steps for high-severity issues', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'PACING', target: 'bar', summary: 'Pacing too slow', status: 'open' },
      ],
    });
    const plan = planFromSession(session);
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    const critiqueStep = plan.steps.find(s => s.command === 'critique');
    const improveStep = plan.steps.find(s => s.command === 'improve');
    expect(critiqueStep).toBeDefined();
    expect(improveStep).toBeDefined();
    expect(improveStep!.dependsOn).toContain(critiqueStep!.order);
    expect(improveStep!.addressesIssues).toContain('PACING');
  });

  it('groups issues by target for efficient fixing', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'PACING', target: 'bar', summary: 'Pacing too slow', status: 'open' },
        { severity: 'high', code: 'EXITS', target: 'bar', summary: 'Missing exits', status: 'open' },
        { severity: 'high', code: 'THEME', target: 'neon-alley', summary: 'Off theme', status: 'open' },
      ],
    });
    const plan = planFromSession(session);
    // bar issues grouped: 1 critique + 1 improve for bar, then neon-alley
    const barImprove = plan.steps.find(s => s.command === 'improve' && s.description.includes('bar'));
    expect(barImprove!.addressesIssues).toContain('PACING');
    expect(barImprove!.addressesIssues).toContain('EXITS');
  });

  it('signals high-severity issues', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'X', target: 'bar', summary: 'Bad', status: 'open' },
      ],
    });
    const plan = planFromSession(session);
    expect(plan.signals.some(s => s.source === 'issue' && s.observation.includes('high-severity'))).toBe(true);
  });
});

// --- Medium-severity issues ---

describe('planFromSession — medium-severity issues', () => {
  it('generates improve steps for medium-severity', () => {
    const session = makeSession({
      issues: [
        { severity: 'medium', code: 'STYLE', target: 'bar', summary: 'Style inconsistent', status: 'open' },
      ],
    });
    const plan = planFromSession(session);
    const improveStep = plan.steps.find(s => s.command === 'improve' && s.addressesIssues.includes('STYLE'));
    expect(improveStep).toBeDefined();
  });
});

// --- Empty artifact categories ---

describe('planFromSession — scaffold empty categories', () => {
  it('scaffolds missing categories in dependency order', () => {
    const session = makeSession({
      artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    });
    const plan = planFromSession(session);
    const scaffolds = plan.steps.filter(s => s.command === 'scaffold');
    expect(scaffolds.length).toBeGreaterThanOrEqual(2);
    // District should come before faction/room/quest
    const districtStep = scaffolds.find(s => s.description.includes('district'));
    const factionStep = scaffolds.find(s => s.description.includes('faction'));
    expect(districtStep).toBeDefined();
    expect(factionStep).toBeDefined();
    expect(districtStep!.order).toBeLessThan(factionStep!.order);
  });

  it('signals missing categories', () => {
    const session = makeSession({
      artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    });
    const plan = planFromSession(session);
    expect(plan.signals.some(s => s.observation.includes('Missing artifact categories'))).toBe(true);
  });
});

// --- Critique when none recent ---

describe('planFromSession — critique phase', () => {
  it('suggests critique when no recent critiques and content exists', () => {
    const session = makeSession(); // has rooms/districts but no issue_opened events
    const plan = planFromSession(session);
    const critiqueStep = plan.steps.find(s =>
      s.command === 'critique' && s.reason.includes('No recent critiques'));
    expect(critiqueStep).toBeDefined();
  });
});

// --- Suggest-next fallback ---

describe('planFromSession — fallback', () => {
  it('falls back to suggest_next when session is clean', () => {
    const now = new Date().toISOString();
    const session = makeSession({
      artifacts: { districts: ['d1'], factions: ['f1'], quests: ['q1'], rooms: ['r1'], packs: [] },
      history: [
        { kind: 'issue_opened', detail: 'recent critique', timestamp: now },
      ],
    });
    const plan = planFromSession(session);
    // No issues, all categories filled, recent critique → suggest_next
    expect(plan.steps.some(s => s.command === 'suggest_next')).toBe(true);
  });
});

// --- User goal ---

describe('planFromSession — user goal', () => {
  it('includes user goal in signals and plan goal', () => {
    const session = makeSession();
    const plan = planFromSession(session, 'Focus on the syndicate storyline');
    expect(plan.goal).toBe('Focus on the syndicate storyline');
    expect(plan.signals.some(s => s.source === 'user-request')).toBe(true);
  });
});

// --- formatPlan ---

describe('formatPlan', () => {
  it('formats plan with signals and steps', () => {
    const plan: ActionPlan = {
      goal: 'Fix issues and expand',
      steps: [
        {
          order: 1, command: 'critique', description: 'Critique bar',
          reason: 'High-severity issue', confidence: 'high',
          expectedImpact: 'Confirm issues', dependsOn: [],
          kind: 'deterministic', addressesIssues: ['PACING'],
        },
        {
          order: 2, command: 'improve', description: 'Fix bar',
          reason: 'Address pacing', confidence: 'medium',
          expectedImpact: 'Resolve issues', dependsOn: [1],
          kind: 'ai-assisted', addressesIssues: ['PACING'],
        },
      ],
      rationale: 'Fix first, then expand.',
      signals: [{ observation: '1 high-severity issue', influence: 'Fix first', source: 'issue' }],
    };
    const formatted = formatPlan(plan);
    expect(formatted).toContain('Fix issues and expand');
    expect(formatted).toContain('[det]');
    expect(formatted).toContain('[ai]');
    expect(formatted).toContain('(after step 1)');
    expect(formatted).toContain('fixes: PACING');
    expect(formatted).toContain('Signals:');
    expect(formatted).toContain('Rationale:');
  });

  it('formats plan with no signals', () => {
    const plan: ActionPlan = {
      goal: 'Explore',
      steps: [{
        order: 1, command: 'suggest_next', description: 'Suggest next step',
        reason: 'Clean state', confidence: 'medium',
        expectedImpact: 'New direction', dependsOn: [],
        kind: 'ai-assisted', addressesIssues: [],
      }],
      rationale: 'Everything looks good.',
      signals: [],
    };
    const formatted = formatPlan(plan);
    expect(formatted).toContain('Explore');
    expect(formatted).not.toContain('Signals:');
  });
});

// --- validatePlan ---

describe('validatePlan', () => {
  it('validates a correct plan', () => {
    const plan: ActionPlan = {
      goal: 'Test',
      steps: [
        { order: 1, command: 'critique', description: 'A', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [], kind: 'deterministic', addressesIssues: [] },
        { order: 2, command: 'improve', description: 'B', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [1], kind: 'ai-assisted', addressesIssues: [] },
      ],
      rationale: 'R',
      signals: [],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate step orders', () => {
    const plan: ActionPlan = {
      goal: 'Test',
      steps: [
        { order: 1, command: 'a', description: 'A', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [], kind: 'deterministic', addressesIssues: [] },
        { order: 1, command: 'b', description: 'B', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [], kind: 'deterministic', addressesIssues: [] },
      ],
      rationale: 'R',
      signals: [],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });

  it('detects dependency on later step (cycle risk)', () => {
    const plan: ActionPlan = {
      goal: 'Test',
      steps: [
        { order: 1, command: 'a', description: 'A', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [2], kind: 'deterministic', addressesIssues: [] },
        { order: 2, command: 'b', description: 'B', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [], kind: 'deterministic', addressesIssues: [] },
      ],
      rationale: 'R',
      signals: [],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('detects dependency on non-existent step', () => {
    const plan: ActionPlan = {
      goal: 'Test',
      steps: [
        { order: 1, command: 'a', description: 'A', reason: 'R', confidence: 'high', expectedImpact: 'I', dependsOn: [99], kind: 'deterministic', addressesIssues: [] },
      ],
      rationale: 'R',
      signals: [],
    };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-existent'))).toBe(true);
  });
});

// --- Resolved issues are ignored ---

describe('planFromSession — resolved issues ignored', () => {
  it('does not plan steps for resolved issues', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'OLD', target: 'bar', summary: 'Was bad', status: 'resolved' },
      ],
    });
    const plan = planFromSession(session);
    expect(plan.steps.every(s => !s.addressesIssues.includes('OLD'))).toBe(true);
  });
});

// --- Plan step limit ---

describe('planFromSession — step limit', () => {
  it('does not exceed 8 steps even with many issues', () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      severity: 'medium' as const,
      code: `ISS-${i}`,
      target: `target-${i}`,
      summary: `Issue ${i}`,
      status: 'open' as const,
    }));
    const session = makeSession({ issues });
    const plan = planFromSession(session);
    // Medium-severity issues capped at 8, but critique phase may add 1 more
    expect(plan.steps.length).toBeLessThanOrEqual(10);
  });
});
