import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Chromatic aberration shader -- RGB color split on boost
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 dir = (vUv - 0.5) * 2.0;
      float d = length(dir);
      vec2 offset = dir * amount * d;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};
import { Game, STATE } from './Game.js';
import { Network } from './Network.js';

// --- Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff9966);
scene.fog = new THREE.FogExp2(0xc8dde8, 0.004);

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.prepend(renderer.domElement);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

// --- Post-processing ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(Math.floor(window.innerWidth / 4), Math.floor(window.innerHeight / 4)),
  0.3,  // strength (subtle by default, dynamic at night)
  0.3,  // radius
  0.9   // threshold
);
composer.addPass(bloomPass);

const caPass = new ShaderPass(ChromaticAberrationShader);
caPass.uniforms.amount.value = 0.0;
composer.addPass(caPass);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x5a8c4b, 0.6));

const sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
sun.position.set(150, 120, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 500;
sun.shadow.camera.left = -200;
sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;
sun.shadow.bias = -0.001;
scene.add(sun);

// --- Network ---
const network = new Network();

// --- Game (pass post-processing refs) ---
const game = new Game(scene, camera, sun, network, { bloomPass, composer, caPass });

// --- Input ---
const keys = {};

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (game.state === STATE.MENU || game.state === STATE.GAMEOVER) {
    if (e.code === 'Digit1' || e.code === 'Enter' || e.code === 'KeyR') {
      game.setMode('single');
      game.handleStart();
    }
  }

  if (e.code === 'Tab' && (game.state === STATE.PLAYING || game.state === STATE.PAUSED) && game.mode === 'single') {
    e.preventDefault();
    if (game.fullmapOpen) {
      game.toggleFullmap();
    } else if (game.state === STATE.PLAYING) {
      game.toggleFullmap();
    }
  }

  // ESC: close fullmap, or toggle pause menu
  if (e.code === 'Escape') {
    e.preventDefault();
    if (game.fullmapOpen) {
      game.toggleFullmap();
    } else if (game.state === STATE.PLAYING) {
      pauseGame();
    } else if (game.state === STATE.PAUSED) {
      resumeGame();
    }
  }

  // Photo mode
  if (e.code === 'KeyP' && game.state === STATE.PLAYING) {
    game.togglePhotoMode();
  }

  // Music toggle
  if (e.code === 'KeyM') {
    toggleMusicUI();
  }

  // Headlight toggle
  if (e.code === 'KeyL' && (game.state === STATE.PLAYING || game.state === STATE.PAUSED)) {
    game.vehicle.toggleHeadlights();
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// --- Lobby UI ---
const $ = (id) => document.getElementById(id);

// --- Pause / Resume ---
function pauseGame() {
  if (game.state !== STATE.PLAYING) return;
  game.setState(STATE.PAUSED);
  $('pause-menu')?.classList.add('active');
}
function resumeGame() {
  if (game.state !== STATE.PAUSED) return;
  game.setState(STATE.PLAYING);
  $('pause-menu')?.classList.remove('active');
}
$('btn-resume')?.addEventListener('click', resumeGame);
$('btn-exit-menu')?.addEventListener('click', () => {
  $('pause-menu')?.classList.remove('active');
  game.returnToMenu();
});

// --- Music toggle ---
function toggleMusicUI() {
  const muted = game.music.toggleMute();
  const btn = $('music-toggle');
  if (btn) {
    btn.textContent = muted ? '♪' : '♫';
    btn.classList.toggle('muted', muted);
  }
}
$('music-toggle')?.addEventListener('click', toggleMusicUI);

// Map selection
document.querySelectorAll('.map-card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    game.setMap(card.dataset.map);
  });
});

// Solo button
$('btn-solo')?.addEventListener('click', (e) => {
  e.stopPropagation();
  game.setMode('single');
  game.handleStart();
});

// Create Room button
$('btn-create')?.addEventListener('click', (e) => {
  e.stopPropagation();
  network.connect();
  const tryCreate = () => {
    if (network.connected) {
      network.createRoom(prompt('Your name:') || 'Player');
    } else {
      setTimeout(tryCreate, 200);
    }
  };
  tryCreate();
});

// Join Room UI
$('btn-join-show')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('menu-main').style.display = 'none';
  $('menu-join').style.display = 'block';
  $('join-code-input')?.focus();
});

$('btn-join-back')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('menu-join').style.display = 'none';
  $('menu-main').style.display = 'block';
});

$('btn-join-go')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const code = $('join-code-input')?.value?.trim();
  const name = $('join-name-input')?.value?.trim() || 'Player';
  if (!code || code.length !== 4) {
    $('join-error').textContent = 'Enter a 4-letter code';
    return;
  }
  $('join-error').textContent = 'Connecting...';
  network.connect();
  const tryJoin = () => {
    if (network.connected) {
      network.joinRoom(code, name);
    } else {
      setTimeout(tryJoin, 200);
    }
  };
  tryJoin();
});

$('join-code-input')?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    $('btn-join-go')?.click();
  }
  e.stopPropagation();
});
$('join-name-input')?.addEventListener('keydown', (e) => { e.stopPropagation(); });

$('btn-start-game')?.addEventListener('click', (e) => {
  e.stopPropagation();
  network.startGame();
});

// --- Network callbacks ---
network.onRoomCreated = (data) => {
  showLobby(data.code);
};

network.onRoomUpdate = (data) => {
  updateLobbyPlayers(data.players);
};

network.onJoinError = (msg) => {
  $('join-error').textContent = msg;
};

