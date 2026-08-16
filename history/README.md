# Griffin execution history

This folder is Griffin's own operational memory — not part of the portable `.agents/griffin/` role package, and not part of the product's `docs/` wiki. It exists so `optimizer` (see `.agents/griffin/optimizer.md`) has something concrete to analyze instead of guessing.

- **`runs.jsonl`** — append-only log written automatically by `griffin/orchestrator.ts` after every `npm run griffin` invocation: timestamp, task, agents invoked, cost, duration, result status. Not versioned in git (see `.gitignore`) — it's local telemetry, not curated documentation, and would otherwise churn on every run.
- **`retrospectives/`** — markdown retrospectives written by `optimizer` when explicitly invoked at the close of a meaningful work cycle. These *are* versioned — they're curated lessons learned, meant to inform future prompt/config changes, not raw logs.

If you copy `.agents/griffin/` and `griffin/` to another project, this folder naturally starts empty there — it's specific to this project's execution history, not part of what makes Griffin itself portable.
