<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/presentation"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/presentation.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/presentation

Schema per la pianificazione della narrazione, contratti di rendering e tipi di stato della presentazione per il [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Parte di **Immersion Runtime** — la pipeline di presentazione multimodale che trasforma lo stato del gioco in esperienze audio-visive strutturate.

## Installazione

```bash
npm install @ai-rpg-engine/presentation
```

## Cosa fa

Invece di produrre testo semplice, il narratore genera un **NarrationPlan** — una ricetta strutturata che descrive testo, effetti sonori, elementi ambientali, segnali musicali, effetti dell'interfaccia utente e parametri di sintesi vocale.

Qualsiasi interfaccia utente (terminale, web, Electron) implementa l'interfaccia `PresentationRenderer` per ricevere ed eseguire questi piani.

## Tipi principali

| Tipo | Scopo |
|------|---------|
| `NarrationPlan` | Ricetta di narrazione strutturata (testo + effetti sonori + elementi ambientali + musica + interfaccia utente) |
| `SpeakerCue` | Parametri di sintesi vocale (ID della voce, emozione, velocità) |
| `SfxCue` | Trigger di effetto sonoro (ID dell'effetto, tempistica, intensità) |
| `AmbientCue` | Controllo dello strato ambientale (avvio, arresto, dissolvenza incrociata) |
| `MusicCue` | Controllo della musica di sottofondo (riproduzione, arresto, intensificazione, attenuazione) |
| `UiEffect` | Effetti visivi su terminale/schermo (lampeggio, tremolio, dissolvenza) |
| `VoiceProfile` | Configurazione vocale per la sintesi vocale |
| `PresentationRenderer` | Contratto di rendering — qualsiasi interfaccia utente lo implementa |

## Utilizzo

```typescript
import type { NarrationPlan, PresentationRenderer } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan, isValidNarrationPlan } from '@ai-rpg-engine/presentation';

// Validate a plan from Claude's output
const errors = validateNarrationPlan(planFromClaude);
if (errors.length === 0) {
  // Plan is valid, execute it
}

// Type guard
if (isValidNarrationPlan(data)) {
  console.log(data.sceneText);
}
```

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consultare il file README principale per l'architettura completa.

## Licenza

MIT