network.onGameStart = (data) => {
  game.setMode('online');
  game.handleStart();
};

network.onGameOver = (data) => {};

function showLobby(code) {
  $('menu-main').style.display = 'none';
  $('menu-join').style.display = 'none';
  $('menu-lobby').style.display = 'block';
  $('lobby-code').textContent = code;

  if (network.isHost) {
    $('btn-start-game').style.display = 'block';
    $('lobby-waiting').style.display = 'none';
  } else {
    $('btn-start-game').style.display = 'none';
    $('lobby-waiting').style.display = 'block';
  }

  updateLobbyPlayers(network.players);
}

function updateLobbyPlayers(players) {
  const el = $('lobby-players');
  if (!el) return;
  el.innerHTML = players.map(p => {
    const color = '#' + new THREE.Color(p.color).getHexString();
    return `<div style="color:${color}">&#9632; ${p.name}</div>`;
  }).join('');
}

// --- Click to fire ---
window.addEventListener('click', (e) => {
  if (e.target.closest('#screen-overlay')) return;
  if (e.target.closest('#touch-controls')) return;
  if (game.state === STATE.PLAYING && !game.photoMode && (game.mode === 'single' || game.mode === 'online')) {
    if (game.projectiles.fire(game.vehicle.position, game.vehicle.rotation, game.vehicle.speed)) {
      game.music.playHonk();
      if (game.mode === 'online') {
        network.sendBalloon({
          x: game.vehicle.position.x,
          z: game.vehicle.position.z,
          rotation: game.vehicle.rotation,
          speed: game.vehicle.speed,
        });
      }
    }
  }
});

// --- Mobile touch controls ---
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const touchControls = $('touch-controls');
const joystick = $('touch-joystick');
const joystickKnob = $('touch-joystick-knob');
const touchKeys = { forward: false, backward: false, left: false, right: false, boost: false, honk: false, fire: false };
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };

if (isMobile && touchControls) {
  touchControls.style.display = 'block';

  // Joystick
  joystick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    const rect = joystick.getBoundingClientRect();
    joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { passive: false });

  joystick.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!joystickActive) return;
    const touch = e.touches[0];
    const dx = touch.clientX - joystickCenter.x;
    const dy = touch.clientY - joystickCenter.y;
    const maxDist = 50;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * dist;
    const ny = Math.sin(angle) * dist;
    joystickKnob.style.transform = `translate(${nx}px, ${ny}px)`;

    // Map to keys
    const threshold = 15;
    touchKeys.forward = dy < -threshold;
    touchKeys.backward = dy > threshold;
    touchKeys.left = dx < -threshold;
    touchKeys.right = dx > threshold;
  }, { passive: false });

  const resetJoystick = () => {
    joystickActive = false;
    joystickKnob.style.transform = 'translate(0, 0)';
    touchKeys.forward = touchKeys.backward = touchKeys.left = touchKeys.right = false;
  };
  joystick.addEventListener('touchend', resetJoystick);
  joystick.addEventListener('touchcancel', resetJoystick);

  // Buttons
  const setupBtn = (id, key) => {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); touchKeys[key] = true; btn.classList.add('active'); }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); touchKeys[key] = false; btn.classList.remove('active'); }, { passive: false });
    btn.addEventListener('touchcancel', () => { touchKeys[key] = false; btn.classList.remove('active'); });
  };
  setupBtn('touch-boost', 'boost');
  setupBtn('touch-honk', 'honk');
  setupBtn('touch-balloon', 'fire');
  setupBtn('touch-brake', 'backward');
}

// Merge touch keys into main keys object
function getMergedKeys() {
  return {
    KeyW: keys['KeyW'] || touchKeys.forward,
    KeyS: keys['KeyS'] || touchKeys.backward,
    KeyA: keys['KeyA'] || touchKeys.left,
    KeyD: keys['KeyD'] || touchKeys.right,
    ArrowUp: keys['ArrowUp'] || touchKeys.forward,
    ArrowDown: keys['ArrowDown'] || touchKeys.backward,
    ArrowLeft: keys['ArrowLeft'] || touchKeys.left,
    ArrowRight: keys['ArrowRight'] || touchKeys.right,
    Space: keys['Space'] || touchKeys.honk,
    ShiftLeft: keys['ShiftLeft'] || touchKeys.boost,
    ShiftRight: keys['ShiftRight'] || touchKeys.boost,
    KeyF: keys['KeyF'] || touchKeys.fire,
  };
}

// --- Game loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const realDelta = Math.min(clock.getDelta(), 0.05);

  // Update slow-mo with real time
  game.updateSlowMo(realDelta);

  // Scale delta for game logic
  const scaledDelta = realDelta * game.timeScale;

  const mergedKeys = getMergedKeys();
  game.update(scaledDelta, mergedKeys);

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Render with post-processing
  composer.render();
}
animate();

// --- Menu background animation (orbiting camera before game starts) ---
let menuAngle = 0;
const menuAnimateInterval = setInterval(() => {
  if (game.state === STATE.MENU) {
    menuAngle += 0.003;
    const cityCenter = 20 * 22;
    const radius = 200;
    camera.position.set(
      cityCenter + Math.sin(menuAngle) * radius,
      40 + Math.sin(menuAngle * 0.5) * 10,
      cityCenter + Math.cos(menuAngle) * radius
    );
    camera.lookAt(cityCenter, 5, cityCenter);
  }
}, 16);

// --- Resize ---
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
});
