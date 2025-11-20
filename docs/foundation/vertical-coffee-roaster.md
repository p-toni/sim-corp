# Vertical 1 — Specialty Coffee Roaster (Artisan.ts)

## Mission

Build and operate the world’s best roaster software — a live, intelligent instrument that makes every batch predictable, expressive, and repeatable — and, through that excellence, master the roasting domain.

## Users & Jobs-to-be-done

- **Production roasters:**
  - hit target profiles reliably,
  - increase throughput without losing quality,
  - train new staff faster.

- **Sample/R&D roasters:**
  - profile new lots quickly,
  - transfer profiles across machines,
  - document experiments.

- **QC teams & green buyers:**
  - maintain calibration across cuppers,
  - track defects and trends,
  - tie sensory outcomes back to process.

## Product pillars

1. **Control**
   - real-time curves (BT/ET/RoR),
   - preheat guidance,
   - first-crack prediction,
   - development time optimizer,
   - alarms & safe autopilot.

2. **Insight**
   - flavor outcome prediction,
   - actionable deltas vs. target flavor map,
   - recommendations grounded in physics + learned patterns.

3. **Consistency**
   - profile transfer across machines & batch sizes,
   - environmental compensation (ambient temp, humidity),
   - replay with defined tolerances.

4. **Sensory**
   - structured cupping forms,
   - color (Agtron) capture,
   - defect logging,
   - calibration tools.

5. **Reliability**
   - offline-first,
   - local decision loops for control,
   - graceful degradation when backend is unavailable.

## Data & instrumentation

- **Time-series:**
  - BT/ET/RoR, gas %, fan %, drum RPM, ambient temp, etc.
- **Events:**
  - charge, TP, FC, development start, drop, notes.
- **Outputs:**
  - weight loss, color values, sensory scores, descriptors.
- **Hardware:**
  - optional extra sensors (airflow, inlet temp, humidity).
- **Privacy:**
  - roaster owns raw data,
  - platform learns anonymized patterns with opt-in.
