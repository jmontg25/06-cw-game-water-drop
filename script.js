// Game difficulty profiles and state
const difficultyProfiles = {
  easy:  { time: 40, spawn: 1200, fall: 4500, win: 10 },
  normal:{ time: 30, spawn: 900,  fall: 4000, win: 15 },
  hard:  { time: 20, spawn: 650,  fall: 3600, win: 20 }
};

let currentDifficulty = 'normal';
let GAME_TIME = difficultyProfiles[currentDifficulty].time; // seconds
let SPAWN_INTERVAL_MS = difficultyProfiles[currentDifficulty].spawn;
let FALL_DURATION_MS = difficultyProfiles[currentDifficulty].fall;
let WIN_SCORE = difficultyProfiles[currentDifficulty].win;

// end-game message pools (README requirement)
const WIN_MESSAGES = [
  'Great work — clean water for all! 🎉',
  'You did it! Communities are closer to clean water.',
  'Amazing catch! You helped bring water to people in need.'
];
const LOSE_MESSAGES = [
  'Nice try — give it another shot!',
  'Almost there — try again to beat the challenge!',
  'Keep practicing — you can reach 20 points!' 
];

let gameRunning = false;
let spawnTimer = null;
let countdownTimer = null;
let timeLeft = GAME_TIME;
let score = 0;
let milestones = [];
let milestonesTriggered = new Set();

// Audio (synth) context - create lazily
let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // Some browsers start the AudioContext in a suspended state; resume if needed.
  if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
    audioCtx.resume().catch(() => {});
  }
}

function playTone(freq, duration = 0.12, type = 'sine', gain = 0.12) {
  try {
    ensureAudioCtx();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    // set initial gain and schedule a smooth ramp down to avoid clicks
    g.gain.setValueAtTime(gain, audioCtx.currentTime + 0.001);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    // gentle decay to near-zero
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration + 0.02);
  } catch (e) {
    // ignore if audio not available
    console.warn('Audio failed', e);
  }
}

function playSound(name) {
  // Use actual audio files for these main events when available.
  if (audioFiles[name]) {
    try {
      const a = audioFiles[name].cloneNode();
      a.currentTime = 0;
      a.volume = 1.0;
      a.play().catch(() => {});
      return;
    } catch (e) {
      // fall back to synth if playback fails
    }
  }

  // Fallback synths for any events without audio files
  switch (name) {
    case 'collect': playTone(880, 0.08, 'sine', 0.12); break;
    case 'bonus': playTone(1100, 0.12, 'triangle', 0.14); break;
    case 'caught':
      playTone(1200, 0.06, 'square', 0.12);
      setTimeout(() => playTone(1500, 0.06, 'sine', 0.08), 60);
      break;
    case 'spawn': playTone(520, 0.05, 'sine', 0.06); break;
    case 'miss': playTone(220, 0.18, 'sawtooth', 0.08); break;
    case 'bad': playTone(180, 0.12, 'sine', 0.08); break;
    case 'button': playTone(1400, 0.06, 'square', 0.06); break;
    case 'win':
      playTone(880, 0.12, 'sine', 0.12);
      setTimeout(() => playTone(1320, 0.14, 'sine', 0.12), 120);
      setTimeout(() => playTone(1760, 0.18, 'sine', 0.12), 300);
      break;
    default: break;
  }
}

// Ambient background oscillator (very soft) to make gameplay feel alive
let ambientOsc = null;
let ambientGain = null;
function startAmbient() {
  try {
    ensureAudioCtx();
    if (ambientOsc) return;
    ambientOsc = audioCtx.createOscillator();
    ambientGain = audioCtx.createGain();
    ambientOsc.type = 'sine';
    ambientOsc.frequency.value = 110; // low hum
    ambientGain.gain.value = 0.006; // very low volume
    ambientOsc.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);
    ambientOsc.start();
  } catch (e) {
    console.warn('Ambient audio failed to start', e);
  }
}

