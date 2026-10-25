import { parseLesson } from "./lesson.js";
import { DrumAudio } from "./audio.js";
import { Playback } from "./playback.js";
import { Track } from "./track.js";
import { BEATS_PER_BAR } from "./music-time.js";
import { Assessment } from "./assessment.js";
import { audioTimeForEvent } from "./clock.js";
import { keyboardInstrument, keyboardTransport, instrumentKeyLabel, remapKey, DEFAULT_KEY_BINDINGS } from "./input.js";
import { MidiInput } from "./midi.js";
import { renderMidi, renderMidiActivity } from "./midi-view.js";
import { BUNDLED_LESSONS } from "../generated/lesson-catalog.js";
import { loadPracticeSettings, savePracticeSettings } from "./practice-settings.js";
import { renderKeyboardBindings } from "./keyboard-view.js";
import { INSTRUMENTS } from "./instruments.js";

const element = id => document.getElementById(id);
const lessonSelect = element("lesson");
const startButton = element("start-stop");
const bpmInput = element("bpm");
const countInInput = element("count-in");
const toleranceInput = element("tolerance");
const latencyInput = element("latency-offset");
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
let assessment = null;
let activeLessonId = null;
let sessionElapsedSeconds = 0;

function recordInputHit(hit) {
    if (!playback?.running || !assessment) return;
    const instrument = hit.instrument;
    if (!assessment.tracks.has(instrument)) return;
    const result = assessment.recordHit({
        ...hit, instrument, audioTime: audioTimeForEvent(audio.context, hit.originalTimeStamp),
    });
    if (result) tracks.find(track => track.data.instrument === instrument).showFeedback(result);
    updateSummary();
}

let browserStorage;
try { browserStorage = window.localStorage; } catch { /* Storage can be disabled; input still works. */ }
const restoredPractice = loadPracticeSettings(browserStorage);
const preferences = restoredPractice.settings;
const midi = new MidiInput({
    requestAccess: window.isSecureContext && typeof navigator.requestMIDIAccess === "function"
        ? options => navigator.requestMIDIAccess(options) : undefined,
    onHit: recordInputHit,
    onChange: () => renderMidi(midi),
    onActivity: () => renderMidiActivity(midi),
    onDisconnect: () => stop("MIDI disconnected · Loop stopped"),
});

function persistPractice() {
    const warning = savePracticeSettings(browserStorage, preferences);
    element("practice-settings-status").textContent = warning || "Practice settings saved in this browser.";
    element("practice-settings-status").dataset.warning = String(Boolean(warning));
}

function updateKeyHints() {
    const hint = Object.entries(INSTRUMENTS).map(([instrument, details]) =>
        `${instrumentKeyLabel(instrument, preferences.keyBindings)}: ${details.label.toLowerCase()}`).join(" · ");
    element("keyboard-hint").textContent = hint;
    element("timeline").setAttribute("aria-label", `Drum practice. Space starts or stops the loop. ${hint}`);
    for (const track of tracks) track.setKeyLabel(instrumentKeyLabel(track.data.instrument, preferences.keyBindings));
    renderKeyboardBindings(preferences.keyBindings, (instrument, code) => {
        stop("Keyboard mapping changed · Press Start to restart");
        preferences.keyBindings = remapKey(preferences.keyBindings, instrument, code);
        updateKeyHints();
        persistPractice();
    });
}

function renderLessonOptions() {
    const options = BUNDLED_LESSONS.map(({ id, title }) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = title;
        return option;
    });
    lessonSelect.replaceChildren(...options);
    lessonSelect.value = activeLessonId ?? preferences.lastBundledLessonId;
}

function updateTempoReset() {
    element("bpm-level").textContent = bpmInput.value;
    const button = element("lesson-tempo");
    const lessonTempo = lesson ? Math.min(300, Math.max(20, lesson.bpm)) : null;
    button.hidden = !lesson || Number(bpmInput.value) === lessonTempo;
    if (lesson) button.textContent = `Use lesson tempo (${lessonTempo} BPM)`;
}

function updateSummary() {
    for (const state of ["on_time", "early", "late", "missed", "extra"]) {
        element(`score-${state}`).textContent = assessment?.counts[state] ?? 0;
    }
    const meanError = assessment?.meanAbsoluteErrorMs;
    element("mean-error").textContent = meanError == null ? "—" : `${meanError.toFixed(1)} ms`;
    const seconds = Math.floor(sessionElapsedSeconds);
    element("session-duration").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const loops = assessment ? Math.floor(sessionElapsedSeconds / assessment.loopSeconds) : 0;
    element("session-loops").textContent = loops;
    element("session-loop-label").textContent = loops === 1 ? "loop completed" : "loops completed";
}

function updateAssessment() {
    if (assessment && playback?.running) {
        const now = audioTimeForEvent(audio.context, performance.now());
        sessionElapsedSeconds = Math.max(0, now - assessment.origin);
        for (const result of assessment.advance(now)) {
            tracks.find(track => track.data.instrument === result.instrument)?.showFeedback(result);
        }
    }
    updateSummary();
}

