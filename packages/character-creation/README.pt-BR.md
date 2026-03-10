<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Sistema de criação de personagens sem interface — arquétipos, origens, características, especializações e validação de construção para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/character-creation
```

## O que faz

Personagens não são planilhas — são identidades. Este pacote gerencia a fusão estruturada de um arquétipo principal, origem, características de personalidade e uma disciplina secundária opcional, resultando em uma entidade de jogador validada. Cada combinação de arquétipo + disciplina produz um título que sintetiza a identidade do personagem, em vez de simplesmente somar números.

## Uso

### Validar uma construção

```typescript
import { validateBuild } from '@ai-rpg-engine/character-creation';
import { content, buildCatalog } from '@ai-rpg-engine/starter-fantasy';

const build = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  statAllocations: { vigor: 2, instinct: 1 },
};

const result = validateBuild(build, buildCatalog, content.ruleset);
// result.ok === true
// result.resolvedTitle === 'Grave Warden'
// result.finalStats === { vigor: 8, instinct: 6, will: 1 }
// result.resolvedTags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```

### Converter para Estado da Entidade

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### Explorar as opções disponíveis

```typescript
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from '@ai-rpg-engine/character-creation';

const archetypes = getAvailableArchetypes(buildCatalog);
const backgrounds = getAvailableBackgrounds(buildCatalog);
const traits = getAvailableTraits(buildCatalog, ['iron-frame']); // filters incompatible
const disciplines = getAvailableDisciplines(buildCatalog, 'penitent-knight', ['martial']);
const remaining = getStatBudgetRemaining(build, buildCatalog); // points left to allocate
```

### Serializar para arquivos de salvamento

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## Conceitos

| Conceito | Descrição |
|---------|-------------|
| **Archetype** | Classe primária — estatísticas básicas, tags iniciais, árvore de progressão |
| **Background** | História de origem — modificadores de estatísticas, tags iniciais, inventário opcional |
| **Trait** | Habilidade ou fraqueza — efeitos em estatísticas, recursos, tags, verbos ou facções |
| **Discipline** | Classe secundária — 1 verbo concedido, 1 efeito passivo, 1 desvantagem |
| **Cross-Title** | Identidade sintetizada a partir do arquétipo + disciplina (por exemplo, "Guardião da Tumba") |
| **Entanglement** | Efeito de "atrito" resultante de certas combinações de arquétipo + disciplina |
| **Build Catalog** | Menu específico do pacote com todas as opções de personagem |

## Especializações

O sistema usa a fusão estruturada de identidades, não a soma aditiva:

- O **arquétipo primário** define a identidade central (estatísticas básicas, árvore de progressão, tags iniciais).
- A **disciplina secundária** é compacta: 1 verbo, 1 efeito passivo, 1 desvantagem.
- Cada combinação produz um **título de disciplina cruzada** ("Pistoleiro Hex", "Cirurgião Sináptico", "Marechal de Quarentena").
- Algumas combinações criam **complicações** — efeitos narrativos de "atrito".

## Efeitos das Características

| Tipo | Exemplo |
|------|---------|
| modificador de estatística | `{ stat: 'dex', amount: 1 }` |
| modificador de recurso | `{ resource: 'hp', amount: -3 }` |
| conceder tag | `{ tag: 'curse-touched' }` |
| acesso a verbo | `{ verb: 'steal' }` |
| modificador de facção | `{ faction: 'guard', amount: -10 }` |

## Catálogos de Construções

Todos os 7 pacotes iniciais exportam um `buildCatalog` com opções específicas do pacote. Cada catálogo inclui 3 arquétipos, 3 origens, 4 características (2 habilidades + 2 fraquezas), 2 disciplinas e 6 títulos de disciplina cruzada.

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Ele depende apenas de `@ai-rpg-engine/core` para importações de tipo — sem dependência de tempo de execução do motor.

## Licença

MIT
