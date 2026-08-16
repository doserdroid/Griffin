// griffin/orchestrator.ts
//
// Orquestador de Griffin, el sistema agéntico multi-rol.
//
// Este fichero ES el orquestador: es la sesión de nivel superior del Agent SDK,
// la que decide (vía el prompt de abajo) qué subagentes invocar y en qué orden,
// y sintetiza la salida final. No hay un "orchestrator.md" en .agents/griffin/
// porque en este SDK un subagente no puede invocar a otros subagentes
// (CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH = 1, más abajo) — la orquestación solo
// puede vivir aquí, en el proceso raíz. Ver README.md de este repo, sección
// "Por qué no hay un agente orchestrator".
//
// Uso — dos patrones distintos, elige según lo que necesites:
//
//   A) Una sola tarea consolidada (recomendado para trabajo rutinario: más barato,
//      preserva contexto entre agentes dentro de la misma sesión, sin recargar
//      CLAUDE.md/skills en cada paso):
//        npm run griffin -- "Implementa el módulo X completo: planifica, escribe tests
//          TDD, implementa, valida, revisa seguridad y arquitectura, y verifica que
//          quede completo"
//
//   B) Invocaciones sueltas de un solo rol (para revisiones puntuales o cuando
//      quieres inspeccionar cada paso antes de seguir — cuesta más porque cada
//      llamada es una sesión nueva sin el contexto de la anterior):
//        npm run griffin -- "Explora y describe cómo funciona el módulo X antes de tocarlo"
//        npm run griffin -- "Planifica la implementación completa del módulo X"
//        npm run griffin -- "Escribe los tests del módulo X antes de implementarlo (TDD)"
//        npm run griffin -- "Implementa la entidad X"
//        npm run griffin -- "Genera un plan de pruebas de regresión del módulo X"
//        npm run griffin -- "Revisa si los últimos cambios respetan la arquitectura del proyecto"
//        npm run griffin -- "Revisa los últimos cambios en busca de problemas de seguridad"
//        npm run griffin -- "Verifica si la tarea X quedó completa según lo planeado"
//        npm run griffin -- "Documenta el módulo X en la wiki de docs/ (funcional y técnico)"
//        npm run griffin -- "Analiza el coste y los errores corregidos a mano del módulo X y propón mejoras"
//
//   Para cambios pequeños/triviales, ni siquiera hace falta mencionar varios roles:
//   una tarea como "Arregla el typo en el botón de guardar" solo debería activar a
//   `coder` — no hace falta invocar el ciclo completo para todo. El modelo de nivel
//   superior decide qué agentes son relevantes según la tarea, no hay un pipeline fijo.
//   `optimizer` es la única excepción deliberada: solo se invoca cuando se le pide
//   explícitamente al cerrar un ciclo de trabajo, nunca como parte de la selección
//   automática para una tarea pequeña (ver .agents/griffin/optimizer.md).
//
//   Cuando una tarea consolidada invoca a varios de los roles de output largo
//   (navigator, planner, reviewer, architecture-guardian, verifier), el orquestador
//   les indica una ruta compartida en griffin/workspace/<slug>/ para que cada uno
//   escriba ahí su resultado completo y el siguiente lo lea él mismo, en vez de que
//   este proceso relaye el contenido íntegro dentro de cada prompt (cada subagente
//   arranca con contexto aislado, así que ese relay se re-embebe entero y sin caché
//   en cada llamada — ver griffin/workspace/README.md). coder/tester quedan fuera:
//   su output ya es real (ficheros en el repo), no un informe que haya que relayear.
//
// Requiere ANTHROPIC_API_KEY en el entorno (no se carga desde .env automáticamente).
// CONTEXT7_API_KEY es opcional: sin ella, Context7 funciona en el tier gratuito
// con límites de tasa más bajos.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync, mkdirSync } from "node:fs";
import { loadAgents } from "./loadAgents.js";

const task = process.argv.slice(2).join(" ").trim();

