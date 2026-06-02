// Milestone and reputation tracking

import type { CharacterProfile, Milestone, ReputationEntry } from './types.js';
import { touch } from './profile.js';

/**
 * Derive the next deterministic milestone id for a profile (CP-05 — no Date.now /
 * Math.random). Ids are `ms-N` where N is one past the highest existing suffix,
 * making them sequential, collision-free, and reproducible from profile state.
 */
function nextMilestoneId(profile: CharacterProfile): string {
  let max = 0;
  for (const ms of profile.milestones) {
    const m = /^ms-(\d+)$/.exec(ms.id);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `ms-${max + 1}`;
}

/**
 * Record a milestone. `id` is optional — when omitted, a deterministic sequential
 * id is derived from the profile's existing milestones (CP-05).
 */
export function recordMilestone(
  profile: CharacterProfile,
  milestone: Omit<Milestone, 'id'>,
  id?: string,
): CharacterProfile {
  const full: Milestone = { ...milestone, id: id ?? nextMilestoneId(profile) };
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
