<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

Um conjunto de ferramentas TypeScript para criar simulações de RPG determinísticas. Você define atributos, escolhe módulos, conecta uma pilha de combate e cria conteúdo. O motor gerencia o estado, eventos, RNG, resolução de ações e tomada de decisões pela IA. Cada execução é reproduzível.

Este é um **motor de composição**, não um jogo completo. Os 12 mundos iniciais são exemplos — padrões que podem ser decompostos, dos quais você pode aprender e remixar. Seu jogo usa qualquer subconjunto do motor que você precisar.

---

## O que é

- Uma **biblioteca de módulos** — mais de 30 módulos do motor que abrangem combate, percepção, cognição, facções, rumores, travessia, companheiros e muito mais
- Um **conjunto de ferramentas de composição** — `buildCombatStack()` conecta o combate em cerca de 7 linhas; `new Engine({ modules })` inicia o jogo
- Um **ambiente de execução de simulação** — ciclos determinísticos, registros de ações reproduzíveis, RNG com semente
- Um **estúdio de design de IA** (opcional) — estrutura, crítica, análise de equilíbrio, ajuste, experimentos via Ollama
- Uma **camada opcional na blockchain** — `@ai-rpg-engine/ledger-adapter` garante que a moeda e os itens negociáveis de um jogo sejam respaldados por tokens reais da **testnet** XRPL, liquidados em pontos de verificação, totalmente fora do núcleo determinístico (opcional; uma execução é idêntica em termos de bytes sem ela)
- Um **host visual opcional** — `@ai-rpg-engine/sidecar` mais o cliente Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage). O motor ainda não gera pixels. O cenário desenha um porto dimétrico em proporção 2:1 e reproduz o áudio `felt`. A ocupação permanece como um ID de zona.

## O que não é

- Não é um único jogo completo — ele oferece 12 mundos iniciais jogáveis que você pode `run` hoje como exemplos, e o motor é o conjunto de ferramentas a partir do qual você compõe seu *próprio* jogo
- Não é um motor visual — ele gera eventos estruturados, não pixels. O desenho é trabalho do host (terminal ou Godot)
- Não é um gerador de histórias — ele simula mundos; a narrativa emerge da mecânica

---

## Status atual (v4.0.0)

**O que funciona e está testado:**
- O núcleo de simulação: ticks determinísticos, RNG com semente, replay idêntico byte a byte, e salvar e retomar
- Combate em grupo: alvos aliados, efeitos de status, ataques em área que poupam os aliados, e inimigos que agem segundo os próprios perfis de intenção de IA
- Um mundo que reage: facções, rumores, uma economia de comércio, companheiros, NPCs nomeados com objetivos próprios, e consequências pelo que você faz
- Todos os 12 mundos iniciais, jogáveis hoje com `run`
- Pacotes do World Forge, carregados como conteúdo
- O host Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage), por meio do sidecar, com sinais de áudio `felt`
- A camada de livro-razão na testnet do XRPL, ativada só se você escolher (opt-in)

**O que ainda está bruto ou incompleto:**
- O estúdio de design com IA (Ollama) é opcional e menos testado que o núcleo de simulação
- Não há backend de áudio no terminal: só o palco do Godot reproduz som
- O multijogador (dois jogadores humanos no mesmo mundo) não foi construído
- `replay --replay` restaura o salvamento em vez de simular de novo, por decisão de projeto
- Algumas páginas do manual estão atrás das APIs mais recentes

O histórico completo de versões está em [CHANGELOG.md](CHANGELOG.md).

---

## Como é

A interface de usuário terminal incluída compõe cada turno em seções rotuladas — cena, status, registro e ações — com uma interface HUD de fácil visualização. Por padrão, a saída é texto simples e adiciona cor semântica em um TTY (dano em vermelho, cura em verde, rejeições em amarelo), respeitando `NO_COLOR` e pipes não-TTY; cada sinal é transmitido no texto também, nunca apenas com cor.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Instalação e Jogo

Jogue um jogo inicial ou crie o seu próprio a partir do terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

