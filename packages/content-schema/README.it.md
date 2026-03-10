<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Schemi di contenuto e validatori per il motore AI RPG: definisce stanze, entità, dialoghi, oggetti e missioni come dati.

## Installazione

```bash
npm install @ai-rpg-engine/content-schema
```

## Cosa c'è dentro

- **Schemi delle stanze** — aree con uscite, proprietà e stato ambientale.
- **Schemi delle entità** — definizioni di personaggi non giocanti (PNG), creature e personaggi del giocatore.
- **Schemi dei dialoghi** — alberi di dialogo basati su grafi, con condizioni ed effetti.
- **Schemi degli oggetti** — equipaggiamento, oggetti consumabili, oggetti di missione con modificatori di statistiche.
- **Caricatore di pacchetti di contenuti** — convalida e caricamento di pacchetti di contenuti JSON/TypeScript.
- **Schemi delle abilità** — definizioni delle abilità, definizioni degli stati e convalida dei pacchetti con avvisi sull'equilibrio.
- **Convalidatori di schemi** — convalida a runtime con messaggi di errore strutturati.

## Utilizzo

```typescript
import { validateContentPack, RoomSchema, EntitySchema } from '@ai-rpg-engine/content-schema';

const result = validateContentPack(myContentData);
if (!result.valid) {
  console.error(result.errors);
}
```

## Documentazione

- [File di contenuto (Cap. 13)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/13-content-files/) — creazione di pacchetti di contenuti.
- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
