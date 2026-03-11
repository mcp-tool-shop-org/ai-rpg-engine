<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-colony

> **Ejemplo de Composición** — Este proyecto de inicio demuestra cómo integrar el motor para la supervivencia de una colonia de ciencia ficción. Es un ejemplo para aprender, no una plantilla para copiar. Consulte la [Guía de Composición](../../docs/handbook/57-composition-guide.md) para crear su propio juego.

**Pérdida de Señal** — Una colonia distante pierde contacto con la Tierra. Algo está vivo en las cavernas de abajo.

Parte del catálogo de proyectos de inicio del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Gestión de una colonia de ciencia ficción + contacto con seres alienígenas. La energía es un recurso compartido por toda la colonia; cuando disminuye, los sistemas fallan en cadena. La presencia alienígena percibe a los colonos como "patrones de resonancia disruptivos".

## Inicio Rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## Patrones Demostrados

| Característica | Lo que muestra la colonia |
|---------|-------------------|
| **Engagement** | Etiquetas de zonas de cuello de botella, roles de apoyo/protección basados en escuadrones. |
| **Resources** | Recurso de energía compartido a nivel de toda la colonia con consumo ambiental. |
| **Environment** | Peligros de la zona que provocan el agotamiento de los recursos y fallos en cadena. |
| **Cognition** | Entidad alienígena con reglas de percepción no humanas. |

## Contenido

- **5 zonas:** Módulo de Comando, Bahía de Hidroponía, Valla Perimetral, Torre de Señales, Caverna Alienígena.
- **2 PNJ:** Dra. Vasquez (científica), Jefe Okafor (seguridad).
- **2 enemigos:** Dron Comprometido, Entidad de Resonancia.
- **1 árbol de diálogo:** La Dra. Vasquez informa sobre la señal alienígena y la política de la colonia.
- **1 árbol de progresión:** Camino del Comandante (Ingeniero de Campo → Sensores Agudos → Inquebrantable).
- **1 objeto:** Celda de Emergencia (restaura 20 de energía).

## Mecánicas Únicas

| Verbo | Descripción |
|------|-------------|
| `scan` | Barrido de sensores utilizando la conciencia. |
| `allocate` | Redistribuir la energía entre los sistemas de la colonia. |

## Estadísticas y Recursos

| Estadística | Rol |
|------|------|
| ingeniería | Reparar y construir sistemas. |
| comando | Liderazgo y moral de la tripulación. |
| conciencia | Sensores y percepción. |

| Recurso | Rango | Notas |
|----------|-------|-------|
| HP | 0–25 | Salud estándar |
| Energía | 0–100 | Recurso compartido por toda la colonia, se regenera a 2 unidades por ciclo. |
| Moral | 0–30 | Cohesión de la tripulación. |

## Qué aprender

Presión de recursos impulsada por el entorno y roles de compromiso de escuadrones. Estudie cómo el recurso de energía de la colonia se agota debido a eventos ambientales (no solo combate), lo que provoca fallos en cadena en los sistemas que obligan a una asignación táctica de recursos en todo el escuadrón.

## Licencia

MIT
