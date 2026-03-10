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

# @ai-rpg-engine/ollama

Estúdio de design de IA para o AI RPG Engine — estrutura básica, análise crítica, fluxos de trabalho guiados, ajuste fino, experimentos e experiência do usuário do estúdio.

Conecta-se a uma instância local do [Ollama](https://ollama.ai). Nunca modifica diretamente a simulação — toda a saída é enviada para o stdout por padrão.

## Instalação

```bash
npm install @ai-rpg-engine/ollama
```

## O que está incluído

- **Estrutura básica de conteúdo** — gera salas, facções, missões, distritos, pacotes de localização, pacotes de encontros a partir de um tema.
- **Análise crítica e correção** — valida o conteúdo gerado em relação aos esquemas do motor, corrige automaticamente em caso de falha.
- **Shell de chat** — sessão de design interativa com roteamento contextual, orquestração de ferramentas e memória.
- **Construções guiadas** — fluxos de trabalho de construção de mundo multi-etapas, com planejamento prévio e adaptados à sessão.
- **Análise de simulação** — análise de repetições com resultados estruturados de balanceamento.
- **Ajuste fino guiado** — planos de ajuste fino estruturados, baseados nos resultados de balanceamento, com execução passo a passo.
- **Experimentos de cenário** — execuções de simulação em lote, detecção de variância, varredura de parâmetros, comparação antes/depois.
- **Experiência do usuário do estúdio** — painéis, navegação de problemas, inspeção de experimentos, histórico de sessões, descoberta de comandos, integração.

## Uso

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## Documentação

- [Guia de Construção de Mundos com IA](AI_WORLDBUILDING.md) — documentação completa do fluxo de trabalho.
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