function stopAmbient() {
  try {
    if (ambientOsc) {
      ambientOsc.stop();
      ambientOsc.disconnect();
      ambientGain.disconnect();
      ambientOsc = null;
      ambientGain = null;
    }
  } catch (e) {
    // ignore
  }
}

const container = document.getElementById("game-container");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const difficultySelect = document.getElementById('difficulty');
const messageEl = document.getElementById("message");
const confettiCanvas = document.getElementById("confetti-canvas");
const ctx = confettiCanvas.getContext ? confettiCanvas.getContext('2d') : null;

// Preload audio files (WAVs generated in /audio)
const audioFiles = {
  collect: new Audio('audio/collect.wav'),
  miss: new Audio('audio/miss.wav'),
  button: new Audio('audio/button.wav'),
  win: new Audio('audio/win.wav')
};
Object.values(audioFiles).forEach(a => { a.preload = 'auto'; try { a.load(); } catch (e){} });

// Resize confetti canvas to container size
function resizeCanvas() {
  confettiCanvas.width = container.clientWidth;
  confettiCanvas.height = container.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

startBtn.addEventListener('click', async () => {
  // user gesture: try to ensure audio can play
  try {
    ensureAudioCtx();
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  } catch (e) {
    console.warn('Audio resume failed', e);
  }
  // play a click sound now that audio should be available
  try { playSound('button'); } catch (e) {}
  if (!gameRunning) startGame();
});
resetBtn.addEventListener('click', resetGame);
// keep mousedown handlers for tactile feedback but actual audio resume is done on click
startBtn.addEventListener('mousedown', () => {});
resetBtn.addEventListener('mousedown', () => playSound('button'));

// update difficulty from UI
if (difficultySelect) {
  difficultySelect.addEventListener('change', (e) => {
    currentDifficulty = e.target.value;
    // reflect change visually; new game must be started for values to apply
    messageEl.textContent = `Selected difficulty: ${currentDifficulty}. Start to apply.`;
  });
}

function startGame() {
  // apply selected difficulty
  const profile = difficultyProfiles[currentDifficulty] || difficultyProfiles.normal;
  GAME_TIME = profile.time;
  SPAWN_INTERVAL_MS = profile.spawn;
  FALL_DURATION_MS = profile.fall;
  WIN_SCORE = profile.win;

  // compute milestones at quarters
  milestones = [
    { score: Math.max(1, Math.ceil(WIN_SCORE * 0.25)), msg: 'Good start — keep going!' },
    { score: Math.max(1, Math.ceil(WIN_SCORE * 0.5)), msg: 'Halfway there!' },
    { score: Math.max(1, Math.ceil(WIN_SCORE * 0.75)), msg: 'Almost there!' }
  ];
  milestonesTriggered = new Set();

  gameRunning = true;
  score = 0;
  updateScore();
  timeLeft = GAME_TIME;
  updateTime();
  messageEl.textContent = `Difficulty: ${currentDifficulty} — reach ${WIN_SCORE} points to win.`;

  // spawn drops and countdown
  spawnTimer = setInterval(spawnDrop, SPAWN_INTERVAL_MS);
  countdownTimer = setInterval(() => {
    timeLeft -= 1;
    updateTime();
    if (timeLeft <= 0) endGame();
  }, 1000);
  startAmbient();
}

function endGame() {
  gameRunning = false;
  clearInterval(spawnTimer);
  clearInterval(countdownTimer);
  spawnTimer = null;
  countdownTimer = null;
  // remove remaining drops
  document.querySelectorAll('.water-drop').forEach(d => d.remove());
  document.querySelectorAll('.water-can, .falling-logo').forEach(e => e.remove());

    if (score >= WIN_SCORE) {
    // pick a random winning message from the pool
    const msg = WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
    messageEl.textContent = `${msg} Score: ${score}`;
    launchConfetti();
    playSound('win');
  } else {
    // pick a random losing message from the pool
    const msg = LOSE_MESSAGES[Math.floor(Math.random() * LOSE_MESSAGES.length)];
    messageEl.textContent = `${msg} Score: ${score}`;
    playSound('miss');
  }
  stopAmbient();
}

function resetGame() {
  gameRunning = false;
  clearInterval(spawnTimer);
  clearInterval(countdownTimer);
  spawnTimer = null;
  countdownTimer = null;
  score = 0;
  timeLeft = GAME_TIME;
  updateScore();
  updateTime();
  messageEl.textContent = '';
  document.querySelectorAll('.water-drop, .drop-score-pop').forEach(e => e.remove());
  document.querySelectorAll('.water-can, .falling-logo').forEach(e => e.remove());
  stopConfetti();
  milestonesTriggered = new Set();
  stopAmbient();
}

function updateScore() {
  scoreEl.textContent = score;
}

function updateTime() {
  timeEl.textContent = timeLeft;
}

// Spawn either a good drop or a bad drop
function spawnDrop() {
  if (!gameRunning) return;
  // small chance to spawn a water can (bonus collectible)
  if (Math.random() < 0.06) {
    spawnCan();
    return;
  }
  // small chance to spawn a falling charity: water logo that is interactive
  if (Math.random() < 0.03) {
    spawnLogo();
    return;
  }

  const drop = document.createElement('div');
  drop.className = 'water-drop';

  // 20% chance to be a bad (dirty) drop
  const isBad = Math.random() < 0.2;
  if (isBad) drop.classList.add('bad-drop');

  const initialSize = 60;
  // good drops are a consistent size; bad drops vary for visibility
  let size;
  if (isBad) {
    const sizeMultiplier = Math.random() * 0.8 + 0.5;
    size = Math.floor(initialSize * sizeMultiplier);
  } else {
    size = initialSize; // consistent good drop size
  }
  drop.style.width = drop.style.height = `${size}px`;

  // translate animation duration in css animation terms
  drop.style.animationDuration = `${FALL_DURATION_MS}ms`;

  const gameWidth = container.clientWidth;
  const xPosition = Math.random() * Math.max(0, gameWidth - size);
  drop.style.left = xPosition + 'px';

  // track whether drop was clicked or caught
  drop.dataset.clicked = 'false';

  // add visuals
  container.appendChild(drop);
  addDropVisual(drop, isBad);
  playSound('spawn');

  // handle clicks/taps
  drop.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!gameRunning) return;
    if (drop.dataset.clicked === 'true') return; // ignore double clicks
    drop.dataset.clicked = 'true';

    if (isBad) {
      // penalty: subtract points and feedback
      score = Math.max(0, score - 3);
      showScorePop('-3', e.clientX, e.clientY, '#ff4444');
      messageEl.textContent = 'Oh no — dirty water! -3 points.';
      playSound('bad');
    } else {
      // reward
      score += 1;
      showScorePop('+1', e.clientX, e.clientY, '#0099ff');
      messageEl.textContent = 'Nice catch! +1 point.';
      playSound('collect');
      playSound('caught');
      checkMilestones();
    }
    updateScore();

    // remove with small pop animation
    drop.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    drop.style.transform = 'scale(0.1)';
    drop.style.opacity = '0';
    setTimeout(() => drop.remove(), 220);
  });

  // when drop reaches bottom
  drop.addEventListener('animationend', () => {
    // if it wasn't clicked/caught
    if (drop.dataset.clicked === 'false') {
      if (isBad) {
        // dirty drop landed safely on ground: no penalty
        messageEl.textContent = 'A dirty drop landed.';
      } else {
        // clean drop missed: penalty
        score = Math.max(0, score - 1);
        updateScore();
        messageEl.textContent = 'You missed a clean drop! -1 point.';
        playSound('miss');
      }
    }
    drop.remove();
  });
}

