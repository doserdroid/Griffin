// griffin/loadAgents.ts
//
// Carga las definiciones de subagentes de Griffin desde .agents/griffin/*.md.
// Cada fichero es un markdown con frontmatter YAML simple (name, description,
// tools, model, skills) seguido del prompt del agente. Formato:
//
// ---
// name: coder
// description: ...
// tools: Read, Write, Edit, Grep, Glob
// skills: typescript, react
// model: sonnet
// ---
//
// <prompt del agente>
//
// Este loader es agnóstico del proyecto en el que se ejecuta: no contiene
// nada específico de ningún repo en particular. Toda la carpeta .agents/griffin/
// (roles + skills) más griffin/*.ts están pensadas para copiarse tal cual a
// cualquier otro proyecto.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { loadSkills } from "./loadSkills.js";

const AGENTS_DIR = join(process.cwd(), ".agents", "griffin");

function parseAgentFile(raw: string, filename: string): { meta: Record<string, string>; prompt: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(
      `[griffin] ${filename}: falta el frontmatter YAML (--- ... ---) al inicio del fichero`
    );
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

/** GRIFFIN_CODER_MODEL, GRIFFIN_PLANNER_MODEL, etc. — override de modelo por rol sin tocar el .md */
function resolveModel(agentName: string, frontmatterModel: string | undefined): AgentDefinition["model"] {
  const envKey = `GRIFFIN_${agentName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_MODEL`;
  const override = process.env[envKey];
  return (override || frontmatterModel || undefined) as AgentDefinition["model"] | undefined;
}

/**
 * Lee todos los .md de .agents/griffin/ (ficheros directos, no subcarpetas —
 * "skills/" queda excluida porque no termina en .md) y devuelve un objeto
 * listo para pasar como `options.agents` a query() del Claude Agent SDK.
 */
export function loadAgents(): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};

  let files: string[];
  try {
    files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    throw new Error(
      `[griffin] No se encuentra la carpeta ${AGENTS_DIR}. Ejecuta este script desde la raíz del proyecto.`
    );
  }

  if (files.length === 0) {
    throw new Error(`[griffin] No hay ningún agente (.md) en ${AGENTS_DIR}`);
  }

  for (const file of files) {
    const raw = readFileSync(join(AGENTS_DIR, file), "utf-8");
    const { meta, prompt } = parseAgentFile(raw, file);

    if (!meta.name || !meta.description || !prompt) {
      throw new Error(`[griffin] ${file}: faltan campos obligatorios (name, description o prompt)`);
    }

    const skillNames = meta.skills
      ? meta.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const skillsContent = loadSkills(skillNames);
    const fullPrompt = skillsContent
      ? `${prompt}\n\n---\n\n# Skills técnicas aplicables\n\n${skillsContent}`
      : prompt;

    agents[meta.name] = {
      description: meta.description,
      prompt: fullPrompt,
      tools: meta.tools ? meta.tools.split(",").map((t) => t.trim()) : undefined,
      model: resolveModel(meta.name, meta.model)
    };
  }

  return agents;
}
