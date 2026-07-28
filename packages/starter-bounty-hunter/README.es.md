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

# @ai-rpg-engine/starter-bounty-hunter

> **Ejemplo de composición** — Este paquete inicial demuestra cómo crear un juego cuyo ciclo principal es la persecución, y cuya verdadera moneda es qué mitad de la ciudad seguirá abriéndote sus puertas. Es un ejemplo del que aprender, no una plantilla para copiar. Consulte la [Guía de composición](../../docs/handbook/57-composition-guide.md) para crear su propio juego.

**Alarma y persecución** — Eres un cazador de ladrones en una ciudad sin fuerzas policiales y sin deseo de tenerlas. Aquí no hay ley. Hay un precio, y eres tú.

Parte del catálogo de paquetes iniciales del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

*Alarma y persecución* es la verdadera institución: el deber legal de cada espectador de unirse a una persecución una vez que se haya iniciado. También es, exactamente, la doctrina del "calor" de este motor en lenguaje de época: **el calor determina si el mundo está prestando atención ahora; la persistencia determina si lo recordará después.** El paquete se creó teniendo en cuenta esta doctrina, y no a su alrededor. No añade un segundo reloj de persecución.

La ciudad tiene dos mitades que ambas pagan por los favores. La oficina de recompensas paga por cada cabeza y te proporciona la cobertura legal para capturar a alguien. El inframundo paga por el silencio, por las placas robadas y por un hombre que no testifique. Jonathan Quill, quien se hace llamar Jefe de Cazadores de Ladrones, descubrió que puede manejar ambos aspectos al mismo tiempo. Él es el jefe de este paquete, y no es un monstruo; es tú, cuatro años más adelante en el mismo camino.

## Inicio rápido

```typescript
import { createGame, pursuitState, formatPursuitForNarrator } from '@ai-rpg-engine/starter-bounty-hunter';

const engine = createGame(71);

// Sign for a ticket — the office now owns what you do next
engine.submitAction('speak', { targetIds: ['clerk-hesper'] });
engine.submitAction('choose', { parameters: { choiceId: 'sign' } });

// Buy a word, walk it down, take him breathing
engine.submitAction('informant', { targetIds: ['nightman'] });
engine.submitAction('move', { targetIds: ['shambles'] });
engine.submitAction('move', { targetIds: ['rookery'] });
engine.submitAction('collar', { targetIds: ['rookery-runner'] });

// Then choose a side, for today
engine.submitAction('impeach', { targetIds: ['rookery-runner'] });  // the office
// ...or take the other road entirely
engine.submitAction('fence', { toolId: 'stolen-plate' });           // the ward

console.log(formatPursuitForNarrator(engine.world));
// [SEARCHED] Somebody raised the cry. Faces turn when you pass. (heat 12 — 10+ and the cry is up)
```

## Patrones demostrados

- **Un ciclo de persecución sin un segundo reloj** — `pursuitState` es una derivación pura del propio `player_heat` y la alerta de facción del motor. `HUNTED_HEAT` *es* el `HEAT_ESCALATION_THRESHOLD` del "tick" mundial, por lo que el jugador nunca tiene dos números que no estén de acuerdo sobre si está siendo perseguido.
- **Una reputación de doble cara como presión del paquete** — `warrant` es la cobertura legal; `infamy` es la percepción que tiene el inframundo de ti. Trabajar en uno aumenta y gasta el otro. Ninguno es un medidor de ruina; no hay pérdida de valor, solo una dirección hacia la que te estás moviendo.
- **El rechazo como mecánica** — `collar` requiere cobertura legal *y* un objetivo ya debilitado, y explica por qué si se niega. Una captura que no verifica nada es un lanzamiento de daño con una recompensa adjunta.
- **La doctrina como verbo del jugador** — `lay-low` convierte el silencio que el motor ya recompensa en algo que eliges, y se niega cuando nadie está mirando, porque un verbo que siempre funciona no enseña nada.
- **Contenido creado a partir de las reglas de aparición** — El empleado Hesper es aliado y codicioso porque esa es la única forma de NPC que la regla `contract` del motor ofrecerá trabajo. El Barrio Marginal se creó como pobre e incontrolado porque así lo indican las reglas del distrito.
- **Un módulo local del paquete** — `pursuit-core` vive dentro del paquete inicial en lugar de en `@ai-rpg-engine/modules`, porque tiene exactamente un consumidor. Promociona en el segundo nivel.

