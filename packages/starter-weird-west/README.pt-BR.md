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

# @ai-rpg-engine/starter-weird-west

**O Pacto do Demônio da Poeira** — Uma cidade fronteiriça esconde um culto que invoca algo da mesa vermelha.

Parte do catálogo de pacotes de inicialização do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Oeste + sobrenatural. Pistoleiros, espíritos da poeira e um culto na mesa. O recurso "Poeira" se acumula com o tempo — quando atinge 100, o andarilho é consumido pelo deserto.

## Início Rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.submitAction('inspect');
```

## Conteúdo

- **5 zonas:** Encruzilhada do Andarilho, Salão, Delegacia do Xerife, Trilha da Mesa Vermelha, Gruta dos Espíritos
- **2 NPCs:** Bartender Silas, Xerife Hale
- **2 inimigos:** Revenant da Poeira, Rastejador da Mesa
- **1 árvore de diálogo:** Informações do bartender sobre o culto da mesa
- **1 árvore de progressão:** Caminho do Pistoleiro (Mão Rápida → Vontade de Ferro → Olhar Mortal)
- **1 item:** Feixe de Sálvia (reduz a Poeira em 20)

## Mecânicas Únicas

| Verbo | Descrição |
|------|-------------|
| `draw` | Duelo de reflexos — competição de reflexos |
| `commune` | Converse com espíritos usando conhecimento. |

## Estatísticas e Recursos

| Estatística | Função |
|------|------|
| resiliência | Resistência e força de vontade |
| velocidade de saque | Reflexos e tempo de reação |
| conhecimento | Conhecimento sobrenatural |

| Recurso | Alcance | Observações |
|----------|-------|-------|
| HP | 0–30 | Saúde padrão |
| Determinação | 0–20 | Força mental, regenera 1 por "tick" |
| Poeira | 0–100 | **Pressão inversa** — acumula, 100 = morte |

## Licença

MIT
