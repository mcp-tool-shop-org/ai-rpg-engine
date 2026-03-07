<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a>
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

Un toolkit avanzato per la creazione, l'analisi e l'ottimizzazione di mondi di gioco di ruolo (RPG).

L'AI RPG Engine combina un motore di simulazione deterministica con un ambiente di progettazione assistito dall'intelligenza artificiale, consentendo agli autori di creare mondi, testarli tramite simulazione e migliorarli sulla base di dati concreti, anziché di semplici ipotesi.

> Gli strumenti tradizionali vi aiutano a scrivere storie.
> L'AI RPG Engine vi aiuta a **testare i mondi**.

---

## Cosa fa

```
build → critique → simulate → analyze → tune → experiment
```

È possibile generare contenuti per il mondo di gioco, valutare i progetti, eseguire simulazioni deterministiche, analizzare il comportamento delle partite, ottimizzare le meccaniche, eseguire esperimenti su diverse configurazioni e confrontare i risultati. Ogni risultato è riproducibile, verificabile e spiegabile.

---

## Funzionalità principali

### Simulazione deterministica

Un motore di simulazione basato su "tick" per i mondi di gioco di ruolo. Include lo stato del mondo, il sistema di eventi, i livelli di percezione e cognizione, la propagazione delle credenze delle fazioni, i sistemi di voci, le metriche dei distretti, i registri delle azioni riproducibili e un generatore di numeri casuali (RNG) deterministico. Ogni esecuzione può essere riprodotta esattamente.

### Creazione di mondi assistita dall'IA

Un livello opzionale di intelligenza artificiale che crea stanze, fazioni, missioni e distretti a partire da un tema. Valuta i progetti, corregge gli errori di schema, propone miglioramenti e guida i processi di creazione del mondo. L'IA non modifica direttamente lo stato della simulazione, ma genera solo contenuti o suggerimenti.

### Flussi di lavoro di progettazione guidati

Flussi di lavoro sensibili al contesto e basati sulla pianificazione per la creazione del mondo, i cicli di valutazione, l'iterazione del design, la creazione guidata e i piani di ottimizzazione strutturati. Combina strumenti deterministici con l'assistenza dell'IA.

### Analisi della simulazione

Analisi delle partite che spiega perché si sono verificati determinati eventi, dove le meccaniche non funzionano correttamente, quali trigger non si attivano e quali sistemi creano instabilità. I risultati strutturati vengono utilizzati direttamente per l'ottimizzazione.

### Ottimizzazione guidata

I risultati dell'analisi generano piani di ottimizzazione strutturati con correzioni proposte, impatto previsto, stime di affidabilità e modifiche in anteprima. Vengono applicati passo dopo passo, con piena tracciabilità.

### Esperimenti di simulazione

Eseguire batch di simulazioni su diverse configurazioni per comprendere il comportamento tipico. Estrarre metriche di scenario, rilevare la varianza, modificare i parametri e confrontare i mondi ottimizzati con quelli di base. Trasforma la progettazione del mondo in un processo testabile.

### Ambiente di sviluppo

Ambiente di sviluppo a riga di comando (CLI) con dashboard di progetto, navigazione dei problemi, ispezione degli esperimenti, cronologia delle sessioni, onboarding guidato e scoperta di comandi contestuali. È uno spazio di lavoro per la creazione e il test di mondi.

---

## Guida rapida

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

## Flusso di lavoro di esempio

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

Creare un mondo e migliorarlo attraverso prove ottenute dalla simulazione.

---

## Architettura

Il sistema è composto da quattro livelli.

| Livello | Ruolo |
|-------|------|
| **Simulation** | Motore di simulazione deterministico — stato del mondo, eventi, azioni, percezione, cognizione, fazioni, propagazione delle voci, metriche dei distretti, riproduzione |
| **Authoring** | Generazione di contenuti — scaffolding, valutazione, normalizzazione, cicli di correzione, generatori di pacchetti |
| **AI Cognition** | Assistenza opzionale dell'IA — interfaccia di chat, instradamento contestuale, recupero, modellazione della memoria, orchestrazione degli strumenti |
| **Studio UX** | Ambiente di sviluppo a riga di comando — dashboard, tracciamento dei problemi, navigazione degli esperimenti, cronologia delle sessioni, flussi di lavoro guidati |

---

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Motore di simulazione deterministico — stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | 17 moduli integrati — combattimento, percezione, cognizione, fazioni, voci, distretti |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione assistita dall'IA (opzionale) — scaffolding, valutazione, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio di progettazione basato su riga di comando: shell di chat, flussi di lavoro, strumenti di sperimentazione. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motore di rendering per terminale e livello di input. |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold: mondo di partenza a tema fantasy. |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox: mondo di partenza a tema cyberpunk. |

---

## Documentazione

| Risorse. | Descrizione. |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 26 capitoli + 4 appendici che coprono ogni sistema. |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline di azioni, verità vs. presentazione, livelli di simulazione. |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flussi di lavoro per la creazione di prototipi, la diagnosi, l'ottimizzazione e la sperimentazione. |
| [Philosophy](PHILOSOPHY.md) | Perché mondi deterministici, progettazione basata su evidenze e l'intelligenza artificiale come assistente. |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni. |

---

## Filosofia

Il motore AI RPG è costruito attorno a tre idee:

1. **Mondi deterministici:** i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata su evidenze:** le meccaniche del mondo devono essere testate tramite simulazione.
3. **L'intelligenza artificiale come assistente, non come autorità:** gli strumenti di intelligenza artificiale aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Consultare [PHILOSOPHY.md](PHILOSOPHY.md) per una spiegazione completa.

---

## Sicurezza

AI RPG Engine è una **libreria di simulazione esclusivamente locale**. Nessuna telemetria, nessuna rete, nessun segreto. I file di salvataggio vengono scritti nella cartella `.ai-rpg-engine/` solo quando esplicitamente richiesto. Consultare [SECURITY.md](SECURITY.md) per i dettagli.

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
