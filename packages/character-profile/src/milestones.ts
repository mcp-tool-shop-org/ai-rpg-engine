// Milestone and reputation tracking

import type { CharacterProfile, Milestone, ReputationEntry } from './types.js';
import { touch } from './profile.js';

/** Generate a simple milestone ID. */
function milestoneId(): string {
  return `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Record a milestone. */
export function recordMilestone(
  profile: CharacterProfile,
  milestone: Omit<Milestone, 'id'>,
): CharacterProfile {
  const full: Milestone = { ...milestone, id: milestoneId() };
  return touch({
    ...profile,
    milestones: [...profile.milestones, full],
  });
}

/** Get milestones matching a tag. */
export function getMilestonesByTag(profile: CharacterProfile, tag: string): Milestone[] {
  return profile.milestones.filter((m) => m.tags.includes(tag));
}

/** Adjust faction reputation. Clamps to [-100, 100]. */
export function adjustReputation(
  profile: CharacterProfile,
  factionId: string,
  delta: number,
): CharacterProfile {
  const existing = profile.reputation.find((r) => r.factionId === factionId);
  const newValue = Math.max(-100, Math.min(100, (existing?.value ?? 0) + delta));

  const updated: ReputationEntry[] = existing
    ? profile.reputation.map((r) =>
        r.factionId === factionId ? { ...r, value: newValue } : r,
      )
    : [...profile.reputation, { factionId, value: newValue }];

  return touch({ ...profile, reputation: updated });
}

/** Get reputation value for a faction (0 if unknown). */
export function getReputation(profile: CharacterProfile, factionId: string): number {
  return profile.reputation.find((r) => r.factionId === factionId)?.value ?? 0;
}
