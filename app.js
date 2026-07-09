// --- Simulation States ---
const PHASE_INTRO = 'INTRO';
const PHASE_SUMMONING = 'SUMMONING';
const PHASE_PAUSE = 'PAUSE';
const PHASE_CONVERGENCE = 'CONVERGENCE';
const PHASE_BUTTON_BIRTH = 'BUTTON_BIRTH';
const PHASE_BLACKOUT = 'BLACKOUT';
const PHASE_REVEAL = 'REVEAL';
const PHASE_FINAL = 'FINAL';

let currentPhase = PHASE_INTRO;
let canvas, ctx;
let width, height;

// Simulation collections
let fireflies = [];
let sparks = []; // Energy sparks during convergence
let buttonSparkles = []; // Sparkles around the cinematic button
let revealParticles = []; // Thousands of dust particles for image reveal

// Image loading state
let memoryImage = new Image();
let isImageLoaded = false;
let imageFitRect = { x: 0, y: 0, w: 0, h: 0 };

// Sound instance
const ambience = new NightAmbience();

// Interaction states
let isPointerDown = false;
let pointerX = 0;
let pointerY = 0;
let isAttracting = false;
let pointerTimer = null;
let attractionRippleRadius = 0;
let lastTapTime = 0;

// Phase transition timing
let phaseTimer = 0;
let revealStartTime = 0;
const MAX_FIREFLIES = 120;

// Organic pseudo-noise helper
// Generates smooth sinusoidal waves using detuned wave frequencies
function getNoise(time, seed) {
    return Math.sin(time * 0.0035 + seed) * 0.55 + 
           Math.sin(time * 0.0093 + seed * 1.6) * 0.32 + 
           Math.sin(time * 0.0217 + seed * 2.4) * 0.13;
}

// --- Firefly Class ---
class Firefly {
    constructor(x, y, fromEdge = false) {
        this.x = x;
        this.y = y;
        this.seed = Math.random() * 1000;
        
        // Randomize characteristics for uniqueness
        this.baseSize = 1.6 + Math.random() * 2.2;
        this.size = this.baseSize;
        this.angle = Math.random() * Math.PI * 2;
        this.speedMultiplier = 0.35 + Math.random() * 0.55;
        this.vx = Math.cos(this.angle) * this.speedMultiplier;
        this.vy = Math.sin(this.angle) * this.speedMultiplier;
        
        // Bioluminescence pulsing
        this.pulseSpeed = 0.012 + Math.random() * 0.028;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.maxBrightness = 0.7 + Math.random() * 0.3;
        this.glowColor = this.getRandomGlowColor();
        
        // Flight states
        this.pauseTimer = 0;
        this.trail = [];
        this.maxTrailLength = 10 + Math.floor(Math.random() * 12);
        
        this.opacity = 0;
        this.fadingIn = true;
        this.fadingOut = false;
        this.fadeSpeed = 0.025;

        // If spawned from edge in final scene, fly slower and stay thin
        if (fromEdge) {
            this.speedMultiplier *= 0.6;
            this.maxBrightness *= 0.7;
        }
    }