function showStatus(message, error = false) {
    if (status.textContent !== message) status.textContent = message;
    status.dataset.error = String(error);
}

function updateMuteButton(bus, muted) {
    const button = element(`${bus}-mute`);
    const label = `${muted ? "Unmute" : "Mute"} ${bus === "guide" ? "guide drums" : "metronome"}`;
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", label);
    button.title = label;
}

function toggleTrack(instrument) {
    stop("Tracks changed · Press Space or Start to restart");
    preferences.disabledInstruments = preferences.disabledInstruments.includes(instrument)
        ? preferences.disabledInstruments.filter(value => value !== instrument)
        : [...preferences.disabledInstruments, instrument];
    assessment = null;
    sessionElapsedSeconds = 0;
    for (const track of tracks) track.setEnabled(!preferences.disabledInstruments.includes(track.data.instrument));
    persistPractice();
    draw();
    element("timeline").focus({ preventScroll: true });
}

function updateVolumes(save = true) {
    for (const bus of ["guide", "metronome"]) {
        const volume = Number(element(`${bus}-volume`).value);
        const muted = element(`${bus}-mute`).getAttribute("aria-pressed") === "true";
        element(`${bus}-level`).textContent = `${volume}%`;
        audio?.setVolume(bus, volume / 100, muted);
        preferences[`${bus}Volume`] = volume;
        preferences[`${bus}Muted`] = muted;
    }
    if (save) persistPractice();
}

function draw() {
    updateAssessment();
    const beat = playback?.running
        ? playback.beatAt(audioTimeForEvent(audio.context, performance.now())) : 0;
    tracks.forEach((track, index) => track.render(beat, playback?.running ? assessment : null, index === 0));
    const positiveBeat = Math.max(0, beat);
    const loopBeats = lesson.bars * BEATS_PER_BAR;
    position.textContent = [
        `Bar ${Math.floor(positiveBeat / BEATS_PER_BAR) % lesson.bars + 1} / ${lesson.bars}`,
        `Beat ${Math.floor(positiveBeat) % BEATS_PER_BAR + 1}`,
        `Loop ${Math.floor(positiveBeat / loopBeats) + 1}`,
    ].join(" · ");
    if (playback?.running) {
        showStatus(beat < 0 ? `Count-in · ${Math.min(4, Math.ceil(-beat))}` : "Playing");
        animation = requestAnimationFrame(draw);
    }
}

function stop(message = "Stopped") {
    startRequest++;
    starting = false;
    updateAssessment();
    playback?.stop();
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    startButton.textContent = "Start loop ▶";
    startButton.dataset.running = "false";
    if (lesson) draw();
    showStatus(message);
}

async function changeLesson(read, id, { initial = false } = {}) {
    const request = ++lessonRequest;
    stop("Loading lesson…");
    loading = true;
    startButton.disabled = true;
    element("lesson-error").hidden = true;
    try {
        const nextLesson = await read();
        if (request !== lessonRequest) return;
        lesson = nextLesson;
        activeLessonId = id;
        if (BUNDLED_LESSONS.some(entry => entry.id === id)) preferences.lastBundledLessonId = id;
        assessment = null;
        sessionElapsedSeconds = 0;
        tracks = lesson.tracks.map(track => new Track(
            track, lesson.bars * BEATS_PER_BAR, instrumentKeyLabel(track.instrument, preferences.keyBindings),
            () => toggleTrack(track.instrument),
        ));
        for (const track of tracks) track.setEnabled(!preferences.disabledInstruments.includes(track.data.instrument));
        element("tracks").style.setProperty("--track-count", tracks.length);
        element("tracks").replaceChildren(...tracks.map(track => track.element));
        element("lesson-title").textContent = lesson.title;
        element("lesson-detail").textContent = `4/4 · ${lesson.bars} ${lesson.bars === 1 ? "bar" : "bars"} · ${tracks.length} instruments · Repeating lesson`;
        const requestedTempo = Object.hasOwn(preferences.tempos, id) ? preferences.tempos[id] : lesson.bpm;
        bpmInput.value = requestedTempo;
        renderLessonOptions();
        updateTempoReset();
        if (!initial) persistPractice();
        showStatus(Number(bpmInput.value) === requestedTempo ? "Ready"
            : `Tempo set to ${bpmInput.value} BPM (range 20–300)`);
        draw();
    } catch (error) {
        if (request !== lessonRequest) return;
        const message = `${error.message}${lesson ? " Previous lesson kept; press Start to resume." : " Choose a lesson again to retry."}`;
        element("lesson-error").textContent = message;
        element("lesson-error").hidden = false;
        renderLessonOptions();
        showStatus(message, true);
        if (!lesson) {
            element("lesson-title").textContent = "No lesson loaded";
            element("lesson-detail").textContent = "Choose a lesson again to retry.";
        }
    } finally {
        if (request === lessonRequest) {
            loading = false;
            lessonSelect.disabled = false;
            startButton.disabled = !lesson;
        }
    }
}

