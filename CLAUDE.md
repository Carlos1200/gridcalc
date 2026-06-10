# gridcalc — instrucciones para Claude Code

Motor de fórmulas tipo Excel, headless, en TypeScript estricto, cero dependencias de runtime.

**Antes de trabajar, lee:**

- `PROGRESS.md` — estado actual por fases con checklist; márcalo al completar ítems.
- `docs/SPEC.md` — especificación técnica completa (fuente de verdad del diseño: arquitectura, precedencia, tipos, roadmap).

**Reglas del proyecto:**

- Código, identificadores, comentarios y docs públicas en **inglés**; la localización (es/en) es una feature de runtime, no el idioma del fuente.
- Compatibilidad Excel por defecto, incluso sus bugs históricos (bisiesto 1900, configurable).
- Una función NO está terminada sin sus golden tests (caso normal, bordes, tipos incorrectos con el error exacto, rangos, propagación de errores).
- Cero dependencias de runtime; solo devDependencies.
- Verificar antes de dar por hecho: `npm test`, `npm run typecheck`, `npm run lint`.
- Commits incrementales en inglés, sin línea de co-author.
- Al terminar un bloque de trabajo: actualizar `PROGRESS.md` (checklist y "Última actualización") en el mismo commit.