O loop `run` é uma sessão real baseada em turnos: os inimigos agem com base em seus próprios perfis de IA, as habilidades e os pontos de experiência estão no menu, você pode salvar e retomar, e uma luta termina em vitória ou derrota. Cada jogo é determinístico e pode ser reproduzido.

Opcionalmente, o estúdio de design de IA é instalado como um comando separado:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

O estúdio se comunica com um daemon [Ollama](https://ollama.com) local — execute `ollama serve` e `ollama pull qwen2.5-coder` primeiro. É totalmente opcional; o motor e o loop `run` não precisam de rede.

Uma imagem de contêiner é publicada no GHCR como `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` para testes de CI e execução em ambiente isolado.

---

## Início Rápido

Prefere criar seu próprio jogo no código? Compile o motor a partir de módulos:

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

Consulte o [Guia de Composição](site/src/content/docs/handbook/57-composition-guide.md) para obter o fluxo de trabalho completo ou crie um novo jogo inicial:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Arquitetura

| Camada | Função |
|-------|------|
| **Núcleo de Execução** | Motor determinístico — estado do mundo, eventos, ações, ticks, RNG, reprodução |
| **Módulos** | Mais de 30 sistemas compostos — combate, percepção, cognição, facções, travessia, companheiros, etc. |
| **Conteúdo** | Entidades, zonas, diálogos, itens, habilidades, status — criados pelo autor |
| **Estúdio de IA** | Camada Ollama opcional — criação de protótipos, crítica, análise de equilíbrio, ajuste, experimentos |

---

## O adaptador do livro-razão XRPL (opcional)

`@ai-rpg-engine/ledger-adapter` é um pacote **opcional** que associa a
**camada de itens negociáveis pertencente ao jogador** de um jogo — o saldo de `coin` e o inventário de itens consumíveis que os verbos `buy`/`sell` do `trade-core` já movimentam — à **testnet XRPL**, para que
esses ativos possam ser lastreados por tokens reais registrados no livro-razão e liquidados em pontos de verificação.
A ausência de um adaptador corresponde exatamente ao motor offline que está disponível atualmente.

**A invariante do determinismo (o objetivo principal).** O adaptador é um *canal lateral*, nunca parte da simulação:

- Ele **nunca é invocado dentro do tick determinístico** — apenas em **checkpoints** (salvar, entrada na cidade/mercado, fim do capítulo).
- Nada em `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` o importa (sua única dependência do motor é um `import type` em tempo de compilação).
- **Uma execução é idêntica byte a byte, com ou sem ele.** Um teste de firewall executa o loop de comerciante `starter-pirate` `createGame()` real em dois motores — um com o adaptador habilitado e liquidando em um checkpoint — e afirma que os dois mundos são profundamente iguais. A reprodução com a semente 0 não é afetada.

**Níveis de integração — um jogo o incorpora tão profundamente quanto seu design desejar.** O firewall é uma *fronteira de determinismo*, não uma regra anti-integração; a invariante acima se mantém em todos os níveis:

| Nível | O que depende do adaptador | Se encaixa |
|-------|-----------------------------|------|
| **L0 — Observador externo** | Nada dentro do jogo; o adaptador é anexado externamente em checkpoints e o jogo não tem conhecimento disso. | Retrofit de um jogo existente (a demonstração de pirata lançada). |
| **L1 — Checkpoints acionados pelo jogo** | O próprio fluxo de salvamento/cidade/progressão meta do jogo chama o adaptador em momentos definidos. | Um jogo que deseja momentos de livro-razão deliberados. |
| **L2 — Design nativo no livro-razão** | A economia ou a identidade do jogo é projetada *em torno* da propriedade na cadeia (emissor persistente, mercados reais). | Um jogo de comerciante com foco no livro-razão. |

A distinção que mantém a reprodução segura **não** é "qual pacote importa o adaptador", mas "a chamada está dentro do tick". Um pacote de jogo pode importar e acionar o adaptador livremente, desde que cada chamada ocorra em um checkpoint fora do loop de reprodução acionado pela semente.

**Três modos de jogo.** `offline` (padrão — sem cadeia, o motor como é lançado) · `ledger` (moedas/itens respaldados por saldos do testnet, liquidados em checkpoints) · `diary` (jogue offline e, em seguida, ancore o hash do estado da execução no livro-razão para um recibo à prova de adulteração).

**O que está no livro-razão.** `coin` → uma promessa de moeda emitida em relação a uma linha de confiança;
itens consumíveis → tokens fungíveis; o saldo líquido de uma transação em um ponto de verificação → uma transferência liquidada por meio de um **escrow de token XLS-85**. Equipamentos exclusivos são enviados como **NFTs XLS-20**
(v3.3), com o crescimento de relíquias que aprimora os metadados de um NFT mutável no local por meio de
**XLS-46 `NFTokenModify`** — impulsionado por jogabilidade real a partir de v3.4. A economia abstrata do distrito (`economy-core`) *não* é afetada — permanece uma simulação pura.

**Medidas de segurança.** Apenas para testnet, com uma proteção estrutural **impossível em mainnet** (não uma flag de configuração); as chaves da carteira ficam em um arquivo secundário ignorado pelo Git, nunca no arquivo de salvamento; o liquidação é idempotente e segura em relação à conservação no caminho de repetição; as provas verificam o **memo real na cadeia** (não a string própria do motor); e, se a cadeia estiver inacessível, a execução simplesmente continua, marcada como *não ancorada*.

**Comprovadamente funcional.** Uma execução real de um comerciante `starter-pirate` — venda de um sabre, compra de uma bala de canhão — é liquidada na testnet XRPL por meio de um escrow de token e, em seguida, `reconcile()` confirma os saldos e os memos no livro-razão em relação à economia do motor (a conservação é válida para cada token). O livro-razão é uma família de sistemas diferente do motor, portanto, o motor não pode falsificá-lo — a reconciliação é uma verificação externa genuína. Apenas para testnet; os ativos são recibos com escopo de jogo, não títulos.

---

## Sistema de Combate

Cinco ações (ataque, defesa, desengajamento, proteção, reposicionamento), quatro estados de combate (defendido, desequilibrado, exposto, em fuga), quatro estados de engajamento (engajado, protegido, retaguarda, isolado). Três dimensões de atributos impulsionam todas as fórmulas, de modo que um duelista rápido joga de forma diferente de um lutador pesado ou um sentinela composto.

Os oponentes de IA usam pontuação unificada de decisão — as ações e habilidades de combate competem em uma única avaliação, com limites configuráveis para evitar o uso excessivo de habilidades marginais.

Os autores de pacotes usam `buildCombatStack()` para vincular o combate a um mapeamento de atributos, perfil de recursos e tags de viés. Consulte a [Visão Geral do Combate](site/src/content/docs/handbook/49a-combat-overview.md) e o [Guia do Autor do Pacote](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo do gênero, com custos, verificações de atributos, tempos de recarga e efeitos tipados (dano, cura, aplicação de status, limpeza). Os efeitos de status usam um vocabulário semântico de 11 tags com perfis de resistência/vulnerabilidade. As pontuações de seleção com reconhecimento de IA avaliam os caminhos auto/AoE/de alvo único.

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
| [`@ai-rpg-engine/core`](packages/core) | Tempo de execução de simulação determinística — estado do mundo, eventos, RNG, ticks, resolução de ações |
| [`@ai-rpg-engine/modules`](packages/modules) | Mais de 30 módulos compostos — combate, percepção, cognição, facções, rumores, travessia, companheiros, agência de NPC, mapa estratégico, reconhecimento de itens, oportunidades emergentes, detecção de arco, gatilhos de fim de jogo |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas e validadores canônicos para conteúdo do mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressão do personagem, ferimentos, marcos, reputação |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Seleção de arquétipo, geração de construção, equipamento inicial |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipamento, proveniência de itens e crescimento de relíquias — incluindo `item-chronicle-core`, o módulo opcional que registra o histórico do equipamento da jogabilidade real para que os itens obtenham epítetos e níveis |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memória entre sessões, efeitos de relacionamento, estado da campanha |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo de vida do rumor, mecânicas de mutação, rastreamento de disseminação |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Esquema do plano de narração, contratos de renderização, perfis de voz |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Agendamento de dicas, prioridade, atenuação, lógica de tempo de recarga |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifestos de pacotes de som, registro endereçável por conteúdo |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registro de pacotes, pontuação de rubrica, descoberta de pacotes |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Armazenamento endereçado por conteúdo para retratos, ícones, mídia |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Geração de retrato sem interface com provedores plugáveis |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Autoria de IA opcional — estrutura, crítica, fluxos de trabalho guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: execute jogos, crie modelos iniciais, inspecione salvamentos |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderizador de terminal e camada de entrada |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Início mercantil — o pacote de referência para o adaptador do livro-razão, sem dependência dele |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Mundo inicial de caçador de ladrões — perseguição como o loop e qual metade da cidade abrirá uma porta para você |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opcional** — liquidação opcional na testnet XRPL para a camada comercial de propriedade do jogador (moeda/inventário/comércio), por meio de um escrow de token XLS-85 em pontos de verificação, totalmente fora do núcleo determinístico |

### Exemplos de Início

Os 12 mundos iniciais são **exemplos de composição** — eles demonstram como combinar módulos do motor em jogos completos. Cada um mostra diferentes padrões (mapeamentos de atributos, perfis de recursos, configurações de engajamento, conjuntos de habilidades). Consulte o arquivo README de cada início para obter “Padrões Demonstrados” e “O que Copiar”.

| Início | Gênero | Padrões Principais |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasia sombria | Combate mínimo, orientado ao diálogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Recursos, funções de engajamento |
| [`starter-detective`](packages/starter-detective) | Mistério vitoriano | Socialmente orientado, com foco na percepção |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Naval + combate corpo a corpo, multizona |
| [`starter-zombie`](packages/starter-zombie) | Sobrevivência de zumbis | Escassez, recurso de infecção |
| [`starter-weird-west`](packages/starter-weird-west) | Faroeste estranho | Viés do pacote, recuperação de zona segura |
| [`starter-colony`](packages/starter-colony) | Colônia de ficção científica | Gargalos, zonas de emboscada |
| [`starter-ronin`](packages/starter-ronin) | Japão feudal | Passagens escondidas, múltiplas funções de protetor |
| [`starter-merchant`](packages/starter-merchant) | Mercantil | Obrigação como o loop, combate com preço como penalidade |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Perseguição | Caça a pessoas por dinheiro; a violência faz barulho, não é proibida |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiro | Recurso de sangue, manipulação social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate na arena, favor da multidão |

---

## Documentação

| Recurso | Descrição |
|----------|-------------|
| [Crie Seu Próprio Mundo Inicial](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crie um novo jogo — CLI ou rota de modelo manual |
| [Guia de Composição](site/src/content/docs/handbook/57-composition-guide.md) | Crie seu próprio jogo, combinando módulos do motor |
| [Perfis Plug-in](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolução de regras por entidade — combate com estilos de jogo mistos, `applyProfile`, modelos de perfil, a CLI `profile` |
| [Adaptador do Livro-Razão XRPL](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Liquidação opcional no livro-razão — o firewall de determinismo, níveis de integração L0/L1/L2, modos de jogo, mecanismos de segurança e a demonstração de pirata testada ao vivo |
| [Visão Geral do Combate](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco ações, estados em um piscar de olhos |
| [Guia do Autor do Pacote](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack passo a passo, mapeamento de atributos, perfis de recursos |
| [Clientes Visuais](site/src/content/docs/handbook/66-visual-clients.md) | Hosts do tipo "sidecar", carga "felt", porto dimétrico do Godot — a apresentação pode ser enganosa, a ocupação permanece como um ID de zona |
| [Manual](site/src/content/docs/handbook/index.md) | Manual abrangente — todos os sistemas, mais 4 apêndices |
| [Modelo de Composição](docs/composition-model.md) | As 6 camadas reutilizáveis e como elas se combinam |
| [Exemplos](docs/examples/) | Exemplos TypeScript executáveis (verificados por tipo + testados em comportamento no CI) — grupo misto por entidade, perfis compartilhados, entre mundos, do zero |
| [Documento de Design](docs/DESIGN.md) | Análise aprofundada da arquitetura — pipeline de ação, verdade versus apresentação |
| [Filosofia](PHILOSOPHY.md) | Mundos determinísticos, design orientado por evidências, IA como assistente |
| [Histórico de Lançamentos](CHANGELOG.md) | Histórico de lançamentos |

---

## Roteiro

### Onde estamos agora

As duas colunas de composição estão completas: os 12 mundos iniciais usam `buildCombatStack` **e** `buildWorldStack`, o replay é determinístico e idêntico byte a byte com sementes impressas, a pontuação de decisões da IA está completa e a CLI cria estruturas, executa, valida e inspeciona.

O histórico completo de versões está em [CHANGELOG.md](CHANGELOG.md).

### Próximo

O que resta é trabalho de ciclos posteriores:

- Uma trilha ambiente da família de tom próspero (a ponte de tom e o sorteio por zona já foram lançados; o CORE ainda não tem uma faixa-base próspera)
- Multijogador — dois jogadores *humanos* compartilhando um mundo (uma camada de rede, deliberadamente adiada; perfis compartilhados de um único controlador são lançados hoje como [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Substituições de fórmula serializáveis — ajuste de fórmula por perfil (bloqueado em uma DSL de fórmula; os perfis carregam mapeamentos de atributos hoje, não closures)

### Destino: Perfis Plug-in

O objetivo final do motor são **perfis definidos pelo usuário** — pacotes portáteis que se encaixam em qualquer jogo. Um perfil empacota um mapeamento de atributos, comportamento de recursos, tags de viés de IA e habilidades em uma única unidade importável. A partir de v2.5, as entidades em um mundo podem ter seus próprios perfis e resolver o combate por entidade — um lutador `might` e um místico `will` compartilham um grupo, cada um trazendo seu próprio estilo de jogo.

O esquema, o carregador `applyProfile`, a resolução de habilidades por entidade e a validação entre perfis são todos lançados. O que resta é o multijogador — permitir que dois jogadores *humanos* (não apenas duas entidades) compartilhem um mundo — que é uma camada de rede. Consulte [Roteiro do Perfil](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) para o design.

---

## Filosofia

O AI RPG Engine é construído em torno de três ideias:

1. **Mundos determinísticos** — os resultados da simulação devem ser reproduzíveis.
2. **Design orientado por evidências** — a mecânica do mundo deve ser testada por meio de simulação.
3. **IA como assistente, não autoridade** — as ferramentas de IA ajudam a gerar e criticar projetos, mas não substituem os sistemas determinísticos.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obter a explicação completa.

---

## Segurança

O motor principal é uma **biblioteca de simulação exclusivamente local**: sem telemetria, sem rede, sem informações confidenciais. Os arquivos de salvamento são armazenados em `.ai-rpg-engine/` apenas quando solicitado explicitamente. Duas camadas **opcionais** adicionam um caminho de saída, e apenas quando você as ativa:

- A camada de IA (`@ai-rpg-engine/ollama`) comunica-se com um daemon Ollama **local**; sua opção de adesão `webfetch` (para RAG) é restrita por um mecanismo de proteção contra SSRF (bloqueia loopback/link-local/CGNAT/metadados da nuvem e equivalentes tunelados via IPv6).
- A camada de registro (`@ai-rpg-engine/ledger-adapter`) acessa a **testnet XRPL** — e apenas a testnet: uma proteção estrutural **impossível de ser implementada na mainnet por meio de código** (não uma flag de configuração) rejeita qualquer host que não seja da testnet durante a construção. As chaves da carteira são armazenadas em um arquivo de segredos ignorado pelo Git, nunca em um arquivo de salvamento, e o núcleo determinístico nunca importa o adaptador.

Consulte [SECURITY.md](SECURITY.md) para obter detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
