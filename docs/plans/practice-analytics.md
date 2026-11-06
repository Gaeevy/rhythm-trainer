# Practice accuracy analytics

Agreed design, 2026-11-06. Branch: `codex/practice-analytics-plan`.
Milestone 1 calculations are implemented; no UI integration. Do not commit yet.

## Current direction from the user

This replaces the earlier recent-bar summary proposal before implementation.

1. Show an overall score from 0 to 100, using a weighted moving average so recent
   results matter more.
2. Show a trend indicator: up, down or approximately unchanged. Compare with the
   weighted moving average for earlier bars, excluding the last N bars.
3. Show the same score and trend for every pad.
4. Show a consistency score for notes intended to land together. Three notes
   equally early indicate good coordination, while scattered hits do not.
5. Overall score: consistency contributes 30%; pads share the remaining 70%,
   proportionally to their number of hits.
6. Use a Gaussian-shaped continuous curve for individual timing and consistency:
   closer to the target earns more, including inside the visual on-time band.
   Retain two visual animation levels for mild/severe inaccuracies.

Earlier user requirements still relevant: distinguish slightly/substantially
early or late notes through animation, consider a right-hand analytics panel,
and split delivery into small reviewable steps. Keeping code/UI simple is the
strongest constraint. A streak is optional, not a required extra score.

Scoring defaults below are approved for the calculation foundation. Animation
and layout details remain proposals for their later review gates.

## Scoring specification

### Individual note quality

Use one Gaussian-shaped quality function, normalized to 1 at zero error. This
is a fixed scoring curve, not a probability density or a fitted distribution of
the player's hits; fitting to the player would make a persistent offset look good.

- Only a precisely centered note receives the maximum raw quality. Near-center
  notes score slightly less, even when their assessment status is on time.
- Points decrease smoothly with absolute timing error. Early and late errors of
  equal magnitude receive equal quality, with no flat tolerance band or hard
  zero-point scoring cutoff for matched hits.
- A missed note receives zero points and remains a scoring opportunity.
- An extra hit adds a zero-point scoring opportunity, instead of a separate
  arbitrary deduction. For example, 4 perfect expected hits plus 1 extra = 80.

For a matched note, use a fixed 50 ms curve width:

```text
quality(errorMs, widthMs) = exp(-0.5 * (errorMs / widthMs)^2)
note quality = quality(errorMs, 50)
```

Multiply by 100 for display. Examples (rounded only for this table):

| Absolute timing error | Points |
| --- | ---: |
| 0 ms | 100 |
| 20 ms | 92 |
| 30 ms | 84 |
| 60 ms | 49 |
| 100 ms | 14 |
| 150 ms | 1 |

Matching remains authoritative: no note outside its matching window is recovered
because the curve is positive. Dense patterns can have narrower matching windows.
Keep widths fixed across the session, rather than scaling them with density,
tempo or the player's observed errors. Do not round inputs or stored errors;
round displayed aggregates only. A rounded 100 is not a claim of exact timing.

The on-time tolerance remains a visual/assessment category, not a score plateau.
Changing it alone does not change the Gaussian quality of an already matched
timing error; it still resets practice as today. No extra curve settings or
alternative scoring modes in the UI. The proposed width is a calibration choice
to review with examples, not an established accuracy standard.

### Recent weighting

Use exponential weighting by bar age, not input arrival order. Default half-life:
8 bars; a scoring opportunity 8 bars older has half the weight. No user control
for this in the initial version.

```text
weight = 2 ^ (-barAge / 8)
pad score = 100 * sum(weight * note quality)
                  / sum(weight * scoring opportunities)
```

Calculate numerator/denominator sums, not an average of bar percentages, so bars
with different note counts are weighted correctly. Silent bars introduce no
perfect or failed notes. Equal decay of numerator/denominator leaves a pad's
score unchanged while that pad has no new scoring opportunities.

For a pad with no scoring opportunities, show “—”, not 0 or 100. On a fresh
session with expected notes but no successful hits, show 0 once those misses are
finalized. Count-in taps remain ignored as in the current assessment.

### What counts for pad weights

Use scoring opportunities: expected notes (including misses) plus extras, with the
same recency weights. Using successful/actual matched hits would let a missed
difficult pad lose influence, making the overall score misleadingly improve.

