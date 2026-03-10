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

Um conjunto de ferramentas para a criação, análise e balanceamento de mundos de RPG, com foco em simulação.

O Motor de RPG com Inteligência Artificial combina um ambiente de simulação determinística com um estúdio de design assistido por IA, permitindo que os criadores construam mundos, os testem por meio de simulações e os aprimorem com base em evidências, em vez de suposições.

> As ferramentas tradicionais ajudam você a escrever histórias.
> O Motor de RPG com Inteligência Artificial ajuda você a **testar mundos**.

---

## O que ele faz

```
build → critique → simulate → analyze → tune → experiment
```

Você pode gerar conteúdo para o mundo, analisar projetos, executar simulações determinísticas, analisar o comportamento em diferentes jogadas, ajustar as mecânicas, realizar experimentos em diversas configurações e comparar os resultados. Cada resultado é reproduzível, inspecionável e explicável.

---

## Funcionalidades Principais

### Simulação Determinística

Um motor de simulação baseado em ciclos para mundos de RPG. Inclui o estado do mundo, sistema de eventos, camadas de percepção e cognição, propagação de crenças de facções, sistemas de rumores, métricas de distritos com derivação de humor, agência de NPCs com pontos de fidelidade e cadeias de consequências, companheiros com moral e risco de deserção, influência do jogador e ações políticas, análise de mapas estratégicos, consultor de movimentos, reconhecimento de itens e rastreamento de origem de equipamentos, marcos de desenvolvimento de relíquias, oportunidades emergentes (contratos, recompensas, favores, missões de suprimento, investigações) geradas a partir das condições do mundo, detecção de arcos de campanha (10 tipos de arcos derivados do estado acumulado), detecção de gatilhos de final de jogo (8 classes de resolução) e renderização de finais determinísticos com epílogos estruturados. Registros de ações reproduzíveis e RNG determinístico. Cada execução pode ser reproduzida exatamente.

### Criação de Mundos Assistida por IA

Uma camada de IA opcional que cria salas, facções, missões e distritos a partir de um tema. Analisa projetos, corrige erros de esquema, propõe melhorias e orienta fluxos de trabalho de criação de mundos. A IA nunca modifica diretamente o estado da simulação; ela apenas gera conteúdo ou sugestões.

### Fluxos de Trabalho de Design Guiados

Fluxos de trabalho conscientes da sessão e orientados por planos para a criação de mundos, ciclos de análise, iteração de design, construções guiadas e planos de ajuste estruturados. Combina ferramentas determinísticas com assistência de IA.

### Análise de Simulação

Análise de jogadas que explica por que os eventos ocorreram, onde as mecânicas falham, quais gatilhos nunca são acionados e quais sistemas criam instabilidade. Os resultados estruturados são integrados diretamente no ajuste.

### Ajuste Guiado

Os resultados de balanceamento geram planos de ajuste estruturados com correções propostas, impacto esperado, estimativas de confiança e alterações previstas. Aplicados passo a passo, com total rastreabilidade.

### Experimentos de Cenário

Execute várias simulações em diferentes configurações para entender o comportamento típico. Extraia métricas de cenário, detecte variações, ajuste parâmetros e compare mundos ajustados com mundos de referência. Transforma o design de mundos em um processo testável.

### Ambiente de Desenvolvimento (Studio Shell)

Ambiente de desenvolvimento de linha de comando com painéis de projetos, navegação de problemas, inspeção de experimentos, histórico de sessões, integração guiada e descoberta de comandos com base no contexto. Um espaço de trabalho para construir e testar mundos.

---

## Início Rápido

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## Fluxo de Trabalho de Exemplo

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

Crie um mundo e aprimore-o por meio de evidências de simulação.

---

## Arquitetura

O sistema possui quatro camadas.

| Camada | Função |
|-------|------|
| **Simulation** | Motor determinístico — estado do mundo, eventos, ações, percepção, cognição, facções, propagação de rumores, métricas de distritos, reprodução |
| **Authoring** | Geração de conteúdo — criação de estruturas, análise, normalização, ciclos de reparo, geradores de pacotes |
| **AI Cognition** | Assistência de IA opcional — shell de chat, roteamento de contexto, recuperação, modelagem de memória, orquestração de ferramentas |
| **Studio UX** | Ambiente de design de linha de comando — painéis, rastreamento de problemas, navegação de experimentos, histórico de sessões, fluxos de trabalho guiados |

---

## Pacotes

| Pacote | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Simulação determinística em tempo de execução — estado do mundo, eventos, gerador de números aleatórios, ciclos, resolução de ações. |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 módulos integrados — combate, percepção, cognição, facções, rumores, distritos, agência de NPCs, companheiros, influência do jogador, mapa estratégico, consultor de movimento, reconhecimento de itens, oportunidades emergentes, detecção de arcos narrativos, gatilhos para o final do jogo. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas e validadores canônicos para o conteúdo do mundo. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Estado de progressão do personagem, ferimentos, marcos, reputação. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Seleção de arquétipos, geração de personagens, equipamentos iniciais. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipamentos, origem dos itens, crescimento de relíquias, registros de itens. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memória entre sessões, efeitos de relacionamento, estado da campanha. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Criação de IA opcional — estruturas de base, análise crítica, fluxos de trabalho guiados, ajuste fino, experimentos. |
| [`@ai-rpg-engine/cli`](packages/cli) | Estúdio de design em linha de comando — shell de chat, fluxos de trabalho, ferramentas de experimentação. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderizador de terminal e camada de entrada |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | Chapel Threshold — mundo de fantasia para iniciantes. |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — mundo cyberpunk para iniciantes. |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective — mundo de mistério vitoriano para iniciantes. |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem — mundo de piratas para iniciantes. |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead — mundo de sobrevivência zumbi para iniciantes. |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain — mundo de faroeste estranho para iniciantes. |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss — mundo de colônia de ficção científica para iniciantes. |

---

## Documentação

| Recurso | Descrição |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 43 capítulos + 4 apêndices que cobrem todos os sistemas. |
| [Design Document](docs/DESIGN.md) | Análise aprofundada da arquitetura — pipeline de ações, verdade versus apresentação, camadas de simulação. |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Fluxos de trabalho para estruturação, diagnóstico, ajuste fino e experimentação. |
| [Philosophy](PHILOSOPHY.md) | Por que mundos determinísticos, design baseado em evidências e IA como assistente. |
| [Changelog](CHANGELOG.md) | Histórico de lançamentos |

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
