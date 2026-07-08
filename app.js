// Global variables & state
let canvas, ctx;
let width, height;
let fireflies = [];
let dustParticles = [];
let settings = {
    audioEnabled: false,
    moonlightEnabled: false,
    dustEnabled: true,
    maxFireflies: 150
};

// Interaction states
let isPointerDown = false;
let pointerX = 0;
let pointerY = 0;
let pointerStartTime = 0;
let pointerTimer = null;
let isAttracting = false;
let lastTapTime = 0;
let attractionRippleRadius = 0;

// Ambient Sound Instance
const ambience = new NightAmbience();

// --- Firefly Class ---
class Firefly {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        
        // Randomize characteristics for uniqueness
        this.baseSize = 1.8 + Math.random() * 2.2; // Size between 1.8px and 4.0px
        this.size = this.baseSize;
        
        this.angle = Math.random() * Math.PI * 2;
        this.speedMultiplier = 0.4 + Math.random() * 0.6; // Speed scale
        this.vx = Math.cos(this.angle) * this.speedMultiplier;
        this.vy = Math.sin(this.angle) * this.speedMultiplier;
        
        // Bioluminescence pulse parameters
        this.pulseSpeed = 0.015 + Math.random() * 0.035; // Pulse frequency (rads/frame)
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.maxBrightness = 0.75 + Math.random() * 0.25; // Max opacity 0.75-1.0
        this.glowColor = this.getRandomGlowColor();
        
        // Organic pauses
        this.pauseTimer = 0;
        this.driftAngle = 0;
        
        // Trail points history
        this.trail = [];
        this.maxTrailLength = 10 + Math.floor(Math.random() * 10); // Trail length 10-20
        
