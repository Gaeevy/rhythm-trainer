/*
  Enhanced Rhythm Training App with Note-based Scheduling

  New logic:
  1. Based on BPM and the chosen subdivision option, we calculate the interval between successive notes.
     For example, if BPM is 60 then a quarter has 1 sec duration.
     • Quarter Notes: interval = 60/BPM seconds.
     • Eighth Notes: interval = (60/BPM)/2 seconds.
     • Sixteenths: interval = (60/BPM)/4 seconds.
     • Eighth Triplets: interval = (60/BPM)/3 seconds.
  2. A note counter runs over the measure (total number of notes = tact × subdivisionFactor).
  3. When the note number (1-indexed) lands on a “strong” beat – namely, when (noteIndex mod subdivisionFactor == 1) –
     the app plays the click sound. Otherwise, it plays the clack sound.
  4. Clack volume is adjustable via a slider (default 0.5) while click is played at volume 1.
  5. A scheduling function uses setTimeout to trigger notes at exactly the computed intervals.
  6. The progress bar displays measure progress based on the measure start time and total measure duration.
  7. Tap markers (from pressing Space) are still recorded.

  For best results use audio clips that are short enough to be “cut off” at the end of each note interval.
*/

let running = false;
let bpm = 60;
let tact = 4;

// subdivisionFactor is determined by the dropdown.
// quarter: 1, eighth: 2, sixteenth: 4, triplet: 3.
let subdivisionFactor = 1;
let noteInterval = 0;         // ms between consecutive notes
let totalNotes = 0;           // total notes per measure = tact * subdivisionFactor
let measureDuration = 0;      // ms per measure
let measureStart = 0;         // timestamp of current measure start (ms)

let noteCounter = 0;          // counts notes starting from 0 each measure
let noteTimer = null;         // setTimeout reference for scheduling notes

const progressElem = document.getElementById("progress");
const markersContainer = document.getElementById("markers");

const bpmInput = document.getElementById("bpm");
const tactInput = document.getElementById("tact");
const subdivisionSelect = document.getElementById("subdivision");
const clackVolumeSelect = document.getElementById("clackVolume");
const startStopBtn = document.getElementById("startStop");
const timelineElem = document.getElementById("timeline");

// Create audio objects for beat sounds.
// Ensure click.mp3 and clack.mp3 exist (or update the paths accordingly).
const clickSound = new Audio("click_tr.wav");
clickSound.volume = 1.0;
const clackSound = new Audio("click_tr.wav");
// Clack volume will be updated when starting based on clackVolumeInput

// Update the progress bar continuously using requestAnimationFrame.
function updateProgress() {
    if (!running) return;
    const now = performance.now();

    // Calculate which measure we're in
    const measuresElapsed = Math.floor((now - measureStart) / measureDuration);
    const currentMeasureStart = measureStart + (measuresElapsed * measureDuration);

    // Calculate position within current measure
    const elapsed = now - currentMeasureStart;
    const progressPercent = Math.min((elapsed / measureDuration) * 100, 100);

    progressElem.style.width = progressPercent + "%";
    requestAnimationFrame(updateProgress);
}

function scheduleNextNote() {
    if (!running) return;
    const now = performance.now();
    let nextNoteTime = measureStart + (noteCounter * noteInterval);
    let delay = nextNoteTime - now;
    if (delay < 0) delay = 0;

    noteTimer = setTimeout(() => {
        // Clear markers just before starting a new measure
        if (noteCounter === 0) {
            clearMarkers();
        }

        playCurrentNote();
        noteCounter++;

        // If we reached the end of the measure, reset for the next measure.
        if (noteCounter >= totalNotes) {
            noteCounter = 0;
            measureStart += measureDuration;
        }
        scheduleNextNote();
    }, delay);
}

