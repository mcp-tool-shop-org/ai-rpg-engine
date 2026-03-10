<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-colony

**Perdita di segnale** — Una colonia lontana perde il contatto con la Terra. Qualcosa è vivo nelle caverne sottostanti.

Parte del catalogo del pacchetto di avvio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Gestione di una colonia fantascientifica + contatto con una forma di vita aliena. L'energia è una risorsa condivisa dalla colonia: quando diminuisce, i sistemi smettono di funzionare a cascata. La presenza aliena percepisce i coloni come "modelli di risonanza disturbanti".

## Guida rapida

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## Contenuto

- **5 zone:** Modulo di comando, Stazione di idroponica, Recinto perimetrale, Torre di comunicazione, Caverna aliena
- **2 PNG:** Dott.ssa Vasquez (scienziata), Capo Okafor (sicurezza)
- **2 nemici:** Drone compromesso, Entità di risonanza
- **1 albero di dialogo:** Briefing della Dott.ssa Vasquez sul segnale alieno e sulla politica della colonia
- **1 albero di progressione:** Percorso del Comandante (Ingegnere sul campo → Sensori avanzati → Inamovibile)
- **1 oggetto:** Cella di emergenza (ripristina 20 unità di energia)

## Meccaniche uniche

| Verbo | Descrizione |
|------|-------------|
| `scan` | Scansione con sensori utilizzando la consapevolezza |
| `allocate` | Redistribuzione dell'energia tra i sistemi della colonia |

## Statistiche e risorse

| Statistica | Ruolo |
|------|------|
| ingegneria | Riparazione e costruzione di sistemi |
| comando | Leadership e morale dell'equipaggio |
| consapevolezza | Sensori e percezione |

| Risorsa | Portata | Note |
|----------|-------|-------|
| HP | 0–25 | Salute standard |
| Energia | 0–100 | Risorsa condivisa dalla colonia, si rigenera a 2 unità al tick |
| Morale | 0–30 | Coesione dell'equipaggio |

## Licenza

MIT