    getRandomGlowColor() {
        // High quality warm yellow-greens (Hue: 64 to 82)
        const h = 64 + Math.floor(Math.random() * 18);
        const s = 95 + Math.floor(Math.random() * 5);
        const l = 62 + Math.floor(Math.random() * 10);
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    update() {
        // 1. Handle fade states
        if (this.fadingIn) {
            this.opacity += this.fadeSpeed;
            if (this.opacity >= 1) {
                this.opacity = 1;
                this.fadingIn = false;
            }
        } else if (this.fadingOut) {
            this.opacity -= this.fadeSpeed;
            if (this.opacity <= 0) {
                this.opacity = 0;
                return false; // Safely delete
            }
        }

        // 2. Add position to trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }

        // 3. Movement depending on simulation phase
        if (currentPhase === PHASE_CONVERGENCE) {
            // SPIRAL CONVERGENCE MOVEMENT:
            const centerX = width / 2;
            const centerY = height / 2;
            const dx = centerX - this.x;
            const dy = centerY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 8) {
                const angleToCenter = Math.atan2(dy, dx);
                // Dynamic spiraling offset: tighter spiral as it gets closer
                const spiralOffset = Math.PI / 2 + 0.12; 
                const spiralAngle = angleToCenter + spiralOffset;

                // Fireflies speed up as they converge
                const speed = 1.2 + (120 / (dist + 30)); 
                
                this.vx += (Math.cos(spiralAngle) * speed * 0.4 + (dx / dist) * 0.15 - this.vx) * 0.08;
                this.vy += (Math.sin(spiralAngle) * speed * 0.4 + (dy / dist) * 0.15 - this.vy) * 0.08;
            } else {
                // When reached the core, dissolve/fade out immediately
                this.startFadeOut();
                // Spawn a few bright golden energy sparks from center
                for (let i = 0; i < 3; i++) {
                    sparks.push(new ConvergenceSpark(this.x, this.y));
                }
            }

            this.x += this.vx;
            this.y += this.vy;

        } else if (isAttracting && currentPhase === PHASE_SUMMONING) {
            // Pointer attraction mode
            const dx = pointerX - this.x;
            const dy = pointerY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                const force = Math.min(1.4, 75 / (dist + 20));
                this.vx += (dx / dist) * force * 0.16;
                this.vy += (dy / dist) * force * 0.16;
                
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const maxSpeed = 3.2;
                if (speed > maxSpeed) {
                    this.vx = (this.vx / speed) * maxSpeed;
                    this.vy = (this.vy / speed) * maxSpeed;
                }
            }
            this.x += this.vx;
            this.y += this.vy;
            this.pauseTimer = 0;

        } else {
            // Normal organic flight: Perlin-like noise steering
            if (this.pauseTimer > 0) {
                this.pauseTimer--;
                this.vx *= 0.85;
                this.vy *= 0.85;
                this.x += this.vx;
                this.y += this.vy;
            } else {
                const noiseVal = getNoise(Date.now(), this.seed);
                this.angle += noiseVal * 0.07; // Steer based on noise
                
                const speed = (0.28 + Math.sin(Date.now() * 0.0008 + this.seed) * 0.15) * this.speedMultiplier;
                
                const targetVx = Math.cos(this.angle) * speed;
                const targetVy = Math.sin(this.angle) * speed;
                
                this.vx += (targetVx - this.vx) * 0.06;
                this.vy += (targetVy - this.vy) * 0.06;
                
                this.x += this.vx;
                this.y += this.vy;

                // Small chance to pause organically
                if (Math.random() < 0.0028) {
                    this.pauseTimer = 35 + Math.floor(Math.random() * 70);
                    this.angle = Math.random() * Math.PI * 2;
                }
            }
        }

        // Apply separation (only during Summoning and Final phases)
        if (currentPhase === PHASE_SUMMONING || currentPhase === PHASE_FINAL) {
            this.applySeparation();
        }

        // Boundary reflection
        const pad = 40;
        const steerForce = 0.06;
        if (this.x < pad) this.vx += steerForce;
        if (this.x > width - pad) this.vx -= steerForce;
        if (this.y < pad) this.vy += steerForce;
        if (this.y > height - pad) this.vy -= steerForce;

        this.x = Math.max(3, Math.min(width - 3, this.x));
        this.y = Math.max(3, Math.min(height - 3, this.y));

