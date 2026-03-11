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

# Motor de RPG com Inteligência Artificial

Um conjunto de ferramentas em TypeScript para criar simulações de RPG determinísticas. Você define as estatísticas, escolhe os módulos, conecta as ações de combate e cria o conteúdo. O motor gerencia o estado, os eventos, o gerador de números aleatórios, a resolução de ações e a tomada de decisões da inteligência artificial. Cada execução é reproduzível.

Este é um **motor de composição**, não um jogo completo. Os 10 mundos iniciais são exemplos — padrões que podem ser decompostos, aprendidos e remixados. Seu jogo usa apenas o subconjunto do motor que você precisa.

---

## O que isso é

- Uma **biblioteca de módulos** — mais de 27 módulos que abrangem combate, percepção, cognição, facções, rumores, exploração, companheiros e muito mais.
- Um **conjunto de ferramentas de composição** — `buildCombatStack()` conecta as ações de combate em aproximadamente 7 linhas; `new Engine({ modules })` inicia o jogo.
- Um **ambiente de execução de simulação** — execução determinística, logs de ações reproduzíveis, gerador de números aleatórios com semente.
- Um **estúdio de design de IA** (opcional) — estrutura básica, análise crítica, análise de equilíbrio, ajuste fino e experimentos via Ollama.

## O que isso não é

- Não é um jogo jogável "out of the box" — você o cria a partir de módulos e conteúdo.
- Não é um motor visual — ele gera eventos estruturados, não pixels.
- Não é um gerador de histórias — ele simula mundos; a narrativa emerge das mecânicas.

---

## Status atual (v2.3.0)

**O que funciona e está testado:**
- Ambiente de execução principal: estado do mundo, eventos, ações, ciclos, reprodução — estável desde a versão 1.0.
- Sistema de combate: 5 ações, 4 estados de combate, 4 estados de engajamento, interceptação de companheiros, fluxo de derrota, táticas de IA — 1099 testes.
- Habilidades: custos, tempos de recarga, verificações de estatísticas, efeitos tipados, vocabulário de status, seleção com consciência da IA.
- Camada de decisão unificada: pontuação de combate + habilidades combinadas em uma única chamada (`selectBestAction`).
- 10 mundos iniciais com inimigos com estatísticas diferentes e integração completa de combate.
- `buildCombatStack()` elimina aproximadamente 40 linhas de configuração de combate por mundo.
- Taxonomia de tags e utilitários de validação para criação de conteúdo.
- Validação de fase de chefe com rastreamento de tags entre fases.

**O que está incompleto ou em desenvolvimento:**
- As ferramentas de criação de mundo de IA (camada Ollama) funcionam, mas são menos testadas em comparação com a simulação.
- O shell do estúdio de linha de comando é funcional, mas não está finalizado.
- Apenas 1 dos 10 mundos iniciais usa `buildCombatStack` (Weird West); os outros usam conexões manuais mais detalhadas.
- Ainda não há sistema de perfil — os mundos são independentes e não podem ser combinados a partir de perfis compartilhados.
- A documentação é extensa (57 capítulos), mas nem todos os capítulos refletem as APIs mais recentes.

---

## Início Rápido

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulte o [Guia de Composição](docs/handbook/57-composition-guide.md) para o fluxo de trabalho completo.

---

## Arquitetura

| Camada | Função |
|-------|------|
| **Core Runtime** | Motor determinístico — estado do mundo, eventos, ações, ciclos, gerador de números aleatórios, reprodução. |
| **Modules** | Mais de 27 sistemas compostáveis — combate, percepção, cognição, facções, exploração, companheiros, etc. |
| **Content** | Entidades, zonas, diálogos, itens, habilidades, estados — criados pelo usuário. |
| **AI Studio** | Camada Ollama opcional — estrutura básica, análise crítica, análise de equilíbrio, ajuste fino e experimentos. |

---

## Sistema de Combate

Cinco ações (ataque, defesa, desengajamento, preparo, reposicionamento), quatro estados de combate (defensivo, desequilibrado, exposto, em fuga), quatro estados de engajamento (engajado, protegido, retaguarda, isolado). Três dimensões de estatísticas impulsionam cada fórmula, então um duelista rápido joga de forma diferente de um lutador pesado ou um sentinela composto.

Os oponentes de IA usam uma pontuação de decisão unificada — ações de combate e habilidades competem em uma única avaliação, com limites configuráveis para evitar o uso excessivo de habilidades marginais.

