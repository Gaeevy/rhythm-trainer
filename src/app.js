import { VOLUME_MAX, volumeFromPosition, positionFromVolume } from "./volume.js";
import { practiceBpm, bpmFromPosition, positionFromBpm, MIN_BPM, MAX_BPM } from "./tempo.js";
import { parseLesson } from "./lesson.js";
import { DrumAudio } from "./audio.js";
import { Playback } from "./playback.js";
import { NotationView } from "./notation/view.js";
import { Track } from "./track.js";
import { BEATS_PER_BAR } from "./music-time.js";
import { Assessment, TimingStatus } from "./assessment.js";
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
let currentBpm = 80;
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
let summaryValues = [];
const timingStates = Object.values(TimingStatus);

function setText(id, value) {
    const node = element(id);
    const text = String(value);
    if (node.textContent !== text) node.textContent = text;
}

function recordInputHit(hit) {
    if (!playback?.running || !assessment) return;
    const instrument = hit.instrument;
    if (!assessment.tracks.has(instrument)) return;
    const result = assessment.recordHit({
        ...hit, instrument, audioTime: audioTimeForEvent(audio.context, hit.originalTimeStamp),
    });
    if (result) {
        tracks.find(track => track.data.instrument === instrument).showFeedback(result);
        notationView.showFeedback(result);
    }
    updateSummary();
}

const notationView = new NotationView({
    onToggle: instrument => toggleTrack(instrument),
    onFallback: () => { if (lesson && !playback?.running) draw(); },
});

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

function setTempo(value) {
    currentBpm = practiceBpm(value);
    bpmInput.value = positionFromBpm(currentBpm);
    bpmInput.setAttribute("aria-valuenow", String(currentBpm));
    bpmInput.setAttribute("aria-valuetext", `${currentBpm} BPM`);
    element("bpm-level").textContent = currentBpm;
    updateTempoReset();
}

function updateTempoReset() {
    const button = element("lesson-tempo");
    const lessonTempo = lesson ? practiceBpm(lesson.bpm) : null;
    button.disabled = !lesson || currentBpm === lessonTempo;
    button.setAttribute("aria-label", lesson ? `Restore lesson tempo (${lessonTempo} BPM)` : "Restore lesson tempo");
    button.title = button.getAttribute("aria-label");
}

