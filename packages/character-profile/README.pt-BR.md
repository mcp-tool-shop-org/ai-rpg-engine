<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-profile

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-profile)](https://www.npmjs.com/package/@ai-rpg-engine/character-profile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Perfis de personagens persistentes com progressão, ferimentos, marcos e sistema de salvar/carregar para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/character-profile
```

## O que faz

Combina a construção do personagem, estatísticas em tempo real, equipamento, experiência/nível, ferimentos, marcos e reputação de facção em um único perfil persistente que se mantém entre as sessões. Inclui serialização para arquivos de salvamento.

## Uso

### Criar um Perfil

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

### Experiência e Nível

```typescript
import { grantXp, advanceArchetypeRank } from '@ai-rpg-engine/character-profile';

const { profile: leveled, leveledUp } = grantXp(profile, 100);
// leveledUp === true, leveled.progression.level === 2

const { profile: ranked } = advanceArchetypeRank(leveled);
// ranked.progression.archetypeRank === 2
```

### Ferimentos

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

### Marcos e Reputação

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

### Salvar/Carregar

```typescript
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';

const json = serializeProfile(profile);
const { profile: loaded, errors } = deserializeProfile(json);
```

## Sistema de Progressão

| Nível | Experiência Necessária |
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

Nível máximo de arquétipo: 5. Nível máximo de disciplina: 3.

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Depende de `@ai-rpg-engine/character-creation` e `@ai-rpg-engine/equipment`.

## Licença

MIT
