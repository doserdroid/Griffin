# Skill: TypeScript

Buenas prácticas técnicas genéricas para escribir TypeScript, independientes de cualquier proyecto concreto. Se combinan con las convenciones propias del repo (que siempre tienen prioridad si entran en conflicto).

- **Tipado estricto por defecto.** Evita `any`; si de verdad hace falta un escape hatch, usa `unknown` y estrecha el tipo explícitamente. Prefiere tipos explícitos en las fronteras públicas (funciones exportadas, props, retornos de API) aunque el resto se pueda inferir.
- **Nombres significativos**, en el idioma y estilo (`camelCase`/`PascalCase`) que ya use el repo — imita lo existente, no impongas una convención distinta.
- **Funciones y módulos con una responsabilidad clara.** Si una función necesita un comentario para explicar "qué hace" (no "por qué"), probablemente debería dividirse o renombrarse.
- **Dependencias explícitas.** Prefiere inyección de dependencias (parámetros, constructor) sobre singletons ocultos o imports directos de servicios externos dentro de lógica que debería ser pura o testeable.
- **Errores explícitos.** No los ignores ni los conviertas en `console.log` silencioso. Usa tipos de error específicos o resultados tipados (`Result`/`Either`-like) si el proyecto ya sigue ese patrón; si no, al menos lanza `Error` con mensaje descriptivo y deja que se propague donde se pueda manejar con contexto.
- **`async`/`await` siempre con manejo de errores** — nunca una promesa sin `await`, `.catch()` o un `try/catch` que la cubra.
- **Evita abstracción prematura.** No introduzcas interfaces, genéricos o capas nuevas "por si acaso" — resuelve el caso concreto que tienes delante; generaliza solo cuando aparezca una segunda necesidad real.
- **Sigue el linter/formatter que ya tenga el repo** (ESLint, oxlint, Biome, Prettier...) en vez de tu propio criterio de estilo — revisa la config antes de asumir nada.
- **Inmutabilidad donde sea razonable**: prefiere `readonly`, spread/nuevas referencias sobre mutación in-place, especialmente en dominio/estado compartido.