// spawn a water can collectible
function spawnCan() {
  const can = document.createElement('div');
  can.className = 'water-can';
  can.style.width = '64px';
  can.style.height = '64px';
  can.style.backgroundImage = 'url("img/water-can.png")';
  const size = 64;
  const gameWidth = container.clientWidth;
  const xPosition = Math.random() * Math.max(0, gameWidth - size);
  can.style.left = xPosition + 'px';
  can.style.animationDuration = `${FALL_DURATION_MS}ms`;
  can.dataset.clicked = 'false';
  container.appendChild(can);

  can.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!gameRunning) return;
    if (can.dataset.clicked === 'true') return;
    can.dataset.clicked = 'true';
    score += 3; // bonus for collecting can
    updateScore();
    showScorePop('+3', e.clientX, e.clientY, '#FFD400');
    playSound('bonus');
    can.remove();
    checkMilestones();
  });

  can.addEventListener('animationend', () => { can.remove(); });
}

// spawn a falling charity: water logo that grants bonus when clicked
function spawnLogo() {
  const logo = document.createElement('div');
  logo.className = 'falling-logo';
  const size = 80;
  const gameWidth = container.clientWidth;
  const xPosition = Math.random() * Math.max(0, gameWidth - size);
  logo.style.left = xPosition + 'px';
  logo.style.width = logo.style.height = size + 'px';
  logo.style.backgroundImage = 'url("img/cw_logo.png")';
  logo.style.backgroundSize = 'contain';
  logo.style.backgroundRepeat = 'no-repeat';
  logo.style.animationDuration = `${FALL_DURATION_MS + 400}ms`;
  logo.dataset.clicked = 'false';
  container.appendChild(logo);

  // click gives a small bonus and friendly message
  logo.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!gameRunning) return;
    if (logo.dataset.clicked === 'true') return;
    logo.dataset.clicked = 'true';
    score += 2;
    updateScore();
    showScorePop('+2', e.clientX, e.clientY, '#2E9DF7');
    messageEl.textContent = 'Thanks! You tapped a charity: water logo — +2 bonus.';
    playSound('bonus');
    // small scale out
    logo.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
    logo.style.transform = 'scale(0.2)';
    logo.style.opacity = '0';
    setTimeout(() => logo.remove(), 220);
    checkMilestones();
  });

  logo.addEventListener('animationend', () => { logo.remove(); });
}

