# Agent Harness v1: Multi-Session Continuity Protocol

**Version:** 1.0.0
**Last Updated:** 2026-01-06
**Status:** Active

## Purpose

The Agent Harness provides a structured workflow for long-running agent work across multiple sessions, ensuring:

1. **Continuity**: State and context survive session boundaries and context window compaction
2. **Safety**: Deterministic smoke checks catch regressions early
3. **Handoff-Ready**: Clean, documented state for session transitions
4. **Accountability**: Complete audit trail of what changed and why

## Why This Exists

Large-scale agent work (e.g., implementing M4 autopilot across 15+ files) often spans multiple sessions due to:
- Context window compaction/summarization
- Natural break points in complex tasks
- Agent failures or timeouts
- Human review checkpoints

Without structured continuity artifacts, agents lose critical context, leading to:
- Repeated work
- Inconsistent state
- Broken builds
- Lost decisions and rationale

The harness solves this by enforcing:
- **Durable progress artifacts** (CONTINUITY.md, PROGRESS.md, task-registry.json)
- **Machine-editable checklists** (JSON task registry)
- **Deterministic smoke checks** (fast, reliable test suites)
- **Clean state verification** (git status, file updates, completeness)

## Required Artifacts

### 1. CONTINUITY.md (Long-term Context)

**Purpose**: The canonical session briefing designed to survive context compaction.

**Required sections**:
- Goal (incl. success criteria):
- Constraints/Assumptions:
- Key decisions:
- State:
  - Done:
  - Now:
  - Next:
- Open questions (UNCONFIRMED if needed):
- Working set (files/ids/commands):

**Update triggers**:
- Goal changes
- Key architectural decision made
- Major milestone completed
- State transitions (Done/Now/Next changes)
- New uncertainty discovered

**Rules**:
- Keep it short, factual, bullet-based
- Never guess - mark unknowns as `UNCONFIRMED`
- No transcripts - distill to facts only
- Update at start and end of each session

### 2. PROGRESS.md (Per-Session Tracker)

**Purpose**: Track what changed in the current session for handoff clarity.

**Required sections**:
- Current objective:
- Current state (what is true now):
- What changed in this session:
- Next step (single step):
- Commands run (copy/paste):
- Session log (append-only):

**Update rules**:
- Update "What changed in this session" with every significant change
- Append to "Session log" chronologically
- Add actual commands to "Commands run" for reproducibility
- Keep "Next step" to a single, actionable item

### 3. task-registry.json (Machine-Editable Checklist)

**Purpose**: Structured, queryable task status for agents and humans.

**Schema**:
```json
{
  "tasks": [
    {
      "id": "T-XXX",
      "title": "Task title",
      "milestone": "M1|M2|M3|M4|Infrastructure|...",
      "status": "DONE|NOW|NEXT|PLANNED|PENDING_VERIFICATION|BLOCKED",
      "completedDate": "YYYY-MM-DD (if DONE)",
      "evidence": {
        "commands": ["pnpm test commands..."],
        "primaryArtifacts": ["file paths..."]
      },
      "notes": "Additional context"
    }
  ],
  "statusDefinitions": { ... }
}
```

**Agent rules**:
- Agents may only edit `status`, `completedDate`, `evidence.commands`, `evidence.primaryArtifacts`, and `notes` fields
- No large rewrites or restructuring without human approval
- Update when a task status changes
- Add evidence commands when completing tasks

**Statuses**:
- `DONE`: Merged + tests pass + validated
- `NOW`: Currently being implemented
- `NEXT`: Queued and ready
- `PLANNED`: Acknowledged but not scheduled
- `PENDING_VERIFICATION`: Completed but needs re-test
- `BLOCKED`: Has a named blocker

## Harness Scripts

### 1. harness:init (Initializer Run)

**Purpose**: Validate environment and print context snapshot.

**When to run**: **Start of every agent session** (mandatory)

**What it does**:
1. Verifies Node version == 20
2. Verifies pnpm is available
3. Checks required files exist (creates PROGRESS.md from template if missing)
4. Prints "Harness Snapshot":
   - Current objective (from PROGRESS.md)
   - Goal (from CONTINUITY.md)
   - Now/Next (from CONTINUITY.md)
   - Open questions (from CONTINUITY.md)

**Usage**:
```bash
pnpm harness:init
```

**Exit codes**:
- 0: Success
- 1: Environment invalid or required files missing

### 2. harness:smoke (Fast Smoke Check)

**Purpose**: Run deterministic tests to verify repo health.

**When to run**: After code changes, before committing (recommended)

