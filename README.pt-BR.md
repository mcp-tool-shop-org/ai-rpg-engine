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

- Uma **biblioteca de módulos** — mais de 30 módulos do motor que abrangem combate, percepção, cognição, facções, rumores, movimentação, companheiros e muito mais.
- Um **conjunto de ferramentas de composição** — `buildCombatStack()` configura o combate em cerca de 7 linhas; `new Engine({ modules })` inicia o jogo.
- Um **ambiente de execução de simulação** — ciclos determinísticos, registros de ações reproduzíveis, gerador de números aleatórios com semente definida.
- Um **estúdio de design de IA** (opcional) — estrutura básica, análise crítica, análise de equilíbrio, ajuste, experimentos via Ollama.
- Uma **camada opcional no livro-razão** — `@ai-rpg-engine/ledger-adapter` garante que a moeda e os itens negociáveis de um jogo sejam suportados por tokens reais da **testnet** XRPL, liquidados em pontos de verificação, totalmente fora do núcleo determinístico (opcional; uma execução é idêntica sem ele).

## O Que Isso Não É

- Não é um jogo completo — ele oferece 10 mundos iniciais jogáveis que você pode usar como exemplos e testar hoje mesmo, e o motor é o conjunto de ferramentas com o qual você cria seu *próprio* jogo.
- Não é um motor gráfico — ele gera eventos estruturados, não pixels.
- Não é um gerador de histórias — ele simula mundos; a narrativa emerge da mecânica.

---

## Estado atual (versão 3.3.0)

**O que funciona e foi testado:**

