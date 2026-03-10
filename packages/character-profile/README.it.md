<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-profile

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-profile)](https://www.npmjs.com/package/@ai-rpg-engine/character-profile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Profili personaggio persistenti con sistema di progressione, ferite, traguardi e funzionalità di salvataggio/caricamento per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/character-profile
```

## Funzionalità

Combina la creazione del personaggio, le statistiche in tempo reale, l'equipaggiamento, l'esperienza/il livello, le ferite, i traguardi e la reputazione con le fazioni in un singolo profilo persistente che sopravvive tra le sessioni. Include la serializzazione per i file di salvataggio.

## Utilizzo

### Creazione di un Profilo

```typescript
import { createProfile } from '@ai-rpg-engine/character-profile';

const profile = createProfile(
  build,       // CharacterBuild from character-creation
  { vigor: 7, instinct: 4, will: 1 },  // resolved stats
  { hp: 25, stamina: 8 },               // resolved resources
  ['martial', 'oath-broken'],            // resolved tags
  'chapel-threshold',                    // pack ID
);
```

### Esperienza e Livello

```typescript
import { grantXp, advanceArchetypeRank } from '@ai-rpg-engine/character-profile';

const { profile: leveled, leveledUp } = grantXp(profile, 100);
// leveledUp === true, leveled.progression.level === 2

const { profile: ranked } = advanceArchetypeRank(leveled);
// ranked.progression.archetypeRank === 2
```

### Ferite

```typescript
import { addInjury, healInjury, computeInjuryPenalties } from '@ai-rpg-engine/character-profile';

let wounded = addInjury(profile, {
  name: 'Broken Arm',
  description: 'Fractured in combat.',
  statPenalties: { vigor: -2 },
  resourcePenalties: {},
  grantedTags: ['injured'],
  sustainedAt: 'turn-10',
});

const penalties = computeInjuryPenalties(wounded);
// penalties.statPenalties.vigor === -2
```

### Traguardi e Reputazione

```typescript
import { recordMilestone, adjustReputation, getReputation } from '@ai-rpg-engine/character-profile';

let updated = recordMilestone(profile, {
  label: 'Chapel Entered',
  description: 'First entered the ruined chapel.',
  at: 'turn-1',
  tags: ['exploration'],
});

updated = adjustReputation(updated, 'chapel-undead', -10);
// getReputation(updated, 'chapel-undead') === -10
```

### Salvataggio/Caricamento

```typescript
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';

const json = serializeProfile(profile);
const { profile: loaded, errors } = deserializeProfile(json);
```

## Sistema di Progressione

| Livello | Esperienza Richiesta |
|-------|------------|
| 1 | 0 |
| 2 | 100 |
| 3 | 250 |
| 4 | 500 |
| 5 | 1,000 |
| 6 | 2,000 |
| 7 | 4,000 |
| 8 | 7,000 |
| 9 | 11,000 |
| 10 | 16,000 |

Livello massimo per l'archetipo: 5. Livello massimo per la disciplina: 3.

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Dipende da `@ai-rpg-engine/character-creation` e `@ai-rpg-engine/equipment`.

## Licenza

MIT
