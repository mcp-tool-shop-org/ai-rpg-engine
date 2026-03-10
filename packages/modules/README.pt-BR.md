<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/modules

17 módulos de simulação que podem ser combinados para o AI RPG Engine — combate, diálogo, cognição, percepção, facções e muito mais.

## Instalação

```bash
npm install @ai-rpg-engine/modules
```

## Módulos

| Módulo | Descrição |
|--------|-------------|
| `combatCore` | Ataque/defesa, dano, derrota, resistência, guarda, desengajamento. |
| `dialogueCore` | Árvores de diálogo baseadas em grafos, com condições. |
| `inventoryCore` | Itens, equipamentos, uso/equipamento/desequipamento. |
| `traversalCore` | Movimentação e validação de saída de zonas. |
| `statusCore` | Efeitos de status com duração e empilhamento. |
| `environmentCore` | Propriedades dinâmicas de zonas, perigos, decadência. |
| `cognitionCore` | Crenças, intenções, moral e memória da IA. |
| `perceptionFilter` | Canais sensoriais, clareza, audição entre zonas. |
| `narrativeAuthority` | Verdade versus apresentação, ocultação, distorção. |
| `progressionCore` | Progressão baseada em moeda, árvores de habilidades. |
| `factionCognition` | Crenças das facções, confiança, conhecimento entre facções. |
| `rumorPropagation` | Disseminação de informações com decaimento da confiança. |
| `knowledgeDecay` | Erosão da confiança baseada no tempo. |
| `districtCore` | Memória espacial, métricas de zona, limites de alerta. |
| `beliefProvenance` | Reconstrução de rastros através de percepção/cognição/rumores. |
| `observerPresentation` | Filtragem de eventos por observador, rastreamento de divergências. |
| `simulationInspector` | Inspeção em tempo de execução, verificações de saúde, diagnósticos. |
| `combatIntent` | Vieses na tomada de decisão da IA, moral, lógica de fuga. |
| `engagementCore` | Posicionamento em linha de frente/traseira, interrupção de guarda-costas. |
| `combatRecovery` | Estados de ferimentos após o combate, cura em zonas seguras. |
| `combatReview` | Explicação de fórmulas, detalhamento da probabilidade de acerto. |
| `defeatFallout` | Consequências para as facções após o combate, mudanças na reputação. |
| `bossPhaseListener` | Transições de fase baseadas no limite de HP do chefe. |

### Módulos de Habilidade

| Módulo | Descrição |
|--------|-------------|
| `abilityCore` | Resolução de habilidades — custos, testes, alvos, aplicação de efeitos, tempos de recarga. |
| `abilityEffects` | Manipuladores de efeitos — dano, cura, modificação de atributos, aplicação/remoção de estados. |
| `abilityReview` | Rastreamento em tempo de execução — detalhamento por uso, inspetor, saída formatada. |
| `abilityIntent` | Sistema de pontuação da IA — caminhos de ataque (próprio/área/único), consciência de resistência, avaliação de purificação. |

### Criação de Habilidades (Funções Puras)

| Exportação | Propósito |
|--------|---------|
| `ability-summary` | Resumo do pacote, auditoria de balanceamento, exportação em Markdown/JSON. |
| `ability-builders` | Fábricas de conveniência: buildDamageAbility, buildHealAbility, buildStatusAbility, buildCleanseAbility, buildAbilitySuite. |
| `status-semantics` | Vocabulário de 11 tags, registro de estados, aplicação com consciência de resistência. |

### Criação de Combates (Funções Puras)

| Exportação | Propósito |
|--------|---------|
| `combat-roles` | 8 modelos de funções, tipos de composição de encontros, classificação de perigo, definições de chefes. |
| `encounter-library` | 5 fábricas de arquétipos de encontros, 3 fábricas de modelos de chefes, auditoria de pacotes. |
| `combat-summary` | Consulta, auditoria, formatação e inspeção de conteúdo de combate. |

## Uso

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## Documentação

- [Módulos (Cap. 6)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [Cognição da IA (Cap. 8)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [Percepção (Cap. 9)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [Sistema de Combate (Cap. 47)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [Sistema de Habilidades (Cap. 48)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/48-abilities-system/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