## Mecánicas únicas

| Verbo | Qué hace |
|------|--------------|
| `collar` | Captura a un objetivo **vivo** bajo orden judicial. Requiere cobertura legal y un objetivo ya debilitado; de lo contrario, se niega, indicando el motivo. Produce un registro, no un pago. |
| `impeach` | Testifica contra un objetivo que tienes en custodia. Convierte la captura en una condena: la orden judicial aumenta, la infamia disminuye. La oficina confía en un cazador de ladrones que cumple con su trabajo. |
| `informant` | Compra información sobre el paradero de un objetivo. El precio es una función impresa de tu propia reputación en la calle (los extraños pagan el doble), y preguntar es en sí mismo una señal, por lo que la infamia aumenta. |
| `post-bounty` | Establece tu propio precio por un nombre, gastando el crédito de la oficina para hacerlo. Tu rencor se convierte en el trabajo de otras personas. |
| `fence` | Traslada los bienes recuperados a través del mercado negro. Necesita una **persona**, no un menú. Paga mal a propósito: no estás aquí por el dinero. |
| `lay-low` | Pasa un día fuera de la vista y deja que la alarma disminuya. Se niega cuando nadie está mirando. |

**El estado de persecución** es `COLD` / `SEARCHED` / `HUNTED`, y cada estado lleva el número que lo causó. Una facción en alerta 60 o superior te persigue durante una semana tranquila, porque la alerta es memoria y el calor es atención, que es la doctrina, expresada en el vocabulario del paquete.

## Contenido

- **7 zonas** en 3 distritos: el Barrio (oficina y sesiones), el Mercado (mercado y la pared muerta) y el Barrio Marginal (pobre, incontrolado y mediblemente más difícil de obtener una respuesta clara).
- **4 NPC**: Empleado Hesper, Madre Slack, Sargento Pike (reclutable), el Escriba.
- **3 hostiles + 1 jefe**: Jonathan Quill no se vuelve más fuerte a medida que pierde. Se vuelve más franco.
- **3 misiones**: El Primer Boleto, Dinero de Sangre, El Jefe de Cazadores de Ladrones.
- **6 objetos**, incluido el Boleto de Tyburn: un certificado real y transferible que históricamente valía más que la recompensa por la que se otorgaba.

## Estadísticas y recursos

| Estadística | Rol |
|------|------|
| `grip` | Lo que puedes hacer a un hombre que no quiere ser capturado |
| `nose` | Leer una habitación, un libro de contabilidad, una mentira: el verdadero oficio del cazador de ladrones. |
| `authority` | Si la habitación cree que tienes derecho a estar haciendo esto |

| Recurso | Comportamiento |
|----------|-----------|
| `hp` | 32 máximo: te ganas la vida capturando gente. |
| `stamina` | Lo que cuesta una persecución. Luchar lo gasta; `lay-low` lo restaura. |
| `coin` | Lo que quieren los informantes. |
| `warrant` | Cobertura legal. Gastada por `collar` y `post-bounty`, restaurada por `impeach`. |
| `infamy` | La otra mitad de la ciudad te percibe. **No** es un medidor de ruina. |

Los mapas de combate son `attack → grip`, `precision → nose` y `resolve → authority`. La violencia no está prohibida aquí: es **ruidosa** y gasta la resistencia que necesitas para la próxima captura.

## Qué tomar prestado

La derivación del estado de persecución, si tu juego incluye una escena de persecución: tres palabras clave, determinista, cada transición debe indicar su desencadenante y no debe haber ningún estado que el motor ya no controle. La reputación bilateral, si tu juego tiene facciones que desean cosas incompatibles de la misma persona. Y `anti-inert.test.ts`: cada verbo nativo del conjunto de datos tendrá una fila que demuestre que modifica algo *y* una fila que demuestre que su rechazo es un rechazo estructurado y no simplemente silencio.

## Licencia

MIT
