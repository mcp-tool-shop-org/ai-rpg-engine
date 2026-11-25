<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Motore per RPG basato sull'IA

Un set di strumenti TypeScript per creare simulazioni di giochi di ruolo deterministiche. Si definiscono le statistiche, si selezionano i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali, la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 12 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e da cui si possono ricavare nuove idee. Il gioco utilizza qualsiasi sottoinsieme del motore necessario.

---

## Cos'è

- Una **libreria di moduli** — oltre 30 moduli del motore che coprono combattimento, percezione, cognizione, fazioni, voci, movimento, compagni e altro
- Un **set di strumenti di composizione** — `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco
- Un **ambiente di simulazione** — cicli deterministici, registri di azioni riproducibili, generatore di numeri casuali con seme
- Uno **studio di progettazione dell'IA** (opzionale) — scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama
- Un **livello opzionale sulla blockchain** — `@ai-rpg-engine/ledger-adapter` supporta la valuta e gli oggetti commerciabili di un gioco con token XRPL reali sulla **testnet**, con regolamenti effettuati in punti di controllo, completamente al di fuori del nucleo deterministico (opzionale; un'esecuzione è identica a livello di byte senza di esso)
- Un **host visivo opzionale** — `@ai-rpg-engine/sidecar` più il client Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage). Il motore non genera comunque immagini. Lo sfondo disegna un porto dimetrico in scala 2:1 e riproduce l'audio `felt`. L'occupazione rimane un ID di zona.

## Cos'è che non è

- Non è un singolo gioco finito: include 12 mondi iniziali giocabili che puoi avviare con `run` già oggi come esempi, e il motore è il kit di strumenti con cui componi il *tuo* gioco
- Non è un motore grafico: produce eventi strutturati, non pixel. Il disegno spetta all'host (il terminale o Godot)
- Non è un generatore di storie: simula mondi; la narrazione emerge dalle meccaniche

---

## Stato attuale (v3.12.2)

**Cosa funziona ed è stato testato:**
- **I pacchetti di World Forge non vengono più rifiutati (v3.12.2):** il sistema di caricamento indica che le 13 chiavi principali che un pacchetto di World Forge esporta (`connections`, `spawnPoints`, `playerTemplate` e altre dieci) sono note, ma non presenti nel pacchetto. Pertanto, un pacchetto valido che le contiene viene caricato e il rapporto di caricamento elenca ciascuna di esse come elemento caricato. Anche se la chiave è digitata in modo errato, il sistema la rifiuta comunque. I valori di hash non sono stati modificati.
- **Host Godot (v3.12):** il componente aggiuntivo `capabilities.audio` invia un pacchetto dati `felt` (ID delle sequenze, elementi grafici sovrapposti, testo parlato, effetti dell’interfaccia utente) che non viene mai sottoposto a hashing: i dati vengono negoziati e aggiunti, e omessi completamente quando la funzionalità è disattivata, in modo che un client che richiede una corrispondenza esatta mantenga la stabilità dei byte. [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage) è il componente Godot 4: una griglia 2:1 dimetrica TileMapLayer, personaggi creati con Foundry con 8 direzioni, presentazione tramite selezione delle celle, `move` continua a indicare una zona adiacente. Manuale: [Client visivi](site/src/content/docs/handbook/66-visual-clients.md).
- **Regolazione e profondità (v3.11):** `bounty` si attiva nuovamente sui contenuti creati (l’eliminazione del v3.10 listener ha fatto sì che le due navi di Black-Flag venissero affondate con un intervallo di 36 turni; la “grace” termica è proprio questo intervallo misurato, e il “wake” indica ancora due navi affondate). Una lotta che finisce perché qualcuno scappa lo dimostra: `combat.encounter.cleared` comporta `outcome: 'victory' | 'retreat'`, non un secondo evento, non una sconfitta amara, non una vittoria degna di essere annotata. L’appartenenza a una fazione prevede tre modalità di registrazione: `entity.faction`, ovvero la registrazione personale, un registro centralizzato che viene aggiornato e che può contenere informazioni aggiuntive, e `CompanionState.originFaction`, in modo che la gilda di provenienza possa ancora accedere ai dati. La musica di sottofondo si ripete ogni `zoneId`; gli effetti sonori rispettano i tempi di ricarica; le operazioni di scrittura `/build` vengono eseguite in modo da sopravvivere a un arresto anomalo; una nuova sessione CLI emette l’evento relativo all’ingresso nella zona iniziale, in modo che i MOMENTI CHIAVE possano registrare la prima impressione. 8356 test.
- **Il mondo raggiunge il giocatore (v3.10):** due cicli di stimoli sensoriali si concentrano infine sui sensi del giocatore. Tutti e otto gli elementi che caratterizzano la voce del narratore contribuiscono a creare l’atmosfera: le caratteristiche dei personaggi non giocanti e le loro affiliazioni di gruppo definiscono il contesto del discorso, gli indizi relativi al modo di parlare influenzano il tono, la presenza del gruppo, la pressione esercitata dall’ambiente e le opportunità disponibili chiudono il dialogo, aggiungendo elementi di contorno, mentre le informazioni sull’atmosfera e sulla situazione del distretto vengono integrate nel registro degli eventi. L’head-up display, sempre attivo, mostra le informazioni di contatto del gruppo. L’onestà in combattimento si manifesta come un evento reale: `combat.encounter.cleared` viene attivato una sola volta quando l’ultimo nemico viene sconfitto (un’uccisione reciproca viene considerata una sconfitta, la morte di un compagno non porta più alla vittoria e i nove ascoltatori iniziali che celebravano ogni uccisione scompaiono), e il segnale di vittoria viene associato a questo evento tramite il sistema che gestisce i turni. L’ingresso nella zona regola la riproduzione musicale in base al tono: un quartiere cupo suona effettivamente in modo cupo, e il contratto per l’output vocale è effettivo: `NarrationPlan.asides` trasmette i frammenti di dialogo esattamente una volta, `SpeakerCue.emotion` trasmette l’indicazione sullo stile in forma integrale, pronto per essere integrato in un sistema di sintesi vocale. I client Sidecar visualizzano l’acquisizione dei pacchetti `dropped[]`/`advisories` su `initialize`, le operazioni guidate `/build` vengono eseguite in batch in ogni fase, dietro un singolo consenso raggruppato (con un’operazione di annullamento che tiene conto dell’operazione CREATE e un rifiuto che non può invalidare il processo), le fazioni strutturate sopravvivono `emit-pack` e l’identità della fazione viene determinata a partire dai dati `faction` creati dall’entità stessa, ovunque in precedenza fosse necessario un registro; nessun pacchetto viene caricato, invertendo così il tracciamento degli intrusi di zona e riattivando la diffusione delle voci. Durante una sessione di gioco, e2e fissa l’intera superficie fotogramma per fotogramma, garantendo che NO_COLOR i byte siano identici.
- **Il pacchetto che crei è il gioco a cui giochi (v3.9):** lo studio ora crea tutti gli elementi che vengono caricati dal motore di gioco: `create-ruleset`, `create-rule-profile` e `create-item-placement` si aggiungono ai verbi di base, e sia i piani `/build` che la fase finale `ai scaffold-and-critique` si concludono con l’emissione di `content/pack.json`. `applyContentPack` contrassegna `playerId`/`locationId` da una confezione per giocatore singolo, definisce i valori di riferimento della reputazione delle fazioni e registra i profili delle regole (unificati, senza mai cancellare quelli dell’host) e include il manifesto e il set di regole della confezione tramite `extractSessionContent`: la ricetta JSON documentata per l’avvio viene corretta e fissata tramite un test completo. I dialoghi diventano più realistici: un personaggio non giocante fa riferimento al contratto che è effettivamente presente, arriva accompagnato da altri personaggi o si trova in un quartiere malfamato, e l’assistente che fornisce suggerimenti strategici rivolge una frase direttamente al giocatore. Il diario della campagna salva gli oggetti creati e gli elementi utili, le varianti delle immagini mantengono le loro caratteristiche distintive (con supporto LoRA), le voci di corridoio svaniscono e un effetto negativo dopo la vittoria non influisce più sull’atmosfera della zona. 8042 test effettuati.
- **La superficie di hosting si trova nell’Engine (v3.8.1):** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, sidecar `listActions` + salvataggio/caricamento, studio `emit-pack`, cataloghi di pacchetti JSON e `ruleProfiles`. L’aggiunta di un nodo in Godot e l’avvio tramite JSON `--content` non replicano più le componenti interne della CLI per creare tali interfacce.
- Motore principale: stato del mondo, eventi, azioni, cicli di aggiornamento, riproduzione — stabile dalla versione v1.0; riproduzione deterministica e identica a livello di byte (contatore di ID per istanza, generatore di numeri casuali con seme).
- Sistema di combattimento: 5 azioni, 4 stati di combattimento, 4 stati di interazione, intervento del compagno, gestione delle sconfitte, tattiche dell’IA.
- Abilità: costi, tempi di ricarica, verifiche delle statistiche, effetti specifici, vocabolario di stato con 11 tag, selezione consapevole dell’intelligenza artificiale.
- **Combattimento di gruppo (v2.4):** selezione degli alleati come bersaglio (cura / potenziamento / rianimazione), filtro per distinguere amici e nemici AoE, selezione dei bersagli: un curatore può curare un compagno di squadra; un nemico AoE risparmia gli alleati.
- **Effetti di stato (v2.4):** modificatori passivi delle statistiche che si applicano in combattimento, effetti deterministici DoT/HoT basati sul contatore dei round, meccaniche reattive con un limite di profondità (come spine o riflesso).
- **Profili dei plug-in — risoluzione delle regole per entità (v2.5):** un guerriero `might` e un mistico `will` affrontano un combattimento, durante il quale ciascuno di essi utilizza le proprie statistiche tramite una mappatura specifica. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` associa un profilo (mappatura delle statistiche, pool di risorse, abilità per entità); `buildProfile()`, `validateProfileSet()` (gli ID duplicati vengono rifiutati), 10 modelli derivati dai modelli iniziali e un comando `profile` per l’interfaccia a riga di comando.
- **Ciclo di gioco completo `run` (v2.6):** il gioco completo è reale, non una demo: i nemici agiscono in base ai loro profili di intelligenza artificiale (`aggressive`/`cautious`/`territorial`/`calculating`; ora sei profili predefiniti, con `passive` e `follower`), un combattimento termina con una vittoria o una sconfitta, è possibile salvare e riprendere il gioco e le abilità e i punti esperienza sono disponibili nel menu azioni. `run <path>` carica un gioco che hai creato. Interfaccia utente a riga di comando ben strutturata, con una schermata HUD di facile consultazione e una combinazione di colori accessibile (tiene conto di `NO_COLOR` / non-TTY).
- **Lo strumento di progettazione basato sull’IA viene fornito come comando `ai` autonomo (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — genera una struttura di base, effettua una valutazione critica e bilancia i contenuti rispetto a un modello Ollama locale.
- Livello decisionale unificato: le valutazioni relative al combattimento e alle abilità sono state integrate in un’unica funzione (`selectBestAction`).
- Tutti e 12 i mondi iniziali utilizzano `buildCombatStack()`, una formula collaudata.
- API di configurazione per la cognizione (`cognition: CognitionCoreConfig | false`) per la messa a punto dell’intelligenza artificiale per ogni singolo sistema.
- Strumenti per la gestione e la convalida delle etichette (tag) utilizzati nella creazione di contenuti.
- **La reazione del mondo (v2.7):** ogni uccisione aumenta la tensione e diminuisce la sicurezza del distretto; a ogni turno, il sistema genera pressioni nascoste che si manifestano sotto forma di voci ("Voci ti raggiungono…"), si intensificano e scompaiono con conseguenze; circa 30 sequenze di incontri predefinite si attivano all’ingresso in ogni zona nei 10 distretti iniziali: in modo deterministico per ogni seme, i distretti più violenti ne generano di più, e le aree dedicate ai boss sono protette.
- **Un motivo per tornare (v2.7):** un ciclo di missioni essenziale basato sullo schema già implementato da tempo: le missioni vengono offerte in base a determinati eventi, tengono traccia degli obiettivi relativi al numero di nemici sconfitti, al raggiungimento di determinate aree o al completamento di determinate azioni e offrono punti esperienza e oggetti una sola volta; quattro missioni create appositamente, una schermata **Giornale** e momenti chiave delle missioni inseriti nella narrazione del livello.
- **L'equipaggiamento entra in combattimento (v2.7):** `equip`/`unequip` trasferisce valori numerici reali attraverso il livello di stato; le formule di combattimento le leggono già. Nessuna modifica al codice di combattimento; il tridente e la rete del gladiatore sono collegati in serie con una variazione della probabilità di colpire, definita tramite test.
- **Esecuzioni con seme (v2.7):** ogni nuova sessione stampa il suo seme insieme al comando esatto per riprodurla; `--seed <n>` riproduce una sessione byte per byte; i tiri relativi al combattimento, alla resistenza, alle abilità e alle tattiche utilizzano tutti il seme del mondo; i risultati finali riflettono la sessione che è stata effettivamente giocata (dinamiche di gioco, pressioni, accumulo di risorse delle fazioni, livello del giocatore).
- **`buildWorldStack()` (v2.7):** la struttura compositiva strategica, affiancata a `buildCombatStack()`, che permette di gestire l’ambiente, le fazioni, le voci, i distretti, le conseguenze delle sconfitte, gli incontri e le missioni con una sola chiamata; inoltre, include la schermata della strategia **Director's Ledger**, un ispettore di simulazione `AI_RPG_DEBUG=1`, `inspect-save`, che rispetta le stesse regole di Continue, e un modulo per il salvataggio e il trasferimento dei dati lungo il percorso di ripristino.
- **Intervieni sull’economia dinamica (v2.8):** `createEconomyCore` avvia un’economia specifica per ogni distretto, partendo da una quantità iniziale e aggiornandola a ogni ciclo; un nuovo `sell` verbo determina il prezzo del bottino in base a `computeItemValue` (scarsità / fazione / provenienza / merce di contrabbando) e modifica l’offerta locale. Un singolo elemento di scrittura ha dato vita a cinque sistemi che sono stati inclusi in v2.7, anche se inizialmente non erano previsti: la sezione MARKET OVERVIEW + FACTIONS per la valutazione, l’arco narrativo finale incentrato sul mercante-principe e il suo crollo, e quattro tipi di meccaniche che esercitano pressione sull’economia. **Vendita esclusiva per questo ciclo** (acquisto → v2.9)
- **Compagni (v2.8):** un `recruit` verbo crea un gruppo — stato, tag e fazione, quindi un compagno combatte *insieme* a te; il combattimento dei compagni si basa sulla meccanica di intercettazione del sistema di combattimento principale (inattiva fino a quando `isAlly` non viene impostato), i compagni reagiscono in base al morale e possono andarsene, e il reclutamento attiva sette potenziali alleati: si tratta dell'elenco dei COMPAGNI finale, degli obiettivi di gruppo, degli obiettivi dei personaggi non giocanti, delle missioni di favore e della sezione PARTY del Direttore. **Intercettazione passiva in questo ciclo** (azioni indipendenti → v2.9)
- **Il direttore esamina l’intero pannello (v2.8):** una nuova sezione del registro delle ATTREZZATURE (collegata alla dipendenza tra interfaccia a riga di comando e origine delle attrezzature), un trailer finale con un riepilogo del DIRETTORE, le sezioni PANORAMICA DEL MERCATO e EVENTO, ora alimentate con dati in tempo reale dai produttori, e la stabilità distrettuale e il tono economico nella sezione DISTRETTI del finale.
- **L’altra metà dell’economia (v2.9):** un `buy` verbo completa il ciclo: le scorte dei commercianti vengono offerte per distretto, con una granularità a livello di categoria di fornitura (il livello di fornitura *è* il segnale di rifornimento), e il prezzo viene determinato attraverso la stessa `computeItemValue` procedura utilizzata per `sell`, a cui si aggiunge uno spread di acquisto/vendita, in modo da non esserci alcun rischio di transazione senza profitto. E la creazione prende vita: `createCraftingCore` registra `salvage`/`craft`/`repair`/`modify` sulle tabelle delle ricette create, illuminando le sezioni MATERIALI + RICETTE del pannello di controllo, che prima erano oscurate.
- **I compagni agiscono a turno (v2.9):** l’area di intercettazione passiva di v2.8 diventa il limite superiore: i compagni reclutati agiscono in modo indipendente a ogni turno tramite il consigliere `selectBestAction`, precedentemente inutilizzato, con una predisposizione al combattimento specifica per ogni ruolo, in modo che un combattente e uno studioso combattano in modo diverso, con intercettazione tra compagni e punti vita del gruppo sulla linea PARTY del Direttore. I pacchetti senza elementi aggiuntivi mantengono la stessa struttura dati (il meccanismo di controllo per le sequenze vuote preserva la compatibilità con la versione originale, mantenendo il valore iniziale 0).
- **Il livello sociale, collegato in modo sequenziale (v2.9):** quattro verbi chiave — `bribe`, `intimidate`, `petition`, `seed` (voci di corridoio) — danno vita a una vera e propria reputazione, generano avvisi e creano dinamiche globali che influenzano i prezzi e le alleanze, e `seed` attiva l’intero modulo delle voci di corridoio tra i giocatori, oltre alla sezione “VOCI SU DI TE” del Direttore. Anche l’«economia della leva» che li finanzia è ben strutturata: sfruttare appieno un’opportunità ora garantisce i vantaggi che essa prometteva, quindi i risultati ottenuti sono effettivamente concreti e misurabili.
- **Opportunità, l’intero ciclo di vita (v2.9):** un sistema di generazione di incarichi per ogni round offre contratti/missioni/favori che vengono valutati in base allo stato attuale del mondo di gioco; tu `accept`, poi `complete` o `abandon`; ignorare un incarico fino alla sua scadenza comporta delle conseguenze (effetti negativi dovuti alla scadenza) e completare un favore per un personaggio secondario ne aumenta il morale. Le dinamiche dell’ultima fase del gioco, con l’ascesa di nuove potenze e l’emergere di figure mercantili influenti, riflettono le opportunità che hai effettivamente sfruttato.
- **Uniformità dei contenuti in tutti e dieci i mondi iniziali (v2.9):** cablaggio delle attrezzature, missioni, compagni reclutabili e un saldo iniziale di monete, implementati in tutti i mondi iniziali che ne erano privi: i dieci mondi condividono ora una superficie uniforme e completamente illuminata (le attrezzature erano disponibili solo per i gladiatori; le missioni erano disponibili solo per i mondi fantasy/zombie; cinque mondi sono stati rilasciati con `recruit` senza la possibilità di reclutare personaggi). Inoltre, è presente un sistema di convalida strutturale dei contenuti che individua eventuali errori di battitura nell’ID di un elemento in tutte le superfici di riferimento, e sono disponibili più slot di salvataggio con checkpoint, contrassegnati con `--checkpoint`/`--list-checkpoints`.
- **PNG interattivi, realmente vivi (v3.0):** il sistema che gestisce il comportamento persistente dei PNG attiva la sezione **PERSONAGGI** del pannello del Direttore di gioco: i PNG nominati (un personaggio con una storia definita per ogni personaggio iniziale, più tutti i compagni che recluti) hanno obiettivi, relazioni basate su fiducia/paura/avidità/lealtà, un registro degli obblighi e catene di conseguenze. `runNpcAgencyTick` viene eseguito a ogni ciclo, con un meccanismo di controllo che garantisce che un mondo senza personaggi non giocanti (NPC) con nomi specifici rimanga identico alle versioni precedenti, a livello di dati. Oltre a illuminare il produttore, l’illuminazione ha evidenziato anche i punti di svolta relativi alla partenza e alle conseguenze dell’alleanza, due regole inattive per l’attivazione di opportunità (obiettivo NPC + obbligo) e la npcProfiles/npcObligations della fase finale: il cavo è stato testato e si è rivelato funzionante, ma inattivo nel contenuto distribuito fino a quando un audit di Fase 9 non lo ha rilevato, quindi la correzione prevede l’inserimento di un NPC con un nome specifico in ogni fase iniziale.
- **La gamma completa di interazioni sociali (v3.0):** i quattro verbi principali si trasformano in venticinque: i gruppi relativi alla diplomazia e al sabotaggio vengono registrati (con altri 21 verbi secondari), attivando le reazioni dei personaggi secondari precedentemente inattive `leverage-diplomacy` / `leverage-sabotage`; diciannove opzioni compaiono nel menu numerato (disponibili in base al livello di affinità, al tempo di attesa e alla reputazione). Le condizioni e gli effetti dei dialoghi ora leggono e modificano lo stato sociale (influenza/reputazione/relazione con i personaggi non giocanti). E il reddito passivo derivante dalla leva finanziaria (`tickLeverage` / `computeLeverageGains`) genera influenza attraverso la reputazione e offre vantaggi/strumenti di ricatto/legittimità grazie all’esperienza e ai traguardi raggiunti, quindi il livello sociale genera guadagni *tra* un’opportunità e l’altra, non solo al completamento.
- **Economia basata sul genere (v3.0):** gli articoli dei mercanti e le ricette per la creazione ora si basano su tabelle di genere specifiche per ciascun personaggio iniziale (sette dei dieci personaggi iniziali hanno contenuti di genere definiti; i restanti tre utilizzano contenuti universali). Questo si applica a tutti gli aspetti, tra cui le meccaniche di acquisto/creazione, la visualizzazione del menu numerato e la sezione RICETTE del Direttore, il tutto collegato alla stessa serie di regole, in modo che la visualizzazione e le meccaniche siano coerenti. `repair` e `modify` sono ora le voci numerate del menu (abbinamento articolo × ricetta), e `escort` opportunità compaiono su un portale che consente di viaggiare in sicurezza in un quartiere pericoloso.
- **Nella fase finale, si tiene conto del vantaggio che hai ottenuto (v3.0):** le conclusioni delle campagne `victory`, `puppet-master` e `quiet-retirement`, che in precedenza erano accessibili solo dopo aver raggiunto un certo livello di influenza, ricatto o legittimità (fattori che, nella fase finale, vengono interpretati come valori fissi pari a zero), ora possono essere raggiunte grazie al reale vantaggio che l’intero sistema socio-economico mette a disposizione. È possibile gestire anche la partenza dei compagni di viaggio, tramite punti di interruzione definiti nell’interfaccia dei personaggi non giocanti e un meccanismo di riserva che interviene quando il morale raggiunge un livello minimo.
- **Interfaccia a riga di comando per sviluppatori `audit-content` (v3.0):** un comando per l’analisi dei contenuti destinato agli sviluppatori (simile a `validate`, ma distinto dal registro Director, rivolto agli utenti) che esegue i sei formattatori per gli incontri/boss/combattimenti su un pacchetto.
- **Un *kit iniziale* a tema specifico — l'introduzione di v3.0, fornita (v3.1):** `economyGenre` intreccia i punti chiave delle regole di base di ciascun kit attraverso `buildWorldStack` → `createEconomyCore`, in modo che un distretto ora definisca il profilo `GENRE_SUPPLY_DEFAULTS` del suo genere (il cyberpunk si concentra su componenti/beni di contrabbando, il fantasy sulla scarsità di risorse mediche) invece di una base universale standard: questo è il kit iniziale che definisce il tono del MERCATO del Direttore e che anticipa gli elementi chiave della fase finale. Sette dei dieci giocatori titolari presentano caratteristiche tipiche del loro ruolo; tre, a dire il vero, si comportano in modo più ordinario. Un campo distinto da `tradeGenre` / `craftingGenre`, in modo che i tre possano divergere in seguito.
- **La superficie sociale, completa (v3.1):** `deny` e `bury-scandal` — la coppia che manipola le voci, e che prende di mira una voce esistente identificandola piuttosto che associandola a una fazione — raggiunge il menu numerato attraverso una dimensione di accoppiamento tra voce e obiettivo, completando la superficie con ventuno verbi (da 19 a 21 verbi).
- **`obligation-exists` dialogo, attivato e accessibile (v3.1):** la condizione del dialogo legge il registro delle obbligazioni persistenti di un NPC con nome (`getPersistedNpcObligations`) — nel contesto fantasy, Fratello Aldric; una volta che ti deve un favore attraverso le normali interazioni con gli NPC, si sblocca una `call-in-favor` scelta — un vero e proprio passaggio in cui v3.0 ha lasciato un elemento sempre valido e silenzioso (un audit della sessione di gioco di Fase 9 ha dimostrato che è accessibile in una vera partita, e non solo in una versione di test).
- **Riparazione con elementi distintivi di genere (v3.1):** ogni autore che introduce un genere crea una ricetta distintiva `repair` nella tabella del genere di riferimento (fantasy `repair-rune-mend`, cyberpunk `repair-nanite-weld`, …), che viene resa disponibile tramite `getAvailableRecipes`; la riparazione ora è personalizzata in base al genere, e non più semplicemente universale.
- **Adesione facoltativa alla liquidazione del registro XRPL (v3.2):** un nuovo pacchetto `@ai-rpg-engine/ledger-adapter` opzionale associa lo strato negoziabile di proprietà del giocatore — `coin` → un IOU, beni di consumo → token fungibili, la variazione netta `buy`/`sell` di un checkpoint → un **deposito di token (XLS-85) regolato** — alla **testnet XRPL**, al di fuori del nucleo deterministico. Nessun elemento in `core`/`modules` lo importa e l’esecuzione è identica a livello di byte, sia con esso che senza (come dimostrato sul ciclo reale del commerciante pirata `createGame()`). Funziona esclusivamente sulla testnet, protetto da una barriera impossibile da implementare sulla mainnet tramite codice, con un file separato contenente segreti escluso dal controllo di versione (gitignored), tentativi ripetuti sicuri per la conservazione dei dati, verifica dei memo sulla blockchain e un meccanismo di fallback non ancorato; testato con successo in modalità end-to-end sulla testnet (regolamento tramite deposito di token → `reconcile` rispetto ai saldi e ai memo registrati sulla blockchain). Nuovi e unici oggetti NFT disponibili in v3.3 (qui sotto). Consulta [l’adattatore del registro XRPL](#ladattatore-del-registro-xrpl-opzionale).
- **Oggetti unici come NFT (v3.3):** il `@ai-rpg-engine/ledger-adapter` associa l’oggetto unico contenuto nel pacchetto `equipment` — la “parte” differita di v3.2 — agli NFT di XRPL: ogni oggetto unico viene creato come un **XLS-20 NFToken** (`tfMutable`, non può essere distrutto, garantendo la vera proprietà al giocatore) in un punto di controllo, e l’evoluzione dell’oggetto fa avanzare i metadati dell’NFT modificabile tramite **XLS-46 `NFTokenModify`**, mentre una famiglia di proprietari `reconcile()` verifica l’autenticità dell’oggetto nel registro `account_nfts`. Un percorso di lettura ben definito, applicato alla configurazione dell’hardware, che viene eseguito in parallelo allo strato intercambiabile, garantendo lo stesso livello di determinismo, sia con esso sia senza. Testato durante una sessione di gioco reale `starter-gladiator`, in diretta sulla testnet (crea l’oggetto `trident-and-net` equipaggiato come NFT, possedilo nel registro, effettua la riconciliazione, il mondo rimane inalterato).
- **Oggetti che si fanno un nome (v3.4):** l’evoluzione degli oggetti è presente fin da v3.3, ma non si è mai attivata durante il gioco: nessun oggetto ha mai lasciato una traccia nella cronologia degli oggetti in una partita in corso, quindi la versione evoluta di ogni oggetto è rimasta permanentemente `0`. La nuova funzionalità è ora disponibile: un modulo `item-chronicle-core` attivabile su richiesta registra `acquired` / `used-in-kill` / `recognized` durante le partite reali e `starter-gladiator` lo elabora. Se si vincono tre combattimenti nell’arena, il tridente del retiario diventa il **Tridente e la Rete Insanguinati** per il resto della partita, e viene visualizzato nell’HUD e nel registro del direttore. Questo, inoltre, **completa il ciclo NFT**: un punto di controllo sancisce tale crescita come un effettivo **XLS-46 `NFTokenModify`**, facendo progredire l’URI presente nel registro e preservando il NFTokenID. Sono stati corretti i seguenti problemi: sia `boss-kill` che `recognized` risultavano inaccessibili in ogni pacchetto distribuito (un semplice controllo del tag `boss` rispetto al contenuto che include il tag `role:boss` e una protezione per evitare contenuti in cui nessuna entità imposta un valore) e, nel secondo caso, si verificava un blocco silenzioso di *tutti* gli aumenti di armatura. Implementazione graduale: un pacchetto che, pur non essendo cablato, è identico, a livello di codice, alla versione precedente del motore.
- **Conseguenze che lasciano un segno indelebile (v3.8):** lo strato strategico è stato eliminato dopo v3.7 — sono state create opportunità, sono stati risolti i problemi e il narratore ha potuto comunicare il risultato — e poi il mondo se ne è dimenticato. `applyOpportunityFallout` ha definito **quattordici** tipi di effetti, ma ne ha mantenuti solo **sei**: un obbligo annunciato e registrato in nessun registro, una voce che non si è diffusa a nessuno, un titolo che non ha conferito alcun titolo a nessuno. Tutti e quattordici sono ancora attivi, ciascuno tramite il sistema di gestione specifico, e due di essi creano dei **cicli di feedback chiusi**: un elemento scritto nel sistema influisce sul livello di fiducia, determinando cosa un personaggio non giocante (NPC) ti offrirà in seguito, e il cambiamento di questo livello apre la strada attraverso cui tali offerte vengono presentate. Si è scoperto che tre tipi di effetti si sono verificati un livello prima rispetto alla mancanza di un elemento (`materials` e `spawn-opportunity` non sono stati generati da nulla; ogni produttore `spawn-pressure` si è basato su una risoluzione che nessun percorso implementato poteva raggiungere), quindi il ciclo ha coinvolto i produttori piuttosto che creare delle protezioni che non avrebbero mai potuto attivarsi. L’operazione `betray` si inserisce come quarta fase e attiva **sei aree di obbligo, tre aree di generazione di voci e tutti e tre i generatori originali di pressione** che erano stati creati nelle versioni precedenti e che non erano raggiungibili in altro modo. Successivamente, un controllo completo dei registri di sistema ha rivelato altri tre dispositivi di pressione non segnalati nell’applicazione, il che dimostra il vantaggio di una riconciliazione bidirezionale rispetto a una semplice scansione isolata. E il dodicesimo racconto, intitolato **Hue and Cry**, è stato scritto partendo dalle conseguenze: narra di un investigatore che dà la caccia a dei ladri in una città priva di forze dell’ordine, con un punteggio di 7/7 nella valutazione complessiva.
- **Lo strato strategico, illuminato (v3.7):** lo strato superiore rispetto alle azioni che si svolgono di momento in momento, dove nascono le opportunità, i compagni hanno un ruolo passivo e i distretti presentano diverse atmosfere, era per metà immerso nell’oscurità e nulla poteva rivelarlo. Una nuova funzione, applicabile all’intero catalogo, avvia tutti e undici i pacchetti e simula **quaranta turni completi** utilizzando lo stesso motore interattivo a riga di comando (azioni dei personaggi non giocanti, azioni dei compagni, quindi l’avanzamento del mondo), perché `runWorldTick` è una funzione che si applica a ogni turno, piuttosto che un verbo, e una funzione creata esclusivamente con `submitAction` visualizzerà per sempre solo metà di un turno. Ha analizzato **uno dei otto tipi di opportunità** che si presentano quando si lavora su contenuti già pubblicati. Tutti e **otto i test sono stati eseguiti**, e ciascuno di essi è corredato dalla prova di una sessione di gioco che dimostra che la ricompensa è stata effettivamente ottenuta, e uno di essi è stato progettato appositamente per far scadere il tempo, in modo che le conseguenze della scadenza (perdita di reputazione, aumento della fame in una determinata area) siano dimostrate attraverso dati reali, e non attraverso supposizioni. Il problema non sono mai state le regole: `contract` richiedeva un PNG sia alleato che avido, cosa che la tabella dei punti di interruzione rende incompatibile con `favorable`, e `relations['player-trust']` era stato creato esattamente una volta nell’intero catalogo; le economie dei distretti hanno cancellato le proprie caratteristiche di genere e di tag in circa 15 turni, spostando ogni categoria verso un valore universale di 50; `world.factions[].reputation`, ovvero la base di riferimento creata, che il motore unisce esplicitamente, non era definita da alcun pacchetto, quindi ogni mondo partiva da uno zero assoluto, con tutti gli elementi allo stesso livello. Il **ritmo** è calibrato in base a elementi specifici individuati, piuttosto che al gusto personale; ciascun elemento è associato a una costante che ne regola l’effetto (sovraccarico di scelte, variabilità della ricerca, momenti di relax, ripetizione coinvolgente, dinamiche degli appuntamenti) ed è controllato da una regressione deterministica. **Dodici dei tredici** campi relativi ai modificatori di accompagnamento e di distretto ora utilizzano una funzione di risoluzione tramite un parametro di collegamento, ciascuno dei quali contribuisce in modo specifico ai dati trasmessi, in modo che l’interfaccia utente possa indicare CHI ha fornito l’aiuto: un modificatore calcolato ma non visualizzato è, dal punto di vista dell’utente, identico all’assenza di modificatore. `use` **interrompe silenziosamente la distruzione**: 89/90 gli elementi creati e presenti in tutto il catalogo venivano elaborati da un verbo che non produceva alcun effetto, ma li eliminava comunque, segnalando l’avvenuta operazione. E il contratto `statusTags`, dichiarato da tutte e undici le fazioni ma non applicato da nessuna, è vincolante: le dichiarazioni sono state ampliate, prima per riflettere la realtà dei fatti, poi per limitarne l’applicazione.
- **Lo strumento ha attivato il catalogo (v3.6):** il pacchetto progettato per UTILIZZARE il registro viene ora eseguito intenzionalmente come strumento per la manutenzione del motore. Un’**analisi esaustiva della compatibilità dei verbi** a livello dell’intero catalogo avvia tutti e undici i pacchetti e sottopone ogni verbo al motore reale, verificando se nel mondo in cui viene eseguito esiste un elemento che lo accetta. Si tratta di un controllo che nessun sistema esistente potrebbe superare o fallire, poiché la verifica dell’affidabilità del verbo confronta la tabella di riferimento con i gestori registrati e non analizza mai il contenuto. Eseguire questo controllo prima di applicare qualsiasi correzione. Ha rilevato che `recruit`, pubblicizzato in Salt Road Ledger, non permette di reclutare alcun PNG (il difetto v2.9, reintrodotto) e che `use` è inutilizzabile in tutto il catalogo. `give` rappresenta la **prima operazione di trasferimento di elementi tra entità** eseguita dal motore: un’operazione atomica, che rifiuta strutture non valide, contrassegnata da un timestamp di evento e che colma una lacuna: in precedenza, un insieme di dati poteva rendere un elemento accessibile, ma non esisteva un meccanismo per fornirlo a chiunque. Le due restanti assi dell’adattatore, che prima erano flag di configurazione con **zero letture comportamentali**, sono diventate comportamenti: la modalità `diary` (osservata, non custodita – un punto di ancoraggio per ogni checkpoint, nessuna linea di fiducia, la riconciliazione verifica la catena di ancoraggio) e la modalità `issuerMode: 'persistent'` (un mercato che sopravvive al ciclo di esecuzione). Testato con successo: **15/15 sulla rete di test XRPL in ambiente attivo**.
- **Un gioco in cui il fulcro è il debito (v3.5):** l’undicesimo gioco della serie, **Salt Road Ledger**, è il primo a essere concepito partendo da un sistema piuttosto che da un genere specifico: si interpreta un personaggio che effettua scambi sfruttando il capitale di qualcun altro, e cinque azioni commerciali (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) fanno progredire il gioco, mentre il combattimento è penalizzato (il profilo delle risorse presenta un array `gains` vuoto: la violenza non porta a nessun vantaggio). `consign` è l’unico verbo presente nel catalogo la cui semantica offline corrisponde in modo diretto a una primitiva di regolamento, il che lo rende il pacchetto di riferimento per l’adattatore del registro, senza che questo dipenda da esso. Include navi appartenenti al genere `mercantile` e con un profilo economico basato sul commercio, e assegna loro un punteggio di 7/7 nella sezione relativa alle caratteristiche. Lo stesso ciclo ha reso effettive due assi adattatore che erano rimasti inattivi per molto tempo: il campo memo `VERB:` (dichiarato con membri che nessun punto di chiamata poteva generare) e `config.settlement` (dichiarato con zero letture in qualsiasi punto), e un controllo della sessione di gioco del nuovo pacchetto ha rivelato sei meccanismi che erano attivi, conformi allo schema, validi a livello di unità e non funzionanti.
- `ai-rpg-engine create-starter <name>`: crea la struttura di base per un nuovo gioco (un progetto indipendente, eseguibile al di fuori del monorepo); `validate` + `scaffold`: comandi per la gestione dei contenuti; carica i pacchetti da file JSON.
- Pubblicato il modello di base su npm (`@ai-rpg-engine/starter-template`)
- Suite completa di test: **8368 test** (i risultati sono coerenti anche in esecuzioni ripetute; i file di test vengono controllati durante l’integrazione continua; viene applicato un meccanismo per garantire una copertura completa).

**Cosa è incompleto o grezzo:**
- Lo studio di creazione di mondi AI (livello Ollama) è testato in modo meno approfondito rispetto al motore di simulazione e richiede un daemon Ollama locale; è completamente opzionale: il motore e il ciclo `run` non necessitano di una rete.
- Lo stack di narrazione/audio crea comandi audio deterministici, ma non esiste un backend audio terminale: nulla riproduce un suono in `run`. La scena di Godot è il primo ambiente che riproduce effettivamente gli ID di segnale `felt` (mixer + TTS opzionale). Gli effetti sonori sovrapposti non devono sostituire il suono di base della zona.
- Il multiplayer (due giocatori umani che condividono un mondo) non è implementato: è un livello di rete, escluso intenzionalmente dall'ambito; i profili attuali sono destinati a un singolo controller.
- `replay --replay` ripristina il salvataggio invece di risimulare, e dopo v2.9 questa è la direzione **decisa**, non un rinvio: `Engine.serialize()` è già uno snapshot completo e collaudato dello stato, mentre la risimulazione dovrebbe tenere traccia dello stato del mondo/degli incontri che si trova al di fuori del registro delle azioni. v2.9 include slot di salvataggio multi-checkpoint su questo percorso di ripristino collaudato; una vera risimulazione basata su eventi non è prevista.
- v3.1 ha chiuso i tre soffitti nominati di v3.0: la **fornitura iniziale** del genere, le ricette di *riparazione* specifiche del genere e la superficie del menu `deny` / `bury-scandal` sono ora inclusi. L'unico limite rimasto è che queste nuove ricette di riparazione del genere includono un `statDelta` (un piccolo bonus alle statistiche) che `resolveRepair` non applica ancora: la riparazione *ripristina*, `modify` *migliora*, quindi la riparazione come miglioramento è contrassegnata nel codice ed è **rinviata a v3.2/v3.3** come meccanica intenzionale, non un campo inerte silenzioso. E `obligation-exists` include una demo con un personaggio (Fratello Aldric); la condizione è attiva per consentire agli autori dei contenuti di aggiungere più dialoghi.
- La documentazione è estesa, ma non tutte le pagine del manuale riflettono le API più recenti.

---

## Come si presenta

L'interfaccia utente terminale inclusa compone ogni turno in sezioni etichettate: scena, stato, registro e azioni, con un'interfaccia utente di facile consultazione. L'output è testo semplice per impostazione predefinita e aggiunge colori semantici su un terminale (danni in rosso, guarigioni in verde, rifiuti in giallo), rispettando `NO_COLOR` e i canali non-terminale; ogni segnale è incluso anche nel testo, non solo nel colore.

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

Avvia una demo o crea il tuo gioco dal terminale:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

Il ciclo `run` è una vera sessione a turni: i nemici agiscono in base ai loro profili AI. Le abilità e i punti esperienza sono disponibili nel menu, puoi salvare e riprendere, e un combattimento termina con una vittoria o una sconfitta. Ogni partita è deterministica e può essere rigiocata.

Facoltativamente, lo studio di progettazione AI si installa come un comando separato:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Lo studio comunica con un daemon [Ollama](https://ollama.com) locale: esegui `ollama serve` e `ollama pull qwen2.5-coder` per prima cosa. È completamente opzionale; il motore e il ciclo `run` non necessitano di una rete.

Un'immagine container viene pubblicata su GHCR come `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` per test CI e esecuzioni in ambiente isolato.

---

## Avvio rapido

Preferisci creare il tuo gioco nel codice? Assembla il motore da moduli:

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

Consulta la [Guida alla composizione](site/src/content/docs/handbook/57-composition-guide.md) per il flusso di lavoro completo, oppure crea una nuova demo:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Core Runtime** | Motore deterministico: stato del mondo, eventi, azioni, tick, RNG, replay |
| **Modules** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, movimento, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore |
| **AI Studio** | Livello Ollama opzionale: creazione di prototipi, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti |

---

## L'adattatore del registro XRPL (opzionale)

`@ai-rpg-engine/ledger-adapter` è un pacchetto **opzionale** che associa il **livello negoziabile di proprietà del giocatore** di un gioco (il saldo `coin` e l'inventario di oggetti consumabili che i verbi `buy`/`sell` di `trade-core` gestiscono) alla **testnet XRPL**, in modo che tali risorse possano essere supportate da token reali sul registro e regolati ai checkpoint. Un adattatore assente è esattamente il motore offline che viene fornito oggi.

**L'invariante del determinismo (il punto fondamentale).** L'adattatore è un *canale secondario*, mai parte della simulazione:

- Non viene mai invocato all'interno del tick deterministico, ma solo ai **checkpoint** (salvataggio, ingresso in città/mercato, fine del capitolo).
- Nulla in `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (la sua unica dipendenza dal motore è un `import type` in fase di compilazione).
- **Un'esecuzione è identica con o senza.** Un test del firewall esegue il ciclo del mercante `starter-pirate` `createGame()` reale su due motori, uno con l'adattatore abilitato e che si regola a un checkpoint, e verifica che i due mondi siano identici. Il replay con seme 0 non viene modificato.

**Livelli di integrazione: un gioco lo include in profondità quanto desidera il suo design.** Il firewall è un confine del *determinismo*, non una regola anti-integrazione; l'invariante di cui sopra è valido a tutti i livelli:

| Livello | Cosa dipende dall'adattatore | Si adatta |
|-------|-----------------------------|------|
| **L0 — External observer** | Nulla all'interno del gioco; l'adattatore si collega dall'esterno ai checkpoint e il gioco non ne è a conoscenza. | Riadattamento di un gioco esistente (la demo pirata fornita). |
| **L1: checkpoint guidati dal gioco** | Il flusso di salvataggio/città/progressione meta del gioco chiama l'adattatore in momenti definiti. | Un gioco che desidera momenti di registro deliberati. |
| **L2 — Ledger-native design** | L'economia o l'identità del gioco sono progettate *attorno* alla proprietà on-chain (emittente persistente, mercati reali). | Un gioco di mercanti basato sul registro. |

La distinzione che mantiene il replay sicuro non è "quale pacchetto importa l'adattatore", ma "la chiamata è all'interno del tick". Un pacchetto di gioco può importare e gestire l'adattatore liberamente, purché ogni chiamata avvenga a un checkpoint al di fuori del ciclo di replay guidato dal seme.

**Tre modalità di gioco.** `offline` (predefinito: nessuna catena, il motore così come viene fornito) · `ledger` (monete/oggetti supportati dai saldi della testnet, regolati ai checkpoint) · `diary` (gioca offline, quindi ancora lo stato dell'esecuzione sul registro per una ricevuta a prova di manomissione).

**Cosa è presente nel registro.** `coin` → un impegno di valuta emessa su una linea di credito;
articoli di consumo → token fungibili; la variazione netta delle transazioni di un checkpoint → un trasferimento convalidato tramite **XLS-85 escrow di token**. Attrezzature uniche vengono rilasciate come **XLS-20 NFT**
(v3.3), con la crescita delle reliquie che fa avanzare i metadati di un NFT modificabile tramite
**XLS-46 `NFTokenModify`** — guidato da un gioco reale a partire da v3.4. L'economia distrettuale astratta (`economy-core`) *non* viene toccata — rimane una simulazione pura.

**Misure di sicurezza.** Solo testnet, con una protezione strutturale **impossibile in mainnet nel codice** (non un flag di configurazione); i seed del portafoglio sono memorizzati in un file secondario ignorato da Git, mai nel file di salvataggio; la convalida è idempotente e sicura per la conservazione nel percorso di ripetizione; le prove verificano il **memo reale sulla blockchain** (non la stringa del motore); e se la catena non è raggiungibile, l'esecuzione continua semplicemente, contrassegnata come *non ancorata*.

**Dimostrato in ambiente attivo.** Un vero ciclo di `starter-pirate`, un commerciante: vendi una sciabola, compra un proiettile di cannone — si conclude sulla testnet XRPL tramite escrow di token, quindi `reconcile()` conferma i saldi e i memo nel registro rispetto all'economia del motore (la conservazione è garantita per ogni token). Il registro è una famiglia di sistemi diversa dal motore, quindi il motore non può falsificarlo: la riconciliazione è una verifica esterna autentica. Solo testnet; gli asset sono ricevute con ambito di gioco, non titoli.

---

## Sistema di combattimento

Cinque azioni (attacco, difesa, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (difeso, sbilanciato, esposto, in fuga), quattro stati di coinvolgimento (coinvolto, protetto, in seconda linea, isolato). Tre dimensioni statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso da un combattente pesante o da un sentinella composto.

Gli avversari controllati dall'IA utilizzano un sistema di punteggio decisionale unificato: le azioni e le abilità di combattimento competono in una singola valutazione, con soglie configurabili per prevenire l'uso eccessivo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per collegare il combattimento a una mappatura delle statistiche, un profilo delle risorse e tag di preferenza. Consulta la [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità nativo del genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, guarigione, applicazione di stato, rimozione). Gli effetti di stato utilizzano un vocabolario semantico di 11 tag con profili di resistenza/vulnerabilità. I punteggi di selezione consapevoli dell'IA valutano i percorsi self/AoE/a bersaglio singolo.

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
| [`@ai-rpg-engine/core`](packages/core) | Runtime di simulazione deterministico: stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, attraversamento, compagni, agenzia NPC, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento dell'arco narrativo, trigger di fine gioco |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti e crescita delle reliquie, incluso `item-chronicle-core`, il modulo facoltativo che registra la cronologia dell'equipaggiamento dal gioco reale in modo che gli oggetti ottengano epiteti e livelli |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti relazionali, stato della campagna |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccaniche di mutazione, tracciamento della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano narrativo, contratti di rendering, profili vocali |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Pianificazione delle cue, priorità, attenuazione, logica del tempo di ricarica |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifesti del pacchetto audio, registro indirizzabile in base al contenuto |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione del pacchetto, punteggio della rubrica, scoperta del pacchetto |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Archiviazione indirizzata in base al contenuto per ritratti, icone, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza interfaccia utente con provider collegabili |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione di IA facoltativa: scaffolding, critica, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esegui giochi, crea modelli iniziali, ispeziona i salvataggi |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer terminale e livello di input |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Modello iniziale mercantile: il pacchetto di riferimento per l'adattatore del registro, che non dipende da esso |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Modello iniziale ladro: l'inseguimento come ciclo e quale metà della città aprirà una porta per te |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Facoltativo:** convalida facoltativa della testnet XRPL per il livello negoziabile di proprietà del giocatore (monete/inventario/scambio), tramite XLS-85 escrow di token ai checkpoint, completamente al di fuori del core deterministico |

### Esempi di modelli iniziali

I 12 mondi iniziali sono **esempi di composizione**: dimostrano come combinare i moduli del motore in giochi completi. Ognuno mostra schemi diversi (mappature delle statistiche, profili delle risorse, configurazioni di coinvolgimento, set di abilità). Consulta il file README di ogni modello iniziale per "Schemi dimostrati" e "Cosa prendere in prestito".

| Modello iniziale | Genere | Schemi chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Combattimento minimo, guidato dal dialogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di coinvolgimento |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Prima di tutto l'aspetto sociale, con grande attenzione alla percezione |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Navale + corpo a corpo, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa dell'infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Bias dei pacchetti, recupero in zona sicura |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Colli di bottiglia, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, ruoli di protezione multipli |
| [`starter-merchant`](packages/starter-merchant) | Mercantile | L'obbligo come ciclo, il combattimento ha un costo come penalità |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Inseguimento | Caccia alle persone per soldi; la violenza è rumorosa, non proibita |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa del sangue, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore della folla |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crea un nuovo gioco: tramite CLI o percorso del modello manuale |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Crea il tuo gioco componendo moduli del motore |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Risoluzione delle regole per entità: combattimento con stili di gioco misti, `applyProfile`, modelli di profilo, la CLI `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Integrazione opzionale con il registro — firewall deterministico, livelli di integrazione L0/L1/L2, modalità di gioco, misure di sicurezza e demo pirata testata dal vivo |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stati a colpo d'occhio |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack passo dopo passo, mappatura delle statistiche, profili delle risorse |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | Host sidecar, payload simulato, porto dimetrico di Godot: la presentazione potrebbe essere fuorviante, l'occupazione rimane un ID di zona |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Examples](docs/examples/) | Esempi TypeScript eseguibili (con controllo dei tipi e test del comportamento in CI) — gruppo misto per entità, profili condivisi, tra mondi, da zero |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità contro presentazione |
| [Philosophy](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, IA come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Dove siamo ora

Entrambe le strutture di composizione sono complete: **8368 test su 388 file**, tutti i 12 personaggi iniziali su `buildCombatStack` **e** `buildWorldStack`, riproduzione deterministica e identica byte per byte con seed stampati, punteggio completo delle decisioni dell'IA e una CLI che crea, esegue, convalida e ispeziona. L'arco v3.x ha reso il mondo attivo (NPC con nomi, la superficie sociale con 25 verbi, economie di genere — v3.0–v3.1), ha inserito risorse di proprietà del giocatore sulla testnet XRPL come canale secondario opzionale (v3.2–v3.4), ha creato due personaggi iniziali incentrati sul sistema e li ha trasformati in strumenti per migliorare il motore (v3.5–v3.6), ha illuminato e rafforzato lo strato strategico finché le conseguenze non lasciano segni reali (v3.7–v3.8), ha fornito agli host la superficie del motore di cui hanno bisogno per l'integrazione con Godot (v3.8.1), ha chiuso il ciclo di creazione in modo che una sessione di studio o un semplice pacchetto JSON producano un mondo giocabile dall'inizio alla fine (v3.9), ha portato l'intero strato strategico sui sensi del giocatore (v3.10), ha ottimizzato la profondità che questi sensi raggiungono ora (v3.11) e **ha fornito a un host di rendering la sensazione di un tick: il primo client pixel, un porto dimetrico di Godot 4, viene eseguito su tale contratto (v3.12)**.

**Ciclo di rilascio recente (v2.4.0–v3.0.0):**
- v2.4.0 — Combattimento di gruppo (targeting degli alleati / cura / potenziamento / rianimazione, amico-nemico AoE), sistema di effetti di stato (modificatori + DoT/HoT + trigger reattivi), fase 1 dei profili plug-in, contenuti `validate`/`scaffold` CLI
- v2.5.0 — Risoluzione delle regole per entità (combattimento con stili di gioco misti), il caricatore `applyProfile` + abilità per entità, modelli di profilo + `profile` CLI e un passaggio completo sulla salute
- v2.6.0 — Il comando `run` è diventato un vero gioco: i nemici agiscono in base ai propri profili di IA, vittoria/sconfitta, salvataggio/ripresa, abilità ed esperienza nel menu, il binario dello studio `ai` e lo stack della narrazione
- v2.7.0 — Il mondo reagisce ed esiste una ragione per tornare: calore → pressioni → conseguenze narrate, incontri all'ingresso della zona, un ciclo di missioni + diario, equipaggiamento in combattimento, esecuzioni ripetibili con seed, input di fine gioco dal vivo, `buildWorldStack`, il registro del direttore e un punto di migrazione del salvataggio
- v2.8.0 — Agisci sul mondo in cui vivi: un'economia commerciale attiva + `sell` verbi, compagni che puoi reclutare e con cui combattere e un registro del direttore che legge l'intera mappa di gioco: un collegamento di scrittura per sistema attivo, circa 12 consumatori che hanno rilasciato contenuti in versione oscura
- v2.9.0 — Chiudi i cicli: `buy` + scorte del mercante e creazione completano l'economia; i compagni fanno mosse indipendenti; quattro verbi sociali (corruzione / intimidazione / petizione / semina) vengono eseguiti su un'economia di leva finanziata da ricompense di opportunità; le opportunità si risolvono con scadenza + conseguenze di favore; e equipaggiamento, missioni, personaggi reclutabili e monete iniziali vengono distribuiti uniformemente a tutti i dieci personaggi iniziali
- **v3.0.0 — Rendi il mondo attivo: il produttore di agenzia NPC accende gli NPC con nomi (obiettivi / relazioni / registri degli obblighi / catene di conseguenze) più un NPC narrativo in ogni personaggio iniziale; la superficie sociale cresce fino a 25 verbi (diplomazia + sabotaggio) con reddito passivo e dialogo che legge lo stato sociale; scorte e ricette di genere per personaggio iniziale; le conclusioni di leva (vittoria / burattinaio / pensionamento tranquillo) diventano raggiungibili; righe del menu di riparazione/modifica, opportunità di scorta e una CLI di sviluppo `audit-content`: rilasciato tramite un audit di fase 9 che ha individuato due collegamenti interrotti che la suite di test verde aveva nascosto**

### Prossimo

v3.12 ha chiuso il contratto simulato e il primo host di rendering. Ciò che resta è un lavoro successivo, non gli elementi rimasti di questo ciclo:

- Un ambiente di famiglia prospera (il ponte tonale e il rilascio per zona; CORE non ha ancora un elemento prospero)
- Multiplayer: due giocatori *umani* che condividono un mondo (un livello di rete, volutamente differito; i profili condivisi a controller singolo vengono rilasciati oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Override di formule serializzabili: messa a punto delle formule per profilo (bloccato su un DSL per formule; i profili contengono oggi mappature di statistiche, non chiusure)

### Destinazione: profili plug-in

L'obiettivo finale del motore è **profili definiti dall'utente**: pacchetti portatili che si inseriscono in qualsiasi gioco. Un profilo impacchetta una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire da v2.5, le entità in un mondo possono ciascuna avere il proprio profilo e risolvere il combattimento per entità: un guerriero `might` e un mistico `will` condividono un gruppo, ognuno portando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle abilità per entità e la convalida tra profili sono tutti stati rilasciati. Ciò che resta è il multiplayer: consentire a due giocatori *umani* (non solo a due entità) di condividere un mondo, che è un livello di rete. Vedi [Roadmap del profilo](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) per il progetto.

---

## Filosofia

AI RPG Engine è costruito su tre idee:

1. **Mondi deterministici**: i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata sull'evidenza**: la meccanica del mondo dovrebbe essere testata attraverso la simulazione.
3. **IA come assistente, non come autorità**: gli strumenti di IA aiutano a generare e a valutare i progetti, ma non sostituiscono i sistemi deterministici.

Per una spiegazione completa, consultare [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sicurezza

Il motore principale è una **libreria di simulazione esclusivamente locale**: nessun telemetria, nessuna connessione di rete, nessun dato sensibile. I file di salvataggio vengono salvati in `.ai-rpg-engine/` solo quando richiesto esplicitamente. Due **livelli opzionali** aggiungono un percorso di comunicazione in uscita, e solo quando vengono attivati:

- Il livello di intelligenza artificiale (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**; la sua opzione di attivazione `webfetch` (per RAG) è limitata da una protezione SSRF (che blocca loopback/link-local/CGNAT/metadati cloud e IPv6-tunnelled equivalenti).
- Il livello del registro (`@ai-rpg-engine/ledger-adapter`) raggiunge la **testnet XRPL** — e solo la testnet: una protezione strutturale **impossibile nel codice per la mainnet** (non un flag di configurazione) rifiuta qualsiasi host non appartenente alla testnet durante la creazione. I seed del portafoglio sono memorizzati in un file secondario ignorato da Git, mai in un file di salvataggio, e il core deterministico non importa mai l'adattatore.

Per i dettagli, consultare [SECURITY.md](SECURITY.md).

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
