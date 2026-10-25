import { DRUM_SAMPLES } from "./drum-samples.js";

/** Recorded guide drums, with a synthesized metronome and offline-safe fallback. */
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
        this.guide.connect(context.destination);
        this.metronome.connect(context.destination);
        this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
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
        if (!buffer) return false;
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
        return true;
    }

    setVolume(bus, volume, muted) {
        const gain = this[bus].gain;
        gain.cancelScheduledValues(this.context.currentTime);
        gain.setTargetAtTime(muted ? 0 : volume, this.context.currentTime, 0.008);
    }

    voice(source, time, duration, volume, destination) {
        const envelope = this.context.createGain();
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(volume, time + 0.002);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        source.connect(envelope);
        envelope.connect(destination);
        this.sources.add(source);
        source.onended = () => {
            this.sources.delete(source);
            source.disconnect();
            envelope.disconnect();
            if (destination !== this.guide && destination !== this.metronome) destination.disconnect();
        };
        source.start(time);
        source.stop(time + duration + 0.01);
    }

    tone(time, frequency, endFrequency, duration, volume, destination, type = "sine") {
        const source = this.context.createOscillator();
        source.type = type;
        source.frequency.setValueAtTime(frequency, time);
        source.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
        this.voice(source, time, duration, volume, destination);
    }

    noiseVoice(time, frequency, duration, volume) {
        const source = this.context.createBufferSource();
        source.buffer = this.noise;
        const filter = this.context.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = frequency;
        filter.connect(this.guide);
        this.voice(source, time, duration, volume, filter);
    }

    schedule(instrument, time, accent = false) {
        if (["hi_hat_closed", "hi_hat_pedal"].includes(instrument)) this.chokeHiHat(time);
        if (instrument !== "metronome" && this.sampleVoice(instrument, time)) return;
        switch (instrument) {
            case "metronome":
                this.tone(time, accent ? 1400 : 1000, accent ? 1400 : 1000, 0.035, 0.25, this.metronome);
                break;
            case "kick":
                this.tone(time, 140, 42, 0.2, 0.7, this.guide);
                break;
            case "snare":
                this.noiseVoice(time, 1400, 0.15, 0.5);
                this.tone(time, 180, 90, 0.09, 0.18, this.guide, "triangle");
                break;
            case "hi_hat_closed":
                this.noiseVoice(time, 7000, 0.055, 0.35);
                break;
            case "hi_hat_open":
                this.noiseVoice(time, 6500, 0.45, 0.3);
                break;
            case "hi_hat_pedal":
                this.noiseVoice(time, 5500, 0.035, 0.25);
                break;
            case "tom_1":
            case "tom_2":
            case "tom_3":
            case "tom_4": {
                const frequency = { tom_1: 220, tom_2: 175, tom_3: 130, tom_4: 100 }[instrument];
                this.tone(time, frequency, frequency * 0.65, 0.28, 0.5, this.guide);
                break;
            }
            case "crash_1":
            case "crash_2":
                this.noiseVoice(time, instrument === "crash_1" ? 4000 : 3000, 0.85, 0.25);
                break;
            case "ride":
                this.noiseVoice(time, 4500, 0.38, 0.14);
                for (const frequency of [3100, 4310, 5870]) {
                    this.tone(time, frequency, frequency, 0.32, 0.025, this.guide, "triangle");
                }
                break;
            default:
                throw new Error(`No sound for instrument: ${instrument}`);
        }
    }

    stop() {
        for (const source of this.sources) source.stop();
        this.sources.clear();
        this.openHiHats.clear();
        this.hiHatClosures = [];
    }
}
