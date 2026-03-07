// Genre-specific style presets for portrait generation

import type { StylePreset } from './types.js';

export const STYLE_PRESETS: StylePreset[] = [
  {
    genre: 'fantasy',
    style: 'dark fantasy oil painting, dramatic lighting, detailed armor and cloth textures, medieval setting',
    negativePrompt: 'modern clothing, technology, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'sci-fi',
    style: 'science fiction concept art, futuristic setting, clean lines, high-tech environment, cinematic lighting',
    negativePrompt: 'medieval, fantasy, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'cyberpunk',
    style: 'cyberpunk digital art, neon lighting, chrome and leather, rain-slicked streets, high contrast',
    negativePrompt: 'medieval, nature, pastoral, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'horror',
    style: 'dark horror illustration, unsettling atmosphere, muted desaturated palette, harsh shadows',
    negativePrompt: 'bright colors, cheerful, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'mystery',
    style: 'victorian noir portrait, gaslight atmosphere, fog and shadow, muted earth tones, period clothing',
    negativePrompt: 'modern clothing, bright neon, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'western',
    style: 'weird west oil painting, dusty frontier, supernatural undertones, warm sepia and amber palette',
    negativePrompt: 'modern city, technology, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'pirate',
    style: 'golden age pirate portrait, maritime setting, weathered textures, dramatic ocean sky, rich colors',
    negativePrompt: 'modern clothing, technology, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'post-apocalyptic',
    style: 'post-apocalyptic portrait, ruined urban backdrop, survival gear, gritty textures, muted toxic palette',
    negativePrompt: 'clean modern city, luxury, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'historical',
    style: 'historical portrait painting, period-accurate clothing, classical composition, natural lighting',
    negativePrompt: 'modern clothing, technology, cartoon, anime, blurry, deformed',
  },
];

/** Look up style preset by genre. Returns a generic preset if genre not found. */
export function getStylePreset(genre: string): StylePreset {
  const preset = STYLE_PRESETS.find((p) => p.genre === genre);
  if (preset) return preset;
  return {
    genre,
    style: 'detailed character portrait, cinematic lighting, painterly style',
    negativePrompt: 'blurry, deformed, low quality, cartoon',
  };
}