Including extras in both denominator and pad weight also means that extras on
an enabled but otherwise silent lesson track reduce the total. They never earn
points. Instruments absent from the lesson remain unscored as today; counting
all arbitrary kit strikes is a separate behavior change.

This makes the pad contribution equivalent to pooling all enabled pads' weighted
note quality and opportunities. Do not average displayed, rounded pad scores.

### Consistency of simultaneous hits

“Consistency” here means how tightly simultaneous instruments land together,
not steadiness of one pad across time. Keep that definition in the UI/help.

- Build a group from enabled expected notes with the same performance tick and
  loop. At least two instruments are required. Do not group input hits merely
  because they arrived close together.
- For a complete group, spread = latest corrected hit − earliest corrected hit,
  equivalently max(errorMs) − min(errorMs), in milliseconds.
- Errors [−42, −40, −38] ms have 4 ms spread: tightly coordinated but early.
  Errors [−40, 0, +40] ms have 80 ms spread despite zero average error.
- A group with a missing member receives zero consistency quality. Do not score
  the surviving pair as a successful three-note group. A delayed miss correction
  can restore the complete group and revise its quality.
- Use the same quality function with a width of 25 ms:
  `group quality = quality(spreadMs, 25)`. Since spread is nonnegative, use only
  the decreasing half of the curve: zero spread is best. No full-credit band.
  Rounded examples: 0 ms → 100, 10 ms → 92, 20 ms → 73, 40 ms → 28, 80 ms → 1.
  These widths are product choices for review, not established music standards.
- Weight groups by the same bar recency as pad scores, one sample per group.
- If the lesson has no eligible simultaneous groups, hide consistency and give
  pads 100% of the overall weight. Do not invent a perfect consistency score.
  Before eligible groups have been played/finalized, show overall “—” rather than
  silently assigning missing consistency credit or changing the weighting.

### Overall score

```text
pad contribution = weighted mean of pad scores by scoring opportunities
overall = 0.70 * pad contribution + 0.30 * consistency
```

With no eligible simultaneous groups, overall equals pad contribution. With no
scoring opportunities yet, overall is “—”. Disabled instruments contribute to
neither metric nor group membership; groups reduced to one member disappear.

Known tradeoff: tightly coordinated early hits can retain much of the 30%
consistency component. That is the user's requested distinction, but show pad
and consistency scores alongside overall so the reason remains visible. Missing
members get zero group quality, preventing free credit from incomplete groups.

### Trend indicator

N = 8 bars. Compare the current weighted score with the same
score calculated from all completed bars except the last 8. The historical
reference is effectively the score as of 8 completed bars ago; use the same
formulas and weights, not a different scoring system.

- Up for improvement >=3 points, down for worsening >=3 points, “~” otherwise.
- Use unrounded values for comparisons; display a rounded score.
- With insufficient earlier samples, show no direction and say “Building trend”.
  Wait for 8 recent plus 8 earlier completed bars; per-pad scores also
  require actual scoring opportunities in their historical reference.
- Apply the same rule to overall, each pad and consistency. No separate chart or
  streak in the first version. Include accessible text, not color-only arrows.
- Different repeating bars can have different difficulty. This comparison
  describes session results; do not claim universal skill improvement.

Do not substitute a recent-window-only score for this reference: the trend and
displayed score should use the same calculation.

### Visual categories remain simple

Continuous scoring does not require a separate animation for every score:

- Preserve the visual on-time zone and attached on-time noteheads initially,
  even though their raw timing quality varies within that zone.
- Outside that zone, keep a smooth horizontal slide for mild errors and trial
  a more distinct horizontal settling motion for severe errors. Proposed severe
  boundary: abs(errorMs) > max(60 ms, 2 × on-time tolerance). This is presentation
  only; it does not affect quality, matching or the overall formula.
- Preserve signed direction and current movement sensitivity/geometry caps.
  Misses retain the vertical shake; extras retain hollow heads. No new labels,
  particles or animation settings. Respect reduced motion.
- If the severe animation is distracting or indistinguishable during practice,
  simplify it at the visual review gate rather than adding effects.

