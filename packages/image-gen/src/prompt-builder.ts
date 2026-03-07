// Convert character metadata into image generation prompts

import type { PortraitRequest } from './types.js';
import { getStylePreset } from './styles.js';

/** Build a portrait generation prompt from character data. */
export function buildPortraitPrompt(request: PortraitRequest): string {
  const parts: string[] = [];

  // Subject
  if (request.title) {
    parts.push(`Portrait of ${request.characterName}, ${request.title}`);
  } else {
    parts.push(`Portrait of ${request.characterName}`);
  }

  // Class identity
  const classDesc: string[] = [request.archetypeName];
  if (request.disciplineName) classDesc.push(request.disciplineName);
  parts.push(classDesc.join(' and '));

  // Background origin
  parts.push(`${request.backgroundName} origin`);

  // Traits (flavor only, pick the interesting ones)
  if (request.traits.length > 0) {
    parts.push(`known for being ${request.traits.join(' and ')}`);
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
