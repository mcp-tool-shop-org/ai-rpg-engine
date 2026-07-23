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

Un toolkit TypeScript per la creazione di simulazioni RPG deterministiche. Si definiscono le statistiche, si scelgono i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali (RNG), la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 10 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e che possono essere modificati. Il tuo gioco utilizza qualsiasi sottoinsieme del motore necessario.

---

## Cos'è questo progetto

- Una **libreria di moduli**: oltre 30 moduli per il motore, che coprono combattimento, percezione, cognizione, fazioni, voci, spostamenti, compagni e altro ancora.
- Un **toolkit di composizione**: `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco.
- Un **ambiente di simulazione**: cicli deterministici, registri delle azioni riproducibili, RNG con seme predefinito.
- Uno **studio di progettazione dell'IA** (opzionale): scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama.

## Cos'è questo progetto NON

- Non è un singolo gioco completo: include 10 mondi iniziali giocabili che puoi utilizzare oggi come esempi e il motore è il toolkit da cui componi il *tuo* gioco.
- Non è un motore grafico: genera eventi strutturati, non pixel.
- Non è un generatore di storie: simula mondi; la narrazione emerge dalla meccanica del gioco.

---

## Stato attuale (versione 3.0.0)

**Cosa funziona ed è stato testato:**

*   **Motore principale:** stato del mondo, eventi, azioni, cicli di gioco, replay — stabile dalla versione 1.0; replay deterministico e identico byte per byte (contatore ID per istanza, generazione casuale con seme).
*   **Sistema di combattimento:** 5 azioni, 4 stati di combattimento, 4 stati di interazione, intercettazione dei compagni, flusso di sconfitta, tattiche dell'IA.
*   **Abilità:** costi, tempi di ricarica, controlli delle statistiche, effetti tipizzati, vocabolario di stato con 11 tag, selezione consapevole dell'IA.
*   **Combattimento di gruppo (v2.4):** targeting degli alleati (cura/potenziamento/rianimazione), filtro AoE per amici/nemici, selettori di bersaglio — un curatore può curare un compagno di squadra; l'AoE nemico risparmia gli alleati.
*   **Effetti di stato (v2.4):** i modificatori passivi delle statistiche influenzano il combattimento, DoT/HoT deterministici basati sul contatore dei cicli, trigger reattivi con profondità limitata (spine/riflesso).
*   **Profili plug-in — risoluzione delle regole per entità (v2.5):** un combattente "forte" e un mistico "volitivo" affrontano il combattimento insieme, ciascuno leggendo le statistiche tramite la propria mappatura. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` assegna un profilo (mappatura delle statistiche, pool di risorse, abilità per entità); `buildProfile()`, `validateProfileSet()` (ID duplicati rifiutati), 10 modelli derivati iniziali e un comando CLI `profile`.
*   **Ciclo di gioco eseguibile (`run`) (v2.6):** il gioco finale è reale, non una demo — i nemici agiscono in base ai propri profili di intelligenza artificiale (`aggressivo`/`cauto`/`territoriale`/`calcolatore`), un combattimento termina con la vittoria o la sconfitta, puoi salvare e riprendere, e le abilità e l'esperienza sono nel menu delle azioni. `run <path>` carica un gioco che hai creato. Interfaccia utente finale composta con una HUD facilmente consultabile e colori accessibili (rispetta `NO_COLOR` / non-TTY).
*   **Studio di progettazione dell'IA fornito come comando separato (`ai`) (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — crea, critica e bilancia i contenuti rispetto a un modello Ollama locale.
*   **Livello decisionale unificato:** combattimento + punteggio delle abilità combinati in una singola chiamata (`selectBestAction`).
*   Tutti i 10 mondi iniziali utilizzano `buildCombatStack()` — la struttura di composizione collaudata.
*   API di configurazione della cognizione (`cognition: CognitionCoreConfig | false`) per la regolazione dell'IA per ciascun mondo iniziale.
*   Tassonomia dei tag e utilità di convalida per la creazione di contenuti.
*   **Il mondo reagisce (v2.7):** gli scontri accumulano "calore" ed erodono la sicurezza del distretto; un ciclo di gioco mondiale attiva pressioni nascoste che emergono come voci ("Voci ti raggiungono…"), si intensificano e scompaiono con conseguenze; i circa 30 set di composizioni di incontri creati vengono attivati all'ingresso della zona in tutti i 10 mondi iniziali — deterministici per seme, i distretti più violenti ne generano di più, le sequenze principali dei boss sono protette.
*   **Un motivo per tornare (v2.7):** un ciclo di missioni minimo sullo schema già implementato da tempo — le missioni offrono opportunità in base ai trigger, tracciano obiettivi di uccisione/raggiungimento/progresso e forniscono esperienza e oggetti una sola volta; quattro missioni create, una schermata "Diario", elementi narrativi delle missioni nella narrazione del ciclo.
*   **L'equipaggiamento influenza il combattimento (v2.7):** `equip`/`unequip` modificano i valori reali attraverso lo strato di stato che le formule di combattimento già leggono — nessuna modifica al codice di combattimento; il tridente e la rete del gladiatore sono collegati end-to-end con una variazione della probabilità di colpire testata.
*   **Cicli di gioco con seme (v2.7):** ogni nuova sessione stampa il suo seme insieme al comando di replay esatto; `--seed <n>` riproduce una sessione byte per byte; combattimento, resistenza, abilità e tiri tattici utilizzano tutti il seme del mondo — e i finali leggono il gioco che hai effettivamente giocato (calore in tempo reale, pressioni, accumuli di fazioni, livello del giocatore).
*   **`buildWorldStack()` (v2.7):** la struttura di composizione strategica accanto a `buildCombatStack()` — una singola chiamata assembla ambiente, fazioni, voci, distretti, conseguenze della sconfitta, incontri e missioni; più la schermata "Registro del direttore" per la strategia, un ispettore di simulazione con `AI_RPG_DEBUG=1`, `inspect-save` protetto dalle stesse autorizzazioni di Continua e una connessione di migrazione dei moduli nel percorso di ripristino implementato.
*   **Agire sull'economia dinamica (v2.8):** `createEconomyCore` crea un'economia per distretto al caricamento del pacchetto e la aggiorna a ogni ciclo; un nuovo verbo "vendi" determina il prezzo dei bottini tramite `computeItemValue` (scarsità / fazione / provenienza / merce di contrabbando) e modifica l'offerta locale. Un singolo collegamento ha dato vita a cinque sistemi che sono stati implementati in modo nascosto nella v2.7 — la panoramica del mercato + il punteggio delle fazioni del direttore, l'arco finale del mercante-principe e il trigger di collasso e quattro tipi di pressione economica. **Solo vendita in questo ciclo** (acquisto → v2.9).
*   **Compagni (v2.8):** un verbo "recluta" crea un gruppo — stato, tag e fazione, quindi un compagno combatte *con* te; il combattimento dei compagni si basa sul meccanismo di intercettazione del motore di combattimento (inattivo fino a quando `isAlly` non viene impostato), i compagni reagiscono con morale e possono andarsene e il reclutamento attiva sette consumatori in attesa — la sequenza finale dei COMPAGNI, il targeting del gruppo, gli obiettivi dell'IA NPC, le missioni di favore e la sezione GRUPPO del direttore. **Intercettazione passiva in questo ciclo** (turni indipendenti → v2.9).
*   **Il direttore osserva l'intero scenario (v2.8):** una nuova sezione "EQUIPAGGIAMENTO" nel registro (dietro la dipendenza dalla provenienza dell'equipaggiamento dal CLI), un trailer finale del "RIEPILOGO DEL DIRETTORE", le sezioni "PANORAMICA DEL MERCATO" + "GRUPPO" ora alimentate da produttori in tempo reale e stabilità del distretto + tono economico nella sezione "DISTRETTI" del finale.
*   **L'altra metà dell'economia (v2.9):** un verbo "acquista" completa il ciclo — l'inventario del mercante offerto per distretto a granularità della categoria di fornitura (il livello di fornitura *è* il segnale di rifornimento), con prezzi determinati tramite la stessa pipeline `computeItemValue` di "vendi" più un margine di acquisto/vendita in modo che non ci sia un ciclo senza rischi. E l'artigianato prende vita: `createCraftingCore` registra "ricicla"/"crea"/"ripara"/"modifica" sulle tabelle di ricette create, illuminando le sezioni "MATERIALI" + "RICETTE" del direttore che erano state implementate in modo nascosto.
*   **I compagni fanno i loro turni (v2.9):** il livello di intercettazione passiva della v2.8 diventa il limite superiore — i compagni reclutati agiscono indipendentemente a ogni ciclo tramite l'advisor `selectBestAction` precedentemente inutilizzato, con una parzialità del combattimento per ruolo in modo che un guerriero e uno studioso combattono in modo diverso, intercettazione tra compagni e punti ferita del gruppo nella sezione "GRUPPO" del direttore. I pacchetti senza compagni rimangono identici byte per byte (il gate della festa vuota preserva il replay legacy con seme 0).
*   **Il livello sociale, collegato end-to-end (v2.9):** quattro verbi di leva — "corrompi", "intimidisci", "chiedi" e "diffondi" (voce) — scrivono valori reali globali di reputazione / allerta / calore che influenzano i prezzi e le porte delle fazioni già lette, e "diffondi" illumina l'intero modulo giocatore-voci + la sezione "VOCI SU DI TE" del direttore. Anche l'economia della leva che li finanzia è collegata: completare un'opportunità ora concede la leva che ha sempre narrato, quindi i verbi sono realmente ottenibili nel gioco.
*   **Opportunità, l'intero ciclo di vita (v2.9):** uno strumento di generazione per ciclo offre contratti/taglie/favori valutati in base allo stato del mondo attuale; si "accetta", quindi si "completa" o si "abbandona"; ignorare un'opportunità fino alla scadenza ora ha conseguenze (conseguenze della scadenza) e completare il favore di un compagno fa avanzare la morale di quel compagno. Gli archi finali del potere crescente e del mercante-principe leggono le opportunità che hai effettivamente risolto.
*   **Parità dei contenuti in tutti i dieci mondi iniziali (v2.9):** collegamento dell'equipaggiamento, missioni, compagni reclutabili e un saldo di monete iniziale implementati in ogni mondo iniziale che ne era privo — i dieci mondi ora condividono una superficie di funzionalità uniforme e completamente illuminata (l'equipaggiamento era solo per gladiatori; le missioni erano solo fantasy/zombie; cinque mondi hanno implementato "recluta" senza nessuno da reclutare). Inoltre, un validatore strutturale dei contenuti che rileva un ID di oggetto digitato male in ogni superficie di riferimento e slot di salvataggio con più checkpoint con `--checkpoint`/`--list-checkpoints`.
*   **NPC viventi, realmente vivi (v3.0):** il produttore dell'IA NPC persistente illumina la sezione "PERSONE" del direttore — gli NPC nominati (un personaggio della storia creato per mondo iniziale, più ogni compagno che recluti) hanno obiettivi, relazioni di fiducia/paura/avidità/lealtà, un registro degli obblighi e catene di conseguenze. `runNpcAgencyTick` viene eseguito a ogni ciclo, con restrizioni in modo che un mondo senza NPC nominati rimanga identico byte per byte al replay legacy. L'illuminazione del produttore ha anche illuminato i punti di interruzione della partenza dei favori dei compagni, due regole di generazione delle opportunità dormienti (obiettivo NPC + obbligo) e gli npcProfiles/npcObligations del finale — il collegamento è stato testato ed era funzionante ma inattivo nei contenuti implementati fino a quando un audit di fase 9 non lo ha rilevato, quindi la correzione implementa un NPC nominato creato in ogni mondo iniziale.
*   **L'intera superficie sociale (v3.0):** i quattro verbi di leva diventano venticinque — i gruppi di diplomazia e sabotaggio si registrano (altri 21 sottoverbi), illuminando le reazioni dei compagni precedentemente oscure `leverage-diplomacy` / `leverage-sabotage`; diciannove appaiono nel menu numerato (costo + tempo di ricarica + reputazione). Le condizioni e gli effetti del dialogo ora leggono e scrivono lo stato sociale (leva / reputazione / relazione NPC). E il reddito passivo della leva (`tickLeverage` / `computeLeverageGains`) fa gocciolare l'influenza dalla reputazione e fornisce favori / ricatti / legittimità dall'esperienza e dai traguardi — quindi il livello sociale si guadagna *tra* le opportunità, non solo al completamento.
*   **Economia con sapore di genere (v3.0):** l'inventario del mercante e le ricette artigianali ora risolvono le tabelle di genere per mondo iniziale (sette dei dieci mondi iniziali hanno contenuti di genere creati; tre tornano a quelli universali) — attraverso la meccanica di acquisto/creazione, la visualizzazione nel menu numerato e la sezione "RICETTE" del direttore, tutto collegato dalla stessa chiave del set di regole in modo che la visualizzazione e la meccanica concordino. "Ripara" e "modifica" sono ora righe del menu numerato (accoppiamento oggetto × ricetta) e le opportunità "scorta" vengono generate su un gate di viaggio protettivo in un distretto pericoloso.
*   **Il finale legge la leva che hai guadagnato (v3.0):** i finali delle campagne "vittoria", "burattinaio" e "quieto pensionamento" — a lungo bloccati sull'influenza / ricatto / legittimità che il livello finale leggeva come zero hardcoded — sono ora raggiungibili attraverso il vero archivio di leva che l'intera economia sociale scrive. La partenza del compagno è anche raggiungibile, tramite i punti di interruzione dell'IA NPC e un fallback sul limite inferiore della morale.
*   **CLI per sviluppatori `audit-content` (v3.0):** un comando CLI per l'audit dei contenuti dello sviluppatore (simile a "valida", distinto dal registro del direttore rivolto al giocatore) che esegue i sei formattatori del direttore di incontri / boss / combattimento su un pacchetto.
*   `ai-rpg-engine create-starter <name>` — crea un nuovo gioco (autonomo, eseguito al di fuori del monorepo); comandi "valida" + "crea" per i contenuti; carica i pacchetti da JSON.
*   Modello iniziale pubblicato su npm (`@ai-rpg-engine/starter-template`).
*   Suite di test completa: **5494 test** (deterministici tra esecuzioni ripetute; i file di test sono controllati in CI; il limite di copertura è applicato).

