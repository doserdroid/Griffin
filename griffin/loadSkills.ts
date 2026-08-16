// griffin/loadSkills.ts
//
// Carga módulos de "skills" técnicas (buenas prácticas por lenguaje/framework,
// genéricas y agnósticas del proyecto) desde .agents/griffin/skills/*.md.
// Un rol (planner, coder...) declara en su frontmatter qué skills necesita
// (`skills: typescript, react`) y loadAgents.ts las inyecta en su prompt.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(process.cwd(), ".agents", "griffin", "skills");

function loadSkill(name: string): string {
  const path = join(SKILLS_DIR, `${name}.md`);
  if (!existsSync(path)) {
    throw new Error(`[griffin] Skill "${name}" no encontrada en ${path}`);
  }
  return readFileSync(path, "utf-8").trim();
}

/**
 * Devuelve el contenido concatenado de una lista de skills, listo para
 * anexarse al prompt de un agente. Vacío si la lista está vacía.
 */
export function loadSkills(names: string[]): string {
  if (names.length === 0) return "";
  return names.map((name) => loadSkill(name)).join("\n\n---\n\n");
}
