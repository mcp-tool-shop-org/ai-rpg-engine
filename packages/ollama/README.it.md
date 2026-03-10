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

# @ai-rpg-engine/ollama

Studio di progettazione AI per il motore di giochi di ruolo AI: fornisce una struttura di base, strumenti di analisi, flussi di lavoro guidati, ottimizzazione, esperimenti e un'esperienza utente ottimizzata.

Si connette a un'istanza locale di [Ollama](https://ollama.ai). Non modifica mai direttamente i dati di simulazione; tutto l'output viene, per impostazione predefinita, inviato all'output standard.

## Installazione

```bash
npm install @ai-rpg-engine/ollama
```

## Cosa include

- **Struttura di base dei contenuti** — genera stanze, fazioni, missioni, distretti, pacchetti di località e pacchetti di incontri a partire da un tema.
- **Analisi e correzione** — convalida dei contenuti generati rispetto agli schemi del motore, correzione automatica in caso di errori.
- **Shell di chat** — sessione di progettazione interattiva con routing contestuale, orchestrazione degli strumenti e gestione della memoria.
- **Creazioni guidate** — flussi di lavoro di creazione del mondo multi-step, guidati dalla sessione e basati su una pianificazione preliminare.
- **Analisi della simulazione** — analisi delle simulazioni con identificazione strutturata dei problemi di bilanciamento.
- **Ottimizzazione guidata** — piani di ottimizzazione strutturati, basati sui risultati dell'analisi del bilanciamento, con esecuzione passo dopo passo.
- **Esperimenti di scenario** — esecuzioni di simulazione in batch, rilevamento delle variazioni, analisi dei parametri e confronto prima/dopo.
- **Esperienza utente dello studio** — dashboard, navigazione tra i problemi, ispezione degli esperimenti, cronologia delle sessioni, scoperta dei comandi e tutorial.

## Utilizzo

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## Documentazione

- [Guida alla creazione di mondi AI](AI_WORLDBUILDING.md) — documentazione completa dei flussi di lavoro.
- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
