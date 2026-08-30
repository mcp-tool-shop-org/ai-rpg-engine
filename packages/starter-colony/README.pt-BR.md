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

# @ai-rpg-engine/starter-colony

**Exemplo de Implementação** — Este exemplo demonstra como conectar o motor para garantir a sobrevivência da colônia em um cenário de ficção científica. É um exemplo para aprender, não um modelo para copiar. Consulte o [Guia de Implementação](../../docs/handbook/57-composition-guide.md) para criar seu próprio jogo.

**Perda de Sinal** — Uma colônia distante perde o contato com a Terra. Algo está vivo nas cavernas abaixo.

Parte do catálogo de pacotes iniciais do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Gerenciamento de colônia de ficção científica + contato com alienígenas. A energia é um recurso compartilhado pela colônia — quando diminui, os sistemas falham em cascata. A presença alienígena percebe os colonos como "padrões de ressonância disruptivos".

## Início Rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.submitAction('inspect');
```

## Padrões Demonstrados

| Funcionalidade | O que a colônia demonstra |
|---------|-------------------|
| **Engagement** | Marcadores de zonas de gargalo, funções de suporte/proteção baseadas em esquadrões. |
| **Resources** | Recurso de energia compartilhado em toda a colônia, com consumo ambiental. |
| **Environment** | Perigos ambientais que desencadeiam a depleção de recursos e falhas em cascata. |
| **Cognition** | Entidade alienígena com regras de percepção não humanas. |

## Conteúdo

- **5 zonas:** Módulo de Comando, Baía de Hidroponia, Cerca Perimetral, Torre de Sinal, Caverna Alienígena
- **2 NPCs:** Dra. Vasquez (cientista), Chefe Okafor (segurança)
- **2 inimigos:** Drone Invadido, Entidade de Ressonância
- **1 árvore de diálogo:** Dra. Vasquez informa sobre o sinal alienígena e a política da colônia
- **1 árvore de progressão:** Caminho do Comandante (Engenheiro de Campo → Sensores Apurados → Inabalável)
- **1 item:** Célula de Emergência (restaura 20 de energia)

## Mecânicas Únicas

| Verbo | Descrição |
|------|-------------|
| `scan` | Varredura com sensores usando percepção |
| `allocate` | Redistribua a energia entre os sistemas da colônia |

## Estatísticas e Recursos

| Estatística | Função |
|------|------|
| engenharia | Consertar e construir sistemas |
| comando | Liderança e moral da tripulação |
| percepção | Sensores e percepção |

| Recurso | Alcance | Notas |
|----------|-------|-------|
| HP | 0–25 | Saúde padrão |
| Energia | 0–100 | Recurso compartilhado pela colônia, regenera 2/tick |
| Moral | 0–30 | Coesão da tripulação |

## O que você pode adaptar

Pressão de recursos impulsionada pelo ambiente e funções de engajamento em esquadrões. Estude como o recurso de energia da colônia se esgota devido a eventos ambientais (não apenas combate), criando falhas sistêmicas em cascata que forçam a alocação tática de recursos em todo o esquadrão.

## Licença

MIT
