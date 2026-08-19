<p align="center">
  <img src="canvas.png" alt="Griffin" width="220">
</p>

# Griffin

Sistema agéntico multi-rol para desarrollo asistido por IA, construido sobre el [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). Pensado para copiarse tal cual a cualquier repositorio: ningún rol asume un stack, una arquitectura o un proyecto concreto — cada uno lee el `CLAUDE.md` (o equivalente) del proyecto destino en tiempo de ejecución.

Este repo es el sistema en sí, sin ningún proyecto de aplicación dentro. Para usarlo, se copian `.agents/griffin/` y `griffin/` al repositorio donde vayas a trabajar (ver [Instalación en otro proyecto](#instalación-en-otro-proyecto)).

> Proyecto personal, no financiado por ninguna empresa. El coste en tokens/API es una restricción de diseño de primer orden, no un detalle de optimización posterior — ver [Coste](#coste-y-barandillas).

## Roles

| Rol | Modelo por defecto | Responsabilidad | Herramientas |
|---|---|---|---|
| **navigator** | Haiku | Explora y comprende código existente (estructura, convenciones, puntos de entrada) antes de planificar; produce un mapa conciso para `planner`. Opcional: útil en tareas grandes o zonas poco familiares del repo | `Read`, `Grep`, `Glob` |
| **planner** | Sonnet | Descompone una tarea/feature en subtareas por capa/módulo, según la arquitectura del repo | `Read`, `Grep`, `Glob` |
| **coder** | Sonnet | Implementa código respetando la arquitectura y el plan | `Read`, `Write`, `Edit`, `Grep`, `Glob`, Context7 (MCP) |
| **tester** | Sonnet | Escribe tests (TDD), valida tests tras cambios, genera planes de pruebas de regresión | `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob` |
| **architecture-guardian** | Haiku | Verifica las restricciones arquitectónicas del proyecto (documentadas o inferidas) — límites entre capas/módulos, qué puede importar qué | `Read`, `Grep`, `Glob`, git de solo lectura |
| **reviewer** | Sonnet | Revisa seguridad y calidad del código, al estilo de una revisión automática de PR (secretos, inyección, auth, deps vulnerables...) | `Read`, `Grep`, `Glob`, git de solo lectura, `npm audit` |
| **designer** | Sonnet | Revisa UI/UX, consistencia visual y del sistema de diseño (tokens, reutilización de componentes, accesibilidad, estados de la interfaz) sobre el código de interfaz ya escrito | `Read`, `Grep`, `Glob`, git de solo lectura |
| **verifier** | Sonnet | Comprueba, al cierre del ciclo, que el resultado final cumple el objetivo y los criterios de aceptación originales | `Read`, `Grep`, `Glob`, git de solo lectura |
| **documenter** | Sonnet | Mantiene una wiki de documentación funcional y técnica en `docs/` del proyecto destino, siempre en inglés | `Read`, `Write`, `Edit`, `Grep`, `Glob`, git de solo lectura |
| **optimizer** | Sonnet | Al cerrar un ciclo de trabajo (nunca automático), analiza dónde se fue el coste/tiempo y qué se corrigió a mano, y propone mejoras concretas | `Read`, `Grep`, `Glob`, git de solo lectura, `Write` (restringido a `griffin/history/retrospectives/`) |

`navigator` y `architecture-guardian` corren en Haiku por defecto por ser los roles más mecánicos; el resto requiere síntesis/juicio y se queda en Sonnet. Cualquier rol se puede re-tarear por tarea con `GRIFFIN_<ROL>_MODEL=<modelo>` sin tocar su fichero.

Las **skills** (`typescript`, `react`, `testing`, `documentation`, `design`) son módulos de buenas prácticas técnicas en `.agents/griffin/skills/*.md`, agnósticas de proyecto, que un rol declara en su frontmatter (`skills: typescript, react`) y se le inyectan en el prompt en tiempo de carga. Para añadir soporte a otro lenguaje/framework, basta con crear `.agents/griffin/skills/<nombre>.md` y listarlo en el rol que lo necesite.

## Por qué no hay un agente `orchestrator`

En el Claude Agent SDK, un subagente no puede invocar a otros subagentes (por diseño de este sistema, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` se fija en `1`). La orquestación — decidir qué roles invocar y en qué orden — solo puede vivir en la sesión de nivel superior. `griffin/orchestrator.ts` **es** ese proceso raíz: no es un rol más, es el propio script que llama a `query()` del SDK y delega, vía su prompt, en los subagentes que declara `.agents/griffin/`.

## Transferencia de información entre agentes: contexto directo vs. workspace

Cada subagente arranca con una ventana de contexto propia y aislada — no hay memoria compartida entre subagentes de una misma sesión, y solo el mensaje final de un subagente vuelve al proceso que lo invocó (confirmado contra la [documentación oficial de subagentes](https://code.claude.com/docs/en/agent-sdk/subagents)). Relayear un output largo a varios agentes downstream vía prompt paga ese contenido íntegro, sin caché, en cada llamada.

Por eso los roles de output largo (`navigator`, `planner`, `reviewer`, `architecture-guardian`, `verifier`) soportan opcionalmente el **Shared Workspace Pattern**: si su invocación les indica una ruta `griffin/workspace/<slug>/`, escriben ahí su resultado completo y devuelven solo la ruta; el siguiente rol la lee él mismo en vez de recibir el contenido relayeado. `coder`/`tester` quedan fuera porque su output real ya son ficheros en el propio repo. Es una optimización de coste opcional, no un requisito — para outputs cortos o un solo agente, el contexto directo sigue siendo más simple y barato. Ver `griffin/workspace/README.md`.

Se descartó deliberadamente una arquitectura tipo *Blackboard* (agentes que se auto-activan sobre una estructura de conocimiento compartida, sin orquestador central) por ser sobre-ingeniería para un pipeline mayoritariamente lineal como este.

## Instalación

```bash
npm install @anthropic-ai/claude-agent-sdk
npm install -D tsx typescript @types/node
```

Requiere Node 18+. Autenticación por API key de Anthropic (`ANTHROPIC_API_KEY`, desde [platform.claude.com](https://platform.claude.com/) → Settings → API keys) — **no** el login de Claude Pro/Max, es un producto de facturación separado (pay-as-you-go).

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

`CONTEXT7_API_KEY` es opcional — sin ella, [Context7](https://context7.com) (documentación de librerías siempre actualizada, disponible para `coder`) funciona en el tier gratuito con límites de tasa más bajos.

## Uso

Dos patrones, según lo que necesites:

```bash
# A) Una sola tarea consolidada — más barato, preserva contexto entre agentes
# dentro de la misma sesión. Recomendado para trabajo rutinario.
npm run griffin -- "Implementa el módulo X completo: planifica, escribe tests TDD, \
  implementa, valida, revisa seguridad y arquitectura, verifica que quede completo, \
  y documenta el módulo"

# B) Invocaciones sueltas de un solo rol — para revisiones puntuales o cuando
# quieres inspeccionar cada paso antes de seguir. Cada llamada es una sesión
# nueva, sin el contexto de la anterior (cuesta más).
npm run griffin -- "Explora y describe cómo funciona el módulo X antes de tocarlo"
npm run griffin -- "Planifica la implementación completa del módulo X"
npm run griffin -- "Revisa los últimos cambios en busca de problemas de seguridad"
npm run griffin -- "Verifica si la tarea X quedó completa según lo planeado"

# Cambios pequeños no necesitan mencionar ningún rol — el orquestador decide:
npm run griffin -- "Arregla el typo en el botón de guardar"

# optimizer: solo al cerrar un ciclo de trabajo con sentido, nunca automático
npm run griffin -- "Cerramos el módulo X. Analiza coste y errores corregidos a mano y propón mejoras"

# designer: tras cambios de interfaz, para revisar consistencia visual y accesibilidad
npm run griffin -- "Revisa el diseño de los últimos cambios en el formulario de checkout"
```

No hay un pipeline fijo: el modelo de nivel superior decide, según la tarea, qué roles activar. `optimizer` es la única excepción explícita — nunca se invoca por iniciativa propia.

## Instalación en otro proyecto

Se instala como **git subtree**, no copiando ficheros a mano — un copy-paste no versionado no tiene forma de saber si el destino está desactualizado (así fue como una instalación anterior se quedó sin el rol `designer` durante días sin que nadie lo notara) ni de distinguir un fichero de Griffin sin tocar de uno con personalización local del proyecto.

1. Desde la raíz del repositorio destino (con el working tree limpio):
   ```bash
   git subtree add --prefix=griffin https://github.com/doserdroid/Griffin.git subtree-griffin --squash
   git subtree add --prefix=.agents/griffin https://github.com/doserdroid/Griffin.git subtree-agents-griffin --squash
   ```
   `subtree-griffin` y `subtree-agents-griffin` son ramas de este repo que contienen, cada una, solo el historial de `griffin/` y `.agents/griffin/` respectivamente (generadas con `git subtree split --prefix=<carpeta> -b <rama>`) — **no** uses `main`: al no estar filtrada por carpeta, traería el repo entero (README, LICENSE...) dentro del prefijo destino.
2. Añade los scripts a su `package.json`:
   ```json
   "scripts": {
     "griffin": "tsx griffin/orchestrator.ts",
     "griffin:install-claude-code": "tsx griffin/install-claude-code.ts"
   }
   ```
3. Instala las dependencias (ver [Instalación](#instalación)).
4. Si el proyecto destino tiene un `CLAUDE.md` (o documentación de arquitectura equivalente), los roles lo leerán automáticamente. Si no existe, cada rol sigue el patrón que detecte en el código ya presente.

**Nunca edites ficheros dentro de `griffin/` o `.agents/griffin/`** — son código vendido, cualquier cambio local se pierde o entra en conflicto en el próximo `subtree pull`. Cualquier nota o convención específica del proyecto destino va en su `CLAUDE.md` (que `orchestrator.ts` ya carga vía `settingSources: ["project"]`), nunca en un comentario dentro de un `.ts` o `.md` de Griffin.

Para traer actualizaciones (p. ej. un rol nuevo como `designer`):
```bash
git subtree pull --prefix=griffin https://github.com/doserdroid/Griffin.git subtree-griffin --squash
git subtree pull --prefix=.agents/griffin https://github.com/doserdroid/Griffin.git subtree-agents-griffin --squash
```

**Mantenimiento de `subtree-griffin`/`subtree-agents-griffin` (solo si tocas este repo):** son ramas derivadas, no se editan directamente. Tras cualquier cambio en `griffin/` o `.agents/griffin/` en `main`, regenéralas y publícalas antes de que los proyectos destino puedan hacer `pull`:
```bash
git subtree split --prefix=griffin --rejoin -b subtree-griffin
git subtree split --prefix=.agents/griffin --rejoin -b subtree-agents-griffin
git push origin subtree-griffin subtree-agents-griffin
```

`griffin/history/` y `griffin/workspace/` sí empiezan vacíos en cada instalación nueva (solo con su `README.md`) — son estado de ejecución de ese proyecto concreto, no algo transferible; conviven sin problema con el subtree porque un `subtree pull` solo toca lo que cambió río arriba, nunca ficheros añadidos localmente en esas dos carpetas. `documenter` sí trae una convención propia no negociable (documentar siempre en inglés, sea cual sea el idioma del proyecto destino) independiente de lo que diga el `CLAUDE.md`.

Contrapartida de vivir en `.agents/griffin/` (no en `.claude/agents/`): estos roles no aparecen como subagentes en Claude Code interactivo por defecto, solo funcionan a través de `griffin/orchestrator.ts`. Si además quieres invocarlos directamente dentro de una sesión de Claude Code, hay un instalador que los genera automáticamente — ver [Usarlo como subagentes nativos de Claude Code](#usarlo-también-como-subagentes-nativos-de-claude-code).

## Usarlo también como subagentes nativos de Claude Code

```bash
npm run griffin:install-claude-code
```

Genera un `.claude/agents/<rol>.md` por cada rol, fundiendo las skills correspondientes dentro del prompt, para poder invocarlos directamente en una sesión de Claude Code (`@agent-reviewer`, o simplemente pidiéndolo en lenguaje natural) sin pasar por `npm run griffin`. **No es equivalente** a la ejecución normal — se pierden las barandillas de coste, el historial, el patrón de workspace, el override de modelo por variable de entorno, y las restricciones de `Bash` con patrón se relajan a `Bash` completo (con la restricción como instrucción de prompt, no técnica) en `architecture-guardian`, `documenter`, `optimizer`, `reviewer` y `verifier`. Detalle completo de qué se conserva y qué no en [`griffin/INSTALL_CLAUDE_CODE.md`](griffin/INSTALL_CLAUDE_CODE.md).

## Estructura del repo

```
.agents/griffin/
├── navigator.md
├── planner.md
├── coder.md
├── tester.md
├── architecture-guardian.md
├── reviewer.md
├── designer.md
├── verifier.md
├── documenter.md
├── optimizer.md
└── skills/
    ├── typescript.md
    ├── react.md
    ├── testing.md
    ├── documentation.md
    └── design.md

griffin/
├── loadSkills.ts     # lee .agents/griffin/skills/*.md
├── loadAgents.ts      # lee .agents/griffin/*.md, inyecta skills, resuelve modelo
├── orchestrator.ts    # orquestador: invoca query() del Agent SDK
├── install-claude-code.ts  # genera .claude/agents/<rol>.md — ver INSTALL_CLAUDE_CODE.md
├── INSTALL_CLAUDE_CODE.md  # qué se conserva/pierde al instalarlo así
├── history/            # historial de ejecución + retrospectivas de `optimizer`
│   ├── README.md
│   ├── runs.jsonl       # no versionado — telemetría local
│   └── retrospectives/
└── workspace/           # scratch efímero entre agentes para outputs largos
    └── README.md         # el resto de esta carpeta no se versiona
```

## Coste y barandillas

Este sistema está pensado para uso personal sin presupuesto corporativo detrás, así que el coste es una restricción de diseño, no un detalle:

- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH="1"` — un subagente no puede invocar a otros subagentes, evitando que el coste se dispare de forma exponencial sin que te des cuenta.
- `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS="3"` — limita cuánto puede dispararse el gasto *por minuto* si algo se descontrola.
- `maxBudgetUsd` — techo de gasto por invocación (3 $ por defecto), configurable con `GRIFFIN_MAX_BUDGET_USD`.
- `coder` no tiene `Bash`. El resto de roles con acceso a `Bash`/git lo tienen restringido a comandos de solo lectura (`git diff`/`log`/`show`/`status`, `npm audit` sin `--fix`) — ninguno puede mutar el repo fuera de `Write`/`Edit` en su alcance declarado.
- `optimizer` nunca edita `.agents/griffin/*.md` directamente, aunque técnicamente tenga `Write` — solo puede escribir en `griffin/history/retrospectives/`. Un sistema que se reescribe a sí mismo basándose en su propio análisis de sus propios errores es un bucle de retroalimentación difícil de auditar; sus propuestas quedan para que una persona decida aplicarlas.
- Model tiering: `navigator` y `architecture-guardian` en Haiku por defecto — los roles más mecánicos, no los que requieren síntesis.
- Prefiere el patrón de llamada consolidada (A) sobre invocaciones sueltas (B) para trabajo de confianza: cada invocación de CLI es una sesión nueva que relee `CLAUDE.md` y no hereda contexto de la anterior.

Ninguna de estas barandillas son restos de una prueba de concepto — si se ajustan, que sea de forma consciente, documentada, y sustituyéndolas por algo equivalente.

## Licencia

MIT — ver [LICENSE](LICENSE).