        // Fade in on creation, fade out on destruction
        this.opacity = 0;
        this.fadingIn = true;
        this.fadingOut = false;
        this.fadeSpeed = 0.02;
    }

    getRandomGlowColor() {
        // High quality warm yellow-greens:
        // Hue: 65 (yellow-green) to 85 (lime-green)
        // Saturation: 90% to 100%
        // Lightness: 60% to 75%
        const h = 65 + Math.floor(Math.random() * 20);
        const s = 90 + Math.floor(Math.random() * 10);
        const l = 60 + Math.floor(Math.random() * 15);
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
                return false; // Ready to be removed
            }
        }

        // 2. Push current position to trail (do this before updating coordinates)
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }

        // 3. Movement logic
        if (isAttracting) {
            // Attraction force (gravitational pull towards finger)
            const dx = pointerX - this.x;
            const dy = pointerY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) {
                const force = Math.min(1.5, 80 / (distance + 20)); // Pull force decreases with distance
                this.vx += (dx / distance) * force * 0.15;
                this.vy += (dy / distance) * force * 0.15;
                
                // Cap speed during attraction
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const maxAttractSpeed = 3.5;
                if (speed > maxAttractSpeed) {
                    this.vx = (this.vx / speed) * maxAttractSpeed;
                    this.vy = (this.vy / speed) * maxAttractSpeed;
                }
            }
            this.pauseTimer = 0; // Cancel pauses during attraction
        } else {
            // Normal organic flight behavior
            if (this.pauseTimer > 0) {
                this.pauseTimer--;
                
                // Gentle deceleration to pause
                this.vx *= 0.85;
                this.vy *= 0.85;
                
                // Tiny drift during pause
                this.x += this.vx;
                this.y += this.vy;
            } else {
                // Organic steering drift
                this.angle += (Math.random() - 0.5) * 0.15; // Random steering drift
                
                // Slow organic speed wave
                const speed = (0.35 + Math.sin(Date.now() * 0.001 * this.speedMultiplier) * 0.2) * this.speedMultiplier;
                
                // Smoothly interpolate towards ideal velocity
                const targetVx = Math.cos(this.angle) * speed;
                const targetVy = Math.sin(this.angle) * speed;
                
                this.vx += (targetVx - this.vx) * 0.1;
                this.vy += (targetVy - this.vy) * 0.1;
                
                this.x += this.vx;
                this.y += this.vy;

                // Chance to trigger a brief pause
                if (Math.random() < 0.0025) {
                    this.pauseTimer = 40 + Math.floor(Math.random() * 80); // 0.6s to 2s
                    // Pick a completely new angle to fly in when resuming
                    this.angle = Math.random() * Math.PI * 2;
                }
            }
        }

        // 4. Separation behavior: push apart if too close to another firefly
        this.applySeparation();

        // 5. Boundary behavior: steer back in if near edges
        const padding = 40;
        let steerForce = 0.08;
        if (this.x < padding) this.vx += steerForce;
        if (this.x > width - padding) this.vx -= steerForce;
        if (this.y < padding) this.vy += steerForce;
        if (this.y > height - padding) this.vy -= steerForce;

        // Apply velocities to coordinates (fallback boundaries to ensure they never escape)
        this.x = Math.max(2, Math.min(width - 2, this.x));
        this.y = Math.max(2, Math.min(height - 2, this.y));

        // 6. Update bioluminescence phase
        this.pulsePhase += this.pulseSpeed;

        return true;
    }

    applySeparation() {
        const minDistance = 24;
        const pushForce = 0.06;
        
        for (let i = 0; i < fireflies.length; i++) {
            const other = fireflies[i];
            if (other === this || other.fadingOut) continue;

            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDistance && dist > 0) {
                // Stronger push the closer they are
                const ratio = (minDistance - dist) / minDistance;
                this.vx += (dx / dist) * ratio * pushForce;
                this.vy += (dy / dist) * ratio * pushForce;
            }
        }
    }

    draw() {
        // Calculate dynamic bioluminescent opacity
        // Using power of 3 creates a organic pulse: fast flash up, slow dim down
        const sinVal = Math.sin(this.pulsePhase) * 0.5 + 0.5;
        const pulseRatio = Math.pow(sinVal, 2.5); 
        const currentOpacity = this.opacity * pulseRatio * this.maxBrightness;
        
        if (currentOpacity <= 0.01) return;

        // Draw Trails
        if (this.trail.length > 1) {
            ctx.save();
            ctx.lineWidth = this.baseSize * 0.4;
            ctx.lineCap = 'round';
            
            for (let i = 1; i < this.trail.length; i++) {
                const p1 = this.trail[i - 1];
                const p2 = this.trail[i];
                
                // Trail fades out towards the oldest point
                const trailRatio = i / this.trail.length;
                const trailOpacity = currentOpacity * 0.2 * trailRatio;
                
                ctx.strokeStyle = this.glowColor;
                ctx.globalAlpha = trailOpacity;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Draw Firefly Glow & Bloom
        ctx.save();
        ctx.globalAlpha = currentOpacity;

        // 1. Large Outer Soft Bloom
        const bloomRadius = this.baseSize * 15;
        const bloomGrad = ctx.createRadialGradient(this.x, this.y, this.baseSize, this.x, this.y, bloomRadius);
        bloomGrad.addColorStop(0, this.glowColor);
        bloomGrad.addColorStop(0.2, this.glowColor.replace('hsl', 'hsla').replace(')', ', 0.35)'));
        bloomGrad.addColorStop(0.5, this.glowColor.replace('hsl', 'hsla').replace(')', ', 0.08)'));
        bloomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = bloomGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, bloomRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Medium Glow Core
        const glowRadius = this.baseSize * 4;
        const glowGrad = ctx.createRadialGradient(this.x, this.y, this.baseSize * 0.5, this.x, this.y, glowRadius);
        glowGrad.addColorStop(0, '#ffffff');
        glowGrad.addColorStop(0.2, this.glowColor);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // 3. Bright White Hot Center
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = this.opacity * 0.95;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.baseSize * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    scatter() {
        // Scatter impulse: rapid velocity, cancel pause state
        const angle = Math.random() * Math.PI * 2;
        const scatterSpeed = 8 + Math.random() * 8;
        this.vx = Math.cos(angle) * scatterSpeed;
        this.vy = Math.sin(angle) * scatterSpeed;
        this.pauseTimer = 0;
    }

    startFadeOut() {
        this.fadingOut = true;
        this.fadingIn = false;
    }
}

// --- Dust Particle Class ---
class DustParticle {
    constructor() {
        this.reset(true);
    }

    reset(initRandomY = false) {
        this.x = Math.random() * width;
        this.y = initRandomY ? Math.random() * height : height + 10;
        this.size = 0.5 + Math.random() * 1.2;
        this.speed = 0.08 + Math.random() * 0.15;
        this.vx = (Math.random() - 0.5) * 0.08;
        
        this.maxOpacity = 0.08 + Math.random() * 0.18;
        this.opacity = 0;
        this.fadingIn = true;
        this.pulseFreq = 0.005 + Math.random() * 0.01;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update() {
        // Slow float upwards
        this.y -= this.speed;
        this.x += this.vx;
        
        // Gentle horizontal drift waves
        this.vx += (Math.random() - 0.5) * 0.01;
        this.vx = Math.max(-0.15, Math.min(0.15, this.vx));

        // Fade in/out logic
        this.pulsePhase += this.pulseFreq;
        const fade = Math.sin(this.pulsePhase) * 0.5 + 0.5;
        this.opacity = this.maxOpacity * fade;

        // Reset if offscreen
        if (this.y < -10 || this.x < -10 || this.x > width + 10) {
            this.reset(false);
        }
    }

    draw() {
        if (this.opacity <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        // Draw soft dusty circle
        // Soft blue/silver light reflection
        ctx.fillStyle = 'rgba(191, 219, 254, 0.4)'; 
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// --- Core App Functions ---

function init() {
    canvas = document.getElementById('simulation-canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: false });

    // Handle high DPI crisp drawing
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create background dust particles
    initDust();

    // Hook up UI settings interaction
    setupUI();

    // Hook up touch/mouse simulation interactions
    setupInteractions();

    // Start rendering loop
    requestAnimationFrame(tick);
}

function initDust() {
    dustParticles = [];
    const count = Math.floor((width * height) / 18000); // Proportional to screen size
    for (let i = 0; i < count; i++) {
        dustParticles.push(new DustParticle());
    }
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
}

function addFirefly(x, y) {
    // If we exceed max fireflies, fade out the oldest active one
    const activeFireflies = fireflies.filter(f => !f.fadingOut);
    if (activeFireflies.length >= settings.maxFireflies) {
        // Find the oldest non-fading firefly and trigger fadeout
        const oldest = activeFireflies[0];
        if (oldest) oldest.startFadeOut();
    }

    const firefly = new Firefly(x, y);
    fireflies.push(firefly);
}

function spawnSwarm(x, y) {
    const count = 6 + Math.floor(Math.random() * 5); // 6 to 10 fireflies
    for (let i = 0; i < count; i++) {
        // Spawn around click coordinate with soft radial offset
        const radius = 10 + Math.random() * 40;
        const angle = Math.random() * Math.PI * 2;
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;
        
        // Stagger spawn times slightly for visual magic
        setTimeout(() => {
            addFirefly(
                Math.max(10, Math.min(width - 10, x + offsetX)),
                Math.max(10, Math.min(height - 10, y + offsetY))
            );
        }, i * 45);
    }
}

function scatterAll() {
    fireflies.forEach(f => f.scatter());
    
    // Add visual flash effect using canvas backdrop flash or UI shake
    document.body.style.animation = 'none';
    setTimeout(() => {
        document.body.style.transform = 'scale(1.02)';
        document.body.style.transition = 'transform 0.1s ease';
        setTimeout(() => {
            document.body.style.transform = 'scale(1)';
        }, 100);
    }, 10);
}

// --- Event & Interaction Handlers ---

function setupInteractions() {
    // Gear fade-out timers on inactivity
    const gearBtn = document.getElementById('settings-btn');
    let gearInactivityTimer;

    function resetGearInactivity() {
        gearBtn.classList.remove('fade-out');
        clearTimeout(gearInactivityTimer);
        gearInactivityTimer = setTimeout(() => {
            // Only fade out if settings panel is closed
            if (document.getElementById('settings-panel').classList.contains('hidden')) {
                gearBtn.classList.add('fade-out');
            }
        }, 4000);
    }
    
    // Start inactivity cycle
    resetGearInactivity();

    // Mouse / Touch handler (PointerEvents support both)
    window.addEventListener('pointerdown', (e) => {
        // Ignore clicks inside the settings panel or settings button
        if (e.target.closest('#settings-panel') || e.target.closest('#settings-btn')) {
            return;
        }

        resetGearInactivity();

        isPointerDown = true;
        pointerX = e.clientX;
        pointerY = e.clientY;
        pointerStartTime = Date.now();
        
        // Hide intro instructions overlay on first tap
        const intro = document.getElementById('intro-instructions');
        if (intro && !intro.classList.contains('fade-out')) {
            intro.classList.add('fade-out');
        }

        // Initialize audio on first click (safeguard for browser policies)
        if (settings.audioEnabled) {
            ambience.start();
        }

        // 1. Check for Double-tap
        const currentTime = Date.now();
        const tapDelay = currentTime - lastTapTime;
        if (tapDelay < 300) {
            spawnSwarm(pointerX, pointerY);
            lastTapTime = 0; // Reset
            isPointerDown = false;
            return;
        }
        lastTapTime = currentTime;

        // 2. Set long-press attract timer
        clearTimeout(pointerTimer);
        pointerTimer = setTimeout(() => {
            if (isPointerDown) {
                isAttracting = true;
                attractionRippleRadius = 0;
            }
        }, 450); // 450ms hold triggers attract mode
    });

    window.addEventListener('pointermove', (e) => {
        if (!isPointerDown) {
            resetGearInactivity();
            return;
        }
        pointerX = e.clientX;
        pointerY = e.clientY;
    });

    window.addEventListener('pointerup', (e) => {
        if (!isPointerDown) return;
        
        clearTimeout(pointerTimer);
        
        const clickDuration = Date.now() - pointerStartTime;
        
        // If it was a quick single click (and not a long press attract)
        if (!isAttracting && clickDuration < 450) {
            addFirefly(pointerX, pointerY);
        }

        isPointerDown = false;
        isAttracting = false;
        attractionRippleRadius = 0;
    });

    // Handle touch cancels/escapes
    window.addEventListener('pointercancel', () => {
        clearTimeout(pointerTimer);
        isPointerDown = false;
        isAttracting = false;
        attractionRippleRadius = 0;
    });

    // --- Shake Gesture Detection ---
    let lastX = null, lastY = null, lastZ = null;
    let shakeThreshold = 18; // Movement threshold for shake trigger
    
    window.addEventListener('devicemotion', (e) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;

        const x = acc.x;
        const y = acc.y;
        const z = acc.z;

        if (lastX !== null) {
            const deltaX = Math.abs(x - lastX);
            const deltaY = Math.abs(y - lastY);
            const deltaZ = Math.abs(z - lastZ);

            if ((deltaX > shakeThreshold && deltaY > shakeThreshold) || 
                (deltaX > shakeThreshold && deltaZ > shakeThreshold) || 
                (deltaY > shakeThreshold && deltaZ > shakeThreshold)) {
                scatterAll();
            }
        }

        lastX = x;
        lastY = y;
        lastZ = z;
    });
}

// --- UI Settings Connection ---

function setupUI() {
    const settingsBtn = document.getElementById('settings-btn');
    const closeBtn = document.getElementById('close-btn');
    const settingsPanel = document.getElementById('settings-panel');
    
    const audioToggle = document.getElementById('audio-toggle');
    const moonlightToggle = document.getElementById('moonlight-toggle');
    const dustToggle = document.getElementById('dust-toggle');
    const maxSlider = document.getElementById('max-fireflies-slider');
    const maxValDisplay = document.getElementById('max-fireflies-val');
    
    const scatterBtn = document.getElementById('scatter-btn');
    const clearBtn = document.getElementById('clear-btn');
    const screenshotBtn = document.getElementById('screenshot-btn');

    // Gear Open panel
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.remove('hidden');
        settingsBtn.classList.remove('fade-out');
    });

    // Close panel
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.add('hidden');
    });

    // Close on click outside settings card
    window.addEventListener('click', (e) => {
        if (!settingsPanel.classList.contains('hidden') && !e.target.closest('#settings-panel') && !e.target.closest('#settings-btn')) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Audio Toggle
    audioToggle.addEventListener('change', (e) => {
        settings.audioEnabled = e.target.checked;
        if (settings.audioEnabled) {
            ambience.start();
        } else {
            ambience.stop();
        }
    });

    // Moonlight Toggle
    moonlightToggle.addEventListener('change', (e) => {
        settings.moonlightEnabled = e.target.checked;
        const moonlightOverlay = document.getElementById('moonlight-overlay');
        if (settings.moonlightEnabled) {
            moonlightOverlay.classList.add('active');
        } else {
            moonlightOverlay.classList.remove('active');
        }
    });

    // Dust Toggle
    dustToggle.addEventListener('change', (e) => {
        settings.dustEnabled = e.target.checked;
    });

    // Max Fireflies Slider
    maxSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        settings.maxFireflies = val;
        maxValDisplay.textContent = val;

        // Apply immediately if count exceeds new slider max
        const activeFireflies = fireflies.filter(f => !f.fadingOut);
        if (activeFireflies.length > val) {
            const difference = activeFireflies.length - val;
            for (let i = 0; i < difference; i++) {
                if (activeFireflies[i]) {
                    activeFireflies[i].startFadeOut();
                }
            }
        }
    });

    // Scatter button
    scatterBtn.addEventListener('click', () => {
        scatterAll();
    });

    // Clear Button
    clearBtn.addEventListener('click', () => {
        fireflies.forEach(f => f.startFadeOut());
    });

    // Screenshot Button
    screenshotBtn.addEventListener('click', () => {
        takeScreenshot();
    });
}

function takeScreenshot() {
    // 1. Create a dynamic canvas to compile background + drawings
    const screenshotCanvas = document.createElement('canvas');
    screenshotCanvas.width = canvas.width;
    screenshotCanvas.height = canvas.height;
    const sCtx = screenshotCanvas.getContext('2d');
    
    // 2. Draw black background
    sCtx.fillStyle = '#000000';
    sCtx.fillRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
    
    // 3. Draw Moonlight Overlay if active
    if (settings.moonlightEnabled) {
        sCtx.save();
        const dpr = window.devicePixelRatio || 1;
        sCtx.scale(dpr, dpr);
        const moonGrad = sCtx.createRadialGradient(width/2, height*0.1, 0, width/2, height*0.1, Math.max(width, height) * 0.8);
        moonGrad.addColorStop(0, 'rgba(14, 42, 97, 0.35)');
        moonGrad.addColorStop(0.5, 'rgba(14, 42, 97, 0.12)');
        moonGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sCtx.fillStyle = moonGrad;
        sCtx.fillRect(0, 0, width, height);
        sCtx.restore();
    }
    
    // 4. Draw active elements from current visible canvas
    sCtx.drawImage(canvas, 0, 0);

    // 5. Trigger download of data URI
    try {
        const url = screenshotCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `firefly_night_${Date.now()}.png`;
        link.href = url;
        link.click();
    } catch (e) {
        console.error('Screenshot download failed', e);
    }
}

// --- Main Simulation Loop ---

function tick() {
    // Clear canvas (pure transparency, letting pure black body background shine through)
    ctx.clearRect(0, 0, width, height);

    // Draw long-press attraction ripple effects
    if (isAttracting) {
        drawAttractionRipple();
    }

    // 1. Update and Draw Dust
    if (settings.dustEnabled) {
        dustParticles.forEach(p => {
            p.update();
            p.draw();
        });
    }

    // 2. Update and Draw Fireflies
    // Iterate backwards to safely remove faded-out objects
    for (let i = fireflies.length - 1; i >= 0; i--) {
        const firefly = fireflies[i];
        const isActive = firefly.update();
        if (!isActive) {
            fireflies.splice(i, 1);
        } else {
            firefly.draw();
        }
    }

    requestAnimationFrame(tick);
}

function drawAttractionRipple() {
    ctx.save();
    
    // Animate concentric glowing rings expanding and fading
    attractionRippleRadius = (attractionRippleRadius + 1.2) % 65;
    
    const count = 3;
    for (let i = 0; i < count; i++) {
        const r = (attractionRippleRadius + (i * (65 / count))) % 65;
        const opacity = Math.max(0, 0.3 * (1 - r / 65));
        
        ctx.strokeStyle = `rgba(190, 242, 100, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Center glowing point
    ctx.fillStyle = 'rgba(190, 242, 100, 0.2)';
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// Start application when page is ready
window.onload = init;