// check if player hit a milestone
function checkMilestones() {
  milestones.forEach(m => {
    if (score >= m.score && !milestonesTriggered.has(m.score)) {
      milestonesTriggered.add(m.score);
      // show milestone prominently and play a sound
      showMilestone(m.msg);
      playSound('collect');
    }
  });
}

// show a prominent milestone toast in the game area
function showMilestone(text) {
  const toast = document.createElement('div');
  toast.className = 'milestone-toast';
  toast.textContent = text;
  // append to container so it's positioned over the game area
  container.appendChild(toast);
  // allow CSS animation/transition to run
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  // remove after 2200ms
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 2200);
}

// create SVG visual for good drops or a red circle for bad drops
function addDropVisual(dropEl, isBad) {
  if (isBad) {
    const bad = document.createElement('div');
    bad.style.width = '100%';
    bad.style.height = '100%';
    bad.style.borderRadius = '50%';
    bad.style.background = '#ff4444';
    dropEl.appendChild(bad);
    return;
  }

  // create an inline SVG using the path defined in the page defs
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const use = document.createElementNS(svgNS, 'use');
  // reference the path defined in index.html
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#drop-shape');
  use.setAttribute('fill', '#2E9DF7');
  svg.appendChild(use);
  dropEl.appendChild(svg);
}

/* ---------- Bucket controls & collision detection ---------- */
// create bucket element and add to container
const bucket = document.createElement('div');
bucket.className = 'bucket';
bucket.innerHTML = '<div class="lip"></div>';
container.appendChild(bucket);

// bucket state
let bucketX = (container.clientWidth - 160) / 2; // left position
function positionBucket(x) {
  const max = container.clientWidth - bucket.clientWidth - 8;
  const min = 8;
  bucketX = Math.min(max, Math.max(min, x));
  bucket.style.left = bucketX + 'px';
}

// initial position
positionBucket(bucketX);

// Keyboard continuous movement (left/right arrows)
let moveLeft = false;
let moveRight = false;
const MOVE_SPEED = 6; // pixels per frame

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft = true;
  if (e.key === 'ArrowRight' || e.key === 'd') moveRight = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft = false;
  if (e.key === 'ArrowRight' || e.key === 'd') moveRight = false;
});

