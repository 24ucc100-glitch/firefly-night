class NightAmbience {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        
        // Wind nodes
        this.windNoise = null;
        this.windFilter = null;
        this.windGain = null;
        this.windLFO1 = null;
        this.windLFO2 = null;

        // Crickets variables
        this.cricketTimer = null;
        this.cricketGains = [];
        this.cricketsActive = false;

        this.isPlaying = false;
    }

    init() {
        if (this.ctx) return;

        // Create audio context
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // Create master gain for fading entire soundscape
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.setupWind();
        this.setupCrickets();
    }

    setupWind() {
        const ctx = this.ctx;

        // 1. Generate White Noise Buffer
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        this.windNoise = ctx.createBufferSource();
        this.windNoise.buffer = noiseBuffer;
        this.windNoise.loop = true;

        // 2. Create Lowpass Filter for Wind
        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.Q.setValueAtTime(2.0, ctx.currentTime);
        this.windFilter.frequency.setValueAtTime(200, ctx.currentTime);

        // 3. Create Wind Gain
        this.windGain = ctx.createGain();
        this.windGain.gain.setValueAtTime(0.15, ctx.currentTime); // Low baseline volume

        // 4. Modulate Wind Cutoff Frequency with an LFO (Slow wind waves)
        this.windLFO1 = ctx.createOscillator();
        this.windLFO1.frequency.setValueAtTime(0.06, ctx.currentTime); // Very slow: 16s cycle
        const lfoGain1 = ctx.createGain();
        lfoGain1.gain.setValueAtTime(100, ctx.currentTime); // Oscillate by 100Hz
        
        this.windLFO1.connect(lfoGain1);
        lfoGain1.connect(this.windFilter.frequency);

        // 5. Modulate Wind Volume with a separate LFO (Volume swells)
        this.windLFO2 = ctx.createOscillator();
        this.windLFO2.frequency.setValueAtTime(0.04, ctx.currentTime); // 25s cycle
        const lfoGain2 = ctx.createGain();
        lfoGain2.gain.setValueAtTime(0.08, ctx.currentTime); // Swells volume by 0.08

        this.windLFO2.connect(lfoGain2);
        lfoGain2.connect(this.windGain.gain);

        // Connect Wind nodes
        this.windNoise.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.masterGain);

        // Start oscillators and noise
        this.windNoise.start(0);
        this.windLFO1.start(0);
        this.windLFO2.start(0);
    }

    setupCrickets() {
        // We will dynamically spawn and schedule cricket sounds to avoid infinite loops when silent.
        // We schedule crickets using a recursive timer so they chirp asynchronously.
        this.cricketsActive = true;
        this.scheduleCricketChirps();
    }

    createSingleCricket(frequency, chirpDuration, pulseRate, detune, panValue) {
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const ctx = this.ctx;
        const now = ctx.currentTime;

        // 1. Carrier Oscillator (High pitch chirp)
        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(frequency, now);
        carrier.detune.setValueAtTime(detune, now);

        // 2. Modulator (Fast pulse modulation, e.g. 50Hz, to create the cricket's 'chirp' texture)
        const modulator = ctx.createOscillator();
        modulator.type = 'sawtooth'; // Sawtooth gives a sharper, more natural insect texture
        modulator.frequency.setValueAtTime(pulseRate, now);

        const modulatorGain = ctx.createGain();
        modulatorGain.gain.setValueAtTime(0.7, now);

        // 3. Main Chirp Gain Node (Controls the overall shape of this specific chirp)
        const chirpGain = ctx.createGain();
        chirpGain.gain.setValueAtTime(0, now);

        // 4. Stereo Panning Node to distribute crickets across the soundscape
        let panner = null;
        if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(panValue, now);
        }

        // Modulation connection: Modulator -> Gain -> Carrier Frequency
        modulator.connect(modulatorGain);
        modulatorGain.connect(carrier.frequency);

        // Main signal connection
        if (panner) {
            carrier.connect(chirpGain);
            chirpGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            carrier.connect(chirpGain);
            chirpGain.connect(this.masterGain);
        }

        // Start oscillators
        carrier.start(now);
        modulator.start(now);

        // Keep track of active gains so we can clean up if turned off
        this.cricketGains.push(chirpGain);

        // Schedule the chirp envelope:
        // A single chirp consists of a rapid fade in, sustain, and decay
        chirpGain.gain.setValueAtTime(0, now);
        chirpGain.gain.linearRampToValueAtTime(0.015, now + 0.02); // Soft volume to prevent piercing
        chirpGain.gain.setValueAtTime(0.015, now + chirpDuration - 0.05);
        chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + chirpDuration);

        // Stop and clean up nodes after playback
        setTimeout(() => {
            try {
                carrier.stop();
                modulator.stop();
                carrier.disconnect();
                modulator.disconnect();
                modulatorGain.disconnect();
                if (panner) panner.disconnect();
                chirpGain.disconnect();
            } catch (e) {}

            // Remove from tracking array
            const idx = this.cricketGains.indexOf(chirpGain);
            if (idx > -1) this.cricketGains.splice(idx, 1);
        }, (chirpDuration + 0.2) * 1000);
    }

    scheduleCricketChirps() {
        if (!this.cricketsActive) return;

        // Schedule next chirp in 1 to 4.5 seconds (randomized interval)
        const nextChirpDelay = 1000 + Math.random() * 3500;

        this.cricketTimer = setTimeout(() => {
            if (this.isPlaying && this.ctx && this.ctx.state === 'running') {
                // Spawn 1-2 crickets in parallel with slight differences to simulate a multi-distance field
                const numCrickets = Math.random() > 0.6 ? 2 : 1;
                for (let i = 0; i < numCrickets; i++) {
                    const freq = 3600 + Math.random() * 800; // 3.6kHz - 4.4kHz
                    const duration = 0.8 + Math.random() * 1.2; // 0.8s - 2.0s chirp train
                    const pulses = 45 + Math.random() * 20; // 45Hz - 65Hz pulses
                    const detune = (Math.random() - 0.5) * 50;
                    const pan = (Math.random() - 0.5) * 1.8; // Left to right panorama

                    // Delay secondary crickets slightly to stagger their start times
                    const startDelay = i * (100 + Math.random() * 300);
                    setTimeout(() => {
                        this.createSingleCricket(freq, duration, pulses, detune, pan);
                    }, startDelay);
                }
            }
            this.scheduleCricketChirps();
        }, nextChirpDelay);
    }

    start() {
        this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        this.isPlaying = true;
        // Fade in master gain smoothly over 3 seconds
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(1.0, now + 3.0);
    }

    stop() {
        if (!this.ctx) return;
        
        this.isPlaying = false;
        // Fade out master gain smoothly over 1.5 seconds
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0.0, now + 1.5);
    }

    cleanup() {
        this.cricketsActive = false;
        if (this.cricketTimer) clearTimeout(this.cricketTimer);
        
        // Stop any active oscillators
        try {
            if (this.windNoise) this.windNoise.stop();
            if (this.windLFO1) this.windLFO1.stop();
            if (this.windLFO2) this.windLFO2.stop();
        } catch (e) {}

        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
    }
}
