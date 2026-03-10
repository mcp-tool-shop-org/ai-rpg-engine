<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-colony

**Pérdida de señal** — Una colonia distante pierde contacto con la Tierra. Algo está vivo en las cavernas de abajo.

Parte del catálogo de paquetes de inicio del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Gestión de una colonia de ciencia ficción + contacto con seres alienígenas. La energía es un recurso compartido de la colonia; cuando disminuye, los sistemas fallan en cascada. La presencia alienígena percibe a los colonos como "patrones de resonancia disruptivos".

## Inicio rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## Contenido

- **5 zonas:** Módulo de control, Bahía de hidroponía, Valla perimetral, Torre de señales, Caverna alienígena.
- **2 PNJ:** Dra. Vasquez (científica), Jefe Okafor (seguridad).
- **2 enemigos:** Dron comprometido, Entidad de resonancia.
- **1 árbol de diálogo:** La Dra. Vasquez informa sobre la señal alienígena y la política de la colonia.
- **1 árbol de progresión:** Camino del Comandante (Ingeniero de campo → Sensores avanzados → Inquebrantable).
- **1 objeto:** Celda de emergencia (restaura 20 de energía).

## Mecánicas únicas

| Verbo | Descripción |
|------|-------------|
| `scan` | Barrido de sensores utilizando la conciencia. |
| `allocate` | Redistribuir la energía entre los sistemas de la colonia. |

## Estadísticas y recursos

| Estadística | Rol |
|------|------|
| ingeniería | Reparar y construir sistemas. |
| comando | Liderazgo y moral de la tripulación. |
| conciencia | Sensores y percepción. |

| Recurso | Rango | Notas |
|----------|-------|-------|
| HP | 0–25 | Salud estándar |
| Energía | 0–100 | Recurso compartido de la colonia, se regenera a 2 por "tick". |
| Moral | 0–30 | Cohesión de la tripulación. |

## Licencia

MIT
