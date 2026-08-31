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
  {
    genre: 'pursuit',
    style: 'thief-taker portrait, dusty warrants and folded paper, frontier coats and badge metal, lantern light, weathered leather, oil painting',
    negativePrompt: 'neon, chrome, spaceship, cartoon, anime, blurry, deformed',
  },
  {
    genre: 'mercantile',
    style: 'caravanserai merchant portrait, ledgers and coin, trade-road cloth, spice-market lanterns, silk and warm earth palette, painterly',
    negativePrompt: 'combat armor, neon, cartoon, anime, blurry, deformed',
  },
];

/** Generic fallback used only when `genre` is not in {@link STYLE_PRESETS}. */
export const GENERIC_STYLE = 'detailed character portrait, cinematic lighting, painterly style';

/** Scene fallback — portrait STYLE_PRESETS stay character directions (F-401a1110). */
export const GENERIC_SCENE_STYLE = 'detailed environment, cinematic lighting, painterly style, empty of characters';

/** Icon fallback — inventory-style object render, not a portrait. */
export const GENERIC_ICON_STYLE = 'game item icon, centered subject, clean silhouette, dark background, no text';

/** Look up style preset by genre. Returns a generic preset if genre not found. */
export function getStylePreset(genre: string): StylePreset {
  const preset = STYLE_PRESETS.find((p) => p.genre === genre);
  if (preset) return preset;
  return {
    genre,
    style: GENERIC_STYLE,
    negativePrompt: 'blurry, deformed, low quality, cartoon',
  };
}

/** Scene/environment style for backgrounds. Does not mutate {@link STYLE_PRESETS}. */
export function getSceneStylePreset(genre: string): StylePreset {
  const preset = STYLE_PRESETS.find((p) => p.genre === genre);
  if (!preset) {
    return {
      genre,
      style: GENERIC_SCENE_STYLE,
      negativePrompt: 'people, faces, portrait, text, blurry, deformed, low quality',
    };
  }
  return {
    genre,
    style: `${preset.style}, wide establishing shot, environment, no characters`,
    negativePrompt: `${preset.negativePrompt}, people, faces, portrait, text`,
  };
}

/** Item-icon style. Does not mutate {@link STYLE_PRESETS}. */
export function getIconStylePreset(genre: string): StylePreset {
  const preset = STYLE_PRESETS.find((p) => p.genre === genre);
  if (!preset) {
    return {
      genre,
      style: GENERIC_ICON_STYLE,
      negativePrompt: 'photorealistic scene, people, text, watermark, blurry, deformed',
    };
  }
  return {
    genre,
    style: `${preset.style}, game inventory icon, centered object, simple background`,
    negativePrompt: `${preset.negativePrompt}, photorealistic scene, people, text, watermark`,
  };
}
