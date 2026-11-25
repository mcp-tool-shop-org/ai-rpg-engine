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

# Motor de RPG com IA

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

## Status atual (v3.12.2)

**O que funciona e foi testado:**
- **Os pacotes World Forge não são mais rejeitados (v3.12.2):** o sistema de carregamento declara que as 13 chaves de nível superior que um pacote World Forge carrega (`connections`, `spawnPoints`, `playerTemplate` e mais dez) são conhecidas, mas não estão presentes no pacote, portanto, um pacote válido que as contenha será carregado e o relatório de carregamento listará cada uma como tendo sido descartada. Uma chave com erro de ortografia ainda será rejeitada pelo nome. Os hashes permanecem inalterados.
- **Servidor Godot (v3.12):** o componente `capabilities.audio` envia uma carga útil `felt` (IDs de cenas, elementos de sobreposição, falas, efeitos de interface) que nunca é submetida a hash — é negociada e aditiva, sendo totalmente omitida quando a funcionalidade está desativada, de modo que um cliente com correspondência exata permanece estável em termos de bytes. [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage) é o cliente Godot 4: TileMapLayer dimétrico 2:1, personagens Foundry com 8 direções, apresentação por meio de cliques em células, `move` ainda designa uma zona vizinha. Manual: [Clientes Visuais](site/src/content/docs/handbook/66-visual-clients.md).
- **Ajustes e profundidade (v3.11):** `bounty` é ativado novamente no conteúdo criado (a limpeza do ouvinte v3.10 separou as duas eliminações navais da Black Flag em 36 rodadas; a tolerância ao calor é essa lacuna medida, o rastro ainda são duas eliminações). Uma luta que termina porque alguém desistiu diz isso: `combat.encounter.cleared` carrega `outcome: 'victory' | 'retreat'` — não um segundo evento, não uma vitória passageira, não uma vitória registrada. Afiliação à facção tem três localizações honestas: `entity.faction` na pessoa, um registro mantido que se atualiza a partir dele e ainda armazena informações adicionais, e `CompanionState.originFaction` para que a guilda de onde vieram ainda possa interagir. A música da zona é reproduzida por `zoneId`; os efeitos sonoros respeitam os tempos de recarga; `/build` as gravações em etapas sobrevivem a uma falha; uma nova sessão CLI emite o evento de entrada na zona inicial, para que os MOMENTOS CHAVE mostrem o primeiro estado de espírito. 8356 testes.
- **O mundo alcança o jogador (v3.10):** dois ciclos de elementos geradores finalmente chegam aos sentidos do jogador. Todas as oito dicas da voz do narrador são apresentadas — a textura do NPC e a inclinação da facção enquadram o orador, a dica sobre o comportamento acompanha a linha do orador, a presença do grupo/pressão do mundo/oportunidades abertas encerram o enquadramento do diálogo como comentários, e o clima e os relatórios da situação do distrito juntam-se ao registo de eventos. O HUD, que está sempre ativo, recebe a linha do grupo. A honestidade no combate surge como um evento real: `combat.encounter.cleared` é disparado exatamente uma vez quando o último inimigo cai (um confronto mútuo é interpretado como derrota, a morte de um companheiro não mais indica triunfo e os nove ouvintes iniciais que anunciavam cada morte desaparecem), e é mapeado para o sinal de vitória através do apresentador por turno. A entrada na zona define a música de acordo com o tom — um distrito sombrio realmente soa sombrio — e o contrato de saída de voz é real: `NarrationPlan.asides` transmite fragmentos de diálogo exatamente uma vez, `SpeakerCue.emotion` transmite a dica sobre o comportamento literalmente, pronto para ser incorporado num sistema de conversão de texto em voz. Os clientes secundários veem a ingestão de pacotes `dropped[]`/`advisories` em `initialize`, os lotes guiados `/build` organizam cada etapa atrás de um consentimento em lote (com um recurso de desfazer compatível com CREATE e uma recusa que não pode esvaziar o portal), as facções estruturadas sobrevivem `emit-pack` e a identidade da facção é resolvida a partir do `faction` próprio da entidade, em todos os lugares onde antes era necessário um registo que nenhum pacote enviado preenche — revertendo o rastreamento de intrusos do distrito e reativando a propagação de rumores. Uma sessão jogada e2e fixa toda a superfície quadro a quadro, NO_COLOR byte a byte.
- **O pacote que você cria é o jogo que você joga (v3.9):** o estúdio agora cria tudo o que o motor utiliza — `create-ruleset`, `create-rule-profile` e `create-item-placement` juntam-se aos verbos de estrutura, e tanto os planos `/build` quanto o fim `ai scaffold-and-critique` resultam na emissão de `content/pack.json`. `applyContentPack` marca `playerId`/`locationId` de um pacote para um único jogador, define os valores base da reputação da facção e os registros de perfil de regras (mesclados, sem nunca apagar os do host) e carrega o manifesto e o conjunto de regras do pacote através de `extractSessionContent` — a receita JSON documentada para inicialização é corrigida e fixada por um teste completo. O diálogo ganha textura dinâmica: um NPC menciona o contrato que está realmente sobre a mesa, chegando com companheiros ou entrando em um distrito sombrio, e o conselheiro de jogabilidade diz uma frase direcionada ao jogador. Os registros de memória da campanha salvam os companheiros e os itens criados, as variantes de imagem mantêm suas restrições de identidade (com suporte LoRA), as posturas de rumores desaparecem e um efeito de vitória não encerra mais o tema da zona. 8042 testes.
- **A superfície hospedeira está no Engine (v3.8.1):** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, sidecar `listActions` + salvar/carregar, estúdio `emit-pack`, catálogos de pacotes JSON e `ruleProfiles`. Um anexo do Godot e um arranque JSON `--content` não copiam mais os componentes internos da CLI para criar essas funcionalidades.
- Motor principal: estado do mundo, eventos, ações, ciclos, reprodução — estável desde v1.0; reprodução determinística e idêntica em termos de bytes (contador de ID por instância, gerador de números aleatórios com semente).
- Sistema de combate: 5 ações, 4 estados de combate, 4 estados de interação, interceptação de aliados, sequência de derrota, táticas da IA.
- Habilidades: custos, tempos de recarga, verificações de atributos, efeitos específicos, vocabulário de status com 11 categorias, seleção adaptada à inteligência artificial.
- **Combate em grupo (v2.4):** seleção de aliados como alvo (cura/melhoria/ressurreição), filtragem de amigos/inimigos AoE, seleção de alvos — um curandeiro pode curar um companheiro de equipe; um inimigo AoE poupa os aliados.
- **Efeitos de estado (v2.4):** modificadores de atributos passivos que afetam o combate, DoT/HoT determinísticos ativados pelo contador de tempo, gatilhos reativos com limite de profundidade (espinhos/reflexo).
- **Perfis de plug-in — resolução de regras por entidade (v2.5):** um `might` lutador e um `will` místico resolvem um combate em uma única luta, cada um lendo as estatísticas através de seu próprio mapeamento. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` anexa um perfil (mapeamento de estatísticas, conjuntos de recursos, habilidades por entidade); `buildProfile()`, `validateProfileSet()` (IDs duplicados são rejeitados), 10 modelos derivados do inicial e um comando `profile` da linha de comando.
- **Ciclo de jogo completo `run` (v2.6):** o jogo final é real, não uma demonstração — os inimigos agem com base nos seus próprios perfis de inteligência artificial (`aggressive`/`cautious`/`territorial`/`calculating`; agora seis perfis pré-definidos, com `passive` e `follower`), uma luta termina em vitória ou derrota, pode guardar o progresso e retomá-lo, e as habilidades e pontos de experiência estão no menu de ação. `run <path>` carrega um jogo que você preparou. Interface de utilizador do jogo completa, com um HUD de fácil visualização e cores acessíveis (respeita `NO_COLOR` / não TTY).
- **O estúdio de design de IA é fornecido como um comando `ai` independente (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — cria a estrutura, avalia e equilibra o conteúdo em relação a um modelo Ollama local.
- Camada de decisão unificada: a avaliação de combate e de habilidades é combinada numa única chamada (`selectBestAction`).
- Todos os 12 mundos iniciais utilizam `buildCombatStack()` — a estrutura comprovada que serve de base para a composição.
- API de configuração de cognição (`cognition: CognitionCoreConfig | false`) para ajuste de IA por iniciador.
- Ferramentas de taxonomia e validação de etiquetas para a criação de conteúdo.
- **O mundo reage (v2.7):** as mortes acumulam efeitos negativos e diminuem a segurança do distrito; a cada rodada, o sistema gera pressões ocultas que se manifestam como rumores ("Sussurros chegam até você…"), intensificam-se e desaparecem, gerando consequências; as cerca de 30 composições de encontros criadas são ativadas quando o jogador entra em uma zona em qualquer um dos 10 pontos de partida — de forma determinística para cada semente, distritos mais perigosos geram mais encontros, e os chefes são protegidos.
- **Um motivo para retornar (v2.7):** um ciclo de missões mínimo no esquema já implementado há algum tempo — as missões são oferecidas quando determinados eventos ocorrem, registram o número de inimigos derrotados/objetivos alcançados/progresso e concedem experiência e itens apenas uma vez; quatro missões criadas, uma tela de **Diário** e momentos-chave das missões na narrativa da fase.
- **Equipamento em ação no combate (v2.7):** `equip`/`unequip` move números reais através da camada de status; as fórmulas de combate já as utilizam — nenhuma alteração no código de combate; o tridente e a rede do gladiador estão conectados de ponta a ponta com um delta de chance de acerto testado.
- **Execuções com semente (v2.7):** cada nova sessão imprime a sua semente juntamente com o comando exato para reproduzir a sessão; `--seed <n>` reproduz uma sessão byte a byte; os cálculos de combate, resistência, habilidade e táticas consomem todos a semente do mundo — e os finais refletem a sessão que você realmente jogou (nível de dificuldade, pressões, acumulação de facções, nível do jogador).
- **`buildWorldStack()` (v2.7):** o principal elemento de composição estratégica, ao lado de `buildCombatStack()` — uma única chamada reúne o ambiente, as facções, os rumores, os distritos, as consequências da derrota, os encontros e as missões; além da tela de estratégia **Director's Ledger**, um inspetor de simulação `AI_RPG_DEBUG=1`, `inspect-save`, que é controlado pelas mesmas autoridades que o Continue, e um ponto de migração de salvamento de módulos no caminho de restauração do jogo.
- **Atue na economia dinâmica (v2.8):** `createEconomyCore` cria uma economia por distrito no momento do carregamento e a atualiza a cada rodada; um novo `sell` verbo define os preços dos itens através de `computeItemValue` (escassez / facção / origem / contrabando) e altera a oferta local. Um único comando ativou cinco sistemas que geraram recursos em v2.7 — a visão geral do mercado e a pontuação das facções do Diretor, o arco final do mercador-príncipe e o gatilho do colapso, e quatro tipos de pressão econômica. **Venda apenas neste ciclo** (compra → v2.9).
- **Companheiros (v2.8):** um `recruit` verbo cria um grupo — estado, atributos e facção, de modo que um companheiro luta *com* você; o combate com companheiros utiliza a mecânica de interceptação do núcleo de combate (inativo até `isAlly` ser definido), os companheiros reagem com moral e podem partir, e o recrutamento ativa sete potenciais aliados — a lista final de COMPANHEIROS, o direcionamento do grupo, os objetivos da agência de personagens não jogáveis, as missões de favor e a seção PARTY do Diretor. **Interceptação passiva neste ciclo** (turnos independentes → v2.9)
- **O diretor analisa todo o painel (v2.8):** uma nova seção do REGISTO DE EQUIPAMENTOS (posterior à dependência de rastreamento da origem dos equipamentos), um trailer final da SÍNTESE DO DIRETOR, as seções de PANORAMA DO MERCADO e EVENTO, que agora recebem informações de produtores em tempo real, e a estabilidade do distrito e o tom econômico na seção DISTRITOS do final.
- **A outra metade da economia (v2.9):** um `buy` verbo completa o ciclo — o estoque do comerciante é oferecido por distrito, com granularidade por categoria de fornecimento (o nível de fornecimento *é* o sinal de reabastecimento), com preços definidos através do mesmo `computeItemValue` processo que o `sell`, mais uma margem de compra/venda, para que não haja risco de transação sem lucro. E a criação ganha vida: `createCraftingCore` registra `salvage`/`craft`/`repair`/`modify` nas tabelas de receitas criadas, ativando as seções de MATERIAIS + RECEITAS do Diretor, que antes estavam inativas.
- **Os companheiros atuam em turnos individuais (v2.9):** o nível de interceptação passiva de v2.8 torna-se o teto — os companheiros recrutados atuam de forma independente em cada rodada através do conselheiro `selectBestAction`, que não era utilizado anteriormente, com uma tendência de combate específica para cada função, de modo que um lutador e um estudioso lutem de forma diferente, ocorre a interceptação entre companheiros e os pontos de vida do grupo são exibidos na linha PARTY do Diretor. Os grupos sem companheiros permanecem idênticos (o portal de grupo vazio preserva o legado da reprodução com a semente 0).
- **A camada social, conectada de ponta a ponta (v2.9):** quatro verbos que amplificam o impacto — `bribe`, `intimidate`, `petition`, `seed` (boato) — geram reputação real/alertas/notícias relevantes que afetam os preços e as alianças, e `seed` ativa todo o módulo de boatos dos jogadores + a seção «BOATOS SOBRE VOCÊ» do Diretor. A *economia* que financia esses elementos também está interligada: ao completar uma oportunidade, o jogador obtém o benefício que sempre foi prometido, de modo que os verbos podem ser realmente desbloqueados durante o jogo.
- **Oportunidades, o ciclo de vida completo (v2.9):** um gerador por rodada oferece contratos/recompensas/favores que são avaliados com base no estado atual do mundo; você `accept`, depois `complete` ou `abandon`; ignorar um deles até o prazo final agora tem consequências (efeitos negativos após o prazo), e completar um favor para um companheiro aumenta o moral desse companheiro. As fases finais, com o aumento do poder e as tramas do príncipe mercador, refletem as oportunidades que você realmente resolveu.
- **Consistência do conteúdo em todos os dez mundos iniciais (v2.9):** fiação dos equipamentos, missões, companheiros recrutáveis e um saldo inicial de moedas, implementados em todos os mundos que não os possuíam — os dez mundos agora compartilham uma superfície de jogo uniforme e totalmente iluminada (os equipamentos eram exclusivos dos gladiadores; as missões eram exclusivas dos gêneros fantasia/zumbi; cinco mundos foram lançados com `recruit` sem nenhum personagem para recrutar). Além disso, um validador estrutural de conteúdo que detecta erros de digitação nos IDs dos itens em todas as superfícies de referência e vários pontos de salvamento com `--checkpoint`/`--list-checkpoints`.
- **NPCs com vida, realmente vivos (v3.0):** o produtor persistente de agência de NPCs acende a seção **PESSOAS** do Diretor — os NPCs nomeados (um personagem de história criado por partida, mais todos os companheiros que você recruta) têm objetivos, relações de confiança/medo/ganância/lealdade, um registro de obrigações e cadeias de consequências. `runNpcAgencyTick` é executado a cada rodada, com restrições para que um mundo sem NPCs nomeados permaneça idêntico à versão original. Ao acender o produtor, também são ativados os pontos de partida para a mudança de favor dos companheiros, duas regras inativas de geração de oportunidades (objetivo do NPC + obrigação) e o npcProfiles/npcObligations do final do jogo — o código foi testado e funcionou, mas permaneceu inativo no conteúdo lançado até que uma auditoria da Fase 9 o detectasse, então a correção inclui um NPC nomeado criado em cada partida.
- **A totalidade da camada social (v3.0):** os quatro verbos de influência transformam-se em vinte e cinco — os grupos de diplomacia e sabotagem registam (mais 21 subverbos), ativando as reações de `leverage-diplomacy` / `leverage-sabotage`, que antes estavam inativas; dezenove aparecem no menu numerado (afeto + tempo de espera + reputação como requisitos). As condições e os efeitos do diálogo agora leem e escrevem o estado social (influência / reputação / relação com personagens não jogáveis). E a influência passiva (`tickLeverage` / `computeLeverageGains`) gera gradualmente impacto a partir da reputação e concede favor / chantagem / legitimidade a partir da experiência e dos marcos alcançados — portanto, a camada social gera oportunidades *entre* as tarefas, e não apenas ao concluí-las.
- **Economia com elementos de gênero (v3.0):** o estoque dos mercadores e as receitas de criação agora são determinados pelas tabelas de gênero específicas de cada personagem inicial (sete dos dez personagens iniciais possuem conteúdo de gênero definido; os três restantes utilizam conteúdo universal). Isso se aplica aos mecanismos de compra/criação, à exibição do menu numerado e à seção RECIPES do Diretor, tudo interligado a partir da mesma base de regras, para garantir que a exibição e os mecanismos estejam em sincronia. `repair` e `modify` são agora linhas numeradas do menu (pares de item e receita), e `escort` oportunidades surgem em um portal que permite viajar com segurança por um distrito perigoso.
- **A fase final considera a influência que você conquistou (v3.0):** os finais de campanha `victory`, `puppet-master` e `quiet-retirement` — que antes dependiam de influência/chantagem/legitimidade, e que a fase final interpretava como um valor fixo de zero — agora podem ser alcançados através da influência real que toda a economia social proporciona. A partida do companheiro também pode ser alcançada, através de pontos de interrupção da agência de personagens não jogáveis e de um limite mínimo de moral.
- **`audit-content` CLI para desenvolvedores (v3.0):** um comando para auditoria de conteúdo para desenvolvedores (semelhante a `validate`, mas diferente do Director's Ledger, que é voltado para o jogador), que executa os seis formatadores para os encontros/chefes/combates em um conjunto de dados.
- **Conjunto inicial com temática específica — o ponto de partida de v3.0, apresentado (v3.1):** `economyGenre` insere a principal regra de cada cenário inicial através de `buildWorldStack` → `createEconomyCore`, de modo que um distrito agora define o perfil `GENRE_SUPPLY_DEFAULTS` de sua temática (cyberpunk enfatiza componentes/contrabando, fantasia enfatiza a escassez de medicamentos) em vez de uma base universal uniforme — o conjunto inicial que define o tom do mercado do Diretor e as entradas do jogo final já estão estabelecidas. Sete de dez cenários iniciais carregam um perfil de temática; três retornam à base, para ser honesto. Um campo separado de `tradeGenre` / `craftingGenre` para que os três possam divergir mais tarde.
- **A camada social, completa (v3.1):** `deny` e `bury-scandal` — o par de manipulação de rumores que tem como alvo um rumor existente, identificando-o em vez de uma facção — acessa o menu numerado através de uma dimensão de associação entre rumor e alvo, fechando a camada dos vinte e um verbos (19 → 21 elementos na camada).
- **`obligation-exists` diálogo, conectado e acessível (v3.1):** a condição de diálogo lê o registro de obrigações persistente de um NPC nomeado (`getPersistedNpcObligations`) — no caso, o personagem de fantasia Irmão Aldric; quando ele lhe deve um favor por meio de uma interação normal com o NPC, desbloqueia uma `call-in-favor` opção — um portal real onde v3.0 deixou um fragmento silencioso e sempre verdadeiro (uma auditoria de sessão da Fase 9 comprovou que ele pode ser acessado em uma sessão real, e não apenas em testes).
- **Reparação com elementos de gênero (v3.1):** cada autor inicial que define um gênero cria uma receita característica `repair` na tabela do seu gênero (fantasia `repair-rune-mend`, cyberpunk `repair-nanite-weld`, …), que é apresentada através de `getAvailableRecipes` — a reparação agora tem elementos de gênero, e não é apenas universal.
- **Ativação opcional do acordo de liquidação do livro-razão XRPL (v3.2):** um novo pacote opcional `@ai-rpg-engine/ledger-adapter` vincula a camada comercializável de propriedade do jogador. — `coin` → um título de dívida, materiais de consumo → tokens fungíveis, a alteração líquida de um ponto de verificação `buy`/`sell` → um **depósito de tokens XLS-85** estabelecido — na **testnet XRPL**, totalmente fora do núcleo determinístico. Nada em `core`/`modules` o importa e a execução é idêntica em termos de bytes, com ou sem ele (comprovado no ciclo real do mercador pirata `createGame()`). Apenas para a testnet, com uma proteção que impede a sua utilização na mainnet através de código, um ficheiro lateral com segredos ignorado pelo Git, tentativas seguras para evitar falhas, verificação de memorandos na cadeia de blocos e um mecanismo de segurança alternativo não ancorado; testado e comprovado em funcionamento completo na testnet (liquidação através de depósito fiduciário de tokens → `reconcile` em relação aos saldos e memorandos registados na cadeia de blocos). Equipamentos NFT exclusivos chegam em v3.3 (abaixo). Consulte o [adaptador do livro-razão XRPL](#o-adaptador-do-livro-razão-xrpl-opcional).
- **Equipamento único como NFTs (v3.3):** o `@ai-rpg-engine/ledger-adapter` associa o equipamento único do pacote `equipment` — o «pedaço» adiado de v3.2 — a NFTs da XRPL: cada item único é cunhado como um **XLS-20 NFToken** (`tfMutable`, que não pode ser destruído — verdadeira propriedade do jogador) num ponto de verificação, o crescimento do artefato avança os metadados de um NFT mutável no local através de **XLS-46 `NFTokenModify`**, e uma família de propriedade `reconcile()` verifica no livro-razão `account_nfts`. Um caminho de leitura distinto sobre a configuração do equipamento, que é usado juntamente com a camada fungível — o mesmo mecanismo de segurança de determinismo, idêntico em bytes, com ou sem ele. Testado na sessão real de jogo `starter-gladiator`, em funcionamento na testnet (cunha o `trident-and-net` equipado como um NFT, torna-se proprietário dele no livro-razão, reconcilia, o mundo permanece inalterado).
- **Equipamento que ganha notoriedade (v3.4):** o acúmulo de atributos de itens antigos existe desde v3.3, mas nunca foi ativado durante o jogo — nenhum item registrava seu histórico em uma partida em andamento, portanto, a versão antiga de cada item era permanentemente `0`. A partir de agora, a versão final do jogo já inclui: um módulo `item-chronicle-core`, que pode ser ativado pelo utilizador, e que regista `acquired` / `used-in-kill` / `recognized` de partidas reais, e `starter-gladiator` processa esses dados — ganhe três combates na arena e o tridente do retiarius será o **Tridente e Rede Ensangrentados** durante o resto da partida, exibido no HUD e no registo do diretor. Isto também **encerra o ciclo do NFT**: um ponto de verificação valida esse crescimento como um **XLS-46 `NFTokenModify`** real, avançando o URI no livro-razão, ao mesmo tempo que preserva o NFTokenID. Corrigido ao longo do processo: `boss-kill` e `recognized` eram inacessíveis em todos os pacotes enviados (uma verificação básica de tag `boss` em relação ao conteúdo que contém tags `role:boss` e uma proteção de facção contra conteúdo onde nenhuma entidade define uma) — e o último estava bloqueando silenciosamente *todo* o aumento da defesa. Implementação por opção: um pacote que não utiliza ligações físicas é idêntico, em termos de código, à versão anterior do motor antes de esta ter sido criada.
- **Consequências que deixam marcas reais (v3.8):** a camada estratégica é DESATIVADA após v3.7 — ofertas são geradas, resolvidas e o narrador pode anunciar o resultado — e, em seguida, o mundo esquece. `applyOpportunityFallout` declarou **catorze** tipos de efeito e manteve **seis**: uma obrigação anunciada e registrada em nenhum livro, um boato que se espalhou para ninguém, um título que não conferiu nenhum título a ninguém. Todos os catorze persistem agora, cada um através do seu próprio escritor no sistema proprietário, e dois deles **fecham ciclos de feedback** — uma obrigação escrita no sistema move o ponto de inflexão da lealdade que decide o que um NPC oferece a você em seguida, e a confiança movida pelo sistema abre o portão através do qual essas ofertas são lidas. Três tipos de efeito mostraram-se inativos um nível ANTES de um sistema ausente (`materials` e `spawn-opportunity` foram emitidos por nada; cada `spawn-pressure` produtor estava em uma resolução que nenhum caminho enviado poderia alcançar), então o ciclo criou produtores em vez de construir defesas que nunca poderiam ser ativadas. A operação `betray` é aplicada como a quarta transição e ativa **seis locais de obrigação, três boatos e todos os três produtores originais de pressão** que foram criados em versões anteriores e alcançados por nada. Uma **auditoria de livro-razão** em toda a sessão encontrou então mais três sistemas no aplicativo de pressão que ninguém havia indicado — o que é o que a reconciliação em ambas as direções oferece em comparação com uma análise isolada. E o décimo segundo iniciador, **Hue and Cry**, é criado de forma inversa à camada de consequência: um ladrão em uma cidade sem força policial, 7/7 na rubrica do pacote.
- **A camada estratégica, ativada (v3.7):** o nível acima das ações imediatas — onde as oportunidades surgem, os companheiros têm alguma influência passiva e os distritos apresentam diferentes características — estava meio escuro, e nada conseguia vê-lo. Uma nova sonda que abrange todo o catálogo ativa os onze pacotes e executa **quarenta rodadas completas** através do mesmo mecanismo que a interface de linha de comando interativa utiliza (turnos dos personagens não jogáveis, turnos dos companheiros e, em seguida, o ciclo do mundo), porque `runWorldTick` é uma função por rodada, e não uma ação, e uma sonda construída apenas a partir de `submitAction` vê apenas metade de uma rodada para sempre. Ela mediu **um dos oito tipos de oportunidade** que foram ativados no conteúdo lançado. Todos os **oito estão ativos agora**, cada um com uma prova da sessão em que a recompensa foi realmente obtida — e um que deliberadamente esgota o tempo, para que o resultado final de um prazo (perda de reputação, um distrito que se torna mais carente) seja comprovado em conteúdo real, e não apenas presumido. O que estava no caminho nunca foram as regras: `contract` precisava de um personagem não jogável que fosse tanto aliado quanto ganancioso, o que a tabela de pontos de interrupção torna mutuamente exclusivo com `favorable`, e `relations['player-trust']` foi criado exatamente UMA vez em todo o catálogo; as economias dos distritos apagaram seu próprio caráter de gênero e tag em cerca de 15 rodadas, movendo cada categoria para um valor universal de 50; `world.factions[].reputation` — a linha de base criada que o motor combina explicitamente — não foi definida por nenhum pacote, então todos os mundos começaram em um valor zero, com todos os elementos. O **ritmo** é ajustado em relação a descobertas específicas, e não ao gosto, cada uma citada na constante que a governa (sobrecarga de escolhas, variação de missões, momentos de relaxamento, repetição radiante, dinâmica de compromissos) e protegida por uma regressão determinística. **Doze dos treze** campos de modificadores de companheiros e distritos agora alcançam uma função de resolução por meio de uma junção de parâmetros, cada um com uma contribuição nomeada na carga útil, para que a interface possa indicar QUEM ajudou — um modificador calculado, mas não renderizado, é experiencialmente idêntico a nenhum modificador. `use` **para silenciosamente de destruir coisas**: 89/90, os itens criados em todo o catálogo, foram consumidos por uma ação que não encontrou efeito e os removeu de qualquer maneira, relatando sucesso. E o contrato `statusTags`, declarado por todos os onze pacotes e não aplicado por nenhum, está vinculado — as declarações foram ampliadas para a verdade lançada primeiro e, em seguida, restringidas.
- **O instrumento ativou o catálogo (v3.6):** o pacote criado para UTILIZAR o livro-razão é agora executado deliberadamente como um instrumento de otimização do motor. Uma **auditoria de abrangência verbal** em todo o catálogo ativa os onze pacotes e SUBMETE cada verbo ao motor real, perguntando se algum alvo no mundo ativado o aceita — um teste que nenhum dos testes existentes conseguiria passar ou falhar, porque a verificação da integridade verbal compara a tabela de ajuda com os manipuladores registados e nunca analisa o conteúdo. Executado antes de qualquer correção, detectou `recruit`, anunciado em Salt Road Ledger, com zero NPCs recrutáveis (o defeito v2.9, reintroduzido) e `use` inativos em todo o catálogo do pacote. `give` é lançado como a **primeira transferência de itens de entidade para entidade** do motor — atômica, com rejeição estruturada, com carimbo de data e hora do evento — preenchendo uma lacuna onde um pacote poderia tornar um item acessível e não haver nada que o pudesse entregar a alguém. E os dois eixos de adaptador restantes, que eram flags de configuração com **zero leituras comportamentais**, tornaram-se comportamentos: `diary` modo (observado, não custodiado — um ponto de referência por ponto de verificação, sem linhas de confiança, a reconciliação verifica a cadeia de pontos de referência) e `issuerMode: 'persistent'` (um mercado que sobrevive à execução). Comprovado com **15/15 na testnet XRPL ativa**.
- **Um jogo cujo ciclo central é a dívida (v3.5):** o décimo primeiro jogo da série, **Salt Road Ledger**, é o primeiro a ser desenvolvido a partir de um sistema, e não de um gênero — você interpreta um agente que negocia usando o capital de outra pessoa, e cinco verbos de comércio (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) sustentam o jogo, enquanto o combate é tratado como uma penalidade (o perfil de recursos tem um array vazio `gains` — nada recompensa a violência). `consign` é o único verbo no catálogo cujas semânticas offline correspondem a uma primitiva de assentamento de forma direta, o que o torna o pacote de referência para o adaptador do livro-razão, sem depender dele. Inclui o gênero `mercantile` e um perfil de economia mercantil, com uma pontuação de 7/7 na rubrica do pacote. O mesmo ciclo tornou reais dois eixos de adaptador que estavam inativos há muito tempo — o campo de memorando `VERB:` (declarado com membros que nenhum ponto de chamada poderia emitir) e `config.settlement` (declarado com zero leituras em qualquer lugar) — e uma auditoria da sessão de jogo do novo pacote revelou seis mecânicas que estavam implementadas, válidas em relação ao esquema, aprovadas nas unidades e inativas.
- `ai-rpg-engine create-starter <name>` — cria a estrutura de um novo jogo (independente, funciona fora do monoreposório); `validate` + `scaffold` comandos para gerenciar conteúdo; carrega pacotes a partir de arquivos JSON.
- Modelo inicial publicado no npm (`@ai-rpg-engine/starter-template`)
- Conjunto completo de testes: **8368 testes** (resultados consistentes em execuções repetidas; os arquivos de teste são verificados quanto ao tipo no ambiente de integração contínua; a cobertura dos testes é rigorosamente controlada).

**O que é incompleto ou inacabado:**
- O estúdio de criação de mundos de IA (camada Ollama) é testado de forma menos rigorosa do que o núcleo de simulação e precisa de um daemon Ollama local; é totalmente opcional — o motor e o loop `run` não precisam de rede.
- A pilha de narração/áudio cria comandos de áudio determinísticos, mas não há **nenhum backend de áudio terminal** — nada emite som em `run`. O cenário do Godot é o primeiro host que realmente reproduz os IDs de `felt` (mixer + TTS opcional). As sequências de sobreposição não devem substituir o áudio ambiente da zona.
- O modo multijogador (dois jogadores humanos compartilhando um mundo) **não** foi implementado — é uma camada de rede, intencionalmente fora do escopo; os perfis atuais têm como alvo um único controlador.
- `replay --replay` restaura o jogo salvo em vez de ressimular — e, após v2.9, essa é a **direção** definida, não um adiamento: `Engine.serialize()` já é um snapshot completo e comprovado do estado, enquanto a ressimulação teria que rastrear o estado do mundo/encontro que existe fora do registro de ações. v2.9 oferece slots de salvamento com vários checkpoints nesse caminho de restauração comprovado; a ressimulação real baseada em eventos não está planejada.
- v3.1 removeu os três tetos nomeados de v3.0 — o **estoque inicial** do gênero, as receitas de *reparo* específicas do gênero e a superfície do menu `deny` / `bury-scandal` agora estão incluídos. O único teto que permanece é aquele que contém as novas receitas de reparo do gênero, que carregam um `statDelta` (um pequeno bônus de estatística) que `resolveRepair` ainda não aplica — o reparo *restaura*, `modify` *melhora* — portanto, o reparo como melhoria é marcado no código e **adiado para v3.2/v3.3** como uma mecânica intencional, e não um campo inerte silencioso. E `obligation-exists` é lançado com uma demonstração (Irmão Aldric); a condição está ativa para que os criadores de conteúdo adicionem mais diálogos.
- A documentação é extensa, mas nem todas as páginas do manual refletem as APIs mais recentes.

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
| **Core Runtime** | Motor determinístico — estado do mundo, eventos, ações, ticks, RNG, reprodução |
| **Modules** | Mais de 30 sistemas compostos — combate, percepção, cognição, facções, travessia, companheiros, etc. |
| **Content** | Entidades, zonas, diálogos, itens, habilidades, status — criados pelo autor |
| **AI Studio** | Camada Ollama opcional — criação de protótipos, crítica, análise de equilíbrio, ajuste, experimentos |

---

## O adaptador do livro-razão XRPL (opcional)

`@ai-rpg-engine/ledger-adapter` é um pacote **opcional** que associa a
**camada de itens negociáveis pertencente ao jogador** de um jogo — o saldo e o inventário de itens consumíveis de `coin` que já são movimentados pelos verbos `trade-core`/`buy`/`sell` — à **testnet XRPL**, para que
esses ativos possam ser lastreados por tokens reais registrados no livro-razão e liquidados em pontos de verificação.
A ausência de um adaptador corresponde exatamente ao motor offline que está disponível atualmente.

**A invariante do determinismo (o objetivo principal).** O adaptador é um *canal lateral*, nunca parte da simulação:

- Ele **nunca é invocado dentro do tick determinístico** — apenas em **checkpoints** (salvar, entrada na cidade/mercado, fim do capítulo).
- Nada em `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` o importa (sua única dependência do motor é um `import type` em tempo de compilação).
- **Uma execução é idêntica, com ou sem ele.** Um teste de firewall executa o loop de comerciante `starter-pirate` `createGame()` real em dois motores — um com o adaptador habilitado e liquidando em um checkpoint — e afirma que os dois mundos são profundamente iguais. A reprodução com a semente 0 não é afetada.

**Níveis de integração — um jogo o incorpora tão profundamente quanto seu design desejar.** O firewall é uma *fronteira de determinismo*, não uma regra anti-integração; a invariante acima se mantém em todos os níveis:

| Nível | O que depende do adaptador | Se encaixa |
|-------|-----------------------------|------|
| **L0 — External observer** | Nada dentro do jogo; o adaptador é anexado externamente em checkpoints e o jogo não tem conhecimento disso. | Retrofit de um jogo existente (a demonstração de pirata lançada). |
| **L1 — Checkpoints acionados pelo jogo** | O próprio fluxo de salvamento/cidade/progressão meta do jogo chama o adaptador em momentos definidos. | Um jogo que deseja momentos de livro-razão deliberados. |
| **L2 — Ledger-native design** | A economia ou a identidade do jogo é projetada *em torno* da propriedade na cadeia. | Um jogo de comerciante com foco no livro-razão. |

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
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Início de ladrão — perseguição como o loop e qual metade da cidade abrirá uma porta para você |
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
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Perseguição | Caça a pessoas por dinheiro; a violência é alta, não proibida |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiro | Recurso de sangue, manipulação social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate na arena, favor da multidão |

---

## Documentação

| Recurso | Descrição |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crie um novo jogo — CLI ou rota de modelo manual |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Crie seu próprio jogo, combinando módulos do motor |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolução de regras por entidade — combate com estilos de jogo mistos, `applyProfile`, modelos de perfil, a CLI `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Liquidação opcional no livro-razão — o firewall de determinismo, níveis de integração L0/L1/L2, modos de jogo, mecanismos de segurança e a demonstração de pirata testada ao vivo |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco ações, estados em um piscar de olhos |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack passo a passo, mapeamento de atributos, perfis de recursos |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | Hosts do tipo "sidecar", carga "felt", porto dimétrico do Godot — a apresentação pode ser enganosa, a ocupação permanece como um ID de zona |
| [Handbook](site/src/content/docs/handbook/index.md) | Manual abrangente — todos os sistemas, mais 4 apêndices |
| [Composition Model](docs/composition-model.md) | As 6 camadas reutilizáveis e como elas se combinam |
| [Examples](docs/examples/) | Exemplos TypeScript executáveis (verificados por tipo + testados em comportamento no CI) — festa mista por entidade, perfis compartilhados, entre mundos, do zero |
| [Design Document](docs/DESIGN.md) | Análise aprofundada da arquitetura — pipeline de ação, verdade versus apresentação |
| [Philosophy](PHILOSOPHY.md) | Mundos determinísticos, design orientado por evidências, IA como assistente |
| [Changelog](CHANGELOG.md) | Histórico de lançamentos |

