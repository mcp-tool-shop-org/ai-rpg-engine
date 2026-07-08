<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Motore RPG basato sull'IA

Un toolkit TypeScript per la creazione di simulazioni RPG deterministiche. Si definiscono le statistiche, si selezionano i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali (RNG), la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 10 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e che possono essere remixati. Il tuo gioco utilizza qualsiasi sottoinsieme del motore necessario.

---

## Cos'è questo

- Una **libreria di moduli**: oltre 30 moduli per il motore, che coprono combattimento, percezione, cognizione, fazioni, voci, movimento, compagni e altro ancora.
- Un **toolkit di composizione**: `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco.
- Un **ambiente di simulazione**: cicli deterministici, registri di azioni riproducibili, RNG con seme predefinito.
- Uno **studio di progettazione IA** (opzionale): scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama.

## Cos'è questo non

- Non è un gioco giocabile fin da subito: si compone a partire da moduli e contenuti.
- Non è un motore grafico: genera eventi strutturati, non pixel.
- Non è un generatore di storie: simula mondi; la narrazione emerge dalla meccanica del gioco.

---

## Stato attuale (v2.5.0)

**Cosa funziona ed è stato testato:**
- Motore principale: stato del mondo, eventi, azioni, cicli, riproduzione: stabile dalla versione 1.0; riproduzione deterministica byte per byte (contatore di ID per istanza, RNG con seme predefinito).
- Sistema di combattimento: 5 azioni, 4 stati di combattimento, 4 stati di coinvolgimento, intercettazione dei compagni, flusso di sconfitta, tattiche IA.
- Abilità: costi, tempi di ricarica, controlli delle statistiche, effetti tipizzati, vocabolario di stato a 11 tag, selezione consapevole dell'IA.
- **Combattimento di gruppo (v2.4):** targeting degli alleati (cura/potenziamento/rianimazione), filtro AoE tra amici e nemici, selettori di bersaglio: un curatore può curare un compagno di squadra; l'AoE del nemico risparmia gli alleati.
- **Effetti di stato (v2.4):** i modificatori passivi delle statistiche influenzano il combattimento, DoT/HoT deterministici basati sul contatore dei cicli, trigger reattivi con profondità limitata (spine/riflesso).
- **Profili plug-in: risoluzione delle regole per entità (v2.5):** un combattente "potente" e un mistico "volitivo" affrontano il combattimento insieme, leggendo le statistiche attraverso la propria mappatura. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` applica un profilo (mappatura delle statistiche, pool di risorse, abilità per entità); `buildProfile()`, `validateProfileSet()` (gli ID duplicati vengono rifiutati), 10 modelli derivati iniziali e un comando CLI `profile`.
- Livello decisionale unificato: il punteggio del combattimento e delle abilità viene combinato in una singola chiamata (`selectBestAction`).
- Tutti i 10 mondi iniziali utilizzano `buildCombatStack()`: la struttura di composizione collaudata.
- API di configurazione della cognizione (`cognition: CognitionCoreConfig | false`) per l'ottimizzazione dell'IA per ciascun mondo iniziale.
- Tassonomia dei tag e strumenti di convalida per la creazione di contenuti.
- `ai-rpg-engine create-starter <name>`: crea un nuovo gioco; comandi `validate` e `scaffold` per i contenuti; carica pacchetti da JSON.
- Modello iniziale pubblicato su npm (`@ai-rpg-engine/starter-template`).
- Suite di test completa: **3613 test in 193 file** (deterministici nelle esecuzioni ripetute; il rispetto della copertura è applicato nell'integrazione continua).

**Cosa è ancora in fase di sviluppo o incompleto:**
- Gli strumenti di creazione del mondo IA (livello Ollama) sono testati meno a fondo rispetto al motore di simulazione, anche se la versione 2.5 ha aggiunto una gestione strutturata degli errori, un ciclo di ripetizione configurabile/osservabile e un'opzione `--validate` per i contenuti generati.
- Il multiplayer (due giocatori umani che condividono un mondo) **non** è stato implementato: si tratta di un livello di rete, volutamente fuori dall'ambito; attualmente, i profili sono destinati a un singolo controller.
- La documentazione è estesa, ma non tutte le pagine del manuale riflettono le API più recenti.

---

## Avvio rapido

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulta la [Guida alla composizione](docs/handbook/57-composition-guide.md) per il flusso di lavoro completo, oppure crea un nuovo mondo iniziale:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Core Runtime** | Motore deterministico: stato del mondo, eventi, azioni, cicli, RNG, riproduzione. |
| **Modules** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, movimento, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore. |
| **AI Studio** | Livello Ollama opzionale: scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti. |

---

## Sistema di combattimento

Cinque azioni (attacco, guardia, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (protetto, sbilanciato, esposto, in fuga), quattro stati di coinvolgimento (coinvolto, protetto, retroguardia, isolato). Tre dimensioni statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso da un bruto pesante o da un sentinella composto.

Gli avversari IA utilizzano un punteggio decisionale unificato: le azioni di combattimento e le abilità competono in una singola valutazione, con soglie configurabili per evitare l'uso eccessivo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per configurare il combattimento a partire da una mappatura delle statistiche, un profilo delle risorse e tag di polarizzazione. Consulta la [Panoramica del combattimento](docs/handbook/49a-combat-overview.md) e la [Guida all'autore dei pacchetti](docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità nativo del genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, cura, applicazione dello stato, rimozione dello stato). Gli effetti di stato utilizzano un vocabolario semantico a 11 tag con profili di resistenza/vulnerabilità. La selezione consapevole dell'IA valuta i percorsi auto/AoE/bersaglio singolo.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Ambiente di simulazione deterministico: stato del mondo, eventi, RNG, cicli, risoluzione delle azioni. |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, movimento, compagni, autonomia dei PNG, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento dell'arco narrativo, trigger di fine gioco. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi canonici e validatori per i contenuti del mondo. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della configurazione, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti, crescita delle reliquie |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti sulle relazioni, stato della campagna |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccaniche di mutazione, tracciamento della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano narrativo, contratti di rendering, profili vocali |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Pianificazione dei segnali acustici, priorità, attenuazione, logica di cooldown |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifesti del pacchetto audio, registro indirizzabile per contenuto |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione del pacchetto, valutazione della rubrica, scoperta del pacchetto |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Archiviazione basata sul contenuto per ritratti, icone, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza testa con provider modulari |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione opzionale tramite AI: scheletro, critica, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esecuzione dei giochi, creazione di configurazioni iniziali, ispezione dei salvataggi |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer terminale e livello di input |

### Esempi iniziali

I 10 mondi iniziali sono **esempi di composizione**: dimostrano come combinare i moduli del motore in giochi completi. Ognuno mostra schemi diversi (mappature delle statistiche, profili delle risorse, configurazioni dell'interazione, set di abilità). Consultare il file README di ogni mondo iniziale per "Schemi dimostrati" e "Cosa prendere in prestito".

| Mondo iniziale | Genere | Schemi chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy oscuro | Combattimenti minimi, guidato dal dialogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di interazione |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Prima l'aspetto sociale, con grande attenzione alla percezione |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Navale + combattimento ravvicinato, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa dell'infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Far West insolito | Bias dei pacchetti, recupero della zona sicura |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Punti di strozzatura, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, ruoli multipli di protettore |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa del sangue, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore della folla |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crea un nuovo gioco: tramite CLI o percorso del modello manuale |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Costruisci il tuo gioco componendo i moduli del motore |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Sei pilastri di combattimento, cinque azioni, stati a colpo d'occhio |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Passo dopo passo: buildCombatStack, mappatura delle statistiche, profili delle risorse |
| [Handbook](docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Examples](docs/examples/) | Esempi TypeScript eseguibili (con controllo dei tipi + test del comportamento in CI): gruppo misto per entità, profili condivisi, tra mondi, da zero |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità rispetto alla presentazione |
| [Philosophy](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, AI come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Dove siamo ora

L'ambiente di esecuzione della simulazione, la struttura di composizione del combattimento e il percorso di creazione dei mondi iniziali sono completi: 3613 test su 193 file, tutti i 10 mondi iniziali su `buildCombatStack`, riproduzione deterministica byte per byte, punteggio completo delle decisioni dell'IA e un comando CLI per la creazione. **La v2.5 offre la risoluzione delle regole per entità: la funzionalità principale dei profili plug-in: un combattente "forza" e un mistico "volontà" risolvono il combattimento in una singola battaglia, ciascuno leggendo le statistiche tramite la propria mappatura.**

**Ciclo di rilascio recente (v2.3.3–v2.5.0):**
- v2.3.3–v2.3.7: prova dell'artefatto per l'utente finale, rafforzamento del Combat Stack, tutti i 10 mondi iniziali su `buildCombatStack`, modello iniziale pubblicato, CLI `create-starter`
- v2.4.0: combattimento di gruppo (bersagliamento degli alleati / cura / potenziamento / rianimazione, effetto di stato (modificatori + DoT/HoT + trigger reattivi), fase 1 dei profili plug-in, CLI `validate`/`scaffold` per il contenuto
- **v2.5.0: risoluzione delle regole per entità (combattimento con stili di gioco misti), caricatore `applyProfile` + abilità per entità, modelli di profilo + CLI `profile` e una revisione completa della salute (correzione della riproduzione byte per byte, rafforzamento della correttezza, implementazione delle misure di controllo qualità)**

### Prossimo

- Multiplayer: due giocatori *umani* che condividono un mondo (un livello di rete, volutamente rimandato; i profili condivisi con un singolo controller sono disponibili oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Override delle formule serializzabili: ottimizzazione della formula per profilo (in attesa di un DSL per le formule; i profili contengono oggi mappature delle statistiche, non chiusure)
- Sincronizzazione della documentazione API: assicurarsi che ogni pagina del manuale rifletta le API v2.5

### Destinazione: Profili plug-in

L'obiettivo finale del motore è la creazione di **profili definiti dall'utente**: pacchetti portatili che si inseriscono in qualsiasi gioco. Un profilo raggruppa una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire dalla v2.5, le entità in un mondo possono ciascuna avere il proprio profilo e risolvere il combattimento per entità: un combattente "forza" e un mistico "volontà" condividono una squadra, ognuno portando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle abilità per entità e la convalida tra profili sono tutti disponibili. Ciò che resta è il multiplayer: consentire a due giocatori *umani* (e non solo a due entità) di condividere un mondo, il che richiede un livello di rete. Consultare [Roadmap del profilo](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) per la progettazione.

---

## Filosofia

L'AI RPG Engine è costruito su tre idee:

1. **Mondi deterministici:** i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata sull'evidenza:** le meccaniche del mondo dovrebbero essere testate tramite simulazione.
3. **L'IA come assistente, non come autorità:** gli strumenti di IA aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Per una spiegazione completa, consultare [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sicurezza

Il motore principale è una **libreria di simulazione esclusivamente locale**: nessun telemetria, nessuna rete, nessun dato sensibile. I file salvati vengono archiviati in `.ai-rpg-engine/` solo quando esplicitamente richiesto. Lo strato di IA **opzionale** (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**: la sua funzione `webfetch` (per RAG), attivabile facoltativamente, è l'unica connessione di rete in uscita ed è protetta da una protezione SSRF (che blocca loopback/link-local/CGNAT/metadati cloud e le relative equivalenti IPv6) — non si potrà accedere a essa a meno che non venga esplicitamente attivata. Per i dettagli, consultare [SECURITY.md](SECURITY.md).

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
