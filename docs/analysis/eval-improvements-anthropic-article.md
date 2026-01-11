# Eval Design Improvements: Anthropic Article Analysis

**Source:** [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
**Date:** 2026-01-10
**Context:** T-028 Eval Harness review and improvement identification

## Executive Summary

The Anthropic article provides **HIGH VALUE** insights that can significantly improve our eval harness. Key gaps identified:

1. **Multiple trials for non-determinism (pass@k metrics)** - CRITICAL
2. **Negative test cases** - HIGH VALUE
3. **Reference solutions** - HIGH VALUE
4. **Real failure case sourcing** - HIGH VALUE
5. **Agent transcript capture** - MEDIUM VALUE
6. **Eval saturation monitoring** - MEDIUM VALUE

## Current Sim-Corp Eval Design

### ✅ What We Have (Already Strong)

1. **Code-based graders**: DetailedEvalMetrics with 15+ metrics
   - Timing errors (FC, drop, development ratio)
   - Temperature metrics (FC temp, drop temp errors)
   - RoR stability (spikes, crashes, stdDev)
   - Command performance (success rate, deviation, impact score)

2. **Model-based graders**: LM-as-Judge (T-028.1)
   - 4 evaluation dimensions (0-100 scale)
   - Issue detection (safety warnings, physics/constraint violations)
   - Explainable reasoning

3. **Human review fields**: Schema supports human grading
   - `humanReviewed`, `humanOutcome`, `humanNotes`
   - `reviewedBy`, `reviewedAt` timestamps

4. **Auto-evaluation**: Runs on session close
   - Integrated with ingestion pipeline
   - Command tracking included

5. **Promotion gates**: Pass/fail determination with gate tracking
   - `passedGates`, `failedGates` arrays
   - Multiple gates per eval run

6. **Partial credit**: DetailedMetrics provides granular scores (not just binary)

## Article's Key Recommendations vs. Our Gaps

### 1. Multiple Trials for Non-Determinism ⚠️ CRITICAL GAP

**Article:** "Two metrics capture variability: pass@k (likelihood of ≥1 success in k attempts) and pass^k (probability all k trials succeed)."

**Our Current Design:**
- Golden cases run once per evaluation
- No trial tracking
- No pass@k or pass^k metrics

**Impact:** We cannot measure agent consistency/reliability. A flaky agent that passes 1/10 times looks the same as one that passes 10/10 times.

**Recommendation:**
```typescript
// Add to GoldenCaseSchema
trialsRequired: z.number().int().min(1).default(1),  // How many trials to run
passAtKThreshold: z.number().min(0).max(1).optional(), // e.g., 0.7 = 7/10 trials must pass

// Add to EvalRunSchema
trialNumber: z.number().int().min(1).optional(),      // Which trial is this?
trialSetId: z.string().optional(),                    // Group trials together
passAtK: z.number().min(0).max(1).optional(),         // Overall pass@k for this golden case
passToK: z.number().min(0).max(1).optional(),         // Overall pass^k for this golden case
```

**Implementation Plan:**
- Update schemas (libs/schemas/src/kernel/eval.ts)
- Update evaluator to run N trials per golden case
- Calculate pass@k and pass^k metrics
- Add trial aggregation logic
- Update UI to show consistency metrics

---

### 2. Negative Test Cases ⚠️ HIGH VALUE GAP

**Article:** "Build balanced test sets (both positive and negative cases)"

**Our Current Design:**
- All golden cases are positive (expected successes)
- No cases testing agent's ability to AVOID bad recommendations

**Impact:** We don't test if agents can reject dangerous profiles, avoid over-roasting, or decline impossible missions.

**Examples of Negative Cases:**
- "Reject profile that would cause scorching (>500°F)"
- "Don't recommend 30-second development (impossible)"
- "Refuse to roast 10kg batch in 250g roaster"

**Recommendation:**
```typescript
// Add to GoldenCaseSchema
expectation: z.enum(["SHOULD_SUCCEED", "SHOULD_REJECT"]).default("SHOULD_SUCCEED"),
rejectReasonExpected: z.string().optional(),  // Why agent should reject

// Add to EvalRunSchema
agentRejected: z.boolean().optional(),        // Did agent refuse the mission?
rejectionReason: z.string().optional(),       // Agent's stated reason
rejectionAppropriate: z.boolean().optional(), // Was rejection correct?
```

**Implementation Plan:**
- Add negative golden cases to eval database
- Update evaluator to handle SHOULD_REJECT cases
- Update promotion gates to test rejection logic
- Add safety-focused negative cases (scorching, fire risk, equipment damage)

---

### 3. Reference Solutions ⚠️ HIGH VALUE GAP

**Article:** "Paired with reference solutions proving solvability... A good task is one where two domain experts would independently reach the same pass/fail verdict."

**Our Current Design:**
- Golden cases define targets but no "reference roast"
- No proof that targets are achievable
- No expert consensus mechanism

**Impact:** We may have impossible golden cases that frustrate agents. No way to verify golden case quality.

**Recommendation:**
```typescript
// Add to GoldenCaseSchema
referenceSolution: z.object({
  sessionId: z.string(),                      // Actual roast that achieved targets
  roasterName: z.string().optional(),         // Who performed reference roast
  achievedAt: IsoDateTimeSchema,              // When it was achieved
  notes: z.string().optional(),               // How it was achieved
  expertReviewed: z.boolean().default(false), // Expert validated this?
}).optional(),

expertConsensus: z.object({
  expertsReviewed: z.number().int().min(0).default(0),
  expertAgreement: z.number().min(0).max(1).optional(), // % agreement on pass/fail
  conflictNotes: z.string().optional(),
}).optional(),
```

**Implementation Plan:**
- Create golden cases from REAL successful roasts (not synthetic)
- Add UI for experts to mark sessions as "reference solutions"
- Add expert review workflow (2+ experts rate same golden case)
- Flag golden cases with low expert agreement for revision

---

### 4. Real Failure Case Sourcing ⚠️ HIGH VALUE GAP

**Article:** "Begin with 20-50 tasks from actual user failures rather than waiting for perfection."

**Our Current Design:**
- Golden cases may be synthetic
- No systematic way to convert real failures into test cases

**Impact:** Missing real-world failure modes. Evals may not cover actual user problems.

**Recommendation:**
```typescript
// Add to GoldenCaseSchema
sourceType: z.enum(["SYNTHETIC", "REAL_SUCCESS", "REAL_FAILURE"]).default("SYNTHETIC"),
sourceSessionId: z.string().optional(),       // Original session that inspired this case
failureMode: z.string().optional(),           // What went wrong in original session?
```

**Implementation Plan:**
- Add "Create Golden Case from Session" button in desktop UI
- Operators mark failed roasts → auto-create golden case
- Capture failure mode (scorching, underdevelopment, timing errors)
- Start with 20-50 real failure cases
- Gradually replace synthetic cases with real-world ones

---

### 5. Agent Transcript Capture ⚠️ MEDIUM VALUE GAP

**Article:** "Transcripts: Complete records of agent interactions and reasoning... Reading transcripts regularly catches grading bugs."

**Our Current Design:**
- We store command reasoning
- We store LM-judge reasoning
- We DON'T store complete agent transcripts (all tool calls, observations, actions)

**Impact:** Hard to debug why evaluations passed/failed. Can't review agent decision-making process.

**Recommendation:**
```typescript
// Add to EvalRunSchema
agentTranscript: z.object({
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1),
    action: z.string(),                       // "observe", "analyze", "propose_command", etc.
    toolCalls: z.array(z.object({
      tool: z.string(),
      input: JsonRecordSchema,
      output: JsonRecordSchema,
      durationMs: z.number(),
    })).default([]),
    reasoning: z.string().optional(),
    timestamp: IsoDateTimeSchema,
  })).default([]),
  totalSteps: z.number().int().min(0),
  totalDurationMs: z.number(),
}).optional(),
```

**Implementation Plan:**
- Update agents to emit structured transcripts
- Store transcripts in eval runs
- Add UI to view transcript diffs (expected vs actual)
- Add transcript search/filtering

---

### 6. Eval Saturation Monitoring ⚠️ MEDIUM VALUE GAP

**Article:** "Monitor for 'eval saturation' when agents consistently pass all solvable tasks, signaling diminishing improvement signal."

**Our Current Design:**
- No monitoring for when golden cases become too easy
- No alerts when agent passes 100% of cases

**Impact:** Waste resources running evals that no longer provide signal. Miss opportunities to add harder cases.

**Recommendation:**
```typescript
// New schema: EvalSaturationReport
export const EvalSaturationReportSchema = z.object({
  reportId: z.string(),
  generatedAt: IsoDateTimeSchema,

  goldenCaseSaturation: z.array(z.object({
    goldenCaseId: z.string(),
    recentPassRate: z.number().min(0).max(1),  // Last 30 days
    consecutivePasses: z.number().int().min(0), // In a row
    saturated: z.boolean(),                     // >95% pass rate for 30+ days
    recommendation: z.enum(["KEEP", "RETIRE", "MAKE_HARDER"]),
  })).default([]),

  overallSaturation: z.number().min(0).max(1), // % of cases saturated
  actionNeeded: z.boolean(),
});
```

**Implementation Plan:**
- Calculate pass rates per golden case over time
- Alert when >80% of cases are saturated
- Recommend retiring easy cases or making them harder
- Add dashboard showing case difficulty distribution

---

### 7. Domain Expert Contribution UI ⚠️ LOW-MEDIUM VALUE GAP

**Article:** "Enable domain experts to contribute tasks."

**Our Current Design:**
- Golden cases are code-defined (TypeScript/SQL)
- No UI for roasting experts to add cases

**Impact:** High friction for non-technical roasters to contribute. Limits eval coverage.

**Recommendation:**
- Add "Create Golden Case" form in desktop UI
- Fields: Bean info, target profile, tolerances
- One-click "Make this session a golden case" button
- Expert review queue

**Implementation Plan:**
- Desktop form component (apps/roaster-desktop)
- POST /golden-cases endpoint (services/eval)
- Expert review queue (pending → approved → active)

---

## Low Priority / Already Addressed

### ✅ Isolated Environments
**Article:** "Isolate environments between trials"
**Status:** Already have simulation isolation (sim-twin)

### ✅ Outcome-Based Grading
**Article:** "Grade outcomes rather than prescribing agent steps"
**Status:** We grade final temperature profiles, not specific agent actions

### ✅ Complementary Methods
**Article:** "Production monitoring, A/B testing, user feedback, manual review"
**Status:**
- Production monitoring: Coming (T-037)
- A/B testing: Premature for current stage
- User feedback: Via desktop UI
- Manual review: Human grading fields exist

---

## Prioritized Implementation Roadmap

### Phase 1: Critical Foundations (1 week)
**Why:** These provide immediate value for measuring agent reliability

1. **Multiple trials (pass@k metrics)**
   - Update schemas: `trialsRequired`, `trialNumber`, `passAtK`, `passToK`
   - Update evaluator to run N trials
   - Calculate aggregated metrics
   - UI showing consistency scores

2. **Negative test cases**
   - Add `expectation: SHOULD_REJECT`
   - Create 10-20 negative golden cases (safety-focused)
   - Update evaluator to handle rejection cases
   - Update promotion gates

### Phase 2: Quality Improvements (1 week)
**Why:** Ensures golden cases are high-quality and achievable

3. **Reference solutions**
   - Add `referenceSolution` field
   - UI to mark sessions as reference solutions
   - Link golden cases to real successful roasts

4. **Real failure sourcing**
   - Add `sourceType: REAL_FAILURE`
   - "Create golden case from session" button
   - Seed 20-50 cases from real failures

### Phase 3: Observability (3-5 days)
**Why:** Improves debugging and monitoring

5. **Agent transcript capture**
   - Add `agentTranscript` to schema
   - Update agents to emit structured transcripts
   - UI to view transcripts

6. **Eval saturation monitoring**
   - Calculate pass rates over time
   - Alert when >80% saturated
   - Dashboard showing difficulty distribution

### Phase 4: Expert Enablement (3-5 days)
**Why:** Scales eval coverage with domain expertise

7. **Domain expert UI**
   - "Create Golden Case" form
   - Expert review queue
   - One-click golden case creation

---

## Metrics to Track Success

1. **Coverage**: Number of golden cases (target: 50+)
2. **Consistency**: Average pass@k score (target: >0.8 for production)
3. **Balance**: % negative cases (target: 20-30%)
4. **Quality**: % cases with reference solutions (target: >80%)
5. **Realism**: % cases from real failures (target: >50%)
6. **Saturation**: % saturated cases (target: <20%)

---

## Immediate Next Steps

1. **Decision Point**: Should we implement Phase 1 now or defer to M6?
   - **Recommendation**: Implement Phase 1 (multiple trials + negative cases) as **T-028.2**
   - **Rationale**: Critical for L4+ autonomy validation. Need consistency metrics.

2. **Create Task**: T-028.2 (Eval Harness P1 Improvements)
   - Multiple trials with pass@k metrics
   - Negative test cases
   - Estimated: 3-5 days

3. **Defer**: Phases 2-4 to M6 (post-production hardening)

---

## Conclusion

The Anthropic article reveals **significant gaps** in our eval design, particularly around:
- **Consistency measurement** (no pass@k metrics)
- **Test coverage** (no negative cases)
- **Quality assurance** (no reference solutions)

These gaps are **CRITICAL for production** because:
- We can't measure agent reliability (flaky vs consistent)
- We don't test rejection logic (safety risk)
- We can't prove golden cases are achievable (may be impossible)

**Recommendation:** Implement Phase 1 (multiple trials + negative cases) as **T-028.2** before M5 completion. This provides the foundation for L4+ autonomy and production-grade agent validation.

---

## Sources

- [Demystifying Evals for AI Agents - Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
