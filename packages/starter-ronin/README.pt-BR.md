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

# @ai-rpg-engine/starter-ronin

**Exemplo de Estrutura** — Este exemplo demonstra como estruturar um jogo com elementos de mistério feudal. É um exemplo para aprender, não um modelo para copiar. Consulte o [Guia de Estrutura](../../docs/handbook/57-composition-guide.md) para criar seu próprio jogo.

**Jade Veil** — Um castelo feudal durante um tenso encontro político. Um senhor foi envenenado. Descubra o assassino antes que a honra se perca.

Parte do catálogo de pacotes de inicialização do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Mistério feudal + intrigas da corte. A honra é frágil — falsas acusações têm um alto custo e são quase impossíveis de reverter. Cada pergunta tem peso, cada acusação tem consequências. Os assassinos veem o ronin como "uma lâmina sem senhor — imprevisível".

## Início Rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## Padrões Demonstrados

| Funcionalidade | O que o Ronin demonstra |
|---------|------------------|
| **Engagement** | Múltiplos papéis de protetor (guarda-costas + samurai), passagens secretas. |
| **Resources** | Sistema de camadas: ki (regeneração) vs. honra (frágil, difícil de recuperar). |
| **Social** | Investigação com consequências — acusações falsas custam honra. |
| **Cognition** | Regra de percepção de assassinos, direcionada a ronins não afiliados. |

## Conteúdo

- **5 zonas:** Portão do Castelo, Grande Salão, Jardim de Chá, Câmara do Senhor, Passagem Secreta
- **3 NPCs:** Lorde Takeda (senhor envenenado), Lady Himiko (suspeita), Magistrado Sato (investigador)
- **2 inimigos:** Assassino das Sombras, Samurai Corrupto
- **1 árvore de diálogo:** Magistrado informa sobre o envenenamento e os suspeitos da corte
- **1 árvore de progressão:** Caminho da Lâmina (Mão Firme → Calma Interior → Fúria Justa)
- **1 item:** Kit de Incenso (restaura 5 ki)

## Mecânicas Únicas

| Verbo | Descrição |
|------|-------------|
| `duel` | Desafio marcial formal usando disciplina |
| `meditate` | Restaura ki e compostura ao custo de um turno |

## Estatísticas e Recursos

| Estatística | Função |
|------|------|
| disciplina | Habilidade marcial, técnica de lâmina, foco |
| percepção | Consciência, dedução, leitura de intenções |
| compostura | Controle social, domínio emocional |

| Recurso | Alcance | Notas |
|----------|-------|-------|
| HP | 0–30 | Saúde padrão |
| Honra | 0–30 | Frágil — falsas acusações custam -5, difícil de recuperar |
| Ki | 0–20 | Energia espiritual, regenera 2/tick |

## O que pode ser adaptado

Múltiplos papéis de protetor (guarda-costas + samurai) e recursos de camadas (ki + honra). Estude como dois papéis de protetor com diferentes condições de ativação criam uma defesa em camadas, e como o ki (regeneração) vs. a honra (frágil, difícil de recuperar) forçam diferentes estilos de jogo em combate e investigação.

## Licença

MIT
