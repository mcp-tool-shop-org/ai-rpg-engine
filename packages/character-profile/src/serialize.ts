// Profile serialization — save/load to JSON

import type { CharacterProfile } from './types.js';
import { PROFILE_VERSION } from './types.js';

/** Serialize a profile to JSON string. */
export function serializeProfile(profile: CharacterProfile): string {
  return JSON.stringify(profile, null, 2);
}

/** Deserialize a profile from JSON string. Returns the profile or errors. */
export function deserializeProfile(json: string): {
  profile: CharacterProfile | null;
  errors: string[];
} {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { profile: null, errors: ['Invalid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { profile: null, errors: ['Expected an object'] };
  }

  const obj = parsed as Record<string, unknown>;

  // Required string fields
  for (const field of ['id', 'packId', 'createdAt', 'updatedAt'] as const) {
    if (typeof obj[field] !== 'string') {
      errors.push(`Missing or invalid field: ${field}`);
    }
  }

  // Version check
  if (typeof obj['version'] !== 'number') {
    errors.push('Missing or invalid version');
  } else if (obj['version'] > PROFILE_VERSION) {
    errors.push(`Profile version ${obj['version']} is newer than supported version ${PROFILE_VERSION}`);
  }

  // Required objects
  if (typeof obj['build'] !== 'object' || obj['build'] === null) {
    errors.push('Missing or invalid build');
  }
  if (typeof obj['stats'] !== 'object' || obj['stats'] === null) {
    errors.push('Missing or invalid stats');
  }
  if (typeof obj['resources'] !== 'object' || obj['resources'] === null) {
    errors.push('Missing or invalid resources');
  }
  if (typeof obj['loadout'] !== 'object' || obj['loadout'] === null) {
    errors.push('Missing or invalid loadout');
  }
  if (typeof obj['progression'] !== 'object' || obj['progression'] === null) {
    errors.push('Missing or invalid progression');
  }

  // Required arrays
  if (!Array.isArray(obj['tags'])) errors.push('Missing or invalid tags');
  if (!Array.isArray(obj['injuries'])) errors.push('Missing or invalid injuries');
  if (!Array.isArray(obj['milestones'])) errors.push('Missing or invalid milestones');
  if (!Array.isArray(obj['reputation'])) errors.push('Missing or invalid reputation');

  if (errors.length > 0) {
    return { profile: null, errors };
  }

  return { profile: parsed as CharacterProfile, errors: [] };
}

/** Validate a serialized profile string. */
export function validateSerializedProfile(json: string): { ok: boolean; errors: string[] } {
  const { errors } = deserializeProfile(json);
  return { ok: errors.length === 0, errors };
}