// animation frame loop to update bucket position smoothly
function bucketLoop() {
  if (moveLeft) positionBucket(bucketX - MOVE_SPEED);
  if (moveRight) positionBucket(bucketX + MOVE_SPEED);
  requestAnimationFrame(bucketLoop);
}
requestAnimationFrame(bucketLoop);

// Collision check: run frequently to detect drops that intersect the bucket lip
setInterval(() => {
  if (!gameRunning) return;
  const bucketRect = bucket.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const bucketTop = bucketRect.top - contRect.top;
  const bucketLeft = bucketRect.left - contRect.left;
  const bucketRight = bucketLeft + bucketRect.width;

  document.querySelectorAll('.water-drop').forEach(drop => {
    const dr = drop.getBoundingClientRect();
    const dropTop = dr.top - contRect.top;
    const dropLeft = dr.left - contRect.left + dr.width/2; // center x
    // if bottom of drop reaches top of bucket lip area
    if (dropTop + dr.height >= bucketTop && dropTop <= bucketTop + 40) {
      // if drop's center x is within bucket horizontal bounds
      if (dropLeft >= bucketLeft && dropLeft <= bucketRight) {
        // treat as caught
        const isBad = drop.classList.contains('bad-drop');
        if (drop.dataset.clicked === 'true') return;
        drop.dataset.clicked = 'true';
        if (isBad) {
          score = Math.max(0, score - 3);
          messageEl.textContent = 'Caught dirty water in the bucket! -3 points.';
          showScorePop('-3', bucketLeft + dropLeft, bucketTop, '#ff4444');
          playSound('bad');
        } else {
          score += 1;
          messageEl.textContent = 'Nice! You caught it in the bucket +1.';
          showScorePop('+1', bucketLeft + dropLeft, bucketTop, '#2E9DF7');
          playSound('collect');
          playSound('caught');
        }
        updateScore();
        updateScore();
        checkMilestones();
        drop.remove();
      }
    }
  });
}, 80);
 

// Small floating score pop
function showScorePop(text, clientX, clientY, color) {
  const pop = document.createElement('div');
  pop.className = 'drop-score-pop';
  pop.textContent = text;
  pop.style.color = color;

  // compute position relative to container
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  container.appendChild(pop);

  // animate up and fade
  requestAnimationFrame(() => {
    pop.style.transform = 'translateY(-40px)';
    pop.style.opacity = '0';
  });
  setTimeout(() => pop.remove(), 700);
}

// Confetti effect (simple particle system)
let confettiParticles = [];
let confettiTimer = null;

function launchConfetti() {
  if (!ctx) return;
  resizeCanvas();
  confettiParticles = [];
  const count = 80;
  for (let i = 0; i < count; i++) {
    confettiParticles.push(createParticle());
  }
  if (confettiTimer) cancelAnimationFrame(confettiTimer);
  (function loop() {
    ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    confettiParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.rotation += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      ctx.restore();
    });
    confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 50);
    if (confettiParticles.length > 0) {
      confettiTimer = requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    }
  })();
}

function stopConfetti() {
  if (confettiTimer) cancelAnimationFrame(confettiTimer);
  confettiParticles = [];
  if (ctx) ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
}

function createParticle() {
  const w = confettiCanvas.width;
  const h = confettiCanvas.height;
  return {
    x: Math.random() * w,
    y: -10 - Math.random() * 100,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 3 + 2,
    vr: (Math.random() - 0.5) * 0.2,
    rotation: Math.random() * Math.PI * 2,
    size: 6 + Math.random() * 8,
    color: ['#FFC907','#2E9DF7','#8BD1CB','#4FCB53','#FF902A','#F16061'][Math.floor(Math.random()*6)]
  };
}

// Make container tappable to support mobile quick interactions (prevent accidental text selection)
container.addEventListener('touchstart', (e) => {
  e.preventDefault();
});

// Initialize UI
updateScore();
updateTime();
