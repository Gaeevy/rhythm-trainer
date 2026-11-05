import { DRUM_SAMPLES } from "./drum-samples.js";

/** Recorded guide drums, with the original synthesized metronome. */
export class DrumAudio {
    constructor(context) {
        this.context = context;
        this.sources = new Set();
        this.samples = new Map();
        this.samplePromise = null;
        this.openHiHats = new Set();
        this.hiHatClosures = [];
        this.guide = context.createGain();
        this.metronome = context.createGain();
        this.guide.gain.value = 0.55;
        this.metronome.gain.value = 0.35;
        this.master = context.createGain();
        this.master.gain.value = 1.5;
        this.guide.connect(this.master);
        this.metronome.connect(this.master);
        this.master.connect(context.destination);
    }

    /** Load once per audio context before scheduling; a failure can retry on Start. */
    loadSamples(fetcher = fetch) {
        if (this.samplePromise) return this.samplePromise;
        const files = [...new Set(Object.values(DRUM_SAMPLES).map(sample => sample.file))];
        this.samplePromise = Promise.all(files.map(async file => {
            const response = await fetcher(new URL(`../assets/drums/${file}`, import.meta.url));
            if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status})`);
            return [file, await this.context.decodeAudioData(await response.arrayBuffer())];
        })).then(entries => {
            this.samples = new Map(entries);
            return true;
        }).catch(() => {
            this.samplePromise = null;
            return false;
        });
        return this.samplePromise;
    }

    chokeVoice(voice, time) {
        if (voice.start > time || voice.end <= time) return;
        voice.gain.gain.setValueAtTime(voice.volume, time);
        voice.gain.gain.linearRampToValueAtTime(0, time + 0.015);
        voice.source.stop(time + 0.02);
        voice.end = time;
    }

    chokeHiHat(time) {
        this.hiHatClosures = this.hiHatClosures.filter(value => value >= this.context.currentTime);
        this.hiHatClosures.push(time);
        for (const voice of this.openHiHats) this.chokeVoice(voice, time);
    }

    sampleVoice(instrument, time) {
        const sample = DRUM_SAMPLES[instrument];
        const buffer = sample && this.samples.get(sample.file);
        if (!buffer) throw new Error(`Recording unavailable for ${instrument}. Press Start to retry loading drum sounds.`);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(sample.gain, time);
        source.connect(gain);
        gain.connect(this.guide);
        const voice = { source, gain, start: time, end: time + buffer.duration, volume: sample.gain };
        this.sources.add(source);
        source.onended = () => {
            this.sources.delete(source);
            this.openHiHats.delete(voice);
            source.disconnect();
            gain.disconnect();
        };
        source.start(time);
        if (instrument === "hi_hat_open") {
            this.openHiHats.add(voice);
            const close = this.hiHatClosures.filter(value => value >= time).sort((a, b) => a - b)[0];
            if (close !== undefined) this.chokeVoice(voice, close);
        }
    }

    setVolume(bus, volume, muted) {
        const gain = this[bus].gain;
        gain.cancelScheduledValues(this.context.currentTime);
        gain.setTargetAtTime(muted ? 0 : volume, this.context.currentTime, 0.008);
    }

    schedule(instrument, time, accent = false) {
        if (instrument !== "metronome") {
            if (["hi_hat_closed", "hi_hat_pedal"].includes(instrument)) this.chokeHiHat(time);
            this.sampleVoice(instrument, time);
            return;
        }
        // Preserve the original click's oscillator, frequency, envelope and timing.
        const source = this.context.createOscillator();
        const frequency = accent ? 1400 : 1000;
        source.type = "sine";
        source.frequency.setValueAtTime(frequency, time);
        source.frequency.exponentialRampToValueAtTime(frequency, time + 0.035);
        const envelope = this.context.createGain();
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(0.25, time + 0.002);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
        source.connect(envelope);
        envelope.connect(this.metronome);
        this.sources.add(source);
        source.onended = () => {
            this.sources.delete(source);
            source.disconnect();
            envelope.disconnect();
        };
        source.start(time);
        source.stop(time + 0.035 + 0.01);
    }

    stop() {
        for (const source of this.sources) source.stop();
        this.sources.clear();
        this.openHiHats.clear();
        this.hiHatClosures = [];
    }
}
