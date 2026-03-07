# Chapter 29 — Image Generation

> Part VII — Systems

Headless portrait generation pipeline with pluggable providers.

## Package

`@ai-rpg-engine/image-gen` — depends on `@ai-rpg-engine/asset-registry` for storage.

```bash
npm install @ai-rpg-engine/image-gen
```

## Architecture

```
PortraitRequest → Prompt Builder → Image Provider → Asset Registry
                     ↓                   ↓              ↓
              genre presets      ComfyUI / SVG     content-addressed
              trait flavor       placeholder        SHA-256 hash
```

The pipeline converts character metadata into a generation prompt, sends it to a provider, and stores the result in the asset registry. The returned hash becomes the `portraitRef` on the character build.

## Prompt Builder

`buildPortraitPrompt(request)` assembles a prompt from:

- Character name and title
- Archetype and discipline class names
- Background origin
- Trait descriptions
- Genre-specific style preset

Example output:
```
Portrait of Aldric, Grave Warden, Penitent Knight and Occultist,
Oath-Breaker origin, known for being Iron Frame and Cursed Blood,
dark fantasy oil painting, dramatic lighting, detailed armor and cloth textures
```

## Providers

| Provider | Backend | Dependencies | Use Case |
|----------|---------|-------------|----------|
| `PlaceholderProvider` | SVG with initials | None | Testing, development |
| `ComfyUIProvider` | ComfyUI HTTP API | ComfyUI server | Local GPU generation |

### PlaceholderProvider

Generates deterministic SVG images with character initials on a color-coded background. Always available, zero dependencies.

### ComfyUIProvider

Calls ComfyUI's REST API directly:
1. POST workflow to `/prompt`
2. Poll `/history/{id}` for completion
3. Fetch image from `/view`

Works with any ComfyUI installation, including [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless).

### Custom Provider

Implement the `ImageProvider` interface:

```typescript
interface ImageProvider {
  readonly name: string;
  generate(prompt: string, opts?: GenerationOptions): Promise<GenerationResult>;
  isAvailable(): Promise<boolean>;
}
```

## Genre Style Presets

9 built-in presets map genres to art direction:

| Genre | Style Direction |
|-------|----------------|
| fantasy | Dark oil painting, dramatic lighting, medieval textures |
| cyberpunk | Neon lighting, chrome, rain-slicked streets |
| mystery | Victorian noir, gaslight, fog and shadow |
| pirate | Golden age maritime, weathered, dramatic ocean sky |
| horror | Dark illustration, unsettling, muted palette |
| western | Weird west, dusty frontier, supernatural undertones |

## Pipeline Functions

- `generatePortrait(request, provider, store)` — generate and store a new portrait
- `ensurePortrait(request, provider, store)` — return existing or generate new
- `buildPromptPair(request)` — get both positive and negative prompts
