# Evaluations & Autonomy Gates

## Goals

- Quantify whether we are improving roasting outcomes.
- Gate autonomy promotion (L2 → L3) on hard evidence.

## Golden cases

We will start with a small set of **golden roasts** for:
- different origins,
- processing methods,
- and target profiles.

Each golden case includes:
- machine & batch size,
- target FC and drop times,
- target development %, roast color,
- and expected sensory range.

## Metrics

For each batch, compute:

- **Timing error:**
  - |FC_actual - FC_target|,
  - |Drop_actual - Drop_target|.
- **Variance reduction:**
  - variance of key times/temps vs. historical baseline for that SKU.
- **RoR stability:**
  - number of spikes/crashes above defined thresholds.
- **Sensory uplift:**
  - change in cupping scores vs. baseline, when available.

## LM-as-Judge

Where appropriate, use a small model to score:
- plan clarity,
- physics plausibility (e.g. no impossible RoR behavior),
- respect for constraints,
- safety concerns (e.g. too aggressive gas steps).

## Autonomy promotion

To promote a behavior from L2 → L3:

- golden cases show equal or better metrics,
- no safety/physics violations,
- human pilots report acceptable UX,
- incident retrospectives show no new risk.

These rules should be implemented as code in the evaluation harness and enforced by the **Governor agent**.
