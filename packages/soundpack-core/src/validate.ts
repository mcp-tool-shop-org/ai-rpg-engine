// Validate a SoundPackManifest

import type { SoundPackManifest, SoundDomain, SoundIntensity, DurationClass, SoundSource } from './types.js';

const VALID_DOMAINS: SoundDomain[] = ['sfx', 'ambient', 'music', 'voice'];
const VALID_INTENSITIES: SoundIntensity[] = ['low', 'medium', 'high'];
const VALID_DURATIONS: DurationClass[] = ['oneshot', 'short-loop', 'long-loop'];
const VALID_SOURCES: SoundSource[] = ['file', 'procedural', 'voice-soundboard'];

export type ManifestError = {
  field: string;
  message: string;
};

/** Validate a SoundPackManifest. */
export function validateManifest(manifest: unknown): ManifestError[] {
  const errors: ManifestError[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return [{ field: 'root', message: 'manifest must be an object' }];
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== 'string' || m.name.length === 0) {
    errors.push({ field: 'name', message: 'name must be a non-empty string' });
  }
  if (typeof m.version !== 'string') {
    errors.push({ field: 'version', message: 'version must be a string' });
  }

  if (!Array.isArray(m.entries)) {
    errors.push({ field: 'entries', message: 'entries must be an array' });
    return errors;
  }

  const seenIds = new Set<string>();
  for (let i = 0; i < m.entries.length; i++) {
    const e = m.entries[i] as Record<string, unknown>;
    const prefix = `entries[${i}]`;

    if (typeof e.id !== 'string' || e.id.length === 0) {
      errors.push({ field: `${prefix}.id`, message: 'id must be a non-empty string' });
    } else if (seenIds.has(e.id)) {
      errors.push({ field: `${prefix}.id`, message: `duplicate id: ${e.id}` });
    } else {
      seenIds.add(e.id);
    }

    if (!VALID_DOMAINS.includes(e.domain as SoundDomain)) {
      errors.push({ field: `${prefix}.domain`, message: `domain must be one of: ${VALID_DOMAINS.join(', ')}` });
    }
    if (!VALID_INTENSITIES.includes(e.intensity as SoundIntensity)) {
      errors.push({ field: `${prefix}.intensity`, message: `intensity must be one of: ${VALID_INTENSITIES.join(', ')}` });
    }
    if (!VALID_DURATIONS.includes(e.durationClass as DurationClass)) {
      errors.push({ field: `${prefix}.durationClass`, message: `durationClass must be one of: ${VALID_DURATIONS.join(', ')}` });
    }
    if (!VALID_SOURCES.includes(e.source as SoundSource)) {
      errors.push({ field: `${prefix}.source`, message: `source must be one of: ${VALID_SOURCES.join(', ')}` });
    }
  }

  return errors;
}

export function isValidManifest(manifest: unknown): manifest is SoundPackManifest {
  return validateManifest(manifest).length === 0;
}
