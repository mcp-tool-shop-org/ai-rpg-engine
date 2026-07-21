import { describe, it, expect } from 'vitest';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import type { Milestone } from './types.js';
import { createProfile } from './profile.js';
import {
  recordMilestone,
  getMilestonesByTag,
  adjustReputation,
  getReputation,
} from './milestones.js';

const testBuild: CharacterBuild = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: [],
};

function makeProfile() {
  return createProfile(testBuild, { vigor: 6 }, { hp: 20 }, [], 'fantasy');
}

describe('recordMilestone', () => {
  it('adds a milestone', () => {
    const profile = makeProfile();
    const updated = recordMilestone(profile, {
      label: 'Chapel Entered',
      description: 'First entered the ruined chapel.',
      at: 'turn-1',
      tags: ['exploration', 'chapel'],
    });
    expect(updated.milestones).toHaveLength(1);
    expect(updated.milestones[0]!.label).toBe('Chapel Entered');
    expect(updated.milestones[0]!.id).toBeTruthy();
  });

  it('preserves existing milestones', () => {
    let profile = makeProfile();
    profile = recordMilestone(profile, {
      label: 'First',
      description: 'First event.',
      at: 'turn-1',
      tags: ['story'],
    });
    profile = recordMilestone(profile, {
      label: 'Second',
      description: 'Second event.',
      at: 'turn-5',
      tags: ['combat'],
    });
    expect(profile.milestones).toHaveLength(2);
  });

  // CP-05: milestone ids must be deterministic (no Date.now / Math.random).
  // Typed as recordMilestone's own parameter type (was `as const`, whose
  // readonly array type is not assignable to the mutable Omit<Milestone, ...>).
  const first: Omit<Milestone, 'id'> = {
    label: 'First',
    description: 'First event.',
    at: 'turn-1',
    tags: ['story'],
  };

  it('generates reproducible milestone ids from the same profile state', () => {
    const a = recordMilestone(makeProfile(), first);
    const b = recordMilestone(makeProfile(), first);
    expect(a.milestones[0]!.id).toBe(b.milestones[0]!.id);
  });

  it('assigns sequential, collision-free ids as milestones accumulate', () => {
    let profile = makeProfile();
    profile = recordMilestone(profile, first);
    profile = recordMilestone(profile, { ...first, label: 'Second' });
    profile = recordMilestone(profile, { ...first, label: 'Third' });
    const ids = profile.milestones.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('ms-1');
    expect(ids[1]).toBe('ms-2');
    expect(ids[2]).toBe('ms-3');
  });

  it('honors a caller-supplied milestone id', () => {
    const profile = recordMilestone(makeProfile(), first, 'ms-custom');
    expect(profile.milestones[0]!.id).toBe('ms-custom');
  });
});

describe('getMilestonesByTag', () => {
  it('filters milestones by tag', () => {
    let profile = makeProfile();
    profile = recordMilestone(profile, {
      label: 'Battle Won',
      description: 'Victory.',
      at: 'turn-3',
      tags: ['combat'],
    });
    profile = recordMilestone(profile, {
      label: 'Treasure Found',
      description: 'Gold.',
      at: 'turn-5',
      tags: ['exploration'],
    });
    profile = recordMilestone(profile, {
      label: 'Boss Slain',
      description: 'A mighty foe.',
      at: 'turn-10',
      tags: ['combat', 'boss'],
    });

    const combat = getMilestonesByTag(profile, 'combat');
    expect(combat).toHaveLength(2);
    expect(combat[0]!.label).toBe('Battle Won');
    expect(combat[1]!.label).toBe('Boss Slain');
  });
});

describe('adjustReputation', () => {
  it('creates a new faction entry', () => {
    const profile = makeProfile();
    const updated = adjustReputation(profile, 'chapel-undead', 10);
    expect(getReputation(updated, 'chapel-undead')).toBe(10);
  });

  it('adjusts existing reputation', () => {
    let profile = makeProfile();
    profile = adjustReputation(profile, 'chapel-undead', 20);
    profile = adjustReputation(profile, 'chapel-undead', -5);
    expect(getReputation(profile, 'chapel-undead')).toBe(15);
  });

  it('clamps to 100', () => {
    const profile = makeProfile();
    const updated = adjustReputation(profile, 'guild', 200);
    expect(getReputation(updated, 'guild')).toBe(100);
  });

  it('clamps to -100', () => {
    const profile = makeProfile();
    const updated = adjustReputation(profile, 'guild', -200);
    expect(getReputation(updated, 'guild')).toBe(-100);
  });
});

describe('getReputation', () => {
  it('returns 0 for unknown faction', () => {
    const profile = makeProfile();
    expect(getReputation(profile, 'unknown')).toBe(0);
  });
});