**Modes**:
- `pnpm harness:smoke` - Full smoke (schemas + kernel + ingestion + desktop)
- `pnpm harness:smoke --quick` - Quick smoke (schemas + kernel only)
- `pnpm harness:smoke --ui` - UI smoke (roaster-desktop only)

**Test suites**:
- **Quick**: @sim-corp/schemas, @sim-corp/company-kernel
- **Full**: Quick + @sim-corp/ingestion, @sim-corp/roaster-desktop
- **UI**: @sim-corp/roaster-desktop

**Usage**:
```bash
pnpm harness:smoke --quick   # Fastest, catches most issues
pnpm harness:smoke           # Full coverage
pnpm harness:smoke --ui      # Desktop-only
```

**Exit codes**:
- 0: All tests passed
- 1: One or more tests failed

### 3. harness:clean (Clean State Guard)

**Purpose**: Verify repo is handoff-ready.

**When to run**: **End of every session before handoff** (mandatory)

**What it checks**:
1. **Git status**: Clean or explicitly lists changed files
2. **PROGRESS.md updated**: "What changed in this session" has content (not placeholder)
3. **CONTINUITY.md updated**: Modified in last hour (best-effort warning)
4. **task-registry.json updated**: Modified in last hour if status changed (best-effort warning)

**Usage**:
```bash
pnpm harness:clean
```

**Exit codes**:
- 0: Ready to handoff (may have warnings)
- 1: Not ready (errors found)

**Outputs**:
- `✅ READY TO HANDOFF` - All checks passed
- `⚠️ READY WITH WARNINGS` - Passed with warnings (review before handoff)
- `❌ NOT READY TO HANDOFF` - Failed checks (fix before handoff)

## Workflow: Initializer vs Coding Runs

### Initializer Run (Start of Session)

**Definition**: The first agent interaction in a new session where no code work occurs yet.

**Protocol**:
1. Read: README.md → AGENTS.md → CONTINUITY.md → task-registry.json
2. Run: `pnpm harness:init`
3. Review harness snapshot
4. Ask clarifying questions if needed (up to 1-3)
5. Update CONTINUITY.md if gaps found (mark `UNCONFIRMED`)
6. Ready to begin coding

**Do NOT**:
- Write code in initializer run
- Run heavy tests
- Make large file changes

**Example**:
```bash
# Agent starts new session
pnpm harness:init
# Reviews snapshot, asks 1-2 questions
# Updates CONTINUITY.md with clarifications
# Now ready for coding
```

### Coding Run (Working Session)

**Definition**: Active implementation work on a feature or task.

**Protocol**:
1. Update PROGRESS.md "Current objective"
2. Work on task (write code, run tests)
3. Update PROGRESS.md "What changed in this session" after each major change
4. Run `pnpm harness:smoke --quick` periodically
5. Update task-registry.json when task status changes
6. Update CONTINUITY.md when state/decisions change
7. Before handoff: `pnpm harness:clean`

**Do**:
- Write code incrementally
- Test frequently
- Update progress artifacts as you go
- Commit logical chunks

**Example**:
```bash
# Agent works on task
# ... makes changes ...
pnpm harness:smoke --quick  # Verify health
# ... more changes ...
git add .
git commit -m "..."
pnpm harness:clean         # Verify handoff-ready
```

## Rules

### 1. One Feature Per Session

**Rule**: Focus on a single feature/task per session. Complete it or reach a clean pause point before handoff.

**Why**: Prevents scattered work and ensures each handoff has clear scope.

**Exception**: Critical bug fixes during feature work (document in PROGRESS.md).

### 2. Leave Repo Merge-Ready

**Rule**: Every handoff must leave the repo in a state where:
- All tests pass
- Git status is clean OR changes are explicitly documented
- No broken builds
- PROGRESS.md explains what changed and why

**Why**: Ensures the next agent (or human) can continue immediately without fixing breakage.

### 3. Update Evidence Commands

**Rule**: When completing a task, add actual test commands to `evidence.commands` in task-registry.json.

**Why**: Makes task completion verifiable and reproducible.

**Example**:
```json
{
  "id": "T-030",
  "status": "DONE",
  "evidence": {
    "commands": [
      "pnpm --filter @sim-corp/schemas test",
      "pnpm --filter @sim-corp/command test"
    ],
    "primaryArtifacts": [
      "services/command",
      "docs/ops/command-service.md"
    ]
  }
}
```

### 4. Agent Editing Rules

