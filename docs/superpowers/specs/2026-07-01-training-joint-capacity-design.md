# Phoenix Training v1 — Joint Capacity & Dunk Readiness Design

## Verdict

Extend the existing Long Conjugate system with a deterministic readiness-and-routing layer. Joint-capacity work belongs inside the current session flow; it is not a diagnosis, treatment plan, or separate rehabilitation product.

## Product flow

`Readiness Scan → Long Conjugate session → targeted capacity block → routed strength/jump/recovery exposure`

The scan is short and required in the UI before starting a planned session. The API remains resilient when no scan exists: it reports `unchecked`, supplies a conservative warm-up, and gates jumps, sprints, and heavy lower-body work.

## Domain boundary

`jarvis/domains/training/joint_capacity.py` owns pure, deterministic decisions:

- validates six discomfort scores in the inclusive range 0–10;
- classifies `clear`, `caution`, `regress`, `recovery_only`, or `unchecked`;
- routes the current Long Conjugate session without changing its constitution;
- supplies targeted Sled Balance, Squat Balance, Pelvic Control, Jump Balance, substitutions, and Recovery Reset blocks;
- emits explicit, educational reasons and safety copy.

The router serializes the result and persists explicit user submissions. SQLite stores scans and completion logs. The frontend only renders backend decisions and collects explicit user input.

## Readiness contract

Scores: knee, ankle, hip, hamstring, calf/Achilles, and lower-back/pelvic discomfort. Optional observations: note, sharp pain, limping, and next-day worsening.

Classification uses the highest score plus observation flags:

- no scan: `unchecked`;
- 0–2: `clear` and planned session;
- 3–4: `caution`, targeted warm-up, and reduced range/load;
- 5–6: `regress`, substitute jumps/sprints/heavy lower-body work;
- 7–10: `recovery_only`;
- sharp pain, limping, or next-day worsening: `recovery_only` with stop/regress guidance and professional assessment if persistent.

High-neural sessions (`high_intensity`, `jump`, `peak`, `attempt`) expose a `readiness_required` gate. An unchecked gate never reveals max-output work as ready to perform.

## Capacity library

Sled Balance provides forward long steps, backward quick steps, and controlled alternatives (backward treadmill, knee-over-toe calf raise, backward step-up). It is preparation and progressive exposure, never a healing promise.

Squat Balance contains exactly six zones:

1. ankle extension;
2. ankle flexion;
3. knee extension;
4. knee flexion;
5. hip extension;
6. hip flexion.

Pelvic Control supports rib-pelvis control, trunk control, hip mobility, glute/hip extension, hip-flexor strength, and split-squat positioning without diagnosing pelvic tilt.

Jump Balance supports four plant patterns (one-foot left, one-foot right, two-foot left-right, two-foot right-left), arms-free and ball-in-hand variants, optional height/video notes, and honest quality observations. Normal skill exposure is capped at ten quality reps per plant. It appears on jump day, or as a small technique dose only when readiness is clear.

Recovery Reset appears only on rest/recovery sessions, `recovery_only`, explicit reset selection, or next-day worsening.

## Persistence

Three additive SQLite tables preserve explicit user records:

- `training_readiness_scans` for readiness input and classified status;
- `training_capacity_logs` for completed capacity blocks;
- `training_jump_balance_logs` for plant-pattern attempts and quality notes.

No background jobs, external services, AI dependency, or unrelated state mutation are introduced.

## API contract

- `POST /training/readiness-scan`: validate, classify, persist, return the scan.
- `GET /training/routed-session`: return current Long Conjugate session plus latest same-day readiness and deterministic routing.
- `POST /training/log/capacity-block`: persist explicit completion.
- `POST /training/log/jump-balance`: persist a supported plant-pattern attempt.
- `GET /training/history`: retain existing fields and add readiness/capacity/jump-balance collections.

All date decisions use the shared clock boundary. The core remains usable without AI credits.

## UI architecture

Training uses the Finance cockpit primitives and typography with an orange domain accent. `TrainingMetrics` becomes the command surface: readiness, route, capacity block, and conditional reset/jump panels. `ActiveSession` consumes the routed session and respects high-neural gating. `JumpLog` collects the expanded plant and quality fields.

The layout remains mobile-first, scroll-safe above the bottom navigation, readable at 100% zoom, and avoids final cross-domain entrance choreography until the later shared-motion sprint.

## Safety invariants

- Performance guidance, not diagnosis or treatment.
- Never say “bulletproof,” promise healing, claim universal safety, or guarantee dunk progress.
- Never tell the user to push through pain.
- Sharp pain or worsening symptoms means stop and regress.
- Persistent pain should be assessed by a qualified professional.
- No Finance, Nutrition, Calendar, Home, broker, execution, Plaan, or Google-write behavior changes.

## Acceptance

The implementation is accepted when threshold routing, conservative flags, unchecked high-neural gating, the six-zone capacity map, four jump plants, reset visibility, persistence, API validation, responsive frontend build, and forbidden-copy tests all pass without weakening existing domain contracts.