---

## Roteiro

### Onde estamos agora

Ambas as estruturas de composição estão completas — **8368 testes em 388 arquivos**, todos os 12 iniciadores em `buildCombatStack` **e** `buildWorldStack`, reprodução determinística e idêntica byte a byte sob sementes impressas, pontuação completa das decisões da IA e uma CLI que cria, executa, valida e inspeciona. O arco v3.x tornou o mundo ativo (NPCs com nomes, a superfície social de 25 verbos, economias de gênero — v3.0–v3.1), colocou ativos de propriedade do jogador na testnet XRPL como um canal secundário opcional (v3.2–v3.4), criou dois iniciadores focados no sistema e os transformou em instrumentos de aprimoramento do motor (v3.5–v3.6), iluminou e fortaleceu a camada estratégica até que as consequências deixem marcas reais (v3.7–v3.8), deu aos hosts a superfície do motor que o Godot precisa (v3.8.1), fechou o ciclo de criação para que uma sessão de estúdio ou um pacote JSON simples produzam um mundo jogável de ponta a ponta (v3.9), colocou toda a camada estratégica nos sentidos do jogador (v3.10), ajustou a profundidade que esses sentidos agora alcançam (v3.11) e **deu a um host de desenho a sensação de um "tick" — o primeiro cliente de pixel, um porto dimétrico do Godot 4, é executado nesse contrato (v3.12)**.

