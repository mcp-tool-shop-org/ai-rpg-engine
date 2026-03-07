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

# AI RPG Engine

Kit de ferramentas nativo de simulação para construir, analisar e balancear mundos de RPG.

AI RPG Engine combina um ambiente de execução de simulação determinística com um estúdio de design assistido por IA, permitindo que autores criem mundos, os testem por simulação e os melhorem com base em evidências, não em suposições.

> Ferramentas tradicionais ajudam a escrever histórias.
> AI RPG Engine ajuda a **testar mundos**.

---

## O Que Ele Faz

```
construir → criticar → simular → analisar → ajustar → experimentar
```

Você pode gerar conteúdo de mundo, criticar designs, executar simulações determinísticas, analisar comportamento de replays, ajustar mecânicas, executar experimentos com múltiplas sementes e comparar resultados. Cada resultado é reproduzível, inspecionável e explicável.

---

## Capacidades Principais

### Simulação Determinística

Um motor de simulação baseado em ticks para mundos de RPG. Estado do mundo, sistema de eventos, camadas de percepção e cognição, propagação de crenças de facções, sistemas de rumores, métricas de distritos, logs de ações reproduzíveis e RNG determinístico. Cada execução pode ser reproduzida exatamente.

### Construção de Mundos Assistida por IA

Camada opcional de IA que gera salas, facções, missões e distritos a partir de um tema. Critica designs, normaliza erros de esquema, propõe melhorias e guia fluxos de trabalho de construção de mundos em múltiplas etapas. A IA nunca altera diretamente o estado da simulação — ela apenas gera conteúdo ou sugestões.

### Fluxos de Trabalho Guiados de Design

Fluxos de trabalho com reconhecimento de sessão e planejamento prévio para scaffolding de mundos, ciclos de crítica, iteração de design, construções guiadas e planos estruturados de ajuste. Combina ferramentas determinísticas com assistência de IA.

### Análise de Simulação

Análise de replays que explica por que eventos aconteceram, onde mecânicas falham, quais gatilhos nunca disparam e quais sistemas criam instabilidade. Descobertas estruturadas alimentam diretamente o ajuste.

### Ajuste Guiado

Descobertas de balanceamento geram planos de ajuste estruturados com correções propostas, impacto esperado, estimativas de confiança e pré-visualização de mudanças. Aplicados passo a passo com rastreabilidade total.

### Experimentos de Cenário

Execute lotes de simulações com diferentes sementes para entender o comportamento típico. Extraia métricas de cenários, detecte variância, faça varredura de parâmetros e compare mundos ajustados vs. linha de base. Transforma o design de mundos em um processo testável.

### Shell do Estúdio

Estúdio de design via CLI com painéis de projeto, navegação de problemas, inspeção de experimentos, histórico de sessões, integração guiada e descoberta de comandos contextual. Um espaço de trabalho para construir e testar mundos.

---

## Início Rápido

```bash
# Instalar o CLI
npm install -g @ai-rpg-engine/cli

# Iniciar o estúdio interativo
ai chat

# Executar a integração
/onboard

# Criar seu primeiro conteúdo
create-room haunted chapel

# Executar uma simulação
simulate

# Analisar os resultados
analyze-balance

# Ajustar o design
tune paranoia

# Executar um experimento
experiment run --runs 50
```

---

## Exemplo de Fluxo de Trabalho

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

Construa um mundo e melhore-o através de evidências de simulação.

---

## Arquitetura

O sistema possui quatro camadas.

| Camada | Função |
|--------|--------|
| **Simulação** | Motor determinístico — estado do mundo, eventos, ações, percepção, cognição, facções, propagação de rumores, métricas de distritos, replay |
| **Autoria** | Geração de conteúdo — scaffolding, crítica, normalização, ciclos de reparo, geradores de pacotes |
| **Cognição IA** | Assistência opcional de IA — shell de chat, roteamento de contexto, recuperação, modelagem de memória, orquestração de ferramentas |
| **UX do Estúdio** | Ambiente de design via CLI — painéis, rastreamento de problemas, navegação de experimentos, histórico de sessões, fluxos guiados |

---

## Pacotes

| Pacote | Propósito |
|--------|-----------|
| [`@ai-rpg-engine/core`](packages/core) | Ambiente de execução de simulação determinística — estado do mundo, eventos, RNG, ticks, resolução de ações |
| [`@ai-rpg-engine/modules`](packages/modules) | 17 módulos integrados — combate, percepção, cognição, facções, rumores, distritos |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas canônicos e validadores para conteúdo de mundos |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Autoria com IA opcional — scaffolding, crítica, fluxos guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | Estúdio de design via linha de comando — shell de chat, fluxos de trabalho, ferramentas de experimento |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderizador de terminal e camada de entrada |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — mundo inicial de fantasia |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — mundo inicial de cyberpunk |

---

## Documentação

| Recurso | Descrição |
|---------|-----------|
| [Manual](docs/handbook/index.md) | 26 capítulos + 4 apêndices cobrindo todos os sistemas |
| [Documento de Design](docs/DESIGN.md) | Análise aprofundada da arquitetura — pipeline de ações, verdade vs. apresentação, camadas de simulação |
| [Guia de Construção de Mundos com IA](packages/ollama/AI_WORLDBUILDING.md) | Fluxos de scaffolding, diagnóstico, ajuste e experimento |
| [Filosofia](PHILOSOPHY.md) | Por que mundos determinísticos, design baseado em evidências e IA como assistente |
| [Histórico de Alterações](CHANGELOG.md) | Histórico de versões |

---

## Filosofia

AI RPG Engine é construído em torno de três ideias:

1. **Mundos determinísticos** — os resultados da simulação devem ser reproduzíveis.
2. **Design baseado em evidências** — as mecânicas do mundo devem ser testadas por simulação.
3. **IA como assistente, não autoridade** — ferramentas de IA ajudam a gerar e criticar designs, mas não substituem sistemas determinísticos.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para a explicação completa.

---

## Segurança

AI RPG Engine é uma **biblioteca de simulação exclusivamente local**. Sem telemetria, sem rede, sem segredos. Arquivos de salvamento vão para `.ai-rpg-engine/` apenas quando explicitamente solicitado. Consulte [SECURITY.md](SECURITY.md) para detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
