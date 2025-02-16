# Rhythm Trainer

Welcome to Rhythm Trainer – a pet project hosted on GitHub Pages at [https://gaeevy.github.io/rhythm-trainer/](https://gaeevy.github.io/rhythm-trainer/)!  
Rhythm Trainer is a web-based metronome and rhythm training tool I built to practice frontend development. Although it's a personal experiment to sharpen my skills, it’s a fully functional tool that helps me improve my musical timing and rhythm.

## Features

- **Customizable Rhythm Settings:**
    - Set BPM (beats per minute) and tact (measure length).
    - Choose between different rhythmic subdivisions: Quarter Notes, Eighth Notes, Sixteenths, and Eighth Triplets.
    - Adjust volume for the softer "clack" sound.

- **Visual Feedback:**
    - A moving progress bar shows measure progress.
    - Visual markers (beat and subdivision markers) indicate the timing of beats.
    - Tap markers display your timing input as vertical lines overlaying the progress bar.

- **Multiple Input Methods:**
    - **Laptop Keyboard:** Use the Space key to tap along with the beat.
    - **MIDI Keyboard:** Any connected MIDI keyboard will register Note On events as taps.
    - **MIDI Drums:** Only Note On events on Channel 10 (after filtering real-time messages) are registered, which is perfect for drum controllers.

- **Real-World Application:**
    - Although born as a fun frontend practice project, Rhythm Trainer is a real tool designed to help musicians improve timing and rhythmic accuracy.

## How It Works

- The app calculates note intervals based on the selected BPM and rhythmic subdivision.
- A scheduling loop triggers note sounds (a strong 'click' for the main beat and a softer 'clack' for off-beats) precisely according to the rhythm settings.
- Visual markers (beat and subdivision markers) are generated dynamically on a timeline, and your taps (either via the Space key or MIDI Note On events) are recorded as markers on the progress bar.
- The application uses standard HTML, CSS, and JavaScript, leveraging the Web MIDI API for integrating MIDI devices.

## Getting Started

### Prerequisites

- A modern web browser that supports the Web MIDI API (e.g., Google Chrome).
- For MIDI functionality, a USB-MIDI device (keyboard or drum controller) connected to your computer.

### Installation

1. Clone or download the repository.
2. Open the `index.html` file in your preferred web browser.
3. Adjust the settings (BPM, tact size, rhythmic subdivision, clack volume) and select the desired input method.
4. Click **Start** and begin your rhythm training session!

## Project Structure

```
Rhythm-Trainer/
├── index.html        # Main HTML file with UI controls and timeline.
├── style.css         # CSS styles for layout, progress bar, and markers.
└── script.js         # JavaScript for metronome scheduling and multi-input handling.
```

## Development & Future Improvements

- **Frontend Practice:** This project is a personal experiment to enhance my skills in HTML, CSS, and JavaScript.
- **Extended MIDI Support:** Future iterations might include more nuanced MIDI mappings, such as assigning different sounds to various drum hits.
- **Enhanced UI/UX:** Planned improvements include customizable themes, additional sound options, and more interactive feedback mechanisms.

## License

Feel free to use, modify, and share this project for your own learning and musical practice.
