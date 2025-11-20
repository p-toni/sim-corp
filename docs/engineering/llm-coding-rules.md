# LLM Coding Rules — How to Work on This Repo

You (Codex) are a coding agent collaborating with humans and other agents.  
Follow these rules strictly.

## 1. Always read context first

Before implementing a task:

1. Read:
   - `README.md` 
   - all files in `docs/foundation/` 
   - relevant files in `docs/engineering/` 
2. Summarize the task in your own words.
3. Identify which components are affected.

Do **not** invent architectures; follow the existing docs.

## 2. Respect boundaries

- Company kernel code belongs in:
  - `services/company-kernel`,
  - `libs/agent-runtime`,
  - `libs/schemas`,
  - `agents/*`.
- Roaster product code belongs in:
  - `apps/roaster-desktop`,
  - `services/ingestion`,
  - `services/sim-twin`,
  - `drivers/*`.

Do **not** mix kernel and product concerns.

## 3. One focused change at a time

When asked to change something:

- Keep the change set small and coherent:
  - a feature,
  - a refactor,
  - or a bug fix — not all at once.
- Include:
  - code changes,
  - tests,
  - and minimal documentation updates if needed.

## 4. Type-safety and clarity

- Use TypeScript with strict typing.
- Prefer explicit types & interfaces over `any`.
- Keep functions small and composable.
- Name things clearly; avoid cleverness.

## 5. Tests are first-class

- For every non-trivial change, add or update tests.
- If you cannot easily test something, leave a short comment explaining why and propose how to make it more testable.

## 6. Autonomy & safety

- Never add code that writes to real roasters without:
  - feature flags,
  - config-based kill switches,
  - and policy checks.
- For P0, all real roaster drivers must be **read-only** unless explicitly stated otherwise.

## 7. Evaluations & observability

- When you implement agent behavior:
  - emit traces (OpenTelemetry),
  - add relevant metrics,
  - and ensure errors are logged with enough context.

- If a behavior is important, check whether an evaluation exists; if not, propose one in code comments or `docs/engineering/eval-and-autonomy.md`.

## 8. Follow existing patterns

- Reuse abstractions (e.g. HAL interfaces, schema helpers, logging helpers) instead of inventing new ones.
- If you must introduce a new cross-cutting pattern, document it in `docs/engineering/repo-structure.md` and keep it small.

## 9. When in doubt, mark TODO and comment

When something is ambiguous:

- Do **not** silently guess.
- Implement the safest reasonable option,
- Add a `TODO(@human)` comment with:
  - the decision,
  - alternatives you considered,
  - and what information is needed to finalize it.

## 10. Non-goals

- Do not build features outside the vertical 1 scope (Artisan.ts) or kernel P0 unless explicitly asked.
- Do not add unrelated libraries or frameworks.
