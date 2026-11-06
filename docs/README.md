# Documentation

These guides describe the current app. Use the history summaries only for context.

| Guide | Use it to |
| --- | --- |
| [Practice](practice.md) | Connect the kit, use controls, read feedback and troubleshoot |
| [Lessons](lessons.md) | Generate or edit a lesson JSON file |
| [Development](development.md) | Set up checks, understand the code and release changes |
| [History](history/README.md) | Understand completed work and past decisions |

[AGENTS.md](../AGENTS.md) contains working instructions for coding agents.
Update the relevant current guide when behavior changes; keep history compact.
Use `docs/plans/` only for active, agreed work. When it finishes, compact the plan
into a dated history summary and retain current behavior in the guides above.
There are no active implementation plans at present. Git retains the detailed
development record; do not append routine per-turn logs.

Source data stays authoritative: [lessons](../lessons/),
[MPS-850 mappings](../config/drumkits/mps-850.json),
[instruments](../src/instruments.js), and [musical constants](../src/music-time.js).
Licenses and source records remain with [recordings](../assets/drums/README.md)
and [VexFlow/fonts](../assets/vendor/vexflow/README.md).
