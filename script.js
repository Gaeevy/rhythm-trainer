/*
  Enhanced Rhythm Training App with support for three input methods:
   1) Keyboard (Space key)
   2) MIDI Keyboard – any Note On event is treated as a tap.
   3) MIDI Drums – only Note On events on Channel 10 (after ignoring real–time messages)

   The metronome and tap marker scheduling remains unchanged.
*/

let running = false;
let bpm = 60;
let tact = 4;
// subdivisionFactor is determined by the chosen rhythm dropdown.
// quarter: 1, eighth: 2, sixteenth: 4, triplet: 3.
let subdivisionFactor = 1;
let noteInterval = 0; // milliseconds between consecutive note events.
let totalNotes = 0;    // total note events per measure = tact * subdivisionFactor.
let measureDuration = 0; // the duration of a measure in ms.
let measureStart = 0;  // timestamp marking the start of the current measure.
let noteCounter = 0;   // resets every measure.
let noteTimer = null;  // reference for the scheduled note event.

const progressElem = document.getElementById("progress");
const markersContainer = document.getElementById("markers");
const bpmInput = document.getElementById("bpm");
const tactInput = document.getElementById("tact");
const subdivisionSelect = document.getElementById("subdivision");
const clackVolumeSelect = document.getElementById("clackVolume");
const inputMethodSelect = document.getElementById("inputMethod");
const startStopBtn = document.getElementById("startStop");
const timelineElem = document.getElementById("timeline");

// Create audio objects for beat sounds.
// Update the file paths if needed.
const clickSound = new Audio("click_tr.wav");
clickSound.volume = 1.0;
const clackSound = new Audio("click_tr.wav");
// Clack volume will be set when you start the metronome.

// MIDI integration variables.
let midiInitialized = false;
let midiAccess = null;

/*
  Initializes MIDI if one of the MIDI input methods is selected.
  It attaches the onmidimessage handler to all available inputs.
*/
function initMIDI() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then((access) => {
            midiAccess = access;
            for (let input of midiAccess.inputs.values()) {
                input.onmidimessage = onMIDIMessage;
                console.log("Listening on MIDI device:", input.name);
            }
            midiAccess.onstatechange = function (e) {
                console.log("MIDI device", e.port.name, e.port.state);
                // Auto attach new inputs on connection.
                if (
                    e.port.state === "connected" &&
                    e.port.type === "input"
                ) {
                    e.port.onmidimessage = onMIDIMessage;
                    console.log("Now listening to:", e.port.name);
                }
            };
        }).catch((err) => {
            console.error("MIDI Access error:", err);
        });
    } else {
        console.error("Web MIDI API is not supported in this browser.");
    }
    midiInitialized = true;
}

// Handle incoming MIDI messages.
function onMIDIMessage(message) {
    const data = message.data;
    const status = data[0];

    // Ignore real-time messages (status 0xF8 and above).
    if (status >= 0xF8) return;

    // Only proceed if this is a Note On event.
    // Check that the upper nibble equals 0x90 and velocity is > 0.
    if ((status & 0xF0) !== 0x90) return;
    if (data.length < 3) return; // safety check.
    if (data[2] === 0) return;  // treat Note On with velocity 0 as Note Off.

    // For "MIDI Drums", we filter further to only process events on Channel 10.
    const channel = (status & 0x0F) + 1; // channels 1-16.
    if (inputMethodSelect.value === "midi-drums" && channel !== 10) {
        return; // ignore other channels.
    }
    // For "MIDI Keyboard", no additional channel filtering is performed.

    // If we get here, treat the note on as a tap.
    recordTap();
}

// Append a tap marker at the current progress.
function addMarker(percent) {
    const marker = document.createElement("div");
    marker.className = "tap-marker";
    marker.style.left = percent + "%";
    markersContainer.appendChild(marker);
}

function clearMarkers() {
    markersContainer.innerHTML = "";
}

function resetProgress() {
    progressElem.style.width = "0%";
}

// Update the progress bar continuously.
function updateProgress() {
    if (!running) return;
    const now = performance.now();
    const measuresElapsed = Math.floor((now - measureStart) / measureDuration);
    const currentMeasureStart = measureStart + (measuresElapsed * measureDuration);
    const elapsed = now - currentMeasureStart;
    const progressPercent = Math.min((elapsed / measureDuration) * 100, 100);
    progressElem.style.width = progressPercent + "%";
    requestAnimationFrame(updateProgress);
}

// Schedule the next note sound.
function scheduleNextNote() {
    if (!running) return;
    const now = performance.now();
    let nextNoteTime = measureStart + (noteCounter * noteInterval);
    let delay = nextNoteTime - now;
    if (delay < 0) delay = 0;
    noteTimer = setTimeout(() => {
        if (noteCounter === 0) {
            clearMarkers();
        }
        playCurrentNote();
        noteCounter++;
        if (noteCounter >= totalNotes) {
            noteCounter = 0;
            measureStart += measureDuration;
        }
        scheduleNextNote();
    }, delay);
}