**Cosa è incompleto o approssimativo:**
- Lo studio di creazione del mondo tramite AI (livello Ollama) è stato testato in modo meno approfondito rispetto al nucleo della simulazione e richiede un daemon Ollama locale; è completamente opzionale: il motore e il ciclo `run` non necessitano di una connessione di rete.
- Il sistema di narrazione/audio genera comandi audio deterministici, ma **non esiste alcun backend audio finale**: nessun suono viene riprodotto; i comandi sono un meccanismo di integrazione per un'interfaccia utente grafica o un componente web.
- La modalità multiplayer (due giocatori umani che condividono lo stesso mondo) **non** è implementata: si tratta di un livello di rete, escluso intenzionalmente dall'ambito del progetto; attualmente i profili sono progettati per un singolo giocatore.
- `replay --replay` ripristina il salvataggio invece di rieseguire la simulazione e, a partire dalla versione 2.9, questa è la **soluzione definitiva**, non una soluzione temporanea: `Engine.serialize()` è già uno snapshot completo dello stato che ha dato buoni risultati, mentre la riesecuzione della simulazione dovrebbe tenere traccia dello stato del mondo/degli eventi che si verifica al di fuori del registro delle azioni. La versione 2.9 include slot di salvataggio multi-checkpoint lungo questo percorso di ripristino collaudato; una vera e propria risimulazione basata sugli eventi non è prevista.
- Rimangono ancora alcuni limiti della versione 3.0: la **fornitura iniziale** del distretto continua a utilizzare i valori predefiniti universali anziché i valori `GENRE_SUPPLY_DEFAULTS` specifici per ogni genere (gli articoli acquistabili e le ricette sono organizzati per genere; la fornitura è l'elemento chiave della versione 3.1, con specifiche già pronte); nessun personaggio iniziale ha una ricetta specifica per il *ripristino* (il ripristino funziona ovunque, ma non è specifico per il genere); e due dei ventuno sottoverbi sociali (`deny`, `bury-scandal`) necessitano di una dimensione di associazione tra rumor e bersaglio prima di poter essere visualizzati nel menu.
- La documentazione è completa, ma non tutte le pagine del manuale riflettono le API più recenti.

---

## Come appare

L'interfaccia utente terminale inclusa compone ogni turno in sezioni etichettate: scena, stato, registro e azioni, con un HUD facilmente consultabile. L'output è testo semplice per impostazione predefinita e aggiunge colori semantici su un TTY (danni in rosso, cure in verde, rifiuti in giallo), rispettando `NO_COLOR` e i pipe non-TTY; ogni indicazione è contenuta nel testo stesso, mai solo nei colori.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Installazione e avvio

Gioca a un mondo iniziale o crea il tuo gioco dal terminale:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

Il ciclo `run` è una vera sessione a turni: i nemici agiscono in base ai propri profili di IA, le abilità e l'esperienza sono nel menu, puoi salvare e riprendere e un combattimento termina con la vittoria o la sconfitta. Ogni gioco è deterministico e riproducibile.

Facoltativamente, lo studio di progettazione dell'IA viene installato come comando separato:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Lo studio comunica con un daemon [Ollama](https://ollama.com) locale: esegui prima `ollama serve` e `ollama pull qwen2.5-coder`. È completamente opzionale; il motore e il ciclo `run` non necessitano di una connessione di rete.

Un'immagine container è pubblicata su GHCR come `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` per CI ed esecuzioni in ambiente sandbox.

---

## Avvio rapido

Preferisci creare il tuo gioco nel codice? Componi il motore dai moduli:

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

Consulta la [Guida alla composizione](site/src/content/docs/handbook/57-composition-guide.md) per il flusso di lavoro completo, oppure crea un nuovo progetto di partenza:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Core Runtime** | Motore deterministico: stato del mondo, eventi, azioni, cicli, RNG, replay |
| **Modules** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, movimento, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore |
| **AI Studio** | Livello Ollama opzionale: creazione di progetti iniziali, analisi critica, bilanciamento, ottimizzazione, esperimenti |

---

## Sistema di combattimento

Cinque azioni (attacco, difesa, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (difensivo, sbilanciato, esposto, in fuga), quattro stati di coinvolgimento (coinvolto, protetto, retroguardia, isolato). Tre dimensioni statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso rispetto a un guerriero corpulento o a un sentinella equilibrata.

Gli avversari controllati dall'IA utilizzano una valutazione decisionale unificata: le azioni e le abilità di combattimento competono in un'unica valutazione, con soglie configurabili per evitare l'uso eccessivo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per collegare il combattimento a una mappa delle statistiche, un profilo delle risorse e tag di preferenza. Consulta la [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità nativo del genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, guarigione, applicazione di stato, rimozione dello stato). Gli effetti di stato utilizzano un vocabolario semantico a 11 tag con profili di resistenza/vulnerabilità. I punteggi di selezione consapevoli dell'IA valutano i percorsi auto/AoE/bersaglio singolo.

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
| [`@ai-rpg-engine/core`](packages/core) | Runtime di simulazione deterministico: stato del mondo, eventi, RNG, cicli, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, movimento, compagni, autonomia dei PNG, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento dell'arco narrativo, trigger di fine gioco |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti, crescita delle reliquie |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti sulle relazioni, stato della campagna |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccaniche di mutazione, tracciamento della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano narrativo, contratti di rendering, profili vocali |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Pianificazione dei segnali, priorità, attenuazione, logica dei tempi di ricarica |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifesti del pacchetto audio, registro indirizzabile in base al contenuto |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione del pacchetto, valutazione della rubrica, scoperta del pacchetto |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Archiviazione indirizzata in base al contenuto per ritratti, icone, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza interfaccia utente con provider collegabili |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione automatica opzionale: creazione di progetti iniziali, analisi critica, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esegui giochi, crea progetti iniziali, ispeziona salvataggi |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer terminale e livello di input |

### Esempi di progetto iniziale

I 10 mondi di esempio sono **esempi di composizione**: dimostrano come combinare i moduli del motore in giochi completi. Ognuno mostra schemi diversi (mappe delle statistiche, profili delle risorse, configurazioni di coinvolgimento, set di abilità). Consulta il file README di ogni progetto iniziale per "Schemi dimostrati" e "Cosa prendere in prestito".

| Progetto iniziale | Genere | Modelli chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Combattimento minimo, guidato dal dialogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di coinvolgimento |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Prima di tutto l'aspetto sociale, con molta attenzione alla percezione |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Navale + corpo a corpo, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa dell'infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Preferenze del pacchetto, recupero della zona sicura |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Punti di strozzatura, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, più ruoli protettivi |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa del sangue, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore della folla |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crea un nuovo gioco: percorso CLI o modello manuale |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Costruisci il tuo gioco componendo i moduli del motore |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Risoluzione delle regole per entità: combattimento con stili di gioco misti, `applyProfile`, modelli di profilo, la CLI `profile` |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stati a colpo d'occhio |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Costruzione passo dopo passo di `buildCombatStack`, mappa delle statistiche, profili delle risorse |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Examples](docs/examples/) | Esempi TypeScript eseguibili (con controllo dei tipi + test del comportamento in CI): per entità con gruppo misto, profili condivisi, tra mondi diversi, da zero |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità rispetto alla presentazione |
| [Philosophy](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, IA come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Dove siamo ora

Entrambe le strutture principali sono complete: 5494 test su 280 file, tutti e 10 i personaggi iniziali in `buildCombatStack` **e** `buildWorldStack`, riproduzione deterministica byte per byte con valori di seme stampati, punteggio completo delle decisioni dell'IA e una CLI che crea la struttura, esegue, convalida e ispeziona. La **versione 3.0 dà vita al mondo: i PNG nominati prendono vita con obiettivi, relazioni di fiducia/paura/avidità/lealtà, registri degli obblighi e catene di conseguenze; il livello sociale guadagna passivamente e spende attraverso ventuno nuovi verbi di diplomazia/sabotaggio; l'economia è organizzata per genere in base al personaggio iniziale; e i vantaggi che si ottengono alla fine influenzano gli eventi finali della campagna. Un audit di fase 9 ha rilevato un problema nel contenuto rilasciato: la correzione include un PNG nominato in ogni personaggio iniziale.**

**Ciclo di rilascio recente (v2.4.0–v3.0.0):**
- v2.4.0: combattimento tra personaggi (targeting degli alleati / cura / potenziamento / rianimazione, effetto di stato (modificatori + DoT/HoT + trigger reattivi), fase 1 dei profili plug-in, CLI per la convalida/creazione del contenuto.
- v2.5.0: risoluzione delle regole per entità (combattimento con stili di gioco misti), il caricatore `applyProfile` + abilità per entità, modelli di profilo + CLI `profile` e un controllo completo dello stato di salute.
- v2.6.0: il comando `run` è diventato un vero gioco: i nemici agiscono in base ai propri profili di IA, vittoria/sconfitta, salvataggio/ripresa, abilità ed esperienza nel menu, la cartella `ai` dello studio e lo stack di narrazione.
- v2.7.0: il mondo reagisce ed esiste una ragione per tornare: calore → pressioni → conseguenze narrate, incontri all'ingresso della zona, un ciclo di missioni + diario, equipaggiamento in combattimento, esecuzioni ripetibili con valori iniziali, input finali attivi, `buildWorldStack`, il registro del direttore e una transizione per la migrazione dei salvataggi.
- v2.8.0: agire sul mondo in cui si vive: un'economia commerciale attiva + verbo `sell`, compagni che si possono reclutare e con cui combattere e un registro del direttore che analizza l'intero scenario: una connessione di scrittura per sistema, circa 12 elementi rilasciati che inizialmente non funzionavano correttamente.
- v2.9.0: completare i cicli: `buy` + scorte del mercante e creazione completano l'economia; i compagni agiscono a turno in modo indipendente; quattro verbi sociali (corruzione / intimidazione / petizione / semina) si basano su un'economia di influenza finanziata da ricompense per le opportunità; le opportunità vengono risolte con scadenza + conseguenze dovute alla perdita di favori; e l'equipaggiamento, le missioni, i personaggi reclutabili e la valuta iniziale vengono distribuiti uniformemente a tutti e dieci i personaggi iniziali.
- **v3.0.0: dare vita al mondo: il generatore di agenzia dei PNG attiva i PNG nominati (obiettivi / relazioni / registri degli obblighi / catene di conseguenze) più un personaggio narrativo in ogni personaggio iniziale; la superficie sociale si espande a 25 verbi (diplomazia + sabotaggio) con reddito passivo e dialoghi che leggono lo stato sociale; scorte e ricette specifiche per genere per ciascun personaggio iniziale; gli eventi finali di influenza (vittoria / burattinaio / pensionamento tranquillo) diventano raggiungibili; righe del menu per riparare/modificare, opportunità di scorta e una CLI di sviluppo `audit-content`: tutto questo è stato rilasciato dopo un audit di fase 9 che ha rilevato due problemi nel codice che i test verdi non avevano individuato.**

### Successivo (la struttura della versione 3.0)

- **PNG viventi:** il generatore persistente di agenzia dei PNG che alimenta la sezione PERSONE del direttore: PNG nominati con obiettivi, punti di interruzione delle relazioni, registri degli obblighi e catene di conseguenze, oltre al morale dei compagni, alla perdita di favori e al percorso di rischio di partenza già presente nel sistema di reazione.
- Scorte e ricette specifiche per genere (organizzazione per genere per ciascun personaggio iniziale rispetto ai valori predefiniti universali rilasciati oggi) e la superficie del menu `repair`/`modify`.
- Il livello successivo dell'economia di influenza: reddito passivo oltre alle ricompense per le opportunità e verbi sociali oltre ai quattro già presenti (gruppi di diplomazia/sabotaggio), oltre al vocabolario delle condizioni/effetti dei dialoghi che leggono il nuovo stato sociale.
- Multiplayer: due giocatori *umani* che condividono lo stesso mondo (un livello di rete, escluso intenzionalmente dall'ambito del progetto; i profili condivisi per un singolo giocatore sono già disponibili oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Override delle formule serializzabili: regolazione delle formule per profilo (in attesa di un DSL per le formule; attualmente i profili contengono mappature degli attributi, non chiusure).
- Sincronizzazione della documentazione API: assicurarsi che ogni pagina del manuale rifletta le API più recenti.

### Destinazione: Plug-in Profiles

L'obiettivo finale del motore è quello di offrire **profili definiti dall'utente**: pacchetti portatili che possono essere inseriti in qualsiasi gioco. Un profilo include una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire dalla versione 2.5, le entità in un mondo possono avere ciascuna il proprio profilo e risolvere il combattimento per entità: un combattente "might" e un mistico "will" condividono una squadra, ognuno apportando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle abilità per entità e la convalida tra profili sono tutti disponibili. Ciò che resta è il multiplayer: consentire a due giocatori *umani* (e non solo a due entità) di condividere un mondo, il che richiede un livello di rete. Consultare [Profile Roadmap](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) per la progettazione.

---

## Filosofia

L'AI RPG Engine è costruito su tre idee:

1. **Mondi deterministici:** i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata sull'evidenza:** le meccaniche del mondo dovrebbero essere testate tramite la simulazione.
3. **IA come assistente, non come autorità:** gli strumenti di IA aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Consultare [PHILOSOPHY.md](PHILOSOPHY.md) per la spiegazione completa.

---

## Sicurezza

Il motore principale è una **libreria di simulazione locale:** nessun telemetria, nessuna rete, nessun segreto. I file di salvataggio vengono salvati in `.ai-rpg-engine/` solo quando richiesto esplicitamente. Il livello di IA **opzionale** (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**: la sua funzione `webfetch` (per RAG) è l'unica connessione di rete in uscita ed è limitata da una protezione SSRF (blocca loopback/link-local/CGNAT/cloud-metadata e le equivalenti IPv6), quindi non si può accedere a meno che non venga esplicitamente invocata. Consultare [SECURITY.md](SECURITY.md) per i dettagli.

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
