import { parseLesson } from "./lesson.js";
import { DrumAudio } from "./audio.js";
import { Playback } from "./playback.js";
import { Track } from "./track.js";
import { BEATS_PER_BAR } from "./music-time.js";

const element = id => document.getElementById(id);
const lessonSelect = element("lesson");
const startButton = element("start-stop");
const bpmInput = element("bpm");
const countInInput = element("count-in");
const status = element("status");
const position = element("position");
let lesson;
let tracks = [];
let audio;
let playback;
let animation = null;
let starting = false;
let startRequest = 0;
let lessonRequest = 0;
let loading = true;

function showStatus(message, error = false) {
    if (status.textContent !== message) status.textContent = message;
    status.dataset.error = String(error);
}

function updateVolumes() {
    for (const bus of ["guide", "metronome"]) {
        const volume = Number(element(`${bus}-volume`).value);
        const muted = element(`${bus}-mute`).getAttribute("aria-pressed") === "true";
        element(`${bus}-level`).textContent = `${volume}%`;
        audio?.setVolume(bus, volume / 100, muted);
    }
}

function draw() {
    const beat = playback?.beat ?? 0;
    for (const track of tracks) track.render(beat);
    const positiveBeat = Math.max(0, beat);
    const loopBeats = lesson.bars * BEATS_PER_BAR;
    position.textContent = [
        `Bar ${Math.floor(positiveBeat / BEATS_PER_BAR) % lesson.bars + 1} / ${lesson.bars}`,
        `Beat ${Math.floor(positiveBeat) % BEATS_PER_BAR + 1}`,
        `Loop ${Math.floor(positiveBeat / loopBeats) + 1}`,
    ].join(" · ");
    if (playback?.running) {
        showStatus(beat < 0 ? `Count-in · ${Math.min(4, Math.ceil(-beat))}` : "Playing · Continuous loop");
        animation = requestAnimationFrame(draw);
    }
}

function stop(message = "Stopped · Ready when you are") {
    startRequest++;
    starting = false;
    playback?.stop();
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    startButton.textContent = "Start loop ▶";
    startButton.dataset.running = "false";
    if (lesson) draw();
    showStatus(message);
}

async function loadLesson() {
    const request = ++lessonRequest;
    stop("Loading lesson…");
    loading = true;
    startButton.disabled = true;
    try {
        const response = await fetch(new URL(`../lessons/${lessonSelect.value}.json`, import.meta.url));
        if (!response.ok) throw new Error(`Could not load lesson (HTTP ${response.status})`);
        const nextLesson = parseLesson(await response.text());
        if (request !== lessonRequest) return;
        lesson = nextLesson;
        tracks = lesson.tracks.map(track => new Track(track, lesson.bars * BEATS_PER_BAR));
        element("tracks").replaceChildren(...tracks.map(track => track.element));
        element("lesson-title").textContent = lesson.title;
        element("lesson-detail").textContent = `4/4 · ${lesson.bars} ${lesson.bars === 1 ? "bar" : "bars"} · ${tracks.length} instruments · Repeating lesson`;
        bpmInput.value = lesson.bpm;
        startButton.disabled = false;
        showStatus("Ready · Start with a count-in or listen straight away");
        draw();
    } catch (error) {
        if (request === lessonRequest) showStatus(error.message, true);
    } finally {
        if (request === lessonRequest) {
            loading = false;
            lessonSelect.disabled = false;
        }
    }
}

startButton.addEventListener("click", async () => {
    if (starting || playback?.running) {
        stop();
        return;
    }
    if (loading || !lesson) return;
    if (!bpmInput.reportValidity()) return;
    const request = ++startRequest;
    starting = true;
    startButton.textContent = "Stop ■";
    startButton.dataset.running = "true";
    showStatus("Starting audio…");
    try {
        if (!audio) {
            const context = new AudioContext({ latencyHint: "interactive" });
            audio = new DrumAudio(context);
            playback = new Playback({
                clock: () => context.currentTime,
                schedule: (instrument, time, accent) => audio.schedule(instrument, time, accent),
                cancel: () => audio.stop(),
            });
            context.addEventListener("statechange", () => {
                if (playback.running && context.state !== "running") stop("Audio interrupted · Press Start to restart");
            });
        }
        await audio.context.resume();
        if (request !== startRequest) return;
        if (audio.context.state !== "running") throw new Error("Audio is unavailable. Try Start again.");
        updateVolumes();
        playback.start(lesson, { bpm: Number(bpmInput.value), countIn: countInInput.checked });
        starting = false;
        draw();
    } catch (error) {
        if (request === startRequest) {
            stop();
            showStatus(`Could not start playback: ${error.message}`, true);
        }
    }
});

for (const bus of ["guide", "metronome"]) {
    element(`${bus}-volume`).addEventListener("input", updateVolumes);
    element(`${bus}-mute`).addEventListener("click", event => {
        const button = event.currentTarget;
        const muted = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(muted));
        button.textContent = `${muted ? "Unmute" : "Mute"} ${bus}`;
        updateVolumes();
    });
}
bpmInput.addEventListener("input", () => stop("Tempo changed · Press Start to restart"));
countInInput.addEventListener("change", () => stop("Count-in changed · Press Start to restart"));
lessonSelect.addEventListener("change", loadLesson);
window.addEventListener("resize", () => { if (lesson && !playback?.running) draw(); });
document.addEventListener("visibilitychange", () => {
    if (document.hidden && (starting || playback?.running)) stop("Tab hidden · Press Start to restart");
});
window.addEventListener("pagehide", () => stop());
loadLesson();
