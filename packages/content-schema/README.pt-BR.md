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

# @ai-rpg-engine/content-schema

Esquemas de conteúdo e validadores para o AI RPG Engine — defina salas, entidades, diálogos, itens e missões como dados.

## Instalação

```bash
npm install @ai-rpg-engine/content-schema
```

## O que está incluído

- **Esquemas de ambientes** — áreas com saídas, propriedades e estado do ambiente.
- **Esquemas de entidades** — definições de personagens não jogáveis (NPCs), criaturas e personagens do jogador.
- **Esquemas de diálogo** — árvores de diálogo baseadas em grafos, com condições e efeitos.
- **Esquemas de itens** — equipamentos, consumíveis, itens de missão com modificadores de atributos.
- **Carregador de pacotes de conteúdo** — valida e carrega pacotes de conteúdo em formato JSON/TypeScript.
- **Esquemas de habilidades** — definições de habilidades, definições de estados e validação de pacotes, com avisos sobre o equilíbrio do jogo.
- **Validadores de esquemas** — validação em tempo de execução com mensagens de erro estruturadas.

## Uso

```typescript
import { validateContentPack, RoomSchema, EntitySchema } from '@ai-rpg-engine/content-schema';

const result = validateContentPack(myContentData);
if (!result.valid) {
  console.error(result.errors);
}
```

## Documentação

- [Arquivos de conteúdo (Cap. 13)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/13-content-files/) — criação de pacotes de conteúdo.
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
