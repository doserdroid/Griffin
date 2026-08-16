# Griffin workspace

Carpeta de scratch efímero para tareas de un solo ciclo (`npm run griffin`) que invocan a varios roles cuyo output es texto largo (informes, planes, mapas de exploración) — `navigator`, `planner`, `reviewer`, `architecture-guardian`, `verifier`. `coder` y `tester` quedan fuera a propósito: su output ya es real (ficheros de código/test en el repo), no hace falta relayearlo por aquí.

## Por qué existe

Sin esta carpeta, el orquestador (`griffin/orchestrator.ts`) tiene que copiar literalmente el resultado de un agente dentro del prompt del siguiente para que este último tenga contexto (por ejemplo, pegar el mapa completo de `navigator` en el prompt de `planner`). Cada subagente del Agent SDK arranca con contexto aislado — no hay memoria compartida entre ellos — así que ese contenido se re-embebe entero, sin caché, en cada llamada downstream. Para outputs cortos es irrelevante; para un informe largo pasado a dos o tres roles siguientes, es pagar el mismo contenido varias veces sin necesidad.

Con workspace, cada agente escribe su resultado completo a un fichero y solo se pasa la ruta al siguiente agente, que la lee él mismo cuando la necesita — evita la duplicación de coste sin depender de un mecanismo de memoria compartida que este SDK no ofrece. Es una instancia del "Shared Workspace Pattern", un patrón reconocido en arquitecturas multiagente (alternativa más simple que un blackboard: aquí la secuencia de lectura/escritura sigue siendo mayormente lineal, decidida por el orquestador, no por activación de los propios agentes).

## Cómo se usa

El orquestador decide, por tarea, una ruta con forma `griffin/workspace/<slug-kebab-case>/` a partir de la tarea, y le indica a cada agente relevante que escriba ahí su resultado completo (fichero `<NN>-<rol>.md`, numerado según el orden de invocación) en vez de devolverlo íntegro en la conversación — y que lea los ficheros previos de ese workspace que necesite como entrada. Es opcional por diseño: si la tarea solo invoca a un agente, o los outputs son cortos, no hace falta workspace — cada rol solo lo usa si se le indica explícitamente una ruta (ver la sección "Workspace" en `.agents/griffin/navigator.md`, `planner.md`, `reviewer.md`, `architecture-guardian.md` y `verifier.md`).

## Qué NO es esta carpeta

- No es el historial de ejecución de Griffin — eso vive en `griffin/history/` (telemetría de coste y retrospectivas de `optimizer`).
- No es documentación curada del proyecto — eso vive en `docs/` (wiki mantenida por `documenter`).
- Es contenido efímero de un solo ciclo: no se versiona en git (ver `.gitignore`) y no hay garantía de que sobreviva más allá de la tarea que lo generó. Si algo de aquí resulta valioso a largo plazo (una decisión, una descripción funcional), es trabajo de `documenter` trasladarlo a `docs/`, no de dejarlo aquí.
