// Game constants and state
const GAME_TIME = 30; // seconds
const SPAWN_INTERVAL_MS = 900;
const FALL_DURATION_MS = 4000;
const WIN_SCORE = 15;

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

const container = document.getElementById("game-container");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const messageEl = document.getElementById("message");
const confettiCanvas = document.getElementById("confetti-canvas");
const ctx = confettiCanvas.getContext ? confettiCanvas.getContext('2d') : null;

// Resize confetti canvas to container size
function resizeCanvas() {
  confettiCanvas.width = container.clientWidth;
  confettiCanvas.height = container.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

startBtn.addEventListener('click', () => {
  if (!gameRunning) startGame();
});
resetBtn.addEventListener('click', resetGame);

function startGame() {
  gameRunning = true;
  score = 0;
  updateScore();
  timeLeft = GAME_TIME;
  updateTime();
  messageEl.textContent = `Catch good drops! Try to get ${WIN_SCORE} points to win.`;

  // spawn drops and countdown
  spawnTimer = setInterval(spawnDrop, SPAWN_INTERVAL_MS);
  countdownTimer = setInterval(() => {
    timeLeft -= 1;
    updateTime();
    if (timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  gameRunning = false;
  clearInterval(spawnTimer);
  clearInterval(countdownTimer);
  spawnTimer = null;
  countdownTimer = null;
  // remove remaining drops
  document.querySelectorAll('.water-drop').forEach(d => d.remove());

    if (score >= WIN_SCORE) {
    // pick a random winning message from the pool
    const msg = WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
    messageEl.textContent = `${msg} Score: ${score}`;
    launchConfetti();
  } else {
    // pick a random losing message from the pool
    const msg = LOSE_MESSAGES[Math.floor(Math.random() * LOSE_MESSAGES.length)];
    messageEl.textContent = `${msg} Score: ${score}`;
  }
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
  stopConfetti();
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
    } else {
      // reward
      score += 1;
      showScorePop('+1', e.clientX, e.clientY, '#0099ff');
      messageEl.textContent = 'Nice catch! +1 point.';
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
      }
    }
    drop.remove();
  });
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
        } else {
          score += 1;
          messageEl.textContent = 'Nice! You caught it in the bucket +1.';
          showScorePop('+1', bucketLeft + dropLeft, bucketTop, '#2E9DF7');
        }
        updateScore();
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
