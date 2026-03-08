<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português</a>
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

Toolkit nativo per la simulazione, progettato per costruire, analizzare e bilanciare mondi RPG.

AI RPG Engine combina un motore di simulazione deterministica con uno studio di progettazione assistito dall'intelligenza artificiale, consentendo agli autori di costruire mondi, testarli tramite simulazione e migliorarli sulla base di evidenze concrete anziché di semplici ipotesi.

> Gli strumenti tradizionali vi aiutano a scrivere storie.
> AI RPG Engine vi aiuta a **testare i mondi**.

---

## Cosa fa

```
build → critique → simulate → analyze → tune → experiment
```

Potete generare contenuti per il mondo, valutare i progetti, eseguire simulazioni deterministiche, analizzare il comportamento delle partite, ottimizzare le meccaniche, eseguire esperimenti su molte configurazioni e confrontare i risultati. Ogni risultato è riproducibile, ispezionabile e spiegabile.

---

## Funzionalità principali

### Simulazione deterministica

Un motore di simulazione basato su tick per mondi RPG. Stato del mondo, sistema di eventi, livelli di percezione e cognizione, propagazione delle credenze delle fazioni, sistemi di voci, metriche dei distretti con derivazione dell'umore, agentività dei PNG con punti di rottura della lealtà e catene di conseguenze, compagni con morale e rischio di abbandono, leva del giocatore e azione politica, analisi strategica della mappa, consigliere di mosse, riconoscimento degli oggetti e provenienza dell'equipaggiamento, traguardi di crescita delle reliquie, opportunità emergenti (contratti, taglie, favori, missioni di rifornimento, indagini) generate dalle condizioni del mondo, rilevamento degli archi narrativi della campagna (10 tipi di arco derivati dallo stato accumulato), rilevamento dei trigger di fine gioco (8 classi di risoluzione) e rendering deterministico del finale con epiloghi strutturati. Registri delle azioni riproducibili e RNG deterministico. Ogni esecuzione può essere riprodotta esattamente.

### Creazione di mondi assistita dall'IA

Livello opzionale di intelligenza artificiale che crea stanze, fazioni, missioni e distretti a partire da un tema. Valuta i progetti, normalizza gli errori di schema, propone miglioramenti e guida i flussi di lavoro di creazione del mondo a più fasi. L'IA non modifica mai direttamente lo stato della simulazione: genera solo contenuti o suggerimenti.

### Flussi di lavoro di progettazione guidati

Flussi di lavoro consapevoli della sessione e basati sulla pianificazione per la creazione del mondo, i cicli di valutazione, l'iterazione del design, la costruzione guidata e i piani di ottimizzazione strutturati. Combina strumenti deterministici con l'assistenza dell'IA.

### Analisi della simulazione

Analisi delle partite che spiega perché si sono verificati determinati eventi, dove le meccaniche non funzionano, quali trigger non si attivano e quali sistemi creano instabilità. I risultati strutturati alimentano direttamente l'ottimizzazione.

### Ottimizzazione guidata

I risultati dell'analisi del bilanciamento generano piani di ottimizzazione strutturati con correzioni proposte, impatto previsto, stime di affidabilità e modifiche in anteprima. Vengono applicati passo dopo passo, con piena tracciabilità.

### Esperimenti di simulazione

Eseguite batch di simulazioni su diverse configurazioni per comprendere il comportamento tipico. Estraete metriche di scenario, rilevate la varianza, variate i parametri e confrontate mondi ottimizzati con quelli di base. Trasforma la progettazione del mondo in un processo verificabile.

### Studio Shell

Studio di progettazione CLI con dashboard di progetto, navigazione dei problemi, ispezione degli esperimenti, cronologia delle sessioni, onboarding guidato e scoperta di comandi contestuali. Uno spazio di lavoro per costruire e testare mondi.

---

## Guida rapida

```bash
# Installa la CLI
npm install -g @ai-rpg-engine/cli

# Avvia lo studio interattivo
ai chat

# Esegui l'onboarding
/onboard

# Crea il tuo primo contenuto
create-room haunted chapel

# Esegui una simulazione
simulate

# Analizza i risultati
analyze-balance

# Ottimizza il design
tune paranoia

# Esegui un esperimento
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

Costruite un mondo e miglioratelo attraverso le evidenze della simulazione.

---

## Architettura

Il sistema è composto da quattro livelli.

| Livello | Ruolo |
|-------|------|
| **Simulation** | Motore deterministico — stato del mondo, eventi, azioni, percezione, cognizione, fazioni, propagazione delle voci, metriche dei distretti, riproduzione |
| **Authoring** | Generazione di contenuti — scaffolding, valutazione, normalizzazione, cicli di correzione, generatori di pacchetti |
| **AI Cognition** | Assistenza opzionale dell'IA — shell di chat, instradamento contestuale, recupero, modellazione della memoria, orchestrazione degli strumenti |
| **Studio UX** | Ambiente di progettazione CLI — dashboard, tracciamento dei problemi, navigazione degli esperimenti, cronologia delle sessioni, flussi di lavoro guidati |

---

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Motore di simulazione deterministico — stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 moduli integrati — combattimento, percezione, cognizione, fazioni, voci, distretti, agentività dei PNG, compagni, leva del giocatore, mappa strategica, consigliere di mosse, riconoscimento degli oggetti, opportunità emergenti, rilevamento degli archi narrativi, trigger di fine gioco |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Stato di progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipologie di equipaggiamento, provenienza degli oggetti, crescita delle reliquie, cronache degli oggetti |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti relazionali, stato della campagna |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione assistita dall'IA (opzionale) — scaffolding, valutazione, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio di progettazione a riga di comando — shell di chat, flussi di lavoro, strumenti di sperimentazione |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer per terminale e livello di input |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — mondo iniziale fantasy |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — mondo iniziale cyberpunk |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective — mondo iniziale giallo vittoriano |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem — mondo iniziale piratesco |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead — mondo iniziale di sopravvivenza zombie |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain — mondo iniziale weird west |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss — mondo iniziale colonia fantascientifica |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 43 capitoli + 4 appendici che coprono ogni sistema |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura — pipeline delle azioni, verità vs presentazione, livelli di simulazione |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flussi di lavoro per la creazione di prototipi, la diagnosi, l'ottimizzazione e la sperimentazione |
| [Philosophy](PHILOSOPHY.md) | Perché mondi deterministici, progettazione basata su evidenze e l'intelligenza artificiale come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Filosofia

AI RPG Engine è costruito attorno a tre idee:

1. **Mondi deterministici** — i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata su evidenze** — le meccaniche del mondo devono essere testate tramite simulazione.
3. **L'IA come assistente, non come autorità** — gli strumenti di intelligenza artificiale aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Consultate [PHILOSOPHY.md](PHILOSOPHY.md) per la spiegazione completa.

---

## Sicurezza

AI RPG Engine è una **libreria di simulazione esclusivamente locale**. Nessuna telemetria, nessuna rete, nessun segreto. I file di salvataggio vengono scritti nella cartella `.ai-rpg-engine/` solo quando esplicitamente richiesto. Consultate [SECURITY.md](SECURITY.md) per i dettagli.

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