## Timing/data rules

- Completed bars must have passed both their end and their expected late-hit
  windows, using assessment time and latency correction. Recompute after delayed
  timestamped inputs correct misses; completed data is not immutable.
- Matched hits/misses belong to their expected bar; extras to corrected hit time.
  Repeated bars are distinguished by absolute bar number, not lesson bar alone.
- Reuse Assessment as the source of truth. Do not create a parallel matcher or
  use animation time to score. Keep changes out of notation layout selection.
- Update aggregate work on result/window changes, not every unchanged frame.
  Begin with clear math and bounded relevant work; add caches only when needed.
- Reset on Start, lesson/track changes as today. Stop freezes results. Mixer/view
  changes preserve playback/results. Keep all data session-only initially.
- No backend, database, account, cross-session history or extra runtime service.

## Iterative delivery proposal

1. **Complete: agree and test the math.** Calibrate Gaussian widths, weight
   denominator, recency and trend reference. Implement pure calculations with
   deterministic example tests. Review examples before changing the live UI.
2. **Overall and pad scores.** Connect weighted scores and trends in a compact
   panel in the current layout. No sidebar, new animation or streak yet.
3. **Consistency and combined overall.** Expose complete/missing simultaneous groups,
   the tested 30/70 combination and explicit no-group/no-data behavior. Before this
   milestone, label any pad-only preview clearly rather than claiming the final
   overall formula is already implemented.
4. **Layout and animation polish.** Trial a responsive right-hand panel on wide
   screens, keep top transport/mixer and readable score width, fall back below
   on narrow screens. Trial slightly different bounded horizontal motion for
   small/large errors; missed vertical shake and hollow extras stay distinct.
5. **Optional follow-up after practice.** Decide whether a clean-bar streak or one
   small chart adds enough value. Do not implement every idea automatically.

Review and request commit/release authorization after each milestone. Use a
short design → critique → revise loop with concrete examples; no unattended
“Ralph loop”, additional agents or orchestration are required by this proposal.

## Verification and integration

- Test perfect/early/late/missed/extra hits; weighted counts versus averaging pad
  percentages; dense matching limits; empty/silent/disabled pads; partial groups;
  uniformly early tight versus centered scattered groups; and delayed corrections.
- Test weight decay, long sessions, trend boundary/warm-up, loop edges and exact
  reset/freeze behavior. Keep keyboard and simulated MIDI browser coverage for
  both views at `/` and `/rhythm-trainer/`. Real-kit feel remains user acceptance.
- `src/assessment.js` provides exact results, expected identities, counts and miss
  correction; `src/app.js` coordinates session/UI; notation feedback modules only
  render. Preserve current layout policy and both views.
- Update current practice/development guides as implemented. Calculation code
  exists; analytics is not yet visible in the current app.

## Milestone 1 result

Implemented `src/analytics.js` with pure Gaussian quality, weighted scores,
simultaneous-group consistency, overall blending and trend calculations. Reads
finalized Assessment snapshots without changing matching, time or results.
No app import, UI/settings changes, animation changes or new dependencies.

155 Node tests pass, including 15 analytics tests for calibration, tolerance
independence, missing samples, misses/extras, disabled pads, partial groups,
corrections, recency/count weighting, corrected timestamps, dense subdivisions,
loop separation, count-in, trend boundaries/reference and long-session precision.
Browser checks were not rerun: no browser path imports the new calculation module.

Illustrative raw-score examples (rounded here only):

| Three simultaneous errors | Pad score | Consistency | Overall |
| --- | ---: | ---: | ---: |
| −42, −40, −38 ms | 72.6 | 98.7 | 80.4 |
| −40, 0, +40 ms | 81.7 | 0.6 | 57.4 |

The source is a full-history projection for this foundation. The next UI step
must supply completed-bar/clock handling and gate calculations on meaningful
changes; do not add an every-frame history scan. Review those integration costs
before choosing any cache. Stop/reset/browser checks remain integration work.

Current status: milestone 1 passed user review and is approved for commit.
Milestone 2 is authorized next; its changes must remain uncommitted for review.
Curve calibration can be revisited after actual practice;
the accepted defaults do not need to be reconfirmed before milestone 2.
