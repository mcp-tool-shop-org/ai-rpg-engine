// Convert character metadata into image generation prompts

import type { PortraitRequest } from './types.js';
import { getStylePreset } from './styles.js';

function sanitize(s: string): string {
  return s.replace(/[():\[\]\\<>]/g, '');
}

/** Build a portrait generation prompt from character data. */
export function buildPortraitPrompt(request: PortraitRequest): string {
  const parts: string[] = [];

  const name = sanitize(request.characterName);
  const archetype = sanitize(request.archetypeName);
  const background = sanitize(request.backgroundName);
  const title = request.title ? sanitize(request.title) : undefined;
  const discipline = request.disciplineName ? sanitize(request.disciplineName) : undefined;
  const traits = request.traits.map(sanitize);

  // Subject
  if (title) {
    parts.push(`Portrait of ${name}, ${title}`);
  } else {
    parts.push(`Portrait of ${name}`);
  }

  // Class identity
  const classDesc: string[] = [archetype];
  if (discipline) classDesc.push(discipline);
  parts.push(classDesc.join(' and '));

  // Background origin
  parts.push(`${background} origin`);

  // Traits (flavor only, pick the interesting ones)
  if (traits.length > 0) {
    parts.push(`known for being ${traits.join(' and ')}`);
  }

  // Style
  const preset = getStylePreset(request.genre);
  const style = request.style ?? preset.style;
  parts.push(style);

  return parts.join(', ');
}

/** Build a negative prompt for the given genre. */
export function buildNegativePrompt(request: PortraitRequest): string {
  const preset = getStylePreset(request.genre);
  return preset.negativePrompt;
}

/** Build both positive and negative prompts. */
export function buildPromptPair(request: PortraitRequest): {
  prompt: string;
  negativePrompt: string;
} {
  return {
    prompt: buildPortraitPrompt(request),
    negativePrompt: buildNegativePrompt(request),
  };
}
