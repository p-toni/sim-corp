## Continuity Ledger (compaction-safe)

Maintain a single Continuity Ledger for this workspace in `CONTINUITY.md`. The ledger is the canonical session briefing designed to survive context compaction; do not rely on earlier chat text unless it’s reflected in the ledger.

### How it works
- At the start of every assistant turn: read `CONTINUITY.md`, update it to reflect the latest goal/constraints/decisions/state, then proceed with the work.
- Update `CONTINUITY.md` again whenever any of these change: goal, constraints/assumptions, key decisions, progress state (Done/Now/Next), or important tool outcomes.
- Keep it short and stable: facts only, no transcripts. Prefer bullets. Mark uncertainty as `UNCONFIRMED` (never guess).
- If you notice missing recall or a compaction/summary event: refresh/rebuild the ledger from visible context, mark gaps `UNCONFIRMED`, ask up to 1–3 targeted questions, then continue.

### `functions.update_plan` vs the Ledger
- `functions.update_plan` is for short-term execution scaffolding while you work (a small 3–7 step plan with pending/in_progress/completed).
- `CONTINUITY.md` is for long-running continuity across compaction (the “what/why/current state”), not a step-by-step task list.
- Keep them consistent: when the plan or state changes, update the ledger at the intent/progress level (not every micro-step).

### In replies
- Begin with a brief “Ledger Snapshot” (Goal + Now/Next + Open Questions). Print the full ledger only when it materially changes or when the user asks.

### `CONTINUITY.md` format (keep headings)
- Goal (incl. success criteria):
- Constraints/Assumptions:
- Key decisions:
- State:
  - Done:
  - Now:
  - Next:
- Open questions (UNCONFIRMED if needed):
- Working set (files/ids/commands):

## Agent Harness (Multi-Session Continuity)

For long-running tasks spanning multiple sessions, use the agent harness workflow. See `docs/engineering/agent-harness.md` for full protocol.

### Start of Session (Mandatory)
1. Read: README.md → AGENTS.md → CONTINUITY.md → docs/tasks/task-registry.json
2. Run: `pnpm harness:init`
3. Review harness snapshot
4. Update CONTINUITY.md if gaps found (mark `UNCONFIRMED`)

### During Session
- Update PROGRESS.md "What changed in this session" with each major change
- Run `pnpm harness:smoke --quick` after code changes
- Update task-registry.json when task status changes
- Update CONTINUITY.md when state/decisions change

### End of Session (Mandatory)
1. Ensure PROGRESS.md is complete
2. Ensure CONTINUITY.md reflects current state
3. Update task-registry.json if task status changed
4. Run: `pnpm harness:clean`
5. Fix any errors before handoff

### Artifact Editing Rules
- **CONTINUITY.md**: Update freely (designed for agents)
- **PROGRESS.md**: Update "What changed", "Next step", "Commands run", "Session log"
- **task-registry.json**: Update only `status`, `completedDate`, `evidence` fields, and `notes`
- **task-registry.md**: Human-readable; prefer JSON for status updates
