<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-weird-west

**L'affare del Diavolo di Polvere** — Una città di frontiera nasconde una setta che evoca qualcosa dal plateau rosso.

Parte del catalogo del pacchetto di avvio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Western + soprannaturale. Pistoleri, spiriti della polvere e una setta del plateau. La risorsa "Polvere" si accumula nel tempo: quando raggiunge 100, il personaggio viene reclamato dal deserto.

## Guida Rapida

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.start();
```

## Contenuti

- **5 zone:** Incrocio del Viandante, Saloon, Ufficio dello Sceriffo, Sentiero del Plateau Rosso, Valle degli Spiriti
- **2 PNG:** Bartender Silas, Sceriffo Hale
- **2 nemici:** Revenant di Polvere, Mesa Crawler
- **1 albero di dialoghi:** Informazioni del barista sulla setta del plateau
- **1 albero di progressione:** Percorso del Pistolero (Mano Veloce → Volontà di Ferro → Occhio di Falco)
- **1 oggetto:** Fascio di Salvia (riduce la Polvere di 20)

## Meccaniche Uniche

| Verbo | Descrizione |
|------|-------------|
| `draw` | Duello a colpi rapidi — competizione di riflessi |
| `commune` | Parla con gli spiriti usando la conoscenza |

## Statistiche e Risorse

| Statistica | Ruolo |
|------|------|
| tenacia | Resistenza e volontà |
| velocità di estrazione | Riflessi e tempo di reazione |
| conoscenza | Conoscenza soprannaturale |

| Risorsa | Portata | Note |
|----------|-------|-------|
| HP | 0–30 | Salute standard |
| Determinazione | 0–20 | Forza mentale, si rigenera 1 punto al tick |
| Polvere | 0–100 | **Pressione inversa** — si accumula, 100 = morte |

## Licenza

MIT