// Play the appropriate sound for the current beat.
function playCurrentNote() {
    const noteNumber = noteCounter + 1; // 1-indexed.
    if ((noteNumber % subdivisionFactor) === 1) {
        // Strong beat: play click sound.
        clickSound.currentTime = 0;
        clickSound.play().catch((error) => console.error("Click error:", error));
        if (clickSound.duration && (clickSound.duration * 1000 > noteInterval)) {
            setTimeout(() => {
                clickSound.pause();
                clickSound.currentTime = 0;
            }, noteInterval);
        }
    } else {
        // Other beats: play clack sound.
        clackSound.currentTime = 0;
        clackSound.play().catch((error) => console.error("Clack error:", error));
        if (clackSound.duration && (clackSound.duration * 1000 > noteInterval)) {
            setTimeout(() => {
                clackSound.pause();
                clackSound.currentTime = 0;
            }, noteInterval);
        }
    }
}

// Called on Space tap or equivalent MIDI Note On.
function recordTap() {
    if (!running) return;
    const now = performance.now();
    const measuresElapsed = Math.floor((now - measureStart) / measureDuration);
    const currentMeasureStart = measureStart + (measuresElapsed * measureDuration);
    const elapsed = now - currentMeasureStart;
    const progressPercent = (elapsed / measureDuration) * 100;
    addMarker(progressPercent);
}

// --- Visual markers generation ---

function generateBeatMarkers() {
    const existing = document.querySelectorAll(".beat-marker");
    existing.forEach(m => m.remove());
    for (let i = 1; i < tact; i++) {
        const marker = document.createElement("div");
        marker.className = "beat-marker";
        marker.style.left = ((i / tact) * 100) + "%";
        timelineElem.appendChild(marker);
    }
}

function generateSubdivisionMarkers() {
    const existing = document.querySelectorAll(".subdivision-marker");
    existing.forEach(m => m.remove());
    if (subdivisionFactor <= 1) return;
    for (let beat = 0; beat < tact; beat++) {
        for (let sub = 1; sub < subdivisionFactor; sub++) {
            const posInBeat = sub / subdivisionFactor;
            const overallPos = ((beat + posInBeat) / tact) * 100;
            const marker = document.createElement("div");
            marker.className = "subdivision-marker";
            marker.style.left = overallPos + "%";
            timelineElem.appendChild(marker);
        }
    }
}

// --- Start/Stop Handler ---

startStopBtn.addEventListener("click", () => {
    if (running) {
        running = false;
        startStopBtn.textContent = "Start";
        if (noteTimer) clearTimeout(noteTimer);
        resetProgress();
    } else {
        // Read and validate input values.
        bpm = parseFloat(bpmInput.value);
        tact = parseInt(tactInput.value);
        if (isNaN(bpm) || bpm <= 0) bpm = 60;
        if (isNaN(tact) || tact <= 0) tact = 4;
        switch (subdivisionSelect.value) {
            case "quarter":
                subdivisionFactor = 1;
                break;
            case "eighth":
                subdivisionFactor = 2;
                break;
            case "sixteenth":
                subdivisionFactor = 4;
                break;
            case "triplet":
                subdivisionFactor = 3;
                break;
            default:
                subdivisionFactor = 1;
        }
        noteInterval = (60 / bpm * 1000) / subdivisionFactor;
        totalNotes = tact * subdivisionFactor;
        measureDuration = noteInterval * totalNotes;
        clackSound.volume = parseFloat(clackVolumeSelect.value);
        generateBeatMarkers();
        generateSubdivisionMarkers();
        running = true;
        noteCounter = 0;
        measureStart = performance.now();
        scheduleNextNote();
        updateProgress();
        startStopBtn.textContent = "Stop";

        // If a MIDI input mode is selected and MIDI hasn't been initialized, initialize it.
        if ((inputMethodSelect.value === "midi-keyboard" || inputMethodSelect.value === "midi-drums") && !midiInitialized) {
            initMIDI();
        }
    }
});

// --- Keyboard Tap Handler ---
// Only active if the chosen input method is "keyboard".
document.addEventListener("keydown", (e) => {
    if (inputMethodSelect.value === "keyboard" && e.code === "Space") {
        e.preventDefault();
        recordTap();
    }
});

// Optionally log when the input method changes.
inputMethodSelect.addEventListener("change", () => {
    console.log("Input method changed to:", inputMethodSelect.value);
    // If a MIDI mode is selected and MIDI is not yet initialized, do so.
    if ((inputMethodSelect.value === "midi-keyboard" || inputMethodSelect.value === "midi-drums") && !midiInitialized) {
        initMIDI();
    }
});