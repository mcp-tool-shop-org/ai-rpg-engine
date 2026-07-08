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

# Motor de RPG com IA

Um conjunto de ferramentas TypeScript para criar simulações de RPG determinísticas. Você define atributos, escolhe módulos, configura uma sequência de combate e cria conteúdo. O motor gerencia o estado, eventos, RNG, resolução de ações e tomada de decisões pela IA. Cada execução é reproduzível.

Este é um **motor de composição**, não um jogo completo. Os 10 mundos iniciais são exemplos — padrões que podem ser decompostos, dos quais você pode aprender e remixar. Seu jogo usa qualquer subconjunto do motor que precisar.

---

## O Que É Isso

- Uma **biblioteca de módulos** — mais de 30 módulos para o motor, abrangendo combate, percepção, cognição, facções, rumores, travessia, companheiros e muito mais.
- Um **conjunto de ferramentas de composição** — `buildCombatStack()` configura o combate em cerca de 7 linhas; `new Engine({ modules })` inicia o jogo.
- Um **ambiente de execução de simulação** — ciclos determinísticos, registros de ações reproduzíveis, RNG com semente definida.
- Um **estúdio de design de IA** (opcional) — estrutura básica, análise crítica, análise de equilíbrio, ajuste e experimentos por meio do Ollama.

## O Que Isso Não É

- Não é um jogo jogável pronto para uso — você o cria a partir de módulos e conteúdo.
- Não é um motor visual — ele gera eventos estruturados, não pixels.
- Não é um gerador de histórias — ele simula mundos; a narrativa emerge da mecânica.

---

## Status Atual (v2.5.0)