        this.pulsePhase += this.pulseSpeed;
        return true;
    }

    applySeparation() {
        const minDistance = 22;
        const pushForce = 0.05;
        
        for (let i = 0; i < fireflies.length; i++) {
            const other = fireflies[i];
            if (other === this || other.fadingOut) continue;

            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDistance && dist > 0) {
                const ratio = (minDistance - dist) / minDistance;
                this.vx += (dx / dist) * ratio * pushForce;
                this.vy += (dy / dist) * ratio * pushForce;
            }
        }
    }

    draw() {
        // Organic pulse envelope
        const sinVal = Math.sin(this.pulsePhase) * 0.5 + 0.5;
        const pulseRatio = Math.pow(sinVal, 2.5); // Rapid flash, slow dim
        const currentOpacity = this.opacity * pulseRatio * this.maxBrightness;
        
        if (currentOpacity <= 0.01) return;

        // Render Trails
        if (this.trail.length > 1) {
            ctx.save();
            ctx.lineWidth = this.baseSize * 0.45;
            ctx.lineCap = 'round';
            
            for (let i = 1; i < this.trail.length; i++) {
                const p1 = this.trail[i - 1];
                const p2 = this.trail[i];
                const trailRatio = i / this.trail.length;
                
                // Spiral trails are longer and brighter
                let opacityScale = 0.2;
                if (currentPhase === PHASE_CONVERGENCE) {
                    opacityScale = 0.55 * trailRatio; 
                }
                const trailOpacity = currentOpacity * opacityScale * trailRatio;
                
                ctx.strokeStyle = currentPhase === PHASE_CONVERGENCE ? 'rgba(251, 191, 36, 0.4)' : this.glowColor;
                ctx.globalAlpha = trailOpacity;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Render Glowing Core & Bloom
        ctx.save();
        ctx.globalAlpha = currentOpacity;

        // Color adjustments for convergence phase (shift green to warm gold)
        const activeColor = currentPhase === PHASE_CONVERGENCE ? 'rgb(251, 191, 36)' : this.glowColor;

        // 1. Large soft outer bloom
        const bloomRadius = this.baseSize * (currentPhase === PHASE_CONVERGENCE ? 22 : 14);
        const bloomGrad = ctx.createRadialGradient(this.x, this.y, this.baseSize, this.x, this.y, bloomRadius);
        bloomGrad.addColorStop(0, activeColor);
        bloomGrad.addColorStop(0.25, activeColor.replace('hsl', 'hsla').replace('rgb', 'rgba').replace(')', ', 0.3)'));
        bloomGrad.addColorStop(0.55, activeColor.replace('hsl', 'hsla').replace('rgb', 'rgba').replace(')', ', 0.07)'));
        bloomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = bloomGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, bloomRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Medium glow core
        const glowRadius = this.baseSize * 4;
        const glowGrad = ctx.createRadialGradient(this.x, this.y, this.baseSize * 0.5, this.x, this.y, glowRadius);
        glowGrad.addColorStop(0, '#ffffff');
        glowGrad.addColorStop(0.3, activeColor);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // 3. Bright white hot center
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = this.opacity * 0.95;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.baseSize * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    startFadeOut() {
        this.fadingOut = true;
        this.fadingIn = false;
        this.fadeSpeed = 0.04;
    }
}

// --- Convergence Energy Spark Class ---
class ConvergenceSpark {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 1.0 + Math.random() * 2.5;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        
        this.size = 1.0 + Math.random() * 1.5;
        this.opacity = 0.9 + Math.random() * 0.1;
        this.decay = 0.015 + Math.random() * 0.02;
    }

    update() {
        // Swirl around center slightly
        const dx = width/2 - this.x;
        const dy = height/2 - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > 2) {
            const pull = 0.03;
            this.vx += (dx / dist) * pull + (-dy / dist) * 0.06;
            this.vy += (dy / dist) * pull + (dx / dist) * 0.06;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.opacity -= this.decay;
        return this.opacity > 0;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = '#fbbf24'; // Warm golden-yellow spark
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// --- Button Sparkle Class ---
class ButtonSparkle {
    constructor(bx, by, bw, bh) {
        this.bx = bx;
        this.by = by;
        this.bw = bw;
        this.bh = bh;
        this.reset();
    }

    reset() {
        // Spawn randomly around the border outline of the button
        const perimeter = 2 * this.bw + 2 * this.bh;
        const pos = Math.random() * perimeter;
        
        if (pos < this.bw) { // Top edge
            this.x = this.bx - this.bw/2 + pos;
            this.y = this.by - this.bh/2;
            this.vx = (Math.random() - 0.5) * 0.2;
            this.vy = -0.15 - Math.random() * 0.25;
        } else if (pos < this.bw + this.bh) { // Right edge
            this.x = this.bx + this.bw/2;
            this.y = this.by - this.bh/2 + (pos - this.bw);
            this.vx = 0.15 + Math.random() * 0.25;
            this.vy = (Math.random() - 0.5) * 0.2;
        } else if (pos < 2 * this.bw + this.bh) { // Bottom edge
            this.x = this.bx - this.bw/2 + (pos - this.bw - this.bh);
            this.y = this.by + this.bh/2;
            this.vx = (Math.random() - 0.5) * 0.2;
            this.vy = 0.15 + Math.random() * 0.25;
        } else { // Left edge
            this.x = this.bx - this.bw/2;
            this.y = this.by - this.bh/2 + (pos - 2*this.bw - this.bh);
            this.vx = -0.15 - Math.random() * 0.25;
            this.vy = (Math.random() - 0.5) * 0.2;
        }

        this.size = 0.6 + Math.random() * 1.4;
        this.opacity = 0;
        this.maxOpacity = 0.4 + Math.random() * 0.4;
        this.life = 0;
        this.maxLife = 60 + Math.floor(Math.random() * 60); // 1-2s life
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        // Slow float drift deceleration
        this.vx *= 0.98;
        this.vy *= 0.98;

        this.life++;
        
        // Fade in and out envelope
        if (this.life < this.maxLife * 0.2) {
            this.opacity = this.maxOpacity * (this.life / (this.maxLife * 0.2));
        } else {
            this.opacity = this.maxOpacity * (1 - (this.life - this.maxLife*0.2) / (this.maxLife * 0.8));
        }

        if (this.life >= this.maxLife) {
            this.reset();
        }
    }

    draw() {
        if (this.opacity <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        // Small gold sparks
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// --- Cinematic Timeline Controller ---

function init() {
    canvas = document.getElementById('simulation-canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: false });

    // Handle high DPI crisp drawing
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
        recalculateImageFit();
    });

    // Pre-load the user-supplied forest image
    memoryImage.src = 'memory.jpg';
    memoryImage.onload = () => {
        isImageLoaded = true;
        recalculateImageFit();
    };

    // Configure interactions and event handlers
    setupInteractions();

    // Start Phase 1 Timeline
    startIntroPhase();

    // Start rendering frame loop
    requestAnimationFrame(tick);
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
}

function recalculateImageFit() {
    if (!isImageLoaded) return;
    
    const canvasRatio = width / height;
    const imgRatio = memoryImage.width / memoryImage.height;
    
    let fitW, fitH, fitX, fitY;
    
    if (canvasRatio > imgRatio) {
        // Landscape viewport, portrait image (fit to height)
        fitH = height;
        fitW = height * imgRatio;
        fitX = (width - fitW) / 2;
        fitY = 0;
    } else {
        // Portrait viewport, landscape image (fit to width)
        fitW = width;
        fitH = width / imgRatio;
        fitX = 0;
        fitY = (height - fitH) / 2;
    }
    
    imageFitRect = { x: fitX, y: fitY, w: fitW, h: fitH };
}

// --- Phase 1: Intro Overlay ---
function startIntroPhase() {
    currentPhase = PHASE_INTRO;
    
    const overlay = document.getElementById('intro-overlay');
    overlay.classList.add('intro-active');

    // Exactly 5 seconds visible
    setTimeout(() => {
        overlay.classList.add('intro-fade-out');
        
        // Remove from DOM and reveal logo after 1s fade-out ends
        setTimeout(() => {
            overlay.remove();
            
            // Reveal watermark logo
            const logo = document.getElementById('watermark-logo');
            if (logo) logo.classList.remove('logo-hidden');
            
            // Go to summoning phase (user can start summoning)
            currentPhase = PHASE_SUMMONING;
        }, 1000);
    }, 5000);
}

// --- Phase 2: Summoning & Pause ---
function addFirefly(x, y) {
    if (currentPhase !== PHASE_SUMMONING && currentPhase !== PHASE_FINAL) return;
    
    if (currentPhase === PHASE_SUMMONING) {
        // Verify we don't exceed the limit
        const activeCount = fireflies.filter(f => !f.fadingOut).length;
        if (activeCount >= MAX_FIREFLIES) {
            return;
        }

        // Trigger ambient sound immediately upon the first touch
        if (!ambience.isPlaying) {
            ambience.start();
        }

        const f = new Firefly(x, y);
        fireflies.push(f);

        // Check if limit reached
        if (fireflies.filter(f => !f.fadingOut).length >= MAX_FIREFLIES) {
            triggerPausePhase();
        }
    } else {
        // Final scene has no limit constraints
        fireflies.push(new Firefly(x, y));
    }
}

function triggerPausePhase() {
    currentPhase = PHASE_PAUSE;
    
    // Let fireflies fly normally for 2 seconds
    setTimeout(() => {
        // Fade ambience sounds out over 3 seconds
        ambience.stop();
        
        // Begin spiral convergence
        startConvergencePhase();
    }, 2000);
}

// --- Phase 3: Spiral Convergence ---
function startConvergencePhase() {
    currentPhase = PHASE_CONVERGENCE;
    sparks = [];
    phaseTimer = Date.now();
    
    // Increase trail length and steer behavior inside class update loop
    fireflies.forEach(f => {
        f.maxTrailLength = 35; // Double the trail length
        f.fadeSpeed = 0.015; // Slow fadeout
    });
}

// --- Phase 4: Button Birth ---
function startButtonBirthPhase() {
    currentPhase = PHASE_BUTTON_BIRTH;
    fireflies = [];
    sparks = [];
    
    // Reveal golden magical button
    const btn = document.getElementById('cinematic-btn');
    btn.classList.remove('btn-hidden');

    // Initialize button boundary sparkles
    // Find button rect coordinates
    const btnRect = btn.getBoundingClientRect();
    const bx = btnRect.left + btnRect.width / 2;
    const by = btnRect.top + btnRect.height / 2;
    
    buttonSparkles = [];
    for (let i = 0; i < 40; i++) {
        buttonSparkles.push(new ButtonSparkle(bx, by, btnRect.width, btnRect.height));
    }
}

// --- Phase 5: Button Triggered Transition ---
function handleButtonAction() {
    const btn = document.getElementById('cinematic-btn');
    btn.classList.add('fade-out');
    
    const logo = document.getElementById('watermark-logo');
    if (logo) logo.classList.add('logo-hidden');
    
    // Make sure sounds fade
    ambience.stop();

    currentPhase = PHASE_BLACKOUT;
    
    // Screen blackout for 800ms
    setTimeout(() => {
        btn.remove();
        if (logo) logo.remove();
        startImageReveal();
    }, 1200);
}

// --- Phase 6: Particle Image Reveal ---
function startImageReveal() {
    currentPhase = PHASE_REVEAL;
    revealStartTime = Date.now();
    revealParticles = [];

    if (!isImageLoaded) {
        // Fallback if image fails to load
        setTimeout(() => {
            currentPhase = PHASE_FINAL;
            ambience.start();
        }, 3000);
        return;
    }

    // Extract colors & coordinates using offscreen scaling
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    
    // Scale resolution dynamically to guarantee 60 FPS
    // Scale grid based on viewport size, ~9,000 particles max
    const gridW = 120;
    const gridH = Math.round(120 * (memoryImage.height / memoryImage.width));
    
    offCanvas.width = gridW;
    offCanvas.height = gridH;
    offCtx.drawImage(memoryImage, 0, 0, gridW, gridH);
    
    const imgData = offCtx.getImageData(0, 0, gridW, gridH);
    const data = imgData.data;

    // Center fit bounding rect details
    const fitX = imageFitRect.x;
    const fitY = imageFitRect.y;
    const fitW = imageFitRect.w;
    const fitH = imageFitRect.h;

    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const idx = (y * gridW + x) * 4;
            const r = data[idx];
            const g = data[idx+1];
            const b = data[idx+2];
            const a = data[idx+3];

            // Ignore dark or fully transparent pixels to optimize count
            if (a < 120 || (r < 12 && g < 12 && b < 12)) continue;

            // Map grid position to final canvas layout coordinate
            const targetX = fitX + (x / gridW) * fitW;
            const targetY = fitY + (y / gridH) * fitH;

            revealParticles.push({
                startX: width / 2, // Fly from button center location
                startY: height / 2,
                x: width / 2,
                y: height / 2,
                targetX: targetX,
                targetY: targetY,
                colorR: r,
                colorG: g,
                colorB: b,
                delay: Math.random() * 1400, // Stagger delays up to 1.4s
                duration: 2200 + Math.random() * 1200, // 2.2s - 3.4s travel time
                size: 0.8 + Math.random() * 1.4,
                seed: Math.random() * 100,
                opacity: 0,
                completed: false
            });
        }
    }
}

// --- Phase 7: Final Scene ---
function startFinalScene() {
    currentPhase = PHASE_FINAL;
    revealParticles = [];
    
    // Slow fade ambient audio back in over 5 seconds
    ambience.start();
}

// Spawns occasional fireflies from random screen edges
function handleFinalEdgeSpawns() {
    if (fireflies.length >= 15) return; // Cap at 15 active ones to prevent obscuring photo
    
    if (Math.random() < 0.015) { // Slow spawn chance
        let x, y;
        const edge = Math.floor(Math.random() * 4);
        
        switch (edge) {
            case 0: // Top
                x = Math.random() * width;
                y = -10;
                break;
            case 1: // Right
                x = width + 10;
                y = Math.random() * height;
                break;
            case 2: // Bottom
                x = Math.random() * width;
                y = height + 10;
                break;
            case 3: // Left
                x = -10;
                y = Math.random() * height;
                break;
        }

        const f = new Firefly(x, y, true);
        f.maxTrailLength = 8;
        fireflies.push(f);
    }
}

// --- Event & Interaction Handlers ---

function setupInteractions() {
    // 1. Pointer Down
    window.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#cinematic-btn')) {
            return;
        }

        isPointerDown = true;
        pointerX = e.clientX;
        pointerY = e.clientY;

        // Double-tap swarm spawning
        const now = Date.now();
        const tapDelay = now - lastTapTime;
        if (tapDelay < 300 && currentPhase === PHASE_SUMMONING) {
            spawnSwarm(pointerX, pointerY);
            lastTapTime = 0;
            isPointerDown = false;
            return;
        }
        lastTapTime = now;

        // Start long-press attraction timer
        clearTimeout(pointerTimer);
        pointerTimer = setTimeout(() => {
            if (isPointerDown && currentPhase === PHASE_SUMMONING) {
                isAttracting = true;
                attractionRippleRadius = 0;
            }
        }, 450);
    });

    // 2. Pointer Move
    window.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        pointerX = e.clientX;
        pointerY = e.clientY;
    });

    // 3. Pointer Up
    window.addEventListener('pointerup', () => {
        clearTimeout(pointerTimer);
        
        if (!isAttracting && isPointerDown && currentPhase === PHASE_SUMMONING) {
            addFirefly(pointerX, pointerY);
        }
        
        isPointerDown = false;
        isAttracting = false;
        attractionRippleRadius = 0;
    });

    window.addEventListener('pointercancel', () => {
        clearTimeout(pointerTimer);
        isPointerDown = false;
        isAttracting = false;
        attractionRippleRadius = 0;
    });

    // Magical button action hookup
    document.getElementById('cinematic-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleButtonAction();
    });
}