if (!task) {
  console.error('Uso: npm run griffin -- "descripción de la tarea"');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[griffin] Falta ANTHROPIC_API_KEY en el entorno. Ejecuta: set ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const agents = loadAgents();
console.log(`[griffin] Agentes cargados desde .agents/griffin/: ${Object.keys(agents).join(", ")}\n`);

// Historial de ejecución para que `optimizer` tenga datos reales que analizar, en vez
// de tener que adivinar dónde se fue el coste. Ver griffin/history/README.md.
const HISTORY_DIR = "griffin/history";
const HISTORY_FILE = `${HISTORY_DIR}/runs.jsonl`;
const runStartedAt = new Date().toISOString();
const runStartTime = Date.now();
const agentsInvoked = new Set();
let resultMessage = null;

for await (const message of query({
  prompt: `Completa la siguiente tarea usando SOLO los agentes que realmente hagan falta (no actives el ciclo completo si la tarea es pequeña): navigator para explorar y entender código existente antes de planificar tareas grandes o en zonas poco familiares del repo, planner para planificar, tester para escribir/ejecutar tests y planes de pruebas, coder para implementar código, reviewer para revisar seguridad y calidad del código antes de commitear, architecture-guardian para verificar que los cambios respetan la arquitectura del proyecto, verifier para comprobar al final que el resultado cumple realmente el objetivo original antes de dar la tarea por completada, documenter para mantener la wiki de documentación funcional y técnica en docs/ (siempre en inglés) tras un cambio significativo, optimizer SOLO si se pide explícitamente analizar coste/errores al cerrar un ciclo (nunca por iniciativa propia). Si vas a invocar a más de uno de estos agentes de output largo (navigator, planner, reviewer, architecture-guardian, verifier), decide antes una ruta corta griffin/workspace/<slug-kebab-case-de-la-tarea>/ e indícasela a cada uno de ellos junto con qué fichero(s) previos de ese workspace debe leer como entrada, para que escriban ahí su resultado completo en vez de que tú relayees su contenido de un prompt a otro. Para una tarea de un solo agente, o si los outputs van a ser cortos, no hace falta workspace. Tarea: ${task}`,
  options: {
    // Carga automáticamente el CLAUDE.md del proyecto como contexto
    settingSources: ["project"],
    // Context7: documentación de librerías siempre actualizada, disponible para el agente coder
    mcpServers: {
      context7: {
        command: "npx",
        args: process.env.CONTEXT7_API_KEY
          ? ["-y", "@upstash/context7-mcp", "--api-key", process.env.CONTEXT7_API_KEY]
          : ["-y", "@upstash/context7-mcp"]
      }
    },
    // Agent: para invocar subagentes sin pedir permiso cada vez.
    // mcp__context7__*: para que coder pueda llamar a Context7 sin prompt de confirmación.
    allowedTools: ["Agent", "mcp__context7__*"],
    agents,
    // acceptEdits aprueba automáticamente los Write/Edit de coder y tester.
    // Ojo: esto NO aprueba herramientas MCP (por eso también hace falta allowedTools arriba).
    permissionMode: "acceptEdits",
    // Barandillas de coste/alcance — no son restos de una prueba de concepto, son la
    // defensa principal contra un gasto descontrolado en un proyecto sin presupuesto
    // corporativo detrás. CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH="1" evita que un
    // subagente invoque a otros subagentes (lo que podría disparar el coste de forma
    // exponencial sin que te des cuenta). Ajusta estos valores según el proyecto, pero
    // no los quites sin sustituirlos por algo equivalente.
    env: {
      ...process.env,
      CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1",
      CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "3"
    },
    // Techo de gasto para ESTA invocación (todos los agentes que participen en ella).
    // Para una sola tarea de un rol (p. ej. solo `reviewer`), 3 $ es generoso; para un
    // ciclo completo de 8 roles en una sola llamada consolidada, puede quedarse corto —
    // súbelo con la variable de entorno GRIFFIN_MAX_BUDGET_USD si hace falta.
    maxBudgetUsd: process.env.GRIFFIN_MAX_BUDGET_USD ? Number(process.env.GRIFFIN_MAX_BUDGET_USD) : 3
  }
})) {
  if (message.type === "system" && message.subtype === "init") {
    const failed = message.mcp_servers?.filter(
      (s) => s.status === "failed" || s.status === "needs-auth"
    );
    if (failed && failed.length > 0) {
      console.warn("[griffin] Servidores MCP no disponibles:", failed);
    }
  }
  if (message.type === "assistant") {
    for (const block of message.message?.content ?? []) {
      if ("text" in block) console.log(block.text);
      // Registra qué subagente se invocó (para el historial de `optimizer`) sin
      // depender de un campo concreto del esquema del SDK, que puede variar.
      if (block.type === "tool_use" && block.name === "Agent") {
        const input = block.input || {};
        const name = input.subagent_type || input.agent_type || input.name || input.description || "desconocido";
        agentsInvoked.add(String(name).slice(0, 60));
      }
    }
  }
  if (message.type === "result") {
    resultMessage = message;
    console.log(`\n--- ${message.subtype} · coste: $${message.total_cost_usd} ---`);
  }
}

try {
  mkdirSync(HISTORY_DIR, { recursive: true });
  appendFileSync(
    HISTORY_FILE,
    JSON.stringify({
      startedAt: runStartedAt,
      durationMs: Date.now() - runStartTime,
      task: task.slice(0, 300),
      agentsInvoked: Array.from(agentsInvoked),
      resultSubtype: resultMessage ? resultMessage.subtype : null,
      totalCostUsd: resultMessage ? resultMessage.total_cost_usd : null,
      numTurns: resultMessage ? resultMessage.num_turns : null
    }) + "\n"
  );
} catch (err) {
  console.warn("[griffin] No se pudo escribir el historial de ejecución:", err);
}
