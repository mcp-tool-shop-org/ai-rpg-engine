// Tests — personality profiles: selection, system prompt building

import { describe, it, expect } from 'vitest';
import {
  WORLDBUILDER_PROFILE,
  ANALYST_PROFILE,
  GENERATOR_PROFILE,
  ROUTER_PROFILE,
  getProfileForIntent,
  buildSystemPrompt,
} from './chat-personality.js';
import type { PersonalityProfile, ChatIntentForProfile } from './chat-personality.js';

// --- Profile constants ---

describe('personality profiles', () => {
  it('WORLDBUILDER_PROFILE has balanced inference', () => {
    expect(WORLDBUILDER_PROFILE.name).toBe('worldbuilder');
    expect(WORLDBUILDER_PROFILE.inferenceHint).toBe('balanced');
    expect(WORLDBUILDER_PROFILE.systemPrompt).toContain('senior worldbuilder');
  });

  it('WORLDBUILDER_PROFILE enforces three-way distinction', () => {
    expect(WORLDBUILDER_PROFILE.systemPrompt).toContain('PROJECT TRUTH');
    expect(WORLDBUILDER_PROFILE.systemPrompt).toContain('RETRIEVED CONTEXT');
    expect(WORLDBUILDER_PROFILE.systemPrompt).toContain('YOUR SYNTHESIS');
  });

  it('WORLDBUILDER_PROFILE prohibits filler', () => {
    expect(WORLDBUILDER_PROFILE.systemPrompt).toContain('filler');
  });

  it('ROUTER_PROFILE is precise and JSON-only', () => {
    expect(ROUTER_PROFILE.name).toBe('router');
    expect(ROUTER_PROFILE.inferenceHint).toBe('precise');
    expect(ROUTER_PROFILE.systemPrompt).toContain('JSON only');
  });

  it('ANALYST_PROFILE is balanced and action-focused', () => {
    expect(ANALYST_PROFILE.name).toBe('analyst');
    expect(ANALYST_PROFILE.inferenceHint).toBe('balanced');
    expect(ANALYST_PROFILE.systemPrompt).toContain('actionable');
  });

  it('GENERATOR_PROFILE is creative', () => {
    expect(GENERATOR_PROFILE.name).toBe('generator');
    expect(GENERATOR_PROFILE.inferenceHint).toBe('creative');
    expect(GENERATOR_PROFILE.systemPrompt).toContain('creative worldbuilder');
  });
});

// --- getProfileForIntent ---

describe('getProfileForIntent', () => {
  it('maps scaffold to generator', () => {
    expect(getProfileForIntent('scaffold')).toBe(GENERATOR_PROFILE);
  });

  it('maps improve to generator', () => {
    expect(getProfileForIntent('improve')).toBe(GENERATOR_PROFILE);
  });

  it('maps critique to analyst', () => {
    expect(getProfileForIntent('critique')).toBe(ANALYST_PROFILE);
  });

  it('maps explain_state to analyst', () => {
    expect(getProfileForIntent('explain_state')).toBe(ANALYST_PROFILE);
  });

  it('maps analyze_replay to analyst', () => {
    expect(getProfileForIntent('analyze_replay')).toBe(ANALYST_PROFILE);
  });

  it('maps compare_replays to analyst', () => {
    expect(getProfileForIntent('compare_replays')).toBe(ANALYST_PROFILE);
  });

  it('maps explain_why to analyst', () => {
    expect(getProfileForIntent('explain_why')).toBe(ANALYST_PROFILE);
  });

  it('maps suggest_next to worldbuilder', () => {
    expect(getProfileForIntent('suggest_next')).toBe(WORLDBUILDER_PROFILE);
  });

  it('maps plan to worldbuilder', () => {
    expect(getProfileForIntent('plan')).toBe(WORLDBUILDER_PROFILE);
  });

  it('maps session_info to worldbuilder', () => {
    expect(getProfileForIntent('session_info')).toBe(WORLDBUILDER_PROFILE);
  });

  it('maps help to worldbuilder', () => {
    expect(getProfileForIntent('help')).toBe(WORLDBUILDER_PROFILE);
  });

  it('maps unknown to worldbuilder', () => {
    expect(getProfileForIntent('unknown')).toBe(WORLDBUILDER_PROFILE);
  });

  it('covers all 13 intents', () => {
    const intents: ChatIntentForProfile[] = [
      'suggest_next', 'explain_state', 'scaffold', 'critique',
      'improve', 'compare_replays', 'analyze_replay', 'plan',
      'explain_why', 'session_info', 'apply_content', 'help', 'unknown',
    ];
    for (const intent of intents) {
      const profile = getProfileForIntent(intent);
      expect(profile).toBeDefined();
      expect(profile.name).toBeTruthy();
      expect(profile.systemPrompt).toBeTruthy();
    }
  });
});

// --- buildSystemPrompt ---

describe('buildSystemPrompt', () => {
  it('returns just the profile system prompt when no extras', () => {
    const prompt = buildSystemPrompt({ profile: WORLDBUILDER_PROFILE });
    expect(prompt).toBe(WORLDBUILDER_PROFILE.systemPrompt);
  });

  it('appends project memory when provided', () => {
    const prompt = buildSystemPrompt({
      profile: WORLDBUILDER_PROFILE,
      projectMemory: '--- Project Memory ---\nThemes: horror\n--- End Project Memory ---',
    });
    expect(prompt).toContain(WORLDBUILDER_PROFILE.systemPrompt);
    expect(prompt).toContain('--- Project Memory ---');
    expect(prompt).toContain('Themes: horror');
  });

  it('appends recent conversation when provided', () => {
    const prompt = buildSystemPrompt({
      profile: WORLDBUILDER_PROFILE,
      recentConversation: 'user: create a room\nassistant: Here is your room...',
    });
    expect(prompt).toContain('## Recent conversation');
    expect(prompt).toContain('user: create a room');
  });

  it('includes both project memory and conversation', () => {
    const prompt = buildSystemPrompt({
      profile: ANALYST_PROFILE,
      projectMemory: 'Session data',
      recentConversation: 'Prior chat',
    });
    expect(prompt).toContain(ANALYST_PROFILE.systemPrompt);
    expect(prompt).toContain('Session data');
    expect(prompt).toContain('Prior chat');
    // Memory comes before conversation
    const memoryIdx = prompt.indexOf('Session data');
    const chatIdx = prompt.indexOf('Prior chat');
    expect(memoryIdx).toBeLessThan(chatIdx);
  });
});
