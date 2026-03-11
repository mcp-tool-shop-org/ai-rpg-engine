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

# @ai-rpg-engine/starter-gladiator

**Exemplo de Implementação** — Este exemplo demonstra como conectar o motor para combates em arena. É um exemplo para aprender, não um modelo para copiar. Consulte o [Guia de Implementação](../../docs/handbook/57-composition-guide.md) para criar seu próprio jogo.

**Coliseu de Ferro** — Uma arena subterrânea para gladiadores, localizada sob um império em ruínas. Lute pela liberdade, ganhe o apoio de patrocinadores e sobreviva ao julgamento da multidão.

Parte do catálogo de pacotes iniciais do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Combate em arena romana + política de patrocínio. O Favor da Multidão oscila muito, dependendo do espetáculo — um alto nível de favor desbloqueia presentes dos patrocinadores, um baixo nível de favor significa uma sentença de morte. Os patrocinadores veem os gladiadores como "investimentos em sangue e espetáculo".

## Início Rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## Padrões Demonstrados

| Funcionalidade | O que o Gladiator demonstra |
|---------|----------------------|
| **Resources** | Recurso meta volátil (favor do público) impulsionado pelo espetáculo, e não pela eficiência. |
| **Combat** | Design de chefe em 3 fases com mudanças dinâmicas durante o combate. |
| **Custom verbs** | Provocações e exibições como ações de combate que não causam dano, mas afetam os recursos. |
| **Social** | Sistema de patrocínio limitado por níveis de favor do público. |

## Conteúdo

- **5 zonas:** Celas de Prisão, Piso da Arena, Galeria dos Patrocinadores, Armazém, Saída do Túnel
- **3 NPCs:** Lanista Brutus (mestre da arena), Domina Valeria (patrocinadora), Nerva (aliado veterano)
- **2 inimigos:** Campeão da Arena, Fera de Guerra
- **1 árvore de diálogo:** Público dos patrocinadores sobre patrocínio e política da arena
- **1 árvore de progressão:** Glória na Arena (Agradador da Multidão → Resistência de Ferro → Lutador pela Liberdade)
- **1 item:** Token de Patrocinador (aumenta o favor da multidão em 10)

## Mecânicas Únicas

| Verbo | Descrição |
|------|-------------|
| `taunt` | Provocar inimigos e emocionar a multidão. |
| `showboat` | Sacrificar eficiência em prol do espetáculo e do favor. |

## Estatísticas e Recursos

| Estatística | Função |
|------|------|
| Força | Poder bruto, golpes pesados. |
| Agilidade | Velocidade, esquiva, precisão. |
| Showmanship | Manipulação da multidão, combate teatral. |

| Recurso | Alcance | Observações |
|----------|-------|-------|
| HP | 0–40 | Saúde padrão. |
| Fadiga | 0–50 | Pressão inversa — aumenta em combate, recupera -2 por "tick". |
| Favor da Multidão | 0–100 | Volátil — >75 desbloqueia presentes dos patrocinadores, <25 significa morte. |

## O que você pode adaptar

Economia de recursos de desempenho (favor do público) e design de chefe em 3 fases. Estude como o favor do público funciona como um recurso meta volátil que depende do espetáculo, e não da eficiência, e como a luta contra o Campeão da Arena utiliza transições de fase para alterar a dinâmica do combate durante o confronto.

## Licença

MIT
