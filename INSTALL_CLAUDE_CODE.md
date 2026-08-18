# Instalar los roles de Griffin como subagentes nativos de Claude Code

Por defecto, los roles de Griffin (`.agents/griffin/*.md`) **no son visibles** dentro de una sesión interactiva de Claude Code — solo se ejecutan a través de `npm run griffin` (`griffin/orchestrator.ts`), que usa el Claude Agent SDK por su cuenta. Esto es así a propósito: el puente con el dispositivo del usuario en el flujo de desarrollo de Griffin bloquea la escritura remota dentro de `.claude/`, así que el sistema vive en su propia carpeta (`.agents/griffin/`).

Este script cierra esa distancia: genera, a partir de cada rol de Griffin, un fichero equivalente en `.claude/agents/`, el formato que Claude Code sí reconoce de forma nativa — para poder invocarlos directamente en una sesión, sin salir a una terminal aparte.

## Instalación

Desde la raíz del proyecto (donde tengas `.agents/griffin/` y `griffin/`):

```bash
npx tsx griffin/install-claude-code.ts
```

o, si has añadido el script a `package.json`:

```bash
npm run griffin:install-claude-code
```

Esto crea un fichero `.claude/agents/<rol>.md` por cada rol de Griffin (`navigator`, `planner`, `coder`, `tester`, `architecture-guardian`, `reviewer`, `designer`, `verifier`, `documenter`, `optimizer`). Puedes volver a ejecutarlo cuando quieras — sobrescribe lo que ya hubiera, así que sirve para resincronizar después de editar cualquier `.agents/griffin/*.md`.

> Si ya tenías subagentes propios en `.claude/agents/` con alguno de estos nombres, este script los sobrescribe sin avisar. Revisa `.claude/agents/` antes de ejecutarlo si no estás seguro.

## Cómo invocarlos, una vez instalados

Dentro de una sesión de Claude Code:

```text
Usa el subagente reviewer para revisar los últimos cambios
Que el subagente architecture-guardian compruebe si esto respeta la arquitectura
```

o mencionándolo explícitamente:

```text
@agent-reviewer revisa los últimos cambios
```

Claude Code también puede delegar automáticamente a uno de estos roles si el `description` de su frontmatter encaja con lo que le pides, sin que lo menciones por nombre.

## Qué se conserva y qué NO — importante antes de usarlo así

Instalar los roles como subagentes nativos **no es equivalente** a ejecutar Griffin vía `npm run griffin`. El formato de subagente de Claude Code es distinto del `AgentDefinition` que usa el Agent SDK, y varias piezas de Griffin no tienen equivalente ahí:

| Se conserva | No se conserva |
|---|---|
| El prompt completo de cada rol | Las barandillas de coste: `maxBudgetUsd`, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` — esas viven en `orchestrator.ts`, no en el subagente en sí |
| Las skills (`typescript`, `react`, `testing`, `documentation`) — fundidas dentro del prompt por el propio script instalador | El registro de cada ejecución en `griffin/history/runs.jsonl` (no hay ese hook fuera de `orchestrator.ts`) |
| El modelo por rol (`haiku`/`sonnet`) | El override por variable de entorno `GRIFFIN_<ROL>_MODEL` — el frontmatter nativo no lo lee; para cambiar el modelo de un subagente instalado hay que editar su `.claude/agents/<rol>.md` a mano |
| Qué herramientas tiene cada rol (`Read`, `Write`, `Grep`...) | **Las restricciones de Bash con patrón** (`Bash(git diff *)`, `Bash(npm audit)`...) — el frontmatter nativo de Claude Code solo admite nombres de herramienta sueltos, no argumentos. El instalador colapsa esos patrones a `Bash` a secas (Bash sin restricción técnica) |
| La sección "Workspace" de cada rol (sigue en el prompt, pero solo tiene efecto si tú mismo le indicas una ruta al invocarlo — nadie la decide automáticamente como hace `orchestrator.ts`) | El patrón de workspace automático entre varios roles en una misma tarea — eso es lógica de `orchestrator.ts`, aquí cada invocación es independiente |

**Roles afectados por la pérdida de restricción de Bash** (pasan a tener Bash completo, con la restricción a solo lectura de git/`npm audit` como instrucción de prompt, ya no como límite técnico): `architecture-guardian`, `documenter`, `optimizer`, `reviewer`, `designer`, `verifier`. El script añade una nota explícita al principio del prompt de cada uno de estos roles recordándoselo — pero sigue siendo una restricción de comportamiento, no una imposible de saltarse técnicamente. Si esto te preocupa para algún rol en concreto, edita a mano su `tools:` en `.claude/agents/<rol>.md` para quitarle `Bash` del todo.

**`coder`** necesita el servidor MCP de Context7 (`mcp__context7__resolve-library-id`, `mcp__context7__query-docs`) para que esas herramientas existan de verdad — configúralo en `.mcp.json` o en tu configuración de Claude Code; si no, esas dos herramientas simplemente no estarán disponibles y `coder` seguirá funcionando pero sin consultar documentación externa.

## Cuándo usar cada vía

- **`npm run griffin -- "tarea"`** — para ciclos completos o de varios roles encadenados, cuando quieres las barandillas de coste, el historial y el patrón de workspace. Sigue siendo la forma recomendada para trabajo real de features/módulos.
- **Subagentes instalados en Claude Code** — para invocar un rol suelto y puntual sin salir de la sesión en la que ya estás trabajando (p. ej. "usa `reviewer` para mirar este diff que acabo de hacer"), aceptando las limitaciones de arriba.

Las dos vías leen el mismo `CLAUDE.md`/documentación del proyecto y los mismos roles fuente en `.agents/griffin/` — no son sistemas independientes, solo dos formas distintas de invocar el mismo contenido.