**Arco de lançamento recente (v2.4.0–v3.0.0):**
- v2.4.0 — Combate em grupo (ataque/cura/buff/revive de aliados, amigo/inimigo AoE), sistema de efeitos de status (modificadores + DoT/HoT + gatilhos reativos), fase 1 dos perfis plug-in, conteúdo `validate`/`scaffold` CLI
- v2.5.0 — Resolução de regras por entidade (combate com estilos de jogo mistos), o carregador `applyProfile` + habilidades por entidade, modelos de perfil + `profile` CLI e uma passagem completa de saúde
- v2.6.0 — O comando `run` se tornou um jogo real: inimigos agem com base em seus próprios perfis de IA, vitória/derrota, salvar/retomar, habilidades e XP no menu, o bin do estúdio `ai` e a pilha de narração
- v2.7.0 — O mundo reage e há uma razão para retornar: calor → pressões → consequências narradas, encontros de entrada de zona, um ciclo de missão + diário, equipamentos em combate, execuções reproduzíveis com sementes, entradas de fim de jogo ao vivo, `buildWorldStack`, o Livro do Diretor e uma junção de migração de salvamento
- v2.8.0 — Aja no mundo em que você vive: uma economia comercial ativa + `sell` verbos, companheiros que você recruta e luta ao lado e um Livro do Diretor que analisa todo o cenário — um fio de escrita por sistema acendeu ~12 consumidores que foram lançados
- v2.9.0 — Feche os ciclos: `buy` + estoque de mercador e criação completam a economia; os companheiros fazem jogadas independentes; quatro verbos sociais (suborno / intimidação / petição / semente) são executados em uma economia de alavancagem financiada por recompensas de oportunidade; as oportunidades são resolvidas com expiração + consequência de perda de favor; e equipamentos, missões, recrutáveis e moeda inicial são distribuídos uniformemente para todos os dez iniciadores
- **v3.0.0 — Dê vida ao mundo: o produtor de agência de NPCs acende NPCs com nomes (objetivos / relacionamentos / livros-razão de obrigação / cadeias de consequências) mais um NPC de história em cada iniciador; a superfície social cresce para 25 verbos (diplomacia + sabotagem) com renda passiva de alavancagem e diálogo que lê o estado social; estoque e receitas de gênero por iniciador; os finais de alavancagem (vitória / mestre de marionetes / aposentadoria tranquila) se tornam alcançáveis; linhas de menu de reparo/modificação, oportunidades de escolta e uma CLI de desenvolvimento `audit-content` — lançados por meio de uma auditoria da fase 9 que detectou dois fios soltos que o conjunto de testes verde ocultava**

