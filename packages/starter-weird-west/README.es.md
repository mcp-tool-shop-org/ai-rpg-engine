<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-weird-west

**El Pacto del Demonio de Polvo** — Un pueblo fronterizo esconde un culto que invoca algo desde la meseta roja.

Parte del catálogo de paquetes de inicio del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Oeste + sobrenatural. Pistoleros, espíritus del polvo y un culto en la meseta. El recurso "Polvo" se acumula con el tiempo; cuando alcanza 100, el forastero es reclamado por el desierto.

## Inicio rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.start();
```

## Contenido

- **5 zonas:** Cruce del Forastero, Salón, Oficina del Sheriff, Sendero de la Meseta Roja, Gruta de los Espíritus.
- **2 PNJ:** Bartender Silas, Sheriff Hale.
- **2 enemigos:** Espectro de Polvo, Rastreador de la Meseta.
- **1 árbol de diálogo:** Información del cantinero sobre el culto de la meseta.
- **1 árbol de progresión:** Camino del Pistolero (Rápido en el Desenfundado → Voluntad de Hierro → Ojo de Águila).
- **1 objeto:** Manojo de Salvia (reduce el Polvo en 20).

## Mecánicas Únicas

| Verbo | Descripción |
|------|-------------|
| `draw` | Duelo a duelo rápido — concurso de reflejos. |
| `commune` | Hablar con espíritus usando conocimiento. |

## Estadísticas y Recursos

| Estadística | Rol |
|------|------|
| resistencia | Resistencia y voluntad. |
| velocidad_de_desenfundado | Reflejos y tiempo de reacción. |
| conocimiento | Conocimiento sobrenatural. |

| Recurso | Rango | Notas |
|----------|-------|-------|
| HP | 0–30 | Salud estándar. |
| Determinación | 0–20 | Fuerza mental, se regenera 1 por "tick". |
| Polvo | 0–100 | **Presión inversa** — se acumula, 100 = muerte. |

## Licencia

MIT.