**CONTINUITY.md**:
- Agents update freely (it's designed for them)
- Keep it short and factual

**PROGRESS.md**:
- Agents update "What changed", "Next step", "Commands run", "Session log"
- Append only to "Session log"

**task-registry.json**:
- Agents update: `status`, `completedDate`, `evidence.commands`, `evidence.primaryArtifacts`, `notes`
- No large rewrites or restructuring
- No deleting tasks without human approval

**task-registry.md** (markdown):
- Human-readable; agents may update for consistency but prefer JSON
- If conflict between JSON and markdown, JSON is source of truth

## Start-of-Session Protocol (Mandatory)

Every agent session MUST begin with:

```bash
pnpm harness:init
```

This ensures:
- Environment is valid (Node 20, pnpm available)
- Required artifacts exist
- Agent has current context snapshot

If `harness:init` fails, fix the issues before proceeding.

## End-of-Session Protocol (Mandatory)

Every agent session MUST end with:

```bash
pnpm harness:clean
```

This verifies:
- PROGRESS.md has been updated
- CONTINUITY.md reflects current state (warning if stale)
- task-registry.json reflects task status (warning if stale)
- Git status is clean or changes are documented

If `harness:clean` fails, fix the errors before handoff.

## Example: Full Session Flow

### Session Start
```bash
# Agent reads: README → AGENTS → CONTINUITY → task-registry.json
pnpm harness:init

# Output:
# ✓ Node version: v20.x.x
# ✓ pnpm available: v9.11.0
# ✓ All required files exist
#
# HARNESS SNAPSHOT
# ======================================================================
# Current Objective: Implement agent harness v1
# Goal: Enable multi-session agent continuity
# Now: M4 complete, starting harness implementation
# Next: Create harness scripts
# ======================================================================

# Agent updates PROGRESS.md with session start
# Agent begins work
```

### During Session
```bash
# Agent makes changes
# Updates PROGRESS.md "What changed in this session"
# Adds commands to PROGRESS.md "Commands run"

pnpm harness:smoke --quick  # Verify health
# ✅ Schemas PASSED
# ✅ Company Kernel PASSED

# Agent continues work
# Updates task-registry.json status: "NOW"
```

### Session End
```bash
# Agent finalizes PROGRESS.md
# Agent updates CONTINUITY.md
# Agent commits work

git add .
git commit -m "feat: implement agent harness v1"

pnpm harness:clean

# Output:
# 1️⃣ Checking git status...
#   ⚠️ Git has uncommitted changes:
#      - PROGRESS.md
#   ℹ️ Commit changes or verify they are expected
#
# 2️⃣ Checking PROGRESS.md updated...
#   ✅ PROGRESS.md has been updated
#
# 3️⃣ Checking CONTINUITY.md updated...
#   ✅ CONTINUITY.md recently modified
#
# 4️⃣ Checking task-registry.json updated...
#   ✅ task-registry.json recently modified
#
# ⚠️ READY WITH WARNINGS
# Warnings:
#   - Git has uncommitted changes
# Review warnings before handoff.

# Agent commits PROGRESS.md
git add PROGRESS.md
git commit -m "docs: update progress for harness implementation"

pnpm harness:clean
# ✅ READY TO HANDOFF
```

## Troubleshooting

### `harness:init` fails: "Node version check failed"

**Solution**: Ensure Node 20 is active:
```bash
node --version  # Should be v20.x.x
nvm use 20      # If using nvm
```

### `harness:smoke` fails: "pnpm not found"

**Solution**: Install pnpm:
```bash
npm install -g pnpm@9.11.0
```

### `harness:clean` fails: "PROGRESS.md missing section"

**Solution**: Ensure PROGRESS.md has all required sections and "What changed in this session" is not empty or placeholder text.

### Multiple task registries exist

**Situation**: Both `docs/tasks/task-registry.json` and `tasks/task-registry.md` exist.

**Solution**:
- JSON is source of truth for machine-editable fields
- Markdown is for human readability
- Keep them in sync when updating
- If consolidation is needed, mark as TODO(@human) in CONTINUITY.md

## Future Enhancements

Planned for future versions:
- [ ] Automated CONTINUITY.md diff detection
- [ ] Task dependency tracking in JSON
- [ ] Automatic git status pre-commit hook
- [ ] Session timing/duration tracking
- [ ] Automated evidence command extraction from git log
- [ ] Integration with GitHub Actions for CI validation

## References

- AGENTS.md: Continuity Ledger specification
- CONTINUITY.md: Current session state
- PROGRESS.md: Per-session progress tracker
- docs/tasks/task-registry.json: Machine-editable task checklist
- docs/tasks/task-registry.md: Human-readable task registry
