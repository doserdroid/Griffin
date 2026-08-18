// griffin/install-claude-code.ts
//
// Genera, a partir de .agents/griffin/*.md, un subagente NATIVO de Claude Code
// por cada rol de Griffin, en .claude/agents/<rol>.md — para poder invocarlos
// directamente dentro de una sesión interactiva de Claude Code (mención en
// lenguaje natural, @agent-<rol>, o el Task tool), sin pasar por
// `npm run griffin` / griffin/orchestrator.ts.
//
// IMPORTANTE — esto NO es un espejo 1:1 de cómo se ejecuta Griffin normalmente.
// El formato de subagente de Claude Code es distinto del `AgentDefinition` del
// Agent SDK que usa orchestrator.ts, y varias piezas de Griffin no tienen
// equivalente ahí. Ver INSTALL_CLAUDE_CODE.md para el detalle completo de qué
// se conserva y qué se pierde. Resumen:
//
//   - Las skills (`typescript`, `react`, `testing`, `documentation`) SÍ se
//     conservan: este script las funde dentro del prompt de cada rol (igual
//     que hace loadAgents.ts en tiempo de ejecución), porque el campo nativo
//     `skills:` de Claude Code apunta a .claude/skills/, no a
//     .agents/griffin/skills/, y ahí no existen.
//   - Las restricciones de Bash con patrón (`Bash(git diff *)`) NO tienen
//     equivalente en el frontmatter nativo de Claude Code — solo soporta
//     nombres de herramienta sueltos. Este script las reduce a `Bash` a
//     secas (Bash completo) y dice explícitamente, tanto aquí como dentro
//     del prompt generado, en qué roles ocurre esto.
//   - `model` se conserva tal cual (haiku/sonnet siguen siendo valores
//     válidos en el frontmatter nativo).
//   - Las barandillas de coste (`maxBudgetUsd`, límites de profundidad/
//     concurrencia de subagentes), el registro en `griffin/history/runs.jsonl`
//     y el patrón de workspace (`griffin/workspace/`) son propios de
//     orchestrator.ts y NO se aplican cuando invocas un rol así, como
//     subagente nativo de Claude Code.
//
// Uso:
//   npx tsx griffin/install-claude-code.ts
//
// Se puede volver a ejecutar sin problema cada vez que cambie algo en
// .agents/griffin/ — sobrescribe los ficheros ya generados en .claude/agents/.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkills } from "./loadSkills.js";

const AGENTS_DIR = join(process.cwd(), ".agents", "griffin");
const OUTPUT_DIR = join(process.cwd(), ".claude", "agents");

function parseAgentFile(raw: string, filename: string): { meta: Record<string, string>; prompt: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`[griffin] ${filename}: falta el frontmatter YAML (--- ... ---) al inicio del fichero`);
  }
  const [, frontmatter, body] = match;
  const meta: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, prompt: body.trim() };
}

/**
 * Convierte la lista de tools de Griffin (que puede incluir patrones tipo
 * `Bash(git diff *)`) a la lista que acepta el frontmatter nativo de Claude
 * Code (solo nombres de herramienta sueltos). Cualquier `Bash(...)` se
 * colapsa a `Bash` a secas — deduplicado si aparece más de una vez.
 * Devuelve también si hubo alguna reducción, para poder avisar.
 */
function resolveToolsForClaudeCode(rawTools: string): { tools: string; bashWasScoped: boolean } {
  const items = rawTools.split(",").map((t) => t.trim()).filter(Boolean);
  const resolved: string[] = [];
  let bashWasScoped = false;

  for (const item of items) {
    if (/^Bash\(/.test(item)) {
      bashWasScoped = true;
      if (!resolved.includes("Bash")) resolved.push("Bash");
    } else if (!resolved.includes(item)) {
      resolved.push(item);
    }
  }

  return { tools: resolved.join(", "), bashWasScoped };
}

function main() {
  if (!existsSync(AGENTS_DIR)) {
    console.error(`[griffin] No se encuentra ${AGENTS_DIR}. Ejecuta este script desde la raíz del proyecto.`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.error(`[griffin] No hay ningún rol (.md) en ${AGENTS_DIR}`);
    process.exit(1);
  }

  console.log(`[griffin] Instalando ${files.length} roles como subagentes nativos de Claude Code en .claude/agents/\n`);

  const loosenedBash: string[] = [];

  for (const file of files) {
    const raw = readFileSync(join(AGENTS_DIR, file), "utf-8");
    const { meta, prompt } = parseAgentFile(raw, file);

    if (!meta.name || !meta.description || !prompt) {
      console.warn(`[griffin] ${file}: faltan campos obligatorios (name, description o prompt) — omitido`);
      continue;
    }

    // Funde las skills declaradas dentro del prompt, igual que loadAgents.ts
    // en tiempo de ejecución — el campo nativo `skills:` de Claude Code no
    // sirve aquí porque apunta a .claude/skills/, no a .agents/griffin/skills/.
    const skillNames = meta.skills ? meta.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const skillsContent = loadSkills(skillNames);
    let fullPrompt = skillsContent
      ? `${prompt}\n\n---\n\n# Skills técnicas aplicables\n\n${skillsContent}`
      : prompt;

    let toolsLine = "";
    if (meta.tools) {
      const { tools, bashWasScoped } = resolveToolsForClaudeCode(meta.tools);
      toolsLine = `tools: ${tools}\n`;
      if (bashWasScoped) {
        loosenedBash.push(meta.name);
        fullPrompt =
          `> **Nota de instalación (Claude Code):** en este entorno tienes acceso a \`Bash\` sin restricción técnica de comandos (la restricción a solo lectura de git/npm audit que aplica en la ejecución normal de Griffin no tiene equivalente en el frontmatter nativo de subagentes de Claude Code). Respeta igualmente, como si fuera una restricción dura, lo que se indica más abajo sobre qué comandos puedes ejecutar.\n\n` +
          fullPrompt;
      }
    }

    const modelLine = meta.model ? `model: ${meta.model}\n` : "";

    const output =
      `---\n` +
      `name: ${meta.name}\n` +
      `description: ${meta.description}\n` +
      toolsLine +
      modelLine +
      `---\n\n` +
      fullPrompt +
      `\n`;

    writeFileSync(join(OUTPUT_DIR, `${meta.name}.md`), output, "utf-8");
    console.log(`  ✓ .claude/agents/${meta.name}.md`);
  }

  console.log(`\n[griffin] Listo. Invócalos en una sesión de Claude Code mencionándolos en lenguaje natural`);
  console.log(`("usa el subagente reviewer para revisar los últimos cambios") o con @agent-<rol>.`);

  if (loosenedBash.length > 0) {
    console.log(
      `\n[griffin] Aviso: estos roles pierden la restricción de Bash a comandos de solo lectura ` +
        `(pasan a tener Bash completo, con la restricción solo como instrucción de prompt, no técnica): ` +
        loosenedBash.join(", ")
    );
  }

  console.log(`\n[griffin] coder usa herramientas de Context7 (mcp__context7__*) — para que existan de verdad`);
  console.log(`en Claude Code, configura el servidor MCP context7 en .mcp.json o en tu configuración de Claude Code.`);
}

main();
