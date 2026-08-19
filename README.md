<p align="center">
  <img src="canvas.png" alt="Griffin" width="220">
</p>

# Griffin

Multi-role agentic system for AI-assisted development, built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). Designed to be installed as-is into any repository: no role assumes a particular stack, architecture, or project — each one reads the target project's `CLAUDE.md` (or equivalent) at runtime.

This repo is the system itself, with no application project inside it. To use it, install `.agents/griffin/` and `griffin/` into the repository you're working on (see [Installing Griffin in a project](#installing-griffin-in-a-project)).

> Personal project, not funded by any company. Token/API cost is a first-order design constraint, not an afterthought optimization — see [Cost and guardrails](#cost-and-guardrails).

## Roles

| Role | Default model | Responsibility | Tools |
|---|---|---|---|
| **navigator** | Haiku | Explores and understands existing code (structure, conventions, entry points) before planning; produces a concise map for `planner`. Optional: useful on large tasks or unfamiliar parts of the repo | `Read`, `Grep`, `Glob` |
| **planner** | Sonnet | Breaks a task/feature down into subtasks per layer/module, following the repo's architecture | `Read`, `Grep`, `Glob` |
| **coder** | Sonnet | Implements code respecting the architecture and the plan | `Read`, `Write`, `Edit`, `Grep`, `Glob`, Context7 (MCP) |
| **tester** | Sonnet | Writes tests (TDD), validates tests after changes, generates regression test plans | `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob` |
| **architecture-guardian** | Haiku | Checks the project's architectural constraints (documented or inferred) — boundaries between layers/modules, what can import what | `Read`, `Grep`, `Glob`, read-only git |
| **reviewer** | Sonnet | Reviews security and code quality, like an automated PR review (secrets, injection, auth, vulnerable deps...) | `Read`, `Grep`, `Glob`, read-only git, `npm audit` |
| **designer** | Sonnet | Reviews UI/UX, visual and design-system consistency (tokens, component reuse, accessibility, interface states) on already-written interface code | `Read`, `Grep`, `Glob`, read-only git |
| **verifier** | Sonnet | At the close of a cycle, checks that the final result meets the original objective and acceptance criteria | `Read`, `Grep`, `Glob`, read-only git |
| **documenter** | Sonnet | Maintains a functional/technical docs wiki in the target project's `docs/`, always in English | `Read`, `Write`, `Edit`, `Grep`, `Glob`, read-only git |
| **optimizer** | Sonnet | When closing a work cycle (never automatic), analyzes where cost/time went and what got hand-fixed, and proposes concrete improvements | `Read`, `Grep`, `Glob`, read-only git, `Write` (restricted to `griffin/history/retrospectives/`) |

`navigator` and `architecture-guardian` default to Haiku since they're the most mechanical roles; the rest require synthesis/judgment and stay on Sonnet. Any role can be re-tasked per run with `GRIFFIN_<ROLE>_MODEL=<model>` without touching its file.

**Skills** (`typescript`, `react`, `testing`, `documentation`, `design`) are project-agnostic technical best-practice modules in `.agents/griffin/skills/*.md`, which a role declares in its frontmatter (`skills: typescript, react`) and gets injected into its prompt at load time. To add support for another language/framework, just create `.agents/griffin/skills/<name>.md` and list it in whichever role needs it.

## Why there's no `orchestrator` agent

In the Claude Agent SDK, a subagent cannot invoke other subagents (by this system's design, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is set to `1`). Orchestration — deciding which roles to invoke and in what order — can only live in the top-level session. `griffin/orchestrator.ts` **is** that root process: it's not another role, it's the script itself that calls the SDK's `query()` and delegates, via its prompt, to the subagents declared in `.agents/griffin/`.

## Passing information between agents: direct context vs. workspace

Each subagent starts with its own isolated context window — there's no shared memory between subagents in the same session, and only a subagent's final message goes back to the process that invoked it (confirmed against the [official subagents documentation](https://code.claude.com/docs/en/agent-sdk/subagents)). Relaying a long output to several downstream agents via prompt pays for that content in full, uncached, on every call.

That's why the long-output roles (`navigator`, `planner`, `reviewer`, `architecture-guardian`, `verifier`) optionally support the **Shared Workspace Pattern**: if their invocation points them to a `griffin/workspace/<slug>/` path, they write their full result there and return only the path; the next role reads it itself instead of receiving the relayed content. `coder`/`tester` are excluded because their real output is already files in the repo itself. It's an optional cost optimization, not a requirement — for short outputs or a single agent, direct context is still simpler and cheaper. See `griffin/workspace/README.md`.

A *Blackboard*-style architecture (agents that self-activate over a shared knowledge structure, with no central orchestrator) was deliberately rejected as over-engineering for a mostly-linear pipeline like this one.

## Installation (of this repo, for development on Griffin itself)

```bash
npm install @anthropic-ai/claude-agent-sdk
npm install -D tsx typescript @types/node
```

Requires Node 18+. Authenticates via an Anthropic API key (`ANTHROPIC_API_KEY`, from [platform.claude.com](https://platform.claude.com/) → Settings → API keys) — **not** the Claude Pro/Max login, this is a separate pay-as-you-go billing product.

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

`CONTEXT7_API_KEY` is optional — without it, [Context7](https://context7.com) (always-current library docs, available to `coder`) works on the free tier with lower rate limits.

## Usage

Two patterns, depending on what you need:

```bash
# A) One consolidated task — cheaper, preserves context between agents
# within the same session. Recommended for routine work.
npm run griffin -- "Implement module X completely: plan, write TDD tests, \
  implement, validate, review security and architecture, verify it's complete, \
  and document the module"

# B) Standalone single-role calls — for one-off reviews, or when you want
# to inspect each step before moving on. Each call is a fresh session
# with no context from the previous one (costs more).
npm run griffin -- "Explore and describe how module X works before touching it"
npm run griffin -- "Plan the full implementation of module X"
npm run griffin -- "Review the latest changes for security issues"
npm run griffin -- "Verify whether task X is actually complete as planned"

# Small changes don't need to mention any role — the orchestrator decides:
npm run griffin -- "Fix the typo in the save button"

# optimizer: only when meaningfully closing a work cycle, never automatic
npm run griffin -- "We're closing module X. Analyze cost and hand-fixed errors and propose improvements"

# designer: after UI changes, to review visual consistency and accessibility
npm run griffin -- "Review the design of the latest changes to the checkout form"
```

There's no fixed pipeline: the top-level model decides which roles to activate based on the task. `optimizer` is the one explicit exception — it's never invoked on its own initiative.

## Installing Griffin in a project

Griffin ships as a **git subtree**, not a manual file copy. A plain copy-paste has no way to tell whether a project has fallen behind, or to tell a stock Griffin file apart from one with local edits — that's literally how a previous install silently missed the `designer` role for days. Subtree fixes both: it's real, trackable history, and `git subtree pull` is the one command that brings a project up to date.

### First-time install

From the target project's repo root, with a clean working tree:

```bash
git subtree add --prefix=griffin https://github.com/doserdroid/Griffin.git subtree-griffin --squash
git subtree add --prefix=.agents/griffin https://github.com/doserdroid/Griffin.git subtree-agents-griffin --squash
```

`subtree-griffin` and `subtree-agents-griffin` are branches of this repo, each containing only the history of `griffin/` and `.agents/griffin/` respectively (generated with `git subtree split --prefix=<folder> -b <branch>`). **Do not use `main`** — it isn't filtered by folder, so it would pull this entire repo (README, LICENSE...) into whichever prefix you point it at.

Then, add the scripts to the target project's `package.json`:

```json
"scripts": {
  "griffin": "tsx griffin/orchestrator.ts",
  "griffin:install-claude-code": "tsx griffin/install-claude-code.ts"
}
```

Install the dependencies (same two commands as [Installation](#installation-of-this-repo-for-development-on-griffin-itself) above), and if the target project has a `CLAUDE.md` (or equivalent architecture docs), the roles will read it automatically at runtime. If it doesn't exist, each role just follows the patterns it detects in the code already present.

**Never edit files inside `griffin/` or `.agents/griffin/`.** They're vendored code — any local change is either lost or turns into a conflict on the next `subtree pull`. Anything project-specific (notes, conventions, exceptions) belongs in that project's own `CLAUDE.md`, which `orchestrator.ts` already loads via `settingSources: ["project"]` — never in a comment inside a Griffin `.ts` or `.md` file.

### Keeping a project up to date

Whenever Griffin gets an update (a new role, a fixed prompt, whatever) and you want it in a given project:

```bash
git subtree pull --prefix=griffin https://github.com/doserdroid/Griffin.git subtree-griffin --squash
git subtree pull --prefix=.agents/griffin https://github.com/doserdroid/Griffin.git subtree-agents-griffin --squash
```

If that project also uses Griffin as native Claude Code subagents, regenerate them afterwards:

```bash
npm run griffin:install-claude-code
```

Pulling is on-demand, per project — there's no auto-update. Nothing here should ever conflict, since you never hand-edit vendored files; if a conflict ever does show up, treat it like any normal git merge conflict.

`griffin/history/` and `griffin/workspace/` do start empty on a fresh install (just their `README.md`) — they're that project's own runtime state, not something meant to travel between projects. They coexist fine with the subtree, since a `subtree pull` only touches what changed upstream, never files you added locally inside those two folders.

`documenter` brings one non-negotiable convention of its own (always document in English, whatever language the target project uses) regardless of what `CLAUDE.md` says.

### Publishing a Griffin update (maintainers of this repo)

`subtree-griffin` and `subtree-agents-griffin` are derived branches — never edit them directly. After any change to `griffin/` or `.agents/griffin/` on `main`, regenerate and publish them before any project can `pull` the update:

```bash
git subtree split --prefix=griffin --rejoin -b subtree-griffin
git subtree split --prefix=.agents/griffin --rejoin -b subtree-agents-griffin
git push origin subtree-griffin subtree-agents-griffin
```

Trade-off of living in `.agents/griffin/` rather than `.claude/agents/`: these roles don't show up as native Claude Code subagents by default — they only work through `griffin/orchestrator.ts`. If you also want to invoke them directly inside an interactive Claude Code session, there's an installer that generates them automatically — see [Also usable as native Claude Code subagents](#also-usable-as-native-claude-code-subagents).

## Also usable as native Claude Code subagents

```bash
npm run griffin:install-claude-code
```

Generates a `.claude/agents/<role>.md` for each role, merging the relevant skills into the prompt, so you can invoke them directly in a Claude Code session (`@agent-reviewer`, or just asking in natural language) without going through `npm run griffin`. **This is not equivalent** to normal execution — you lose the cost guardrails, the run history, the workspace pattern, the per-role model override env var, and the pattern-scoped `Bash` restrictions relax to full `Bash` (kept only as a prompt instruction, not a technical one) on `architecture-guardian`, `documenter`, `optimizer`, `reviewer`, and `verifier`. Full detail on what's kept and what's lost in [`griffin/INSTALL_CLAUDE_CODE.md`](griffin/INSTALL_CLAUDE_CODE.md).

## Repo structure

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
├── loadSkills.ts     # reads .agents/griffin/skills/*.md
├── loadAgents.ts      # reads .agents/griffin/*.md, injects skills, resolves model
├── orchestrator.ts    # orchestrator: invokes the Agent SDK's query()
├── install-claude-code.ts  # generates .claude/agents/<role>.md — see INSTALL_CLAUDE_CODE.md
├── INSTALL_CLAUDE_CODE.md  # what's kept/lost when installed this way
├── history/            # run history + `optimizer` retrospectives
│   ├── README.md
│   ├── runs.jsonl       # not version-controlled — local telemetry
│   └── retrospectives/
└── workspace/           # ephemeral scratch space between agents for long outputs
    └── README.md         # the rest of this folder isn't version-controlled
```

## Cost and guardrails

This system is meant for personal use with no corporate budget behind it, so cost is a design constraint, not an afterthought:

- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH="1"` — a subagent can't invoke other subagents, preventing cost from exploding exponentially without you noticing.
- `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS="3"` — caps how much spend can spike *per minute* if something runs away.
- `maxBudgetUsd` — spend ceiling per invocation ($3 by default), configurable via `GRIFFIN_MAX_BUDGET_USD`.
- `coder` has no `Bash`. Every other role with `Bash`/git access has it restricted to read-only commands (`git diff`/`log`/`show`/`status`, `npm audit` without `--fix`) — none of them can mutate the repo outside the `Write`/`Edit` scope they're declared to have.
- `optimizer` never edits `.agents/griffin/*.md` directly, even though it technically has `Write` — it can only write to `griffin/history/retrospectives/`. A system that rewrites itself based on its own analysis of its own mistakes is a feedback loop that's hard to audit; its proposals are left for a person to decide whether to apply.
- Model tiering: `navigator` and `architecture-guardian` default to Haiku — the most mechanical roles, not the ones that need synthesis.
- Prefer the consolidated-call pattern (A) over standalone calls (B) for trusted work: every CLI invocation is a fresh session that re-reads `CLAUDE.md` and doesn't inherit context from the previous one.

None of these guardrails are proof-of-concept leftovers — if you adjust them, do it deliberately, documented, and replaced with something equivalent.

## Contributing

This is a young personal project going open source — issues and PRs are welcome. A few things worth knowing before opening one:

- Roles live in `.agents/griffin/*.md` (frontmatter + prompt) and skills in `.agents/griffin/skills/*.md` — both are plain markdown, no build step, easy to read end-to-end before changing.
- If you change `griffin/` or `.agents/griffin/`, remember the [subtree split/push step](#publishing-a-griffin-update-maintainers-of-this-repo) is what actually ships the change to consuming projects — a plain merge to `main` alone doesn't.
- Keep new roles/skills project-agnostic — nothing in `.agents/griffin/` should assume a specific stack, language, or repo layout.

## License

MIT — see [LICENSE](LICENSE).