### Próximo

v3.12 fechou o contrato "felt" e o primeiro host de desenho. O que resta é um trabalho de ciclo posterior, não sobras deste.

- Um ambiente de família próspera (a ponte de tom e o lançamento por zona; o CORE ainda não tem um tronco próspero)
- Multijogador — dois jogadores *humanos* compartilhando um mundo (uma camada de rede, deliberadamente adiada; perfis compartilhados de um único controlador são lançados hoje como [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Substituições de fórmula serializáveis — ajuste de fórmula por perfil (bloqueado em uma DSL de fórmula; os perfis carregam mapeamentos de atributos hoje, não closures)

### Destino: Perfis Plug-in

O objetivo final do motor são **perfis definidos pelo usuário** — pacotes portáteis que se encaixam em qualquer jogo. Um perfil empacota um mapeamento de atributos, comportamento de recursos, tags de viés de IA e habilidades em uma única unidade importável. A partir de v2.5, as entidades em um mundo podem ter seus próprios perfis e resolver o combate por entidade — um lutador `might` e um místico `will` compartilham um grupo, cada um trazendo seu próprio estilo de jogo.

O esquema, o carregador `applyProfile`, a resolução de habilidades por entidade e a validação entre perfis são todos lançados. O que resta é o multijogador — permitir que dois jogadores *humanos* (não apenas duas entidades) compartilhem um mundo — que é uma camada de rede. Consulte [Roteiro do Perfil](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) para o design.

---

## Filosofia

O Motor de RPG de IA é construído em torno de três ideias:

1. **Mundos determinísticos** — os resultados da simulação devem ser reproduzíveis.
2. **Design orientado por evidências** — a mecânica do mundo deve ser testada por meio de simulação.
3. **IA como assistente, não autoridade** — as ferramentas de IA ajudam a gerar e criticar projetos, mas não substituem os sistemas determinísticos.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obter a explicação completa.

---

## Segurança

O motor principal é uma **biblioteca de simulação exclusivamente local**: sem telemetria, sem rede, sem informações confidenciais. Os arquivos de salvamento são armazenados em `.ai-rpg-engine/` apenas quando solicitado explicitamente. Duas camadas **opcionais** adicionam um caminho de saída, e apenas quando você as ativa:

- A camada de IA (`@ai-rpg-engine/ollama`) comunica-se com um daemon Ollama **local**; sua opção de adesão `webfetch` (para RAG) é restrita por um mecanismo de proteção contra SSRF (bloqueia loopback/link-local/CGNAT/metadados da nuvem e IPv6-tunnelled equivalentes).
- A camada de registro (`@ai-rpg-engine/ledger-adapter`) acessa a **testnet XRPL** — e apenas a testnet: uma proteção estrutural **impossível de ser implementada na mainnet por meio de código** (não uma flag de configuração) rejeita qualquer host que não seja da testnet durante a construção. As chaves da carteira são armazenadas em um arquivo de segredos ignorado pelo Git, nunca em um arquivo de salvamento, e o núcleo determinístico nunca importa o adaptador.

Consulte [SECURITY.md](SECURITY.md) para obter detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