function loadLesson(initial = false) {
    const id = lessonSelect.value;
    return changeLesson(async () => {
        if (!BUNDLED_LESSONS.some(entry => entry.id === id)) throw new Error("Unknown bundled lesson");
        const response = await fetch(new URL(`../lessons/${id}.json`, import.meta.url));
        if (!response.ok) throw new Error(`Could not load lesson (HTTP ${response.status})`);
        return parseLesson(await response.text());
    }, id, { initial });
}

startButton.addEventListener("click", async () => {
    if (starting || playback?.running) {
        stop();
        return;
    }
    if (loading || !lesson) return;
    const invalidSetting = [toleranceInput, latencyInput].find(input => !input.validity.valid);
    if (invalidSetting) {
        element("practice-panel").open = true;
        invalidSetting.reportValidity();
        showStatus("Check the highlighted practice setting before starting", true);
        return;
    }
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
        showStatus("Loading drum sounds…");
        const samplesReady = await audio.loadSamples();
        if (request !== startRequest) return;
        if (audio.context.state !== "running") throw new Error("Audio is unavailable. Try Start again.");
        element("guide-sound-status").textContent = samplesReady ? "Guide drums: acoustic recordings."
            : "Recorded drums unavailable; using synthesized guide sounds. Start again to retry loading.";
        updateVolumes(false);
        playback.start(lesson, { bpm: Number(bpmInput.value), countIn: countInInput.checked, disabledInstruments: preferences.disabledInstruments });
        assessment = new Assessment(lesson, {
            origin: playback.origin,
            bpm: Number(bpmInput.value),
            toleranceMs: Number(toleranceInput.value),
            latencyOffsetMs: Number(latencyInput.value),
            disabledInstruments: preferences.disabledInstruments,
        });
        sessionElapsedSeconds = 0;
        for (const track of tracks) track.showFeedback(null);
        element("timeline").focus({ preventScroll: true });
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
        updateMuteButton(bus, muted);
        updateVolumes();
    });
}
bpmInput.addEventListener("input", () => {
    stop("Tempo changed · Press Start to restart");
    updateTempoReset();
    if (activeLessonId && bpmInput.validity.valid) {
        preferences.tempos[activeLessonId] = Number(bpmInput.value);
        persistPractice();
    }
});
countInInput.addEventListener("change", () => {
    stop("Count-in changed · Press Start to restart");
    preferences.countIn = countInInput.checked;
    persistPractice();
});
for (const [input, setting] of [[toleranceInput, "toleranceMs"], [latencyInput, "latencyOffsetMs"]]) {
    input.addEventListener("input", () => {
        stop("Timing settings changed · Press Start to restart");
        if (input.validity.valid) {
            preferences[setting] = Number(input.value);
            persistPractice();
        }
    });
}
document.addEventListener("keydown", event => {
    if (keyboardTransport(event)) {
        event.preventDefault();
        if (!startButton.disabled) startButton.click();
        return;
    }
    if (!playback?.running || !assessment) return;
    const instrument = keyboardInstrument(event, preferences.keyBindings);
    if (!instrument || !assessment.tracks.has(instrument)) return;
    event.preventDefault();
    recordInputHit({ instrument, originalTimeStamp: event.timeStamp, source: "keyboard" });
});
element("midi-connect").addEventListener("click", () => midi.connect());
lessonSelect.addEventListener("change", () => loadLesson());
element("lesson-tempo").addEventListener("click", () => {
    if (!lesson) return;
    stop("Lesson tempo restored · Press Start to restart");
    delete preferences.tempos[activeLessonId];
    bpmInput.value = lesson.bpm;
    updateTempoReset();
    persistPractice();
});
element("reset-keys").addEventListener("click", () => {
    stop("Default keys restored · Press Start to restart");
    preferences.keyBindings = { ...DEFAULT_KEY_BINDINGS };
    updateKeyHints();
    persistPractice();
});
window.addEventListener("resize", () => { if (lesson && !playback?.running) draw(); });
document.addEventListener("visibilitychange", () => {
    if (document.hidden && (starting || playback?.running)) stop("Tab hidden · Press Start to restart");
});
window.addEventListener("pagehide", () => { stop(); midi.disconnect(); });
window.addEventListener("pageshow", event => { if (event.persisted) midi.connect(); });
renderMidi(midi);
countInInput.checked = preferences.countIn;
toleranceInput.value = preferences.toleranceMs;
latencyInput.value = preferences.latencyOffsetMs;
for (const bus of ["guide", "metronome"]) {
    element(`${bus}-volume`).value = preferences[`${bus}Volume`];
    updateMuteButton(bus, preferences[`${bus}Muted`]);
}
element("practice-settings-status").textContent = restoredPractice.warning
    || "Practice settings are saved automatically in this browser.";
element("practice-settings-status").dataset.warning = String(Boolean(restoredPractice.warning));
updateVolumes(false);
updateKeyHints();
renderLessonOptions();
loadLesson(true);

midi.connect();