function spawnSwarm(x, y) {
    const activeCount = fireflies.filter(f => !f.fadingOut).length;
    // Fit swarm inside remaining headroom
    const count = Math.min(MAX_FIREFLIES - activeCount, 6 + Math.floor(Math.random() * 4));
    
    if (count <= 0) return;

    if (!ambience.isPlaying) {
        ambience.start();
    }

    for (let i = 0; i < count; i++) {
        const radius = 12 + Math.random() * 40;
        const angle = Math.random() * Math.PI * 2;
        const ox = Math.cos(angle) * radius;
        const oy = Math.sin(angle) * radius;

        setTimeout(() => {
            addFirefly(
                Math.max(10, Math.min(width - 10, x + ox)),
                Math.max(10, Math.min(height - 10, y + oy))
            );
        }, i * 50);
    }
}

// --- Main Simulation Frame Tick ---

function tick() {
    // Canvas is strictly clear and transparency-driven (pure black DOM body reveals through)
    ctx.clearRect(0, 0, width, height);

    // 1. Process Summoning long press attraction ripple
    if (isAttracting && currentPhase === PHASE_SUMMONING) {
        drawAttractionRipple();
    }

    // 2. Process Convergence Sparks
    if (currentPhase === PHASE_CONVERGENCE) {
        for (let i = sparks.length - 1; i >= 0; i--) {
            const spark = sparks[i];
            const active = spark.update();
            if (!active) {
                sparks.splice(i, 1);
            } else {
                spark.draw();
            }
        }
    }

    // 3. Process Button Sparkles (fading around golden button boundary)
    if (currentPhase === PHASE_BUTTON_BIRTH) {
        buttonSparkles.forEach(s => {
            s.update();
            s.draw();
        });
    }

    // 4. Update and Draw active Fireflies (Summoning, Pause, Convergence, and Final Scene)
    if (currentPhase === PHASE_SUMMONING || 
        currentPhase === PHASE_PAUSE || 
        currentPhase === PHASE_CONVERGENCE || 
        currentPhase === PHASE_FINAL) {
        
        for (let i = fireflies.length - 1; i >= 0; i--) {
            const f = fireflies[i];
            const active = f.update();
            if (!active) {
                fireflies.splice(i, 1);
            } else {
                f.draw();
            }
        }

        // Convergence Check: When all fireflies have merged into the center, trigger button birth
        if (currentPhase === PHASE_CONVERGENCE) {
            const activeCount = fireflies.filter(f => !f.fadingOut).length;
            const timeElapsed = Date.now() - phaseTimer;
            
            // Limit convergence to 6.5s safety threshold or when count hits 0
            if (activeCount === 0 || timeElapsed > 6500) {
                startButtonBirthPhase();
            }
        }

        // Handle edge spawning in the final scene
        if (currentPhase === PHASE_FINAL) {
            handleFinalEdgeSpawns();
        }
    }

    // 5. Update and Draw Particle Image Reveal
    if (currentPhase === PHASE_REVEAL) {
        const revealTimer = Date.now() - revealStartTime;
        let allSettled = true;

        // Fades in the actual forest image beneath the particles (Starts at 3.5s, finishes at 5s)
        let imgAlpha = 0;
        if (revealTimer > 3500) {
            imgAlpha = Math.min(1.0, (revealTimer - 3500) / 1500);
        }

        if (imgAlpha > 0 && isImageLoaded) {
            ctx.save();
            ctx.globalAlpha = imgAlpha;
            ctx.drawImage(memoryImage, imageFitRect.x, imageFitRect.y, imageFitRect.w, imageFitRect.h);
            ctx.restore();
        }

        // Draw Dust Particles assembling image
        ctx.save();
        for (let i = 0; i < revealParticles.length; i++) {
            const p = revealParticles[i];
            const elapsed = Date.now() - (revealStartTime + p.delay);

            if (elapsed < 0) {
                allSettled = false;
                continue; // Wait for stagger delay
            }

            let t = elapsed / p.duration;
            if (t > 1.0) {
                t = 1.0;
                p.completed = true;
            } else {
                allSettled = false;
            }

            // Cubic Ease Out path
            const easeT = 1.0 - Math.pow(1.0 - t, 3.0);

            // Sine wave turbulence
            const turbulence = Math.sin(t * Math.PI) * (1.0 - easeT) * 35;
            p.x = p.startX + (p.targetX - p.startX) * easeT + Math.sin(t * Math.PI * 2 + p.seed) * turbulence;
            p.y = p.startY + (p.targetY - p.startY) * easeT + Math.cos(t * Math.PI * 2 + p.seed) * turbulence;

            // Opacity: fade in quickly at beginning
            p.opacity = Math.min(1.0, elapsed / 300);
            
            // Fade particles out completely after image starts forming
            if (revealTimer > 4000) {
                p.opacity *= Math.max(0, 1.0 - (revealTimer - 4000) / 1000);
            }

            if (p.opacity <= 0.01) continue;

            // Interpolate color from gold (251, 191, 36) to target pixel RGB
            const r = Math.round(251 + (p.colorR - 251) * easeT);
            const g = Math.round(191 + (p.colorG - 191) * easeT);
            const b = Math.round(36 + (p.colorB - 36) * easeT);

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 6s reveal total time, transition to final scene
        if (revealTimer > 5500 || allSettled) {
            startFinalScene();
        }
    }

    // 6. Draw background image in Final Scene
    if (currentPhase === PHASE_FINAL && isImageLoaded) {
        ctx.save();
        ctx.drawImage(memoryImage, imageFitRect.x, imageFitRect.y, imageFitRect.w, imageFitRect.h);
        ctx.restore();

        // Redraw fireflies on top of image
        for (let i = 0; i < fireflies.length; i++) {
            fireflies[i].draw();
        }
    }

    requestAnimationFrame(tick);
}

function drawAttractionRipple() {
    ctx.save();
    attractionRippleRadius = (attractionRippleRadius + 1.25) % 65;
    
    const count = 3;
    for (let i = 0; i < count; i++) {
        const r = (attractionRippleRadius + (i * (65 / count))) % 65;
        const opacity = Math.max(0, 0.25 * (1.0 - r / 65));
        
        ctx.strokeStyle = `rgba(190, 242, 100, ${opacity})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    ctx.fillStyle = 'rgba(190, 242, 100, 0.15)';
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Start simulation when DOM finishes loading
window.onload = init;
