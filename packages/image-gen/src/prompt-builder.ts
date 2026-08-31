// Convert character metadata into image generation prompts

import type { PortraitRequest, SceneRequest, IconRequest } from './types.js';
import { getStylePreset, getSceneStylePreset, getIconStylePreset } from './styles.js';

/**
 * Strip Stable-Diffusion-style prompt-control syntax before untrusted-ish
 * fields (character/archetype/background/title/discipline/trait names) are
 * joined into the generation prompt: attention weighting `(word:1.5)`, LoRA
 * tags `<lora:...>`, and — v2.6 audit F-4d700ceb — brace/pipe alternation
 * syntax `{a|b}`, which several SD front-ends (including some ComfyUI
 * text-encode nodes) also interpret as prompt-control.
 *
 * Also used by portrait identity so the char: key matches the sanitized
 * strings that actually reach the provider (F-930e6b5b).
 */
export function sanitize(s: string): string {
  return s.replace(/[():\[\]\\<>{}|]/g, '');
}

/**
 * Style string that actually reaches the provider (F-5cafb6fc).
 * Empty-string style is a real override (chargen empty form field), not a
 * missing value — `??` only falls through for omitted/undefined style.
 */
export function resolvedPortraitStyle(request: PortraitRequest): string {
  return sanitize(request.style ?? getStylePreset(request.genre).style);
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

  // Style — request.style is the same open string type as the sanitized
  // fields above and lands in the same final prompt, so it gets the same
  // stripping (v2.6 audit F-ece77541). This is a no-op for every built-in
  // STYLE_PRESETS value (none contain the stripped characters); it only bites
  // a crafted override trying to smuggle prompt-control syntax through.
  // Identity keys this same resolved string (F-5cafb6fc).
  parts.push(resolvedPortraitStyle(request));

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

export function resolvedSceneStyle(request: SceneRequest): string {
  return sanitize(request.style ?? getSceneStylePreset(request.genre).style);
}

export function resolvedIconStyle(request: IconRequest): string {
  return sanitize(request.style ?? getIconStylePreset(request.genre).style);
}

export function buildScenePrompt(request: SceneRequest): string {
  const place = sanitize(request.locationName ?? request.zoneId);
  const desc = sanitize(request.description);
  return [`Scene of ${place}`, desc, resolvedSceneStyle(request)].filter(Boolean).join(', ');
}

export function buildIconPrompt(request: IconRequest): string {
  const name = sanitize(request.name);
  const desc = request.description ? sanitize(request.description) : '';
  return [`Icon of ${name}`, desc, resolvedIconStyle(request)].filter(Boolean).join(', ');
}

export function buildSceneNegativePrompt(request: SceneRequest): string {
  return getSceneStylePreset(request.genre).negativePrompt;
}

export function buildIconNegativePrompt(request: IconRequest): string {
  return getIconStylePreset(request.genre).negativePrompt;
}