function playCurrentNote() {
    // Using 1-indexed note number for determining strong beats.
    const noteNumber = noteCounter + 1;
    // A note is "strong" if its position mod subdivisionFactor is 1.
    // For example, in eighths (subdivisionFactor = 2): notes 1, 3, 5, 7 are strong.
    if ((noteNumber % subdivisionFactor) === 1) {
        // Play click sound (strong beat).
        clickSound.currentTime = 0;
        clickSound.play().catch((error) => {
            console.error("Click sound playback failed:", error);
        });
        // If clickSound is too long, cut it off at noteInterval.
        if (clickSound.duration && (clickSound.duration * 1000 > noteInterval)) {
            setTimeout(() => {
                clickSound.pause();
                clickSound.currentTime = 0;
            }, noteInterval);
        }
    } else {
        // Otherwise play clack sound.
        clackSound.currentTime = 0;
        clackSound.play().catch((error) => {
            console.error("Clack sound playback failed:", error);
        });
        if (clackSound.duration && (clackSound.duration * 1000 > noteInterval)) {
            setTimeout(() => {
                clackSound.pause();
                clackSound.currentTime = 0;
            }, noteInterval);
        }
    }
}

// When the user taps Space, put a marker at the current progress.
function recordTap() {
    if (!running) return;
    const now = performance.now();

    // Calculate which measure we're in
    const measuresElapsed = Math.floor((now - measureStart) / measureDuration);
    const currentMeasureStart = measureStart + (measuresElapsed * measureDuration);

    // Calculate position within current measure
    const elapsed = now - currentMeasureStart;
    const progressPercent = (elapsed / measureDuration) * 100;

    addMarker(progressPercent);
}


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

// Generate quarter (beat) markers.
function generateBeatMarkers() {
    const existingBeatMarkers = document.querySelectorAll(".beat-marker");
    existingBeatMarkers.forEach(m => m.remove());
    // Quarter beats: one per tact. Note that measure starts at 0.
    for (let i = 1; i < tact; i++) {
        const marker = document.createElement("div");
        marker.className = "beat-marker";
        marker.style.left = ((i / tact) * 100) + "%";
        timelineElem.appendChild(marker);
    }
}

// Generate markers for the chosen subdivisions (except the strong beats).
function generateSubdivisionMarkers() {
    const existingSubMarkers = document.querySelectorAll(".subdivision-marker");
    existingSubMarkers.forEach(m => m.remove());
    if (subdivisionFactor <= 1) return;
    // For each quarter beat, add subdivision markers.
    for (let beat = 0; beat < tact; beat++) {
        // Within each quarter note, there are (subdivisionFactor - 1) subdivision points.
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

// Start/stop button handler.
startStopBtn.addEventListener("click", () => {
    if (running) {
        // Stop the metronome.
        running = false;
        startStopBtn.textContent = "Start";
        if (noteTimer) clearTimeout(noteTimer);
        resetProgress();
    } else {
        // Read BPM and tact.
        bpm = parseFloat(bpmInput.value);
        tact = parseInt(tactInput.value);
        if (isNaN(bpm) || bpm <= 0) bpm = 60;
        if (isNaN(tact) || tact <= 0) tact = 4;

        // Set subdivision factor based on dropdown.
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

        // Calculate the note interval.
        // One quarter note lasts 60/BPM seconds,
        // so each subdivision lasts (60/BPM)/subdivisionFactor seconds.
        noteInterval = (60 / bpm * 1000) / subdivisionFactor;

        totalNotes = tact * subdivisionFactor;
        measureDuration = noteInterval * totalNotes;

        // Set clack volume.
        clackSound.volume = parseFloat(clackVolumeSelect.value);

        // Generate visual markers.
        generateBeatMarkers();
        generateSubdivisionMarkers();

        // Initialize scheduling.
        running = true;
        noteCounter = 0;
        measureStart = performance.now();

        scheduleNextNote();
        updateProgress();

        startStopBtn.textContent = "Stop";
    }
});

// Listen for Space key to record tap markers.
document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        recordTap();
    }
});

/*
  Notes:
  • The metronome now works by computing the interval between note events using BPM and the chosen subdivision.
  • A note counter tracks each note event through a measure. When a note event is on a strong beat
    (i.e., its 1-indexed position modulo subdivisionFactor is 1) the click sound is played. All other notes
    play the clack sound.
  • The progress bar updates continuously, and tap markers record the user's Space key presses.

Enjoy practicing your new rhythm modes!
*/