Os autores de pacotes utilizam a função `buildCombatStack()` para implementar o sistema de combate em aproximadamente 7 linhas – mapeamento de atributos, perfil de recursos e tags de viés. Consulte a [Visão Geral do Combate](docs/handbook/49a-combat-overview.md) e o [Guia para Autores de Pacotes](docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo do gênero com custos, verificações de estatísticas, tempos de recarga e efeitos tipados (dano, cura, aplicação de estado, limpeza). Os efeitos de status usam um vocabulário semântico de 11 tags com perfis de resistência/vulnerabilidade. A seleção com consciência da IA pontua caminhos de ataque próprio/área/alvo único.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Pacotes

| Pacote | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Simulação determinística em tempo de execução — estado do mundo, eventos, gerador de números aleatórios, ciclos, resolução de ações. |
| [`@ai-rpg-engine/modules`](packages/modules) | 27+ módulos combináveis — combate, percepção, cognição, facções, rumores, exploração, companheiros, agência de NPCs, mapa estratégico, reconhecimento de itens, oportunidades emergentes, detecção de arcos narrativos, gatilhos para o final do jogo. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas e validadores canônicos para o conteúdo do mundo. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Estado de progressão do personagem, ferimentos, marcos, reputação. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Seleção de arquétipos, geração de personagens, equipamentos iniciais. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipamentos, origem dos itens, crescimento de relíquias. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memória entre sessões, efeitos de relacionamento, estado da campanha. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Criação de IA opcional — estruturas de base, análise crítica, fluxos de trabalho guiados, ajuste fino, experimentos. |
| [`@ai-rpg-engine/cli`](packages/cli) | Estúdio de design de linha de comando. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderizador de terminal e camada de entrada |

### Exemplos iniciais

Os 10 exemplos iniciais são **exemplos de composição** — eles demonstram como combinar módulos do motor para criar jogos completos. Cada um mostra padrões diferentes (mapeamentos de atributos, perfis de recursos, configurações de engajamento, conjuntos de habilidades). Consulte o arquivo README de cada exemplo inicial para ver os "Padrões Demonstrados" e "O que pode ser usado".

| Inicial. | Gênero. | Padrões-chave. |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasia sombria. | Combate mínimo, focado em diálogos. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk. | Recursos, papéis de engajamento. |
| [`starter-detective`](packages/starter-detective) | Mistério vitoriano. | Prioridade para a interação social, forte ênfase na percepção. |
| [`starter-pirate`](packages/starter-pirate) | Pirata. | Combate naval + corpo a corpo, em múltiplas áreas. |
| [`starter-zombie`](packages/starter-zombie) | Sobrevivência contra zumbis. | Escassez, recurso de infecção. |
| [`starter-weird-west`](packages/starter-weird-west) | Oeste estranho. | Referência `buildCombatStack`, preferências de empacotamento. |
| [`starter-colony`](packages/starter-colony) | Colônia espacial. | Pontos de estrangulamento, zonas de emboscada. |
| [`starter-ronin`](packages/starter-ronin) | Japão feudal. | Passagens secretas, múltiplos papéis de proteção. |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiros. | Recurso de sangue, manipulação social. |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico. | Combate na arena, favor da multidão. |

---

## Documentação

| Recurso | Descrição |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | Crie seu próprio jogo combinando módulos do motor — comece aqui. |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Seis pilares do combate, cinco ações, estados em um piscar de olhos. |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Construção passo a passo de `buildCombatStack`, mapeamento de atributos, perfis de recursos. |
| [Handbook](docs/handbook/index.md) | 43 capítulos + 4 apêndices que cobrem todos os sistemas. |
| [Composition Model](docs/composition-model.md) | As 6 camadas reutilizáveis e como elas se combinam. |
| [Examples](docs/examples/) | Exemplos em TypeScript que podem ser executados — grupo misto, entre mundos, do zero. |
| [Design Document](docs/DESIGN.md) | Análise aprofundada da arquitetura — pipeline de ações, verdade versus apresentação. |
| [Philosophy](PHILOSOPHY.md) | Por que mundos determinísticos, design baseado em evidências e IA como assistente. |
| [Changelog](CHANGELOG.md) | Histórico de lançamentos |

---

## Roteiro

### Onde estamos agora

O sistema de simulação e combate são robustos — 2661 testes, 10 exemplos de gênero, reprodução determinística, pontuação completa de decisões da IA. O motor funciona como um conjunto de ferramentas de composição: escolha módulos, defina atributos, conecte-os e crie conteúdo. A documentação cobre todos os sistemas, mas precisa de uma sincronização da API para as adições mais recentes.

### Nas próximas semanas

- Migrar os 9 exemplos iniciais restantes para `buildCombatStack` (Oeste estranho é a referência).
- Sincronização da documentação da API — `submitActionAs`, `selectBestAction`, `resourceCaps`, taxonomia de tags.
- Refinar os arquivos README dos exemplos iniciais — instruções mais claras sobre "O que pode ser usado" e como remixar.
- Passagem de interligação — conectar os arquivos README, o guia de composição, os exemplos e o manual.

### Destino: Perfis de Plug-in

O objetivo final do motor são os **perfis definidos pelo usuário** — pacotes portáteis que podem ser integrados em qualquer jogo. Um perfil empacota um mapeamento de atributos, comportamento de recursos, tags de viés da IA, habilidades e ganchos de encontro em uma única unidade importável. Dois jogadores com perfis diferentes podem compartilhar um mundo, cada um trazendo seu próprio estilo de jogo.

Os perfis se baseiam na composição (já em funcionamento) e na camada unificada de tomada de decisão (lançada na v2.3.0). O trabalho restante é definir o esquema do perfil, construir o carregador e validar as interações entre perfis. Consulte o [Roteiro do Perfil](docs/profile-roadmap.md) para o plano completo.

---

## Filosofia

O motor de RPG com IA é construído em torno de três ideias:

1. **Mundos determinísticos** — os resultados da simulação devem ser reproduzíveis.
2. **Design baseado em evidências** — as mecânicas do mundo devem ser testadas por meio de simulação.
3. **IA como assistente, não como autoridade** — as ferramentas de IA ajudam a gerar e analisar projetos, mas não substituem os sistemas determinísticos.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para uma explicação completa.

---

## Segurança

O motor de RPG com IA é uma **biblioteca de simulação local**. Não há telemetria, não há rede, não há segredos. Os arquivos de salvamento são gravados apenas em `.ai-rpg-engine/` quando solicitado explicitamente. Consulte [SECURITY.md](SECURITY.md) para obter detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