function updateSummary() {
    const seconds = Math.floor(sessionElapsedSeconds);
    const loops = assessment ? Math.floor(sessionElapsedSeconds / assessment.loopSeconds) : 0;
    const meanError = assessment?.meanAbsoluteErrorMs;
    const counts = timingStates.map(state => assessment?.counts[state] ?? 0);
    const values = [...counts, seconds, loops, meanError];
    if (values.every((value, index) => Object.is(value, summaryValues[index]))) return;
    summaryValues = values;
    timingStates.forEach((state, index) => setText(`score-${state}`, counts[index]));
    setText("mean-error", meanError == null ? "—" : `${meanError.toFixed(1)} ms`);
    setText("session-duration", `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    setText("session-loops", loops);
    setText("session-loop-label", loops === 1 ? "loop completed" : "loops completed");
}

function updateAssessment() {
    if (assessment && playback?.running) {
        const now = audioTimeForEvent(audio.context, performance.now());
        sessionElapsedSeconds = Math.max(0, now - assessment.origin);
        for (const result of assessment.advance(now)) {
            tracks.find(track => track.data.instrument === result.instrument)?.showFeedback(result);
            notationView.showFeedback(result);
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
    notationView.updateInstruments(preferences.disabledInstruments);
    persistPractice();
    draw();
    element(notationView.active ? "notation-panel" : "timeline").focus({ preventScroll: true });
}

function updateVolumes(save = true) {
    for (const bus of Object.keys(VOLUME_MAX)) {
        const slider = element(`${bus}-volume`);
        const volume = volumeFromPosition(Number(slider.value), VOLUME_MAX[bus]);
        slider.setAttribute("aria-valuenow", String(volume));
        slider.setAttribute("aria-valuetext", `${volume}%`);
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
    notationView.updatePlayback(beat, Boolean(playback?.running), assessment);
    if (!notationView.active) tracks.forEach((track, index) => track.render(beat, playback?.running ? assessment : null, index === 0));
    const positiveBeat = Math.max(0, beat);
    const loopBeats = lesson.bars * BEATS_PER_BAR;
    position.textContent = [
        `Bar ${Math.floor(positiveBeat / BEATS_PER_BAR) % lesson.bars + 1} / ${lesson.bars}`,
        `Beat ${Math.floor(positiveBeat) % BEATS_PER_BAR + 1}`,
        `Loop ${Math.floor(positiveBeat / loopBeats) + 1}`,
    ].join(" · ");
    if (playback?.running) {
        showStatus(beat < 0 ? `Count-in · ${Math.min(BEATS_PER_BAR, Math.ceil(-beat))}` : "Playing");
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
        notationView.setLesson(lesson, preferences.disabledInstruments);
        void notationView.show(preferences.view);
        lessonSelect.dataset.loadedId = id;
        const requestedTempo = Object.hasOwn(preferences.tempos, id) ? preferences.tempos[id] : lesson.bpm;
        setTempo(requestedTempo);
        renderLessonOptions();
        updateTempoReset();
        if (!initial) persistPractice();
        showStatus(currentBpm === requestedTempo ? "Ready"
            : `Tempo set to ${currentBpm} BPM (integer range ${MIN_BPM}–${MAX_BPM})`);
        draw();
    } catch (error) {
        if (request !== lessonRequest) return;
        const message = `${error.message}${lesson ? " Previous lesson kept; press Start to resume." : " Choose a lesson again to retry."}`;
        element("lesson-error").textContent = message;
        element("lesson-error").hidden = false;
        renderLessonOptions();
        showStatus(message, true);
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
            : "Could not load drum recordings. Check the connection, then press Start to retry.";
        if (!samplesReady) throw new Error("Drum recordings could not load. Press Start to retry.");
        updateVolumes(false);
        playback.start(lesson, { bpm: currentBpm, countIn: countInInput.checked, disabledInstruments: preferences.disabledInstruments });
        assessment = new Assessment(lesson, {
            origin: playback.origin,
            bpm: currentBpm,
            toleranceMs: Number(toleranceInput.value),
            latencyOffsetMs: Number(latencyInput.value),
            disabledInstruments: preferences.disabledInstruments,
        });
        sessionElapsedSeconds = 0;
        for (const track of tracks) track.showFeedback(null);
        element(notationView.active ? "notation-panel" : "timeline").focus({ preventScroll: true });
        starting = false;
        draw();
    } catch (error) {
        if (request === startRequest) {
            stop();
            showStatus(`Could not start playback: ${error.message}`, true);
        }
    }
});

for (const bus of Object.keys(VOLUME_MAX)) {
    const slider = element(`${bus}-volume`);
    slider.addEventListener("input", updateVolumes);
    slider.addEventListener("keydown", event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const volume = preferences[`${bus}Volume`];
        const values = { ArrowLeft: volume - 1, ArrowDown: volume - 1,
            ArrowRight: volume + 1, ArrowUp: volume + 1,
            PageDown: volume - 10, PageUp: volume + 10, Home: 0, End: VOLUME_MAX[bus] };
        if (!Object.hasOwn(values, event.code)) return;
        event.preventDefault();
        slider.value = positionFromVolume(values[event.code], VOLUME_MAX[bus]);
        slider.dispatchEvent(new Event("input"));
    });
    element(`${bus}-mute`).addEventListener("click", event => {
        const button = event.currentTarget;
        const muted = button.getAttribute("aria-pressed") !== "true";
        updateMuteButton(bus, muted);
        updateVolumes();
    });
}
bpmInput.addEventListener("input", () => {
    stop("Tempo changed · Press Start to restart");
    setTempo(bpmFromPosition(Number(bpmInput.value)));
    if (activeLessonId) {
        preferences.tempos[activeLessonId] = currentBpm;
        persistPractice();
    }
});
bpmInput.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const values = { ArrowLeft: currentBpm - 1, ArrowDown: currentBpm - 1,
        ArrowRight: currentBpm + 1, ArrowUp: currentBpm + 1,
        PageDown: currentBpm - 10, PageUp: currentBpm + 10, Home: MIN_BPM, End: MAX_BPM };
    if (!Object.hasOwn(values, event.code)) return;
    event.preventDefault();
    bpmInput.value = positionFromBpm(values[event.code]);
    bpmInput.dispatchEvent(new Event("input"));
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
for (const view of ["lanes", "notation"]) {
    element(`view-${view}`).addEventListener("click", () => {
        preferences.view = view;
        persistPractice();
        void notationView.show(view);
        if (lesson && !playback?.running) draw();
    });
}
element("notation-retry").addEventListener("click", () => { void notationView.show("notation"); });
element("midi-connect").addEventListener("click", () => midi.connect());
lessonSelect.addEventListener("change", () => loadLesson());
element("lesson-tempo").addEventListener("click", () => {
    if (!lesson) return;
    stop("Lesson tempo restored · Press Start to restart");
    delete preferences.tempos[activeLessonId];
    setTempo(lesson.bpm);
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
for (const bus of Object.keys(VOLUME_MAX)) {
    element(`${bus}-volume`).value = positionFromVolume(preferences[`${bus}Volume`], VOLUME_MAX[bus]);
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
