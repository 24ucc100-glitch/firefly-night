class NightAmbience {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        
        // Wind Nodes
        this.windNoise = null;
        this.windFilter = null;
        this.windGain = null;
        this.windLFOFreq = null;
        this.windLFOGain = null;

        // Drone Nodes (Warm cinematic pad)
        this.droneOscs = [];
        this.droneFilter = null;
        this.droneGain = null;
        this.droneLFO = null;

        // Cricket variables
        this.cricketsActive = false;
        this.cricketTimer = null;
        this.cricketGains = [];
        this.cricketVolume = 0.018;

        // Chimes variables
        this.chimesActive = false;
        this.chimesTimer = null;

        this.isPlaying = false;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // Master Gain Node for controlling global fades (fade-out/fade-in)
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.setupWind();
        this.setupDrone();
        this.setupCrickets();
        this.setupChimes();

        this.isInitialized = true;
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

        // 2. Resonant Lowpass Filter for Wind
        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.Q.setValueAtTime(1.5, ctx.currentTime);
        this.windFilter.frequency.setValueAtTime(160, ctx.currentTime); // Low baseline frequency

        // 3. Modulate Wind Cutoff Frequency with slow LFO
        this.windLFOFreq = ctx.createOscillator();
        this.windLFOFreq.frequency.setValueAtTime(0.05, ctx.currentTime); // 20s wave
        const lfoFreqGain = ctx.createGain();
        lfoFreqGain.gain.setValueAtTime(80, ctx.currentTime); // Swing filter cutoff by 80Hz
        this.windLFOFreq.connect(lfoFreqGain);
        lfoFreqGain.connect(this.windFilter.frequency);

        // 4. Modulate Wind Gain for volume swells
        this.windGain = ctx.createGain();
        this.windGain.gain.setValueAtTime(0.06, ctx.currentTime); // Low base volume
        
        this.windLFOGain = ctx.createOscillator();
        this.windLFOGain.frequency.setValueAtTime(0.033, ctx.currentTime); // 30s volume swells
        const lfoGainGain = ctx.createGain();
        lfoGainGain.gain.setValueAtTime(0.05, ctx.currentTime); // Swing gain by 0.05
        this.windLFOGain.connect(lfoGainGain);
        lfoGainGain.connect(this.windGain.gain);

        // Connections
        this.windNoise.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.masterGain);

        this.windNoise.start(0);
        this.windLFOFreq.start(0);
        this.windLFOGain.start(0);
    }

    setupDrone() {
        const ctx = this.ctx;

        // Cinematic low-frequency harmonic pad
        this.droneFilter = ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.setValueAtTime(110, ctx.currentTime); // Dark lowpass

        this.droneGain = ctx.createGain();
        this.droneGain.gain.setValueAtTime(0.06, ctx.currentTime); // Very quiet hum

        // Three low frequency oscillators creating a rich major/neutral chord
        const freqs = [55.00, 110.00, 165.00]; // A1, A2, E3
        const types = ['sine', 'triangle', 'sine'];

        for (let i = 0; i < freqs.length; i++) {
            const osc = ctx.createOscillator();
            osc.type = types[i];
            osc.frequency.setValueAtTime(freqs[i], ctx.currentTime);
            // Stagger phase slightly via detune
            osc.detune.setValueAtTime((Math.random() - 0.5) * 8, ctx.currentTime);
            
            const oGain = ctx.createGain();
            oGain.gain.setValueAtTime(0.3, ctx.currentTime);
            
            osc.connect(oGain);
            oGain.connect(this.droneFilter);
            
            osc.start(0);
            this.droneOscs.push({ osc, oGain });
        }

        // Modulate Drone volume with slow LFO
        this.droneLFO = ctx.createOscillator();
        this.droneLFO.frequency.setValueAtTime(0.02, ctx.currentTime); // 50s wave
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.02, ctx.currentTime); // Subtle volume shift
        this.droneLFO.connect(lfoGain);
        lfoGain.connect(this.droneGain.gain);

        this.droneFilter.connect(this.droneGain);
        this.droneGain.connect(this.masterGain);

        this.droneLFO.start(0);
    }

    setupCrickets() {
        this.cricketsActive = true;
        this.scheduleCricketChirps();
    }

    createSingleCricket(frequency, chirpDuration, pulseRate, detune, panValue) {
        if (!this.ctx || this.ctx.state === 'suspended' || !this.cricketsActive) return;

        const ctx = this.ctx;
        const now = ctx.currentTime;

        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(frequency, now);
        carrier.detune.setValueAtTime(detune, now);

        const modulator = ctx.createOscillator();
        modulator.type = 'sawtooth';
        modulator.frequency.setValueAtTime(pulseRate, now);

        const modulatorGain = ctx.createGain();
        modulatorGain.gain.setValueAtTime(0.65, now);

        const chirpGain = ctx.createGain();
        chirpGain.gain.setValueAtTime(0, now);

        let panner = null;
        if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(panValue, now);
        }

        modulator.connect(modulatorGain);
        modulatorGain.connect(carrier.frequency);

        if (panner) {
            carrier.connect(chirpGain);
            chirpGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            carrier.connect(chirpGain);
            chirpGain.connect(this.masterGain);
        }

        carrier.start(now);
        modulator.start(now);

        this.cricketGains.push(chirpGain);

        // Smooth chirp amplitude envelope
        chirpGain.gain.setValueAtTime(0, now);
        chirpGain.gain.linearRampToValueAtTime(this.cricketVolume, now + 0.03);
        chirpGain.gain.setValueAtTime(this.cricketVolume, now + chirpDuration - 0.08);
        chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + chirpDuration);

        // Stop and clean nodes
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

            const idx = this.cricketGains.indexOf(chirpGain);
            if (idx > -1) this.cricketGains.splice(idx, 1);
        }, (chirpDuration + 0.2) * 1000);
    }

    scheduleCricketChirps() {
        if (!this.cricketsActive) return;

        // Random delay between chirp bursts (1.5s - 4s)
        const nextDelay = 1500 + Math.random() * 2500;

        this.cricketTimer = setTimeout(() => {
            if (this.isPlaying && this.ctx && this.ctx.state === 'running') {
                const count = Math.random() > 0.5 ? 2 : 1;
                for (let i = 0; i < count; i++) {
                    const freq = 3500 + Math.random() * 900; // 3.5kHz - 4.4kHz
                    const duration = 0.9 + Math.random() * 1.0; // 0.9s - 1.9s
                    const pulses = 45 + Math.random() * 20; // 45Hz - 65Hz pulse modulation
                    const detune = (Math.random() - 0.5) * 40;
                    const pan = (Math.random() - 0.5) * 1.7; // Stereo balance

                    const startDelay = i * (120 + Math.random() * 200);
                    setTimeout(() => {
                        this.createSingleCricket(freq, duration, pulses, detune, pan);
                    }, startDelay);
                }
            }
            this.scheduleCricketChirps();
        }, nextDelay);
    }

    setupChimes() {
        this.chimesActive = true;
        this.scheduleMagicalChimes();
    }

    playSingleChime() {
        if (!this.ctx || this.ctx.state === 'suspended' || !this.chimesActive) return;

        const ctx = this.ctx;
        const now = ctx.currentTime;
        
        // Base frequency of the chime (high crystal/magical register)
        const baseFreq = 1600 + Math.random() * 800; // 1.6kHz - 2.4kHz
        
        // 4 additive harmony partials simulating wind chime tubes
        const intervals = [1.0, 1.25, 1.5, 1.88]; // Root, Major Third, Perfect Fifth, Major Seventh
        const panValue = (Math.random() - 0.5) * 1.5;
        
        // Common Stereo Panner
        let panner = null;
        if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(panValue, now);
        }

        const chimeMasterGain = ctx.createGain();
        chimeMasterGain.gain.setValueAtTime(0, now);
        
        if (panner) {
            chimeMasterGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            chimeMasterGain.connect(this.masterGain);
        }

        // Trigger a series of 3-5 quick random bell strikes in a cluster (sweeping wind chimes)
        const strikeCount = 3 + Math.floor(Math.random() * 3);
        const activeOscs = [];

        for (let s = 0; s < strikeCount; s++) {
            const strikeDelay = s * (150 + Math.random() * 250); // Speed of chime sweep
            const strikeTime = now + (strikeDelay / 1000);
            
            intervals.forEach((ratio, idx) => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(baseFreq * ratio, strikeTime);
                osc.detune.setValueAtTime((Math.random() - 0.5) * 15, strikeTime);

                const oscGain = ctx.createGain();
                // Randomize strike intensity of each tube
                const intensity = (0.015 / intervals.length) * (1 - idx * 0.18);
                oscGain.gain.setValueAtTime(0, strikeTime);
                oscGain.gain.linearRampToValueAtTime(intensity, strikeTime + 0.005);
                oscGain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 1.8 + Math.random() * 1.2); // Smooth long ring

                osc.connect(oscGain);
                oscGain.connect(chimeMasterGain);
                
                osc.start(strikeTime);
                activeOscs.push(osc);
            });
        }

        // Master envelope for this entire chime event
        chimeMasterGain.gain.setValueAtTime(0, now);
        chimeMasterGain.gain.linearRampToValueAtTime(1.0, now + 0.02);
        chimeMasterGain.gain.setValueAtTime(1.0, now + 2.0);
        chimeMasterGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0);

        // Clean up oscillators after they fade out completely
        setTimeout(() => {
            activeOscs.forEach(osc => {
                try {
                    osc.stop();
                    osc.disconnect();
                } catch(e) {}
            });
            try {
                chimeMasterGain.disconnect();
                if (panner) panner.disconnect();
            } catch(e) {}
        }, 6000);
    }

    scheduleMagicalChimes() {
        if (!this.chimesActive) return;

        // Schedule chime play event every 15 to 40 seconds
        const nextChimeDelay = 15000 + Math.random() * 25000;

        this.chimesTimer = setTimeout(() => {
            if (this.isPlaying && this.ctx && this.ctx.state === 'running') {
                this.playSingleChime();
            }
            this.scheduleMagicalChimes();
        }, nextChimeDelay);
    }

    start() {
        this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        this.isPlaying = true;
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        
        // Smoothly fade in entire forest ambience over 5 seconds
        this.masterGain.gain.linearRampToValueAtTime(1.0, now + 5.0);
    }

    stop() {
        // Fade out ambience over 3 seconds
        this.fadeMaster(0.0, 3.0);
    }

    fadeMaster(targetVolume, duration) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(targetVolume, now + duration);
    }

    stopCrickets() {
        this.cricketsActive = false;
        if (this.cricketTimer) {
            clearTimeout(this.cricketTimer);
            this.cricketTimer = null;
        }
        if (this.ctx) {
            const now = this.ctx.currentTime;
            this.cricketGains.forEach(gainNode => {
                try {
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
                } catch (e) {}
            });
        }
    }

    resumeCrickets(lowVolume = false) {
        if (this.cricketsActive) return;
        this.cricketsActive = true;
        this.cricketVolume = lowVolume ? 0.006 : 0.018;
        this.scheduleCricketChirps();
    }

    setVolume(volumeFraction) {
        if (!this.isInitialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(volumeFraction, now + 0.1);
    }

    playTwinkle() {
        if (!this.isInitialized || !this.ctx || this.ctx.state === 'suspended' || !this.isPlaying) return;

        const ctx = this.ctx;
        const now = ctx.currentTime;
        
        const freq = 1800 + Math.random() * 1000;
        const panValue = (Math.random() - 0.5) * 1.5;
        
        let panner = null;
        if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(panValue, now);
        }

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.006, now + 0.004);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

        if (panner) {
            osc.connect(oscGain);
            oscGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            osc.connect(oscGain);
            oscGain.connect(this.masterGain);
        }

        osc.start(now);
        
        setTimeout(() => {
            try {
                osc.stop();
                osc.disconnect();
                oscGain.disconnect();
                if (panner) panner.disconnect();
            } catch (e) {}
        }, 800);
    }

    cleanup() {
        this.cricketsActive = false;
        this.chimesActive = false;
        this.isPlaying = false;
        
        if (this.cricketTimer) clearTimeout(this.cricketTimer);
        if (this.chimesTimer) clearTimeout(this.chimesTimer);
        
        try {
            if (this.windNoise) this.windNoise.stop();
            if (this.windLFOFreq) this.windLFOFreq.stop();
            if (this.windLFOGain) this.windLFOGain.stop();
            if (this.droneLFO) this.droneLFO.stop();
            this.droneOscs.forEach(o => o.osc.stop());
        } catch (e) {}

        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
            this.isInitialized = false;
        }
    }
}
