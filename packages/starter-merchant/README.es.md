<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-merchant

> **Ejemplo de composición** — Este inicio demuestra cómo construir un juego cuyo ciclo se basa en la obligación, y no en el combate. Es un ejemplo del que aprender, no una plantilla para copiar. Consulte la [Guía de composición](../../docs/handbook/57-composition-guide.md) para crear su propio juego.

**Libro de cuentas de Salt Road** — Usted es un agente de una pequeña casa comercial. No es propietario de los bienes que transporta; está en deuda por ellos. Cada moneda que se le debe es un cuchillo que otra persona sostiene.

Parte del catálogo de paquetes de inicio de [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Presión mercantil, sarcástica y luego ruinosa. Nada en Salt Road escasea; la restricción es lo que ha prometido. `liquidity` es lo que puede desplegar sin generar una deuda; `lien` se acumula cuando no puede hacerlo, y al llegar a 70, el Gremio de Tasadores toma un activo en consignación. A los 90, toma su sello.

El combate existe y está diseñado deliberadamente como una **mala opción**. Los puntos de vida alcanzan un máximo de 24, el límite más bajo del catálogo, y el perfil de recursos de combate tiene una matriz `gains` vacía; ninguna fila recompensa la violencia. Atacar consume liquidez, recibir daño la agota y ganar agota 5 más, porque acaba de dañar la propiedad de alguien.

## Inicio rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-merchant';

const engine = createGame(71);

// Register with the Assay Guild — the seal is what makes consignment possible
engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
engine.submitAction('choose', { parameters: { choiceId: 'register' } });

// Read the goods, contest the terms, then hand them over
engine.submitAction('appraise', { parameters: { itemId: 'bale-of-flax' } });
engine.submitAction('move', { targetIds: ['long-quay'] });
engine.submitAction('move', { targetIds: ['crooked-stair'] });
engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

// Reconcile your own books
engine.submitAction('audit');
```

## Patrones demostrados

- **Un ciclo primario no basado en el combate** — cinco verbos comerciales impulsan el juego; la pila de combate está configurada, pero tiene un precio como penalización.
- **Un perfil de recursos invertido** — `CombatResourceProfile` sin `gains`, por lo que la IA empuja a un agente con baja liquidez hacia el desapego.
- **Un módulo local del paquete** — `contract-core` se encuentra dentro del inicio en lugar de en `@ai-rpg-engine/modules`, porque tiene exactamente un consumidor. Promocione al segundo.
- **Operaciones inyectadas en lugar de nuevas dependencias** — la maquinaria de estado y el evaluador de reconocimiento se pasan, utilizando la misma interfaz `createEquipmentCore`.
- **Instrumentos que limitan las mecánicas, no las estadísticas** — el Sello del Gremio otorga `consign` y el Libro de cuentas otorga `audit`, por lo que una incautación elimina un verbo.
- **Un distrito sin control como mecánica** — Warrens no tiene ninguna facción controladora, lo que la convierte en el único lugar donde no hay depósito en garantía ni recurso legal.

## Mecánicas únicas

| Verbo | Qué hace |
|------|--------------|
| `appraise` | Evalúa el valor real, la rareza y el origen en comparación con el precio solicitado. Un mejor `ledger` reduce el rango. |
| `haggle` | Discute un precio. Cuesta liquidez; el margen ganado se deposita contra esa contraparte y se consume en su próximo `consign` con ella. |
| `consign` | Entrega bienes a cambio de un pago futuro, creando una obligación con una fecha límite. Los bienes salen inmediatamente de su inventario; esa brecha es todo el riesgo. |
| `underwrite` | Asume el riesgo de otra parte por una tarifa. Liquidez ahora; si la parte que garantizó incumple, la reclamación se activa y la garantía se aplica. |
| `audit` | Reconcilia sus libros y notifica las discrepancias. Requiere el Libro de cuentas; no puede realizar una auditoría basándose en la memoria. |

El **reloj de obligaciones** funciona con el movimiento, no con un temporizador. Las entregas vencidas acumulan garantías a `overdueTicks × value ÷ 10`. La incautación al llegar a la garantía 70 toma la obligación cuyo ID de artículo se ordena en orden ascendente; es determinista, nunca aleatorio.

## Contenido

- **8 zonas** en 4 distritos: Saltgate (el mercado legal), Dockward (aranceles y retrasos), Warrens (pago en efectivo) y la High Counting House.
- **4 NPC** — Maestro de Tasación Corvane, Capitán del Puerto Drell, Agente Inaya, Tesorero Null.
- **3 hostiles + 1 jefe** — La Cuenta Permanente no es una criatura, sino un ajuste de cuentas, con fases basadas en el grado de carga que tenga al llegar.
- **3 misiones** — Abra los libros, El convoy tardío, La cuenta permanente.
- **14 objetos** divididos en bienes comerciales fungibles y cinco instrumentos únicos.

## Estadísticas y recursos

| Estadística | Rol |
|------|------|
| `ledger` | Aritmética, memoria, detección de fraude |
| `tongue` | Negociación y engaño |
| `standing` | Quién da fe por usted |

| Recurso | Comportamiento |
|----------|-----------|
| `hp` | 24 máximo: el más bajo del catálogo. |
| `stamina` | Economía de acciones estándar |
| `coin` | Lo que posee |
| `liquidity` | Lo que puede desplegar sin generar una deuda |
| `lien` | **Inverso**: comienza vacío y se llena hasta la incautación. |

El combate asigna `attack → tongue`, `precision → ledger`, `resolve → standing`: un agente que termina luchando lo hace intimidando y respaldando, nunca superando a nadie en fuerza física.

## Juego en el libro de cuentas (opcional)

Este es el paquete de referencia para `@ai-rpg-engine/ledger-adapter`. No tiene ninguna dependencia con él; una prueba afirma que nunca lo tendrá, pero sus mecánicas son las que el adaptador fue diseñado para cumplir: `consign` es un primitivo de liquidación que lleva un dispositivo argumental, `audit` es el verificador externo como verbo jugable y una incautación de garantía es el compensador nominal que llega en la ficción. Consulte [el Capítulo 60](../../docs/handbook/60-xrpl-ledger-adapter.md) y [el Capítulo 61](../../docs/handbook/61-xrpl-nft-gear.md).

## Qué tomar prestado

El ciclo de vida de la obligación, si su juego tiene deuda. El patrón de operaciones inyectadas, si su paquete necesita un sistema sin generar una dependencia. Y la auditoría antiinercial en `anti-inert.test.ts`: rastrea cada mecánica principal a través de una sesión jugada real y encontró seis que estaban configuradas, con esquema válido, con pruebas unitarias aprobadas y que no funcionaban.

## Licencia

MIT