**O que funciona e foi testado:**
- Motor principal: estado do mundo, eventos, ações, ciclos, reprodução — estável desde a v1.0; reprodução determinística byte a byte (contador de ID por instância, RNG com semente definida).
- Sistema de combate: 5 ações, 4 estados de combate, 4 estados de engajamento, interceptação de companheiros, fluxo de derrota, táticas de IA.
- Habilidades: custos, tempos de recarga, verificações de atributos, efeitos tipados, vocabulário de status com 11 tags, seleção consciente da IA.
- **Combate em grupo (v2.4):** direcionamento de aliados (cura/buff/revive), filtragem AoE de amigos/inimigos, seletores de alvos — um curandeiro pode curar um companheiro de equipe; o AoE do inimigo poupa os aliados.
- **Efeitos de status (v2.4):** modificadores passivos de atributos afetam o combate, DoT/HoT determinísticos com base no contador de ciclos, gatilhos reativos com profundidade limitada (espinhos/reflexo).
- **Perfis plug-in — resolução de regras por entidade (v2.5):** um lutador "poderoso" e um místico "de vontade" resolvem o combate em uma luta, cada um lendo os atributos por meio de seu próprio mapeamento. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` anexa um perfil (mapeamento de atributos, pools de recursos, habilidades por entidade); `buildProfile()`, `validateProfileSet()` (IDs duplicados rejeitados), 10 modelos derivados iniciais e um comando CLI `profile`.
- Camada de decisão unificada: combate + pontuação de habilidade combinados em uma única chamada (`selectBestAction`).
- Todos os 10 mundos iniciais usam `buildCombatStack()` — a estrutura comprovada de composição.
- API de configuração da cognição (`cognition: CognitionCoreConfig | false`) para ajuste da IA por mundo inicial.
- Taxonomia de tags e utilitários de validação para criação de conteúdo.
- `ai-rpg-engine create-starter <name>` — cria um novo jogo; comandos `validate` + `scaffold` para conteúdo; carrega pacotes do JSON.
- Modelo inicial publicado no npm (`@ai-rpg-engine/starter-template`).
- Conjunto de testes completo: **3613 testes em 193 arquivos** (determinístico em execuções repetidas; cobertura reforçada na CI).

**O que está incompleto ou precisa ser aprimorado:**
- As ferramentas de construção de mundo com IA (camada Ollama) são testadas menos do que o núcleo da simulação — embora a v2.5 tenha adicionado tratamento estruturado de erros, um loop de repetição configurável/observável e uma opção `--validate` para o conteúdo gerado.
- O modo multijogador (dois jogadores humanos compartilhando um mundo) **não** foi implementado — é uma camada de rede, deliberadamente fora do escopo; os perfis hoje têm como alvo um único controlador.
- A documentação é extensa, mas nem todas as páginas do manual refletem as APIs mais recentes.

---

## Início Rápido

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulte o [Guia de Composição](docs/handbook/57-composition-guide.md) para obter o fluxo de trabalho completo ou crie um novo mundo inicial:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Arquitetura

| Camada | Função |
|-------|------|
| **Core Runtime** | Motor determinístico — estado do mundo, eventos, ações, ciclos, RNG, reprodução. |
| **Modules** | Mais de 30 sistemas que podem ser combinados — combate, percepção, cognição, facções, travessia, companheiros, etc. |
| **Content** | Entidades, zonas, diálogos, itens, habilidades, status — criados pelo autor. |
| **AI Studio** | Camada opcional do Ollama — estrutura básica, análise crítica, análise de equilíbrio, ajuste e experimentos. |

---

## Sistema de Combate

Cinco ações (ataque, defesa, desengajamento, proteção, reposicionamento), quatro estados de combate (defesa, desequilíbrio, exposição, fuga), quatro estados de engajamento (envolvimento, proteção, retaguarda, isolamento). Três dimensões de atributos impulsionam todas as fórmulas, para que um duelista rápido jogue de forma diferente de um lutador pesado ou um sentinela composto.

Os oponentes da IA usam pontuação unificada para tomada de decisão — ações de combate e habilidades competem em uma única avaliação, com limites configuráveis para evitar spam de habilidades marginais.

Os autores dos pacotes usam `buildCombatStack()` para configurar o combate a partir de um mapeamento de atributos, perfil de recursos e tags de viés. Consulte a [Visão Geral do Combate](docs/handbook/49a-combat-overview.md) e o [Guia do Autor do Pacote](docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo do gênero, com custos, verificações de atributos, tempos de recarga e efeitos tipados (dano, cura, aplicação de status, limpeza). Os efeitos de status usam um vocabulário semântico de 11 tags com perfis de resistência/vulnerabilidade. A seleção consciente da IA pontua caminhos auto/AoE/de alvo único.

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

| Pacote | Finalidade |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Ambiente de execução de simulação determinística — estado do mundo, eventos, RNG, ciclos, resolução de ações. |
| [`@ai-rpg-engine/modules`](packages/modules) | Mais de 30 módulos que podem ser combinados — combate, percepção, cognição, facções, rumores, travessia, companheiros, agência de NPCs, mapa estratégico, reconhecimento de itens, oportunidades emergentes, detecção de arco narrativo, gatilhos finais. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas e validadores canônicos para conteúdo do mundo. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Evolução do personagem, lesões, marcos importantes, reputação. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Seleção de arquétipos, criação de configurações, equipamento inicial. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipamento, origem dos itens, evolução das relíquias |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memória entre sessões, efeitos das relações, estado da campanha |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo de vida dos rumores, mecanismos de mutação, rastreamento da disseminação. |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Esquema do plano de narração, modelos de contratos de prestação de serviços e perfis de voz. |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Programação de acionamentos, prioridade, atenuação automática, lógica de tempo de espera. |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Pacotes de sons disponíveis, registo com endereçamento baseado no conteúdo. |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Inscrição de pacotes, avaliação com base em critérios, descoberta de pacotes. |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Armazenamento de conteúdo para fotografias de retrato, ícones e ficheiros multimédia. |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Geração de retratos sem rosto, com fornecedores personalizáveis. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Criação de conteúdo assistida por IA (opcional) – estruturação, análise crítica, fluxos de trabalho guiados, otimização, experimentação. |
| [`@ai-rpg-engine/cli`](packages/cli) | Interface de linha de comando (CLI): execute jogos, crie modelos iniciais, examine arquivos salvos. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderização do terminal e camada de entrada |

### Exemplos de pratos para começar a refeição

Os 10 mundos iniciais são **exemplos de composição** — demonstram como combinar módulos do motor para criar jogos completos. Cada um apresenta diferentes padrões (mapeamentos de atributos, perfis de recursos, configurações de interação e conjuntos de habilidades). Consulte o arquivo README de cada mundo inicial para obter informações sobre os «Padrões Demonstrados» e «O que pode ser utilizado».

| Entrada | Gênero | Padrões Principais |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasia sombria | Poucos combates, foco no diálogo. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Recursos, funções de envolvimento/participação |
| [`starter-detective`](packages/starter-detective) | Mistério vitoriano | Prioridade às redes sociais, grande importância à percepção. |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Combate naval e corpo a corpo, em várias zonas. |
| [`starter-zombie`](packages/starter-zombie) | Sobrevivência a zumbis | Escassez, recurso para o tratamento de infeções |
| [`starter-weird-west`](packages/starter-weird-west) | Faroeste bizarro/estranho | Eliminar preconceitos, promover a recuperação em ambientes seguros. |
| [`starter-colony`](packages/starter-colony) | Colónia de ficção científica | Pontos de estrangulamento, zonas de emboscada |
| [`starter-ronin`](packages/starter-ronin) | Japão feudal | Passagens secretas, diversas funções de proteção. |
| [`starter-vampire`](packages/starter-vampire) | Terror vampiresco / Filme de terror com vampiros | Recursos sanguíneos, manipulação social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate na arena, apoio do público. |

---

## Documentação

| Recurso | Descrição |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crie a estrutura de um novo jogo – utilize uma ferramenta de linha de comando ou um modelo manual. |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Crie o seu próprio jogo combinando diferentes módulos do motor de jogo. |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco ações, informações gerais sobre os estados. |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Instruções passo a passo para criar o conjunto de combate, mapeamento de atributos e perfis de recursos. |
| [Handbook](docs/handbook/index.md) | Manual completo – todos os sistemas, mais 4 apêndices. |
| [Composition Model](docs/composition-model.md) | As seis camadas reutilizáveis e como elas se combinam. |
| [Examples](docs/examples/) | Exemplos de código TypeScript que podem ser executados (com verificação de tipos e testes de comportamento em ambiente de integração contínua) — festa mista por entidade, perfis partilhados, interação entre diferentes mundos, criação a partir do zero. |
| [Design Document](docs/DESIGN.md) | Análise aprofundada da arquitetura — fluxo de trabalho, realidade versus apresentação. |
| [Philosophy](PHILOSOPHY.md) | Mundos determinísticos, projeto orientado por evidências, IA como assistente. |
| [Changelog](CHANGELOG.md) | Histórico de lançamentos |

---

## Roteiro estratégico / Plano de ação / Cronograma

### Onde estamos agora

O tempo de execução da simulação, a estrutura da composição do combate e o caminho inicial para criação estão completos – 3613 testes em 193 arquivos, todos os 10 personagens iniciais em `buildCombatStack`, reprodução determinística com resultados idênticos em termos de bytes, pontuação completa das decisões da IA e um comando de estrutura na linha de comandos. **A versão 2.5 oferece a resolução de regras por entidade – o principal recurso dos Perfis de Plug-in: um lutador do tipo `might` e um místico do tipo `will` resolvem o combate em uma única luta, cada um lendo as estatísticas através do seu próprio mapeamento.**

**Lançamento recente (v2.3.3 – v2.5.0):**
- v2.3.3 – v2.3.7 — Validação do artefato para o utilizador, reforço do conjunto de combate, todos os 10 personagens iniciais em `buildCombatStack`, modelo inicial publicado, CLI `create-starter`
- v2.4.0 — Combate em grupo (ataque/cura/buff/reviver direcionado a aliados/inimigos, área de efeito), sistema de efeitos de estado (modificadores + dano ao longo do tempo/cura ao longo do tempo + gatilhos reativos), fase 1 dos perfis plug-in, conteúdo `validate`/`scaffold` CLI
- **v2.5.0 — Resolução de regras por entidade (combate com estilos de jogo mistos), o carregador `applyProfile` + habilidades por entidade, modelos de perfil + CLI `profile` e uma revisão completa da saúde (correção para reprodução idêntica em bytes, reforço da correção, implementação de critérios de qualidade)**

### Próximo(a) / Seguinte

- Modo multijogador – dois jogadores *humanos* partilham um único mundo (uma camada de rede, intencionalmente adiada; perfis partilhados controlados por um único comando ficam disponíveis hoje em [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Substituições de fórmulas serializáveis – ajuste das fórmulas por perfil (pendente da criação de uma DSL para fórmulas; os perfis contêm mapeamentos de estatísticas, e não funções anónimas)
- Sincronização da documentação da API – garantir que todas as páginas do manual refletem as APIs da versão 2.5

### Destino: Perfis de plug-ins

O objetivo final do motor é criar **perfis definidos pelo utilizador** – pacotes portáteis que podem ser integrados em qualquer jogo. Um perfil inclui um mapeamento de atributos, comportamento dos recursos, etiquetas de viés da IA e habilidades, tudo num único pacote importável. A partir da versão 2.5, cada entidade num determinado mundo pode ter o seu próprio perfil e resolver os combates individualmente – um guerreiro com alta capacidade física (`might`) e um místico com forte força de vontade (`will`) podem fazer parte do mesmo grupo, cada um contribuindo com o seu próprio estilo de jogo.

O esquema, o carregador `applyProfile`, a resolução de capacidades por entidade e a validação entre perfis já foram implementados. O que resta é o modo multijogador — que permite que dois jogadores *humanos* (e não apenas duas entidades) compartilhem um mundo —, o qual envolve uma camada de rede. Consulte [Roteiro do Perfil](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) para obter informações sobre o design.

---

## Filosofia

O motor de IA para jogos de RPG é baseado em três ideias principais:

1. **Mundos determinísticos** — os resultados da simulação devem ser reproduzíveis.
2. **Design orientado por evidências** — a mecânica do mundo deve ser testada através de simulações.
3. **IA como assistente, não como autoridade** — as ferramentas de IA ajudam a gerar e avaliar projetos, mas não substituem os sistemas determinísticos.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obter a explicação completa.

---

## Segurança

O motor principal é uma **biblioteca de simulação exclusivamente local**: sem telemetria, sem rede, sem informações confidenciais. Os arquivos são salvos em `.ai-rpg-engine/` apenas quando solicitado explicitamente. A camada de IA **opcional** (`@ai-rpg-engine/ollama`) se comunica com um daemon Ollama **local**; sua opção `webfetch` (para RAG) é o único caminho de comunicação externa e é restrita por uma proteção contra SSRF (bloqueia loopback/link-local/CGNAT/metadados da nuvem e equivalentes IPv6 tunelados) — você nunca acessa, a menos que o invoque. Consulte [SECURITY.md](SECURITY.md) para obter detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
