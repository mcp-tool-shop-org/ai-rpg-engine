<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## O que é

AI RPG Engine é um ambiente de execução modular para a criação de RPGs para terminal, onde as ações geram informações, as informações são distorcidas e as consequências surgem do que os personagens acreditam ter acontecido.

O ambiente mantém a verdade objetiva do mundo, ao mesmo tempo que suporta narrativas não confiáveis, diferenças de percepção entre os personagens e narrativas em camadas. É agnóstico em relação ao gênero — o mesmo núcleo pode ser usado para fantasia sombria, cyberpunk ou qualquer outro cenário, através de conjuntos de regras personalizáveis.

## Instalação

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## Início Rápido

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## Arquitetura

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

Cada mudança de estado flui por um único pipeline:

```
action --> validation --> resolution --> events --> presentation
```

## Pacotes

| Pacote | Propósito |
|---------|---------|
| `@ai-rpg-engine/core` | Estado, entidades, ações, eventos, regras, RNG (gerador de números aleatórios), persistência |
| `@ai-rpg-engine/modules` | 17 módulos de simulação integrados |
| `@ai-rpg-engine/content-schema` | Esquemas e validadores de conteúdo |
| `@ai-rpg-engine/terminal-ui` | Renderizador de terminal e camada de entrada |
| `@ai-rpg-engine/cli` | CLI (interface de linha de comando) para desenvolvedores: executar, reproduzir, inspecionar |
| `@ai-rpg-engine/starter-fantasy` | The Chapel Threshold (demonstração de fantasia) |
| `@ai-rpg-engine/starter-cyberpunk` | Neon Lockbox (demonstração de cyberpunk) |

## Módulos Integrados

| Módulo | O que ele faz |
|--------|-------------|
| combat-core | Ataque/defesa, dano, derrota, resistência |
| dialogue-core | Árvores de diálogo baseadas em gráficos com condições |
| inventory-core | Itens, equipamentos, usar/equipar/desequipar |
| traversal-core | Movimentação e validação de saída de áreas |
| status-core | Efeitos de status com duração e empilhamento |
| environment-core | Propriedades dinâmicas de áreas, perigos, decadência |
| cognition-core | Crenças, intenções, moral, memória da IA |
| perception-filter | Canais sensoriais, clareza, audição entre áreas |
| narrative-authority | Verdade versus apresentação, ocultação, distorção |
| progression-core | Avanço baseado em moeda, árvores de habilidades |
| faction-cognition | Crenças de facções, confiança, conhecimento entre facções |
| rumor-propagation | Disseminação de informações com decaimento da confiança |
| knowledge-decay | Erosão da confiança baseada no tempo |
| district-core | Memória espacial, métricas de áreas, limites de alerta |
| belief-provenance | Rastreamento da origem das crenças através de percepção/cognição/rumor |
| observer-presentation | Filtragem de eventos por observador, rastreamento de divergências |
| simulation-inspector | Inspeção em tempo de execução, verificações de saúde, diagnósticos |

## Decisões de Design Chave

- **A verdade da simulação é sagrada** — o ambiente mantém o estado objetivo. As camadas de apresentação podem mentir, mas a verdade do mundo é canônica.
- **As ações geram eventos** — nenhuma mudança de estado significativa ocorre silenciosamente. Tudo emite eventos estruturados e pesquisáveis.
- **Reprodução determinística** — o RNG (gerador de números aleatórios) com semente e o pipeline de ações garantem resultados idênticos a partir de entradas idênticas.
- **O conteúdo é dados** — salas, entidades, diálogos, itens são definidos como dados, não como código.
- **O gênero pertence aos conjuntos de regras** — o ambiente não tem opinião sobre espadas versus lasers.

## Segurança e Confiança

AI RPG Engine é uma **biblioteca de simulação local**.

- **Dados acessados:** apenas o estado do jogo na memória. Arquivos de salvamento são gravados em `.ai-rpg-engine/` quando o CLI de salvamento é usado.
- **Dados NÃO acessados:** nenhum acesso ao sistema de arquivos além dos arquivos de salvamento, nenhuma rede, nenhuma variável de ambiente, nenhum recurso do sistema.
- **Sem telemetria.** Nenhum dado é coletado ou enviado para lugar nenhum.
- **Sem segredos.** O ambiente não lê, armazena ou transmite credenciais.

Consulte o arquivo [SECURITY.md](SECURITY.md) para a política de segurança completa.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Documentação

- [Manual](docs/handbook/index.md) — 25 capítulos + 4 apêndices
- [Visão Geral do Design](docs/DESIGN.md) — análise aprofundada da arquitetura
- [Histórico de Alterações](CHANGELOG.md)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
