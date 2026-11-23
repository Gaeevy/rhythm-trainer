import { DRUM_SAMPLES } from "./drum-samples.js";

// Higher piano harmonics are quieter and decay faster than the fundamental.
const PIANO_PARTIALS = [
    [1, 0.088, 1.1], [2.001, 0.035, 0.35], [3.004, 0.017, 0.21], [4.009, 0.009, 0.12],
];
// General MIDI programs use zero-based values in Program Change messages.
const BACKING_VOICES = {
    27: {
        partials: [[1, 0.08, 0.68], [2, 0.066, 0.31], [3, 0.04, 0.19], [4, 0.02, 0.12], [5, 0.012, 0.07], [7, 0.008, 0.045]],
    },
    34: {
        gain: Math.SQRT2,
        partials: [[1, 0.15, 0.9], [2, 0.065, 0.48], [3, 0.036, 0.25], [4, 0.017, 0.15], [6, 0.014, 0.075], [9, 0.007, 0.045]],
    },
};
/** Guide recordings, metronome and backing on the same audio clock. */
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
        this.backing = context.createGain();
        this.guide.gain.value = 0.55;
        this.metronome.gain.value = 0.35;
        this.backing.gain.value = 0.55;
        this.guide.connect(context.destination);
        this.metronome.connect(context.destination);
        this.backing.connect(context.destination);
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

    scheduleBacking({ buffer, playbackRate, pitches, duration, velocity, program, bends }, time) {
        if (buffer) {
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.playbackRate.value = playbackRate;
            source.connect(this.backing);
            this.sources.add(source);
            source.onended = () => {
                this.sources.delete(source);
                source.disconnect();
            };
            source.start(time);
            return;
        }
        const release = time + duration;
        const attack = Math.min(0.004, duration / 2);
        // General MIDI bass programs share the picked bass sound and gain.
        const isBass = program >= 32 && program <= 39;
        const voice = BACKING_VOICES[isBass ? 34 : program];
        const partials = voice?.partials ?? PIANO_PARTIALS;
        const amplitude = velocity * (voice?.gain ?? 1);
        for (const pitch of pitches) {
            const frequency = 440 * 2 ** ((pitch - 69) / 12);
            for (const [ratio, level, decay] of partials) {
                const source = this.context.createOscillator();
                source.frequency.setValueAtTime(frequency * ratio, time);
                if (bends) {
                    for (const { offset, cents } of bends) source.detune.setValueAtTime(cents, time + offset);
                }
                const envelope = this.context.createGain();
                const peak = level * amplitude;
                envelope.gain.setValueAtTime(0, time);
                envelope.gain.linearRampToValueAtTime(peak, time + attack);
                envelope.gain.exponentialRampToValueAtTime(
                    Math.max(0.0001, peak * Math.exp(-(duration - attack) / decay)), release,
                );
                envelope.gain.exponentialRampToValueAtTime(0.00001, release + 0.035);
                source.connect(envelope);
                envelope.connect(this.backing);
                this.sources.add(source);
                source.onended = () => {
                    this.sources.delete(source);
                    source.disconnect();
                    envelope.disconnect();
                };
                source.start(time);
                source.stop(release + 0.04);
            }
        }
    }

    stop() {
        for (const source of this.sources) source.stop();
        this.sources.clear();
        this.openHiHats.clear();
        this.hiHatClosures = [];
    }
}
