# 2026-11-06 — Practice accuracy analytics

Historical summary of [PR #12](https://github.com/Gaeevy/rhythm-trainer/pull/12).
Current formulas, integration boundaries and controls are in
[Development](../development.md#practice-analytics) and
[Practice](../practice.md#scores-and-trends). Git retains the original plan.

## Decisions

- The initial recent-bar accuracy summary evolved into continuous weighted
  scores: overall, per-pad and consistency, with a neutral/up/down trend.
- A Gaussian curve rewarded better centering even within the visual on-time
  band. Expected notes, including misses, plus extras determined pad weights.
  A missed pad could not disappear from the overall score by being ignored.
- Consistency measured spread between notes scheduled together, separately from
  accuracy to the beat. Missing group members earned zero; delayed corrections
  could complete a group. Lessons without simultaneous groups used pads only.
- Recent bars carried more weight. Trend references excluded the latest eight
  completed bars and required warm-up. Scoring read canonical assessment results;
  it neither matched hits nor used animation time.
- A shared responsive panel moved right on wide screens and below on smaller
  screens. The toolbar stayed above, with setup and session totals folded.
- Severe errors gained bounded horizontal settling; mild errors kept smooth
  slides. Missed shakes, hollow extras and reduced motion were preserved.
- After practice review, numeric values became larger and formula, group-count
  and bar-progress text were removed. A divider separated the pad rows.

## Milestones

| Work | Checkpoint |
| --- | --- |
| Pure scoring and deterministic examples | `20849a5` |
| Weighted pad score/trend panel | `ecd1c4d` |
| Consistency and combined overall | `13eea2b` |
| Responsive layout and severity motion | `c308a1e` |
| Minimal presentation | `624a21a` |

Streaks and extra charts were deferred to keep the UI/code simple. No account,
database, persistent activity history or additional runtime service was added.