*   Motor principal: estado do mundo, eventos, ações, ciclos de jogo, repetição — estável desde a versão 1.0; repetição determinística com bytes idênticos (contador de ID por instância, gerador de números aleatórios inicializado).
*   Sistema de combate: 5 ações, 4 estados de combate, 4 estados de engajamento, interceptação de companheiros, fluxo de derrota, táticas de IA.
*   Habilidades: custos, tempos de recarga, verificações de atributos, efeitos tipificados, vocabulário de status com 11 tags, seleção consciente da IA.
*   **Combate em grupo (v2.4):** direcionamento de aliados (cura/buff/reviver), filtragem de área de efeito para amigos/inimigos, seletores de alvos — um curandeiro pode curar um companheiro; a área de efeito do inimigo poupa os aliados.
*   **Efeitos de status (v2.4):** modificadores passivos de atributos afetam o combate, DoT/HoT determinísticos com base no contador de ciclos, gatilhos reativos com profundidade limitada (espinhos/reflexo).
*   **Perfis de plug-in — resolução de regras por entidade (v2.5):** um lutador "poderoso" e um místico "inteligente" resolvem o combate em uma luta, cada um lendo os atributos através de seu próprio mapeamento. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` anexa um perfil (mapeamento de atributos, pools de recursos, habilidades por entidade); `buildProfile()`, `validateProfileSet()` (IDs duplicados rejeitados), 10 modelos derivados iniciais e um comando CLI "profile".
*   **Ciclo de jogo jogável ("run") (v2.6):** o jogo final é real, não uma demonstração — os inimigos agem com base em seus próprios perfis de intenção de IA ("agressivo"/"cauteloso"/"territorial"/"calculista"), uma luta termina em vitória ou derrota, você pode salvar e retomar, e as habilidades e a experiência estão no menu de ações. `run <path>` carrega um jogo que você preparou. Interface do usuário final composta com um HUD fácil de visualizar e cores acessíveis (respeita `NO_COLOR` / não-TTY).
*   **Estúdio de design de IA fornecido como seu próprio comando "ai" (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — prepara, critica e equilibra o conteúdo em relação a um modelo Ollama local.
*   Camada de decisão unificada: combate + pontuação de habilidades combinados em uma única chamada (`selectBestAction`).
*   Todos os 10 mundos iniciais usam `buildCombatStack()` — a estrutura comprovada de composição.
*   API de configuração da cognição (`cognition: CognitionCoreConfig | false`) para ajuste da IA por mundo inicial.
*   Taxonomia de tags e utilitários de validação para criação de conteúdo.
*   **O mundo reage (v2.7):** mortes acumulam calor e corroem a segurança do distrito; um ciclo mundial por rodada gera pressões ocultas que surgem como rumores ("Sussurros chegam até você..."), aumentam e desaparecem com consequências; as ~30 composições de encontros criadas são ativadas na entrada da zona em todos os 10 mundos iniciais — determinístico por semente, distritos mais sangrentos geram mais, peças-chave do chefe protegidas.
*   **Uma razão para retornar (v2.7):** um ciclo de missão mínimo no esquema já lançado — as missões oferecem gatilhos, rastreiam objetivos de morte/alcance/progresso e pagam experiência e itens exatamente uma vez; quatro missões criadas, uma tela "Diário", momentos da missão na narrativa da rodada.
*   **Equipamento afeta o combate (v2.7):** `equip`/`unequip` movem números reais através da camada de status que as fórmulas de combate já leem — nenhuma alteração no código de combate; tridente e rede do gladiador são conectados de ponta a ponta com um delta de chance de acerto fixo para teste.
*   **Ciclos de jogo com semente (v2.7):** cada nova sessão imprime sua semente com o comando exato de repetição; `--seed <n>` reproduz uma sessão byte por byte; combate, resistência, habilidade e rolagens de táticas consomem todos a semente do mundo — e os finais leem o jogo que você realmente jogou (calor ao vivo, pressões, acúmulos de facções, nível do jogador).
*   **`buildWorldStack()` (v2.7):** a estrutura de composição estratégica além de `buildCombatStack()` — uma única chamada monta o ambiente, as facções, os rumores, os distritos, as consequências da derrota, os encontros e as missões; mais a tela "Ledger do Diretor", um inspetor de simulação com `AI_RPG_DEBUG=1`, `inspect-save` restrito pelas mesmas autoridades que Continuar e uma junção de migração de salvamento no caminho de restauração lançado.
*   **Atue na economia viva (v2.8):** `createEconomyCore` inicializa uma economia por distrito no carregamento do pacote e a executa em cada rodada; um novo verbo "vender" define os preços dos itens através de `computeItemValue` (escassez / facção / proveniência / contrabando) e altera o suprimento local. Uma única linha de código ativou cinco sistemas que foram lançados inativos na v2.7 — a visão geral do mercado + pontuação de facções do diretor, o arco do mercador-príncipe no final do jogo e o gatilho de colapso e quatro tipos de pressão econômica. **Apenas venda neste ciclo** (compra → v2.9).
*   **Companheiros (v2.8):** um verbo "recrutar" constrói um grupo — estado, tags e facção, para que um companheiro lute *com* você; o combate do companheiro usa a mecânica de interceptação do núcleo de combate (inativo até que `isAlly` seja definido), os companheiros reagem com moral e podem partir, e o recrutamento aciona sete consumidores em espera — a chamada de rolos dos COMPANHEIROS no final, direcionamento de grupo, objetivos de agência NPC, missões de favor e a seção GRUPO do Diretor. **Interceptação passiva neste ciclo** (turnos independentes → v2.9).
*   **O diretor lê todo o tabuleiro (v2.8):** uma nova seção EQUIPAMENTO no Ledger (atrás da dependência cli→proveniência de equipamento), um trailer final RESUMO DO DIRETOR, as seções VISÃO GERAL DO MERCADO + GRUPO agora alimentadas por produtores ao vivo e estabilidade do distrito + tom econômico na seção DISTRITOS do final.
*   **A outra metade da economia (v2.9):** um verbo "comprar" completa o ciclo — estoque do mercador oferecido por distrito em granularidade de categoria de suprimento (o nível de suprimento *é* o sinal de reabastecimento), com preços através do mesmo pipeline `computeItemValue` que "vender", mais uma diferença de compra/venda para que não haja viagem de ida e volta sem risco. E a criação ganha vida: `createCraftingCore` registra `salvar`/`criar`/`reparar`/`modificar` nas tabelas de receita criadas, acendendo as seções MATERIAIS + RECEITAS do Diretor que foram lançadas inativas.
*   **Companheiros fazem seus próprios turnos (v2.9):** o limite de interceptação passiva da v2.8 torna-se o teto — os companheiros recrutados agem independentemente a cada rodada através do consultor `selectBestAction` anteriormente não utilizado, com um viés de combate por função para que um lutador e um estudioso lutem de forma diferente, interceptação entre companheiros e HP do grupo na linha GRUPO do Diretor. Os pacotes sem companheiros permanecem byte a byte idênticos (o portão de festa vazia preserva a repetição da semente-0).
*   **A camada social, conectada de ponta a ponta (v2.9):** quatro verbos de alavancagem — `subornar`, `intimidar`, `pedir`, `semear` (rumor) — escrevem globais reais de reputação / alerta / calor que negociam os preços e os portões de facção já lidos, e `semear` acende todo o módulo de rumores do jogador + a seção RUMORES SOBRE VOCÊ do Diretor. A *economia* de alavancagem que as financia também está conectada: completar uma oportunidade agora concede a alavancagem que sempre narrou, para que os verbos sejam genuinamente obtidos no jogo.
*   **Oportunidades, o ciclo de vida completo (v2.9):** um gerador por rodada oferece contratos/recompensas/favores pontuados em relação ao estado mundial ativo; você `aceita`, então `completa` ou `abandona`; ignorar uma até seu prazo agora tem consequências (consequências do vencimento) e completar o favor de um companheiro move a moral desse companheiro. Os arcos de ascensão de poder e mercador-príncipe no final do jogo leem as oportunidades que você realmente resolveu.
*   **Paridade de conteúdo em todos os dez mundos iniciais (v2.9):** fiação de equipamentos, missões, companheiros recrutáveis e um saldo inicial de moedas lançados para cada mundo inicial que não os tinha — os dez mundos agora compartilham uma superfície de recursos uniforme e totalmente iluminada (o equipamento era apenas de gladiador; as missões eram apenas de fantasia/zumbi; cinco mundos foram lançados com `recrutar` sem ninguém para recrutar). Além disso, um validador de conteúdo estrutural que detecta um ID de item digitado incorretamente em todas as superfícies de referência e slots de salvamento com vários pontos de verificação com `--checkpoint`/`--list-checkpoints`.
*   **NPCs vivos, realmente vivos (v3.0):** o produtor persistente de agência NPC acende a seção **PESSOAS** do Diretor — NPCs nomeados (um personagem de história criado por mundo inicial, mais todos os companheiros que você recruta) carregam objetivos, relacionamentos de confiança/medo/ganância/lealdade, um livro de obrigações e cadeias de consequências. `runNpcAgencyTick` é executado a cada rodada, restrito para que um mundo sem NPCs nomeados permaneça byte a byte idêntico à repetição herdada. Acender o produtor também acendeu os pontos de interrupção de partida do companheiro e as duas regras inativas de geração de oportunidades (objetivo NPC + obrigação) e os perfis/obrigações npc no final — o fio foi testado verde, mas inerte no conteúdo lançado até que uma auditoria da Fase 9 detectou, então a correção lança um NPC nomeado criado em cada mundo inicial.
*   **A superfície social completa (v3.0):** os quatro verbos de alavancagem tornam-se vinte e cinco — os grupos de diplomacia e sabotagem se registram (21 subverbos adicionais), acendendo as reações do companheiro anteriormente escuras `alavancagem-diplomacia` / `alavancagem-sabotagem`; 19 aparecem no menu numerado (preço + tempo de recarga + reputação restrita). As condições e os efeitos do diálogo agora leem e escrevem o estado social (alavancagem / reputação / relacionamento NPC). E a renda de alavancagem passiva (`tickLeverage` / `computeLeverageGains`) goteja influência da reputação e concede favor / chantagem / legitimidade da experiência e dos marcos — para que a camada social ganhe *entre* as oportunidades, não apenas na conclusão.
*   **Economia com sabor de gênero (v3.0):** o estoque do mercador e as receitas de criação agora resolvem tabelas de gênero por mundo inicial (sete de dez mundos iniciais carregam conteúdo de gênero criado; três voltam para o universal, honestamente) — através das mecânicas de compra/criação, a exibição no menu numerado e a seção RECEITAS do Diretor, tudo derivado da mesma chave de conjunto de regras para que a exibição e as mecânicas concordem. `reparar` e `modificar` são agora linhas do menu numerado (pareamento item × receita) e as oportunidades de "escolta" geram um portão de viagem protetora em um distrito perigoso.
*   **O final lê a alavancagem que você ganhou (v3.0):** os finais da campanha `vitória`, `mestre das marionetes` e `aposentadoria tranquila` — há muito restritos à influência / chantagem / legitimidade que a camada do final lia como zero codificado — agora são alcançáveis através do armazenamento real de alavancagem que toda a economia social escreve. A partida do companheiro também é alcançável, por meio de pontos de interrupção da agência NPC e um fallback de limite inferior de moral.
*   **CLI de desenvolvimento `audit-content` (v3.0):** um comando de auditoria de conteúdo para desenvolvedores (irmão de `validate`, distinto do Ledger do Diretor voltado para o jogador) que executa os seis formatadores de diretor de encontro / chefe / combate em um pacote.
*   **Suprimento inicial com sabor de gênero — o lançamento da v3.0, entregue (v3.1):** `economyGenre` passa a chave do conjunto de regras de cada mundo inicial através de `buildWorldStack` → `createEconomyCore`, para que um distrito agora gere seu perfil `GENRE_SUPPLY_DEFAULTS` de gênero (cyberpunk tem muito componentes / contrabando, fantasia tem escassez de medicina) em vez de uma linha de base universal plana — o suprimento inicial que a VISÃO GERAL DO MERCADO do Diretor e as entradas do final já leem. Sete de dez mundos iniciais carregam um perfil de gênero; três voltam para a linha de base, honestamente. Um campo separado de `tradeGenre` / `craftingGenre` para que os três possam divergir mais tarde.
*   **A superfície social, completa (v3.1):** `negar` e `enterrar-escândalo` — o par de manipulação de rumores que tem como alvo um rumor existente por ID em vez de uma facção — alcançam o menu numerado através de uma dimensão de pareamento de destino de rumor, fechando a superfície de vinte e um verbos (19 → 21 exibidos).
*   **Diálogo `obligation-exists`, conectado e alcançável (v3.1):** a condição de diálogo lê o livro de obrigações persistente de um NPC nomeado (`getPersistedNpcObligations`) — Irmão Aldric da fantasia, depois que ele lhe deve um favor por meio do jogo normal da agência NPC, desbloqueia uma escolha `chamar-para-favores` — um portão real onde a v3.0 deixou um stub sempre verdadeiro silencioso (uma sessão de jogo auditada na Fase 9 provou que é alcançável em um jogo real, não apenas verde na unidade).
*   **Reparo com sabor de gênero (v3.1):** cada mundo inicial com gênero cria uma receita de `reparar` exclusiva em sua tabela de gênero (fantasia `reparar-runa`, cyberpunk `reparar-nanite`, …), exibida por meio de `getAvailableRecipes` — o reparo agora tem sabor, não apenas é universal.
*   **Liquidação opcional do livro-razão XRPL (v3.2):** um novo pacote opcional `@ai-rpg-engine/ledger-adapter` vincula a camada comercial de propriedade do jogador — `moeda` → uma promissória, consumíveis → tokens fungíveis, o delta líquido de `comprar`/`vender` de um ponto de verificação → um **escrow de token XLS-85** — para o **testnet XRPL**, totalmente fora do núcleo determinístico. Nada em `core`/`modules` o importa e um jogo é byte a byte idêntico com ou sem ele (provado no loop de comerciante pirata real `createGame()`). Apenas testnet atrás de uma proteção impossível em código na rede principal, com um arquivo secreto ignorado pelo git, tentativas seguras de conservação, verificação de memorando on-chain e um fallback não ancorado; comprovadamente ao vivo de ponta a ponta no testnet (liquidação por meio de escrow de token → `reconciliar` em relação aos saldos e memorandos na cadeia). O equipamento NFT exclusivo é uma fatia posterior deliberada. Veja [O adaptador do livro-razão XRPL](#o-adaptador-do-livro-razão-xrpl-opcional).
*   `ai-rpg-engine create-starter <name>` — prepara um novo jogo (autônomo, executa fora do monorepo); comandos de conteúdo `validate` + `scaffold`; carrega pacotes de JSON.
*   Modelo inicial publicado no npm (`@ai-rpg-engine/starter-template`).
*   Conjunto de testes completo: **5633 testes** (determinístico em execuções repetidas; arquivos de teste verificados por tipo no CI; aplicação reforçada da cobertura).

**O que está incompleto ou precisa de melhorias:**
- O estúdio de criação de mundos com IA (camada Ollama) foi testado menos do que o núcleo da simulação e requer um daemon Ollama local; é totalmente opcional — o motor e o ciclo `run` não precisam de rede.
- A pilha de narração/áudio gera comandos de áudio determinísticos, mas **não há nenhum backend de áudio terminal** — nada emite som; os comandos são um ponto de integração para uma interface gráfica ou incorporação web.
- O modo multijogador (dois jogadores humanos compartilhando um mundo) **não** foi implementado — é uma camada de rede, deliberadamente fora do escopo; atualmente, os perfis têm como alvo um único controlador.
- `replay --replay` restaura o arquivo salvo em vez de ress simular — e após a v2.9, essa é a direção **definida**, não apenas um adiamento: `Engine.serialize()` já é um snapshot completo do estado que comprovadamente funciona, enquanto a ressimulação teria que rastrear o estado do mundo/evento que reside fora do registro de ações. A v2.9 inclui slots de salvamento com vários pontos de verificação nesse caminho de restauração comprovado; uma ressimulação baseada em eventos não está planejada.
- A v3.1 encerrou os três limites definidos na v3.0 — o **estoque inicial** do gênero, as receitas de *reparo* específicas do gênero e a interface do menu `deny` / `bury-scandal` agora estão implementadas. O único limite que permanece é que essas novas receitas de reparo do gênero contêm um `statDelta` definido (um pequeno bônus de atributo) que `resolveRepair` ainda não aplica — o reparo *restaura*, `modify` *atualiza* — portanto, o reparo como atualização está marcado no código e será **adiado para a v3.2/v3.3** como uma mecânica deliberada, e não um campo inerte silencioso. E `obligation-exists` é lançado com uma demonstração definida (Irmão Aldric); a condição está ativa para que os criadores de conteúdo possam usar mais diálogos.
- A documentação é extensa, mas nem todas as páginas do manual refletem as APIs mais recentes.

---

## Como se parece

A interface do usuário do terminal incluída compõe cada turno em seções rotuladas — cena, status, log e ações — com uma visão geral (HUD). A saída é texto simples por padrão e adiciona cores semânticas em um TTY (dano vermelho, cura verde, rejeições amarelas), respeitando `NO_COLOR` e pipes não-TTY; cada dica também está presente no texto, nunca apenas na cor.

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

## Instalação e execução

Jogue um mundo inicial ou crie seu próprio jogo a partir do terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

O ciclo `run` é uma sessão real de turnos: os inimigos agem com base em seus próprios perfis de IA, as habilidades e a experiência estão no menu, você pode salvar e retomar, e uma luta termina em vitória ou derrota. Cada jogo é determinístico e reproduzível.

Opcionalmente, o estúdio de design de IA é instalado como seu próprio comando:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

O estúdio se comunica com um daemon [Ollama](https://ollama.com) local — execute `ollama serve` e `ollama pull qwen2.5-coder` primeiro. É totalmente opcional; o motor e o ciclo `run` não precisam de rede.

Uma imagem de contêiner é publicada no GHCR como `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` para CI e execuções em sandbox.

---

## Início Rápido

Prefere criar seu próprio jogo em código? Componha o motor a partir de módulos:

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

## O adaptador de livro-razão XRPL (opcional)

`@ai-rpg-engine/ledger-adapter` é um pacote **opcional** que vincula a camada comercial **de propriedade do jogador** de um jogo — o saldo de `coin` e o inventário consumível que os verbos `buy`/`sell` do `trade-core` já manipulam — à **testnet XRPL**, para que esses ativos possam ser lastreados por tokens reais no livro-razão e liquidados em pontos de verificação. Um adaptador ausente é exatamente o motor offline que está disponível atualmente.

**A invariante do determinismo (o objetivo principal).** O adaptador é um *canal secundário*, nunca parte da simulação:

- Ele **nunca é invocado dentro do ciclo determinístico** — apenas em **pontos de verificação** (salvar, entrada na cidade/mercado, fim do capítulo).
- Nada em `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` o importa (sua única dependência do motor é um `import type` em tempo de compilação).
- **Uma execução é idêntica em bytes com ou sem ele.** Um teste de firewall executa o loop real do comerciante `starter-pirate` `createGame()` em dois motores — um com o adaptador habilitado e liquidando em um ponto de verificação — e afirma que os dois mundos são profundamente iguais. A reprodução da semente 0 permanece inalterada.

**Níveis de integração — um jogo o incorpora tão profundamente quanto seu design desejar.** O firewall é uma *fronteira do determinismo*, não uma regra anti-integração; a invariante acima se mantém em todos os níveis:

| Nível | O que depende do adaptador | Se encaixa |
|-------|-----------------------------|------|
| **L0 — External observer** | Nada dentro do jogo; o adaptador é anexado externamente em pontos de verificação e o jogo não tem conhecimento disso. | Adaptação de um jogo existente (a demonstração pirata lançada). |
| **N1 — Pontos de verificação orientados pelo jogo** | O próprio fluxo de salvamento/cidade/progressão meta do jogo chama o adaptador em momentos definidos. | Um jogo que deseja momentos deliberados no livro-razão. |
| **L2 — Ledger-native design** | A economia ou identidade do jogo é projetada *em torno* da propriedade na cadeia (emissor persistente, mercados reais). | Um jogo de comerciante com foco no livro-razão. |

A distinção que mantém a reprodução segura **não** é "qual pacote importa o adaptador", mas sim "a chamada está dentro do ciclo". Um pacote de jogo pode importar e acionar o adaptador livremente, desde que cada chamada ocorra em um ponto de verificação fora do loop de reprodução orientado pela semente.

**Três modos de jogo.** `offline` (padrão — sem cadeia, o motor como está lançado) · `ledger` (moedas/itens lastreados por saldos da testnet, liquidados em pontos de verificação) · `diary` (jogue offline e, em seguida, ancore o hash do estado da execução no livro-razão para um recibo à prova de adulteração).

**O que está no livro-razão.** `coin` → uma promessa de moeda emitida sobre uma linha de confiança; itens consumíveis → tokens fungíveis; o delta líquido de negociação de um ponto de verificação → uma transferência liquidada por meio do **escrow de token XLS-85**. Equipamentos exclusivos como NFTs são uma etapa posterior deliberada. A economia abstrata do distrito (`economy-core`) *não* é alterada — permanece uma simulação pura.

**Mecanismos de segurança.** Somente testnet, com uma proteção estrutural **impossível na mainnet em código** (não uma flag de configuração); as sementes da carteira estão em um arquivo secundário de segredos ignorado pelo Git, nunca no arquivo de salvamento; a liquidação é idempotente e segura para repetição; as provas verificam o **memo real na cadeia** (não a string do próprio motor); e se a cadeia estiver inacessível, a execução simplesmente continua, marcada como *não ancorada*.

**Comprovadamente funcional.** Uma execução real do comerciante `starter-pirate` — venda de um alfanje, compra de uma bala de canhão — é liquidada na testnet XRPL por meio de escrow de token e, em seguida, `reconcile()` confirma os saldos e memos no livro-razão em relação à economia do motor (a conservação se mantém para cada token). O livro-razão é uma família de sistemas diferente do motor, portanto, o motor não pode falsificá-lo — a reconciliação é um verificador externo genuíno. Somente testnet; os ativos são recibos com escopo no jogo, não títulos.

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
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opcional** — liquidação opcional na testnet XRPL para a camada comercial de propriedade do jogador (moeda/inventário/comércio), por meio de escrow de token XLS-85 em pontos de verificação, totalmente fora do núcleo determinístico. |

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
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolução de regras por entidade — combate com estilos de jogo mistos, `applyProfile`, modelos de perfil, o comando CLI `profile`. |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Liquidação opcional no livro-razão — o firewall do determinismo, níveis de integração L0/L1/L2, modos de jogo, mecanismos de segurança e a demonstração pirata comprovadamente funcional. |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco ações, informações gerais sobre os estados. |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Instruções passo a passo para criar o conjunto de combate, mapeamento de atributos e perfis de recursos. |
| [Handbook](site/src/content/docs/handbook/index.md) | Manual completo – todos os sistemas, mais 4 apêndices. |
| [Composition Model](docs/composition-model.md) | As seis camadas reutilizáveis e como elas se combinam. |
| [Examples](docs/examples/) | Exemplos de código TypeScript que podem ser executados (com verificação de tipos e testes de comportamento em ambiente de integração contínua) — festa mista por entidade, perfis partilhados, interação entre diferentes mundos, criação a partir do zero. |
| [Design Document](docs/DESIGN.md) | Análise aprofundada da arquitetura — fluxo de trabalho, realidade versus apresentação. |
| [Philosophy](PHILOSOPHY.md) | Mundos determinísticos, projeto orientado por evidências, IA como assistente. |
| [Changelog](CHANGELOG.md) | Histórico de lançamentos |

---

## Roteiro estratégico / Plano de ação / Cronograma

### Onde estamos agora

Ambas as estruturas de composição estão completas — 5494 testes em 280 arquivos, todos os 10 iniciadores em `buildCombatStack` **e** `buildWorldStack`, reprodução determinística e idêntica byte a byte com base nas sementes impressas, pontuação completa das decisões da IA e uma CLI que cria, executa, valida e inspeciona. A **versão 3.0 dá vida ao mundo: NPCs nomeados ganham vida com objetivos, relacionamentos de confiança/medo/ganância/lealdade, registros de obrigações e cadeias de consequências; a camada social gera passivamente e gasta em vinte e um novos verbos de diplomacia/sabotagem; a economia é específica para cada gênero por iniciador; e o poder que você ganha finalmente alcança os finais da campanha que ele controla. Uma auditoria da Fase 9 detectou uma falha no conteúdo enviado — a correção envia um NPC nomeado em cada iniciador.**

**Ciclo de lançamento recente (v2.4.0–v3.0.0):**
- v2.4.0 — Combate em grupo (ataque/cura/buff/revive direcionados a aliados, efeito de status), sistema de efeitos de status (modificadores + DoT/HoT + gatilhos reativos), Fase 1 dos Perfis plug-in, conteúdo `validate`/`scaffold` CLI.
- v2.5.0 — Resolução de regras por entidade (combate com estilos de jogo mistos), o carregador `applyProfile` + habilidades por entidade, modelos de perfil + CLI `profile` e uma passagem completa pela saúde.
- v2.6.0 — O comando `run` se tornou um jogo real: os inimigos agem com base em seus próprios perfis de IA, vitória/derrota, salvar/retomar, habilidades e XP no menu, o binário do estúdio `ai` e a pilha de narração.
- v2.7.0 — O mundo reage e há uma razão para retornar: calor → pressões → consequências narradas, encontros na entrada da zona, um loop de missão + Diário, equipamentos em combate, execuções reproduzíveis com sementes, entradas dinâmicas no final do jogo, `buildWorldStack`, o Livro do Diretor e uma junção de migração de salvamento.
- v2.8.0 — Aja sobre o mundo em que você vive: uma economia comercial dinâmica + verbo `sell`, companheiros que você recruta e luta ao lado e um Livro do Diretor lendo todo o cenário — um fio de escrita por sistema aceso ~12 consumidores que foram enviados sem problemas.
- v2.9.0 — Feche os loops: `buy` + estoque do comerciante e criação completam a economia; os companheiros fazem jogadas independentes; quatro verbos sociais (suborno / intimidação / petição / semente) são executados em uma economia de poder financiada por recompensas de oportunidade; as oportunidades se resolvem com expiração + consequências de favor/desfavor; e equipamentos, missões, recrutáveis e moeda inicial são distribuídos uniformemente para todos os dez iniciadores.
- **v3.0.0 — Dê vida ao mundo: o produtor de agência de NPC acende NPCs nomeados (objetivos / relacionamentos / registros de obrigações / cadeias de consequências) mais um NPC de história em cada iniciador; a superfície social cresce para 25 verbos (diplomacia + sabotagem) com renda passiva e diálogo que lê o estado social; estoque e receitas específicos para cada gênero por iniciador; os finais de poder (vitória / mestre das marionetes / aposentadoria tranquila) se tornam alcançáveis; linhas de menu de reparo/modificação, oportunidades de escolta e uma CLI de desenvolvimento `audit-content` — enviados por meio de uma auditoria da Fase 9 que detectou dois fios soltos que o conjunto de testes verde ocultava.**

### Próximo (a base v2.8)

- **NPCs vivos** — o produtor persistente de agência de NPC que acende a seção PEOPLE do Diretor: NPCs nomeados com objetivos, pontos de interrupção de relacionamento, registros de obrigações e cadeias de consequências, mais favor/desfavor da moral do companheiro e o caminho de risco de partida que o sistema de reação já carrega.
- Estoque e receitas de criação específicos para cada gênero (especificação por iniciador em vez do padrão universal que é enviado hoje), e a superfície do menu `repair`/`modify`.
- A próxima camada da economia de poder — renda passiva além das recompensas de oportunidade e verbos sociais além dos quatro enviados (grupos de diplomacia/sabotagem) — mais o vocabulário de condição/efeito do diálogo que lê o novo estado social.
- Multijogador — dois jogadores *humanos* compartilhando um mundo (uma camada de rede, deliberadamente adiada; perfis compartilhados com um único controlador são enviados hoje como [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Substituições de fórmula serializáveis — ajuste de fórmula por perfil (bloqueado em uma DSL de fórmula; os perfis carregam mapeamentos de estatísticas hoje, não closures).
- Sincronização da documentação da API — garantir que cada página do manual reflita as APIs mais recentes.

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

O motor principal é uma **biblioteca de simulação local:** sem telemetria, nenhuma rede, nenhum segredo. Os arquivos de salvamento vão para `.ai-rpg-engine/` apenas quando solicitado explicitamente. Duas camadas **opcionais** adicionam um caminho de saída e somente quando você as invoca:

- A camada de IA (`@ai-rpg-engine/ollama`) se comunica com um daemon Ollama **local**; seu `webfetch` opcional (para RAG) é restrito por uma proteção contra SSRF (bloqueia loopback/link-local/CGNAT/metadados da nuvem e equivalentes IPv6).
- A camada do livro-razão (`@ai-rpg-engine/ledger-adapter`) alcança a **testnet XRPL** — e apenas a testnet: uma proteção estrutural **impossível na mainnet em código** (não uma flag de configuração) rejeita qualquer host que não seja da testnet durante a construção. As sementes da carteira estão em um arquivo secundário de segredos ignorado pelo Git, nunca em um arquivo de salvamento, e o núcleo determinístico nunca importa o adaptador.

Consulte [SECURITY.md](SECURITY.md) para obter detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
