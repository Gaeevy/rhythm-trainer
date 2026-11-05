# Rhythm Trainer

A drum-practice app for the **Millenium MPS-850**, built for Chrome on macOS.
Practice looping JSON lessons with recorded guide drums, a metronome, keyboard
or MIDI input, and early/on-time/late feedback. Read a repeating score in
**Notation**, or use scrolling instrument **Lanes**.

The app runs entirely in the browser. Plain JavaScript, HTML and CSS; no account,
backend, frontend framework or runtime CDN. Python handles local serving and
static packaging for GitHub Pages.

## Run locally

```sh
python3 scripts/site.py
```

Open [localhost:8000](http://localhost:8000) in Chrome. Choose a lesson and press
**Start loop** or **Space**. Connect the kit's USB MIDI port to use the pads.

## Documentation

Start with the [documentation index](docs/README.md).

- [Practice guide](docs/practice.md) — controls, MIDI, timing and sound.
- [Lesson format](docs/lessons.md) — add one JSON file, including Swing/triplets.
- [Development](docs/development.md) — setup, architecture, checks and deployment.
- [Project history](docs/history/2026-10-24-mvp.md) and [notation history](docs/history/2026-11-04-notation-plan.md).
- [AGENTS.md](AGENTS.md) — instructions for coding agents.

Audio and notation credits/licenses stay beside their assets:
[drum recordings](assets/drums/README.md), [VexFlow and fonts](assets/vendor/vexflow/README.md).
