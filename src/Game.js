import * as THREE from 'three';
import { City } from './City.js';
import { Vehicle } from './Vehicle.js';
import { Traffic } from './Traffic.js';
import { TrafficLights } from './TrafficLights.js';
import { PassengerSystem } from './Passenger.js';
import { Wildlife } from './Wildlife.js';
import { Projectiles } from './Projectiles.js';
import { Navigation } from './Navigation.js';
import { MusicSystem } from './Music.js';
import { RemotePlayer } from './RemotePlayer.js';
import { Effects } from './Effects.js';
import { Police } from './Police.js';
import { GAME, CELL_SIZE, GRID_SIZE, TRAFFIC_LIGHT, LEVELS, FARE } from './constants.js';

export class Game {
  constructor(scene, camera, sunLight, network, postProcessing = {}) {
    this.scene = scene;
    this.camera = camera;
    this.sunLight = sunLight;
    this.network = network;
    this.bloomPass = postProcessing.bloomPass || null;
    this.caPass = postProcessing.caPass || null;
    this.state = 'menu';
    this.mode = 'single'; // 'single' | 'online'

    // Slow-motion system
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.baseFOV = 65;
    this.targetFOV = 65;

    // Photo mode
    this.photoMode = false;
    this.photoOrbitAngle = 0;

    // Dynamic events
    this.dynamicEventTimer = 20;
    this.activeEvents = [];

    // Drift spark timer
    this.driftSparkTimer = 0;
    this.tireMarkTimer = 0;

    // Remote players (online mode)
    this.remotePlayers = {};
    this.remoteScores = {};

    // Setup network callbacks
    if (network) {
      network.onPlayerState = (data) => this.handleRemoteState(data);
      network.onScoreUpdate = (data) => this.handleRemoteScore(data);
      network.onBalloon = (data) => this.handleRemoteBalloon(data);
      network.onPlayerLeft = (data) => this.handleRemoteLeave(data);
    }

    // Game state
    this.score = 0;
    this.timeLeft = GAME.totalTime;
    this.gameTime = 0;
    this.deliveries = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.totalStars = 0;
    this.violations = 0;
    this.fines = 0;
    this.level = 1;
    this.highScore = parseInt(localStorage.getItem('rickshaw-rush-hs') || '0', 10);
    this.topScores = JSON.parse(localStorage.getItem('rickshaw-rush-top5') || '[]');

    // Camera
    this.shakeIntensity = 0;
    this.camIdeal = new THREE.Vector3();
    this.camLookTarget = new THREE.Vector3();

    // Weather
    this.isRaining = false;
    this.rainTimer = 0;
    this.rainCooldown = 30;
    this.rainParticles = null;
    this.dustParticles = null;

    // Red light tracking
    this.wasInRedZone = false;
    this.redLightCooldown = 0;

    // Drift scoring
    this.driftTimer = 0;
    this.driftScore = 0;
    this.isDrifting = false;

    // Time bonus pickups
    this.timeBonuses = [];
    this.timeBonusSpawnTimer = 12;

    // Player trail (for minimap)
    this.trail = [];
    this.trailTimer = 0;

    // Fullscreen map
    this.fullmapOpen = false;

    // Crash fine tracking
    this.crashFineCooldown = 0;
    this.crashFineAmount = 30;

    // Nepali dialogues
    this.dialogueTimer = 0;
    this.dialogues = {
      pickup: [
        'Namaste dai! Thamel jaanu paryo!',
        'Chhito chhito! Late bhaisakyo!',
        'Dai, meter chalaunos hai!',
        'Bato hernu hai dai!',
        'Au au kta ho! Chal chal!',
        'Sabai jana au, jam!',
        'Chiya khana Ratnapark jaaam!',
        'Dai ekchhin! Ma aauchu!',
      ],
      delivery: [
        'Dhanyabaad dai!',
        'Ramro chalaunubhayo!',
        'Paisa rakhnus!',
        'Bahini lai pani bhanchu!',
        'Aaba yo bato ma aaunuhos!',
        'Ekdam ramro sewa!',
      ],
      crash: [
        'Ke garnu bhayo dai!?',
        'Bato herna siknus!',
        'Aaee! Bistarai!',
        'Kta ho kta! Hera ta!',
        'Budo gaadi rok!',
        'Pagal! Signal hera!',
      ],
      nearMiss: [
        'Woaaah!',
        'Ekdam close!',
        'Babal!',
        'Kya dare lagyo!',
      ],
      redLight: [
        'Signal red chha dai!',
        'Traffic le samatyo!',
        'Fine tirnu paryo!',
      ],
      rain: [
        'Pani paryo! Bistarai!',
        'Monsoon aayo!',
        'Chhata lyaunu parne!',
      ],
      policeChase: [
        'Police aayo! Bhaga!',
        'Siren bajyo! Chhito!',
        'Dai, police pichha lagyo!',
        'Traffic police! Bhaga bhaga!',
      ],
      policeCaught: [
        'Samatyo! Fine tirnu paryo!',
        'Police le rokyo!',
        'Pakrayo dai!',
        'License dekhau dai!',
      ],
      policeEscaped: [
        'Bachyo! Kya speed!',
        'Police chhutyo!',
        'Escape garyo dai!',
      ],
    };

    // Systems
    this.city = new City(scene);
    this.trafficLights = new TrafficLights(scene, this.city);
    this.vehicle = new Vehicle(scene);
    this.traffic = new Traffic(scene, this.city, this.trafficLights);
    this.passengers = new PassengerSystem(scene, this.city);
    this.wildlife = new Wildlife(scene, this.city);
    this.projectiles = new Projectiles(scene);
    this.navigation = new Navigation(scene, this.city);
    this.music = new MusicSystem();
    this.effects = new Effects(scene);
    this.police = new Police(scene, this.city, null); // music ref set after init

    // Freeze state (police caught)
    this.frozen = false;
    this.freezeTimer = 0;

    // Exhaust particles
    this.exhaustParticles = [];
    this.exhaustTimer = 0;

    // Vehicle headlights (glow during dusk)
    this.headlightL = new THREE.PointLight(0xffffaa, 0, 18);
    this.headlightR = new THREE.PointLight(0xffffaa, 0, 18);
    scene.add(this.headlightL);
    scene.add(this.headlightR);

    // Speed trail
    this.trailLength = 40;
    this.trailPositions = new Float32Array(this.trailLength * 3);
    this.trailOpacities = new Float32Array(this.trailLength);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.speedTrail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.speedTrail.frustumCulled = false;
    scene.add(this.speedTrail);

    // Glow trail (wider, softer)
    const glowTrailGeo = new THREE.BufferGeometry();
    this.glowTrailPositions = new Float32Array(this.trailLength * 3);
    glowTrailGeo.setAttribute('position', new THREE.BufferAttribute(this.glowTrailPositions, 3));
    this.glowTrail = new THREE.Points(
      glowTrailGeo,
      new THREE.PointsMaterial({
        color: 0x4ade80,
        size: 1.2,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.glowTrail.frustumCulled = false;
    scene.add(this.glowTrail);
    this.trailIndex = 0;

    // Particles
    this.createDustParticles();
    this.createRainParticles();

    // UI refs
    this.ui = {
      hud: document.getElementById('hud'),
      score: document.getElementById('score'),
      timer: document.getElementById('timer'),
      deliveries: document.getElementById('deliveries'),
      levelNum: document.getElementById('level-num'),
      starsEarned: document.getElementById('stars-earned'),
      overlay: document.getElementById('screen-overlay'),
      passengerInfo: document.getElementById('passenger-info'),
      passengerText: document.getElementById('passenger-text'),
      comboDisplay: document.getElementById('combo-display'),
      nearMiss: document.getElementById('near-miss'),
      speedLines: document.getElementById('speed-lines'),
      controlsHint: document.getElementById('controls-hint'),
      minimap: document.getElementById('minimap'),
      speedoValue: document.getElementById('speedo-value'),
      speedoBar: document.getElementById('speedo-bar'),
      speedo: document.getElementById('speedo'),
      boostBar: document.getElementById('boost-bar'),
      boostWrap: document.getElementById('boost-wrap'),
      boostStatus: document.getElementById('boost-status'),
      farePanel: document.getElementById('fare-panel'),
      fareValue: document.getElementById('fare-value'),
      fareSurge: document.getElementById('fare-surge'),
      violationFlash: document.getElementById('violation-flash'),
      violationText: document.getElementById('violation-text'),
      levelUp: document.getElementById('level-up'),
      starPopup: document.getElementById('star-popup'),
      rainOverlay: document.getElementById('rain-overlay'),
      ammoWrap: document.getElementById('ammo-wrap'),
      ammoDots: document.getElementById('ammo-dots'),
      crosshair: document.getElementById('crosshair'),
      slowmoVignette: document.getElementById('slowmo-vignette'),
      photoModeEl: document.getElementById('photo-mode'),
    };

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.fullmapCanvas = document.getElementById('fullmap-canvas');
    this.fullmapCtx = this.fullmapCanvas.getContext('2d');
    this.ui.fullmap = document.getElementById('fullmap');
    this.ui.minimapDist = document.getElementById('minimap-dist');
    this.ui.minimapCompass = document.getElementById('minimap-compass');

    // Initial position
    const start = this.getStartPosition();
    this.vehicle.setPosition(start.x, 0, start.z);
    this.camera.position.set(start.x, 12, start.z - 18);
    this.camera.lookAt(start.x, 0, start.z);
  }

  getStartPosition() {
    return new THREE.Vector3(3 * CELL_SIZE + CELL_SIZE / 2, 0, 3 * CELL_SIZE + CELL_SIZE / 2);
  }

  // --- Particles ---
  createDustParticles() {
    const count = 800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const citySize = GRID_SIZE * CELL_SIZE;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * citySize;
      pos[i * 3 + 1] = Math.random() * 15;
      pos[i * 3 + 2] = Math.random() * citySize;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    this.dustParticles = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xccbb99, size: 0.3, transparent: true, opacity: 0.15 })
    );
    this.scene.add(this.dustParticles);
  }

  createRainParticles() {
    const count = 4000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200;
      pos[i * 3 + 1] = Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    this.rainParticles = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xaaaacc, size: 0.12, transparent: true, opacity: 0.5 })
    );
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  // --- Mode selection ---
  setMode(mode) {
    this.mode = mode;
  }

  // --- Remote player handling (online) ---
  handleRemoteState(data) {
    if (!this.remotePlayers[data.id]) {
      const player = this.network.players.find(p => p.id === data.id);
      const color = player?.color || 0xcc3388;
      const name = player?.name || 'Player';
      this.remotePlayers[data.id] = new RemotePlayer(this.scene, data.id, color, name);
    }
    const rp = this.remotePlayers[data.id];
    rp.updateTarget(data.x, data.z, data.rotation, data.speed, data.boosting);
  }

  handleRemoteScore(data) {
    this.remoteScores[data.id] = { score: data.score, deliveries: data.deliveries, name: data.name };
  }

  handleRemoteBalloon(data) {
    // Spawn a balloon from remote player's position
    this.projectiles.fire(
      { x: data.x, y: 0, z: data.z, clone: () => new THREE.Vector3(data.x, 0, data.z) },
      data.rotation,
      data.speed || 20
    );
  }

  handleRemoteLeave(data) {
    if (this.remotePlayers[data.id]) {
      this.remotePlayers[data.id].destroy();
      delete this.remotePlayers[data.id];
      delete this.remoteScores[data.id];
    }
  }

  // (Local split-screen removed -- using online multiplayer instead)

  // --- Start / Reset ---
  handleStart() {
    if (this.state !== 'menu' && this.state !== 'gameover') return;

    this.state = 'playing';
    this.score = 0;
    this.timeLeft = GAME.totalTime;
    this.gameTime = 0;
    this.deliveries = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.totalStars = 0;
    this.violations = 0;
    this.fines = 0;
    this.level = 1;
    this.isRaining = false;
    this.rainCooldown = 30;

    const start = this.getStartPosition();
    this.vehicle.setPosition(start.x, 0, start.z);
    this.vehicle.speed = 0;
    this.vehicle.rotation = 0;
    this.vehicle.gripMultiplier = 1;

    this.passengers.reset();
    this.traffic.reset();
    this.wildlife.reset();

    // Clean time bonuses
    for (const tb of this.timeBonuses) this.scene.remove(tb.mesh);
    this.timeBonuses = [];
    this.timeBonusSpawnTimer = 12;
    this.trail = [];
    this.driftTimer = 0;
    this.driftScore = 0;
    this.fullmapOpen = false;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.targetFOV = this.baseFOV;
    this.camera.fov = this.baseFOV;
    this.photoMode = false;
    this.dynamicEventTimer = 20;
    this.activeEvents = [];
    this.driftSparkTimer = 0;
    this.tireMarkTimer = 0;
    this.effects.cleanup();
    this._duskBellPlayed = false;
    if (this.ui.fullmap) this.ui.fullmap.style.display = 'none';

    // UI
    this.ui.overlay.classList.add('hidden');
    this.ui.hud.style.display = 'flex';
    this.ui.controlsHint.style.display = 'block';
    this.ui.minimap.style.display = 'block';
    this.ui.speedo.style.display = 'block';
    this.ui.boostWrap.style.display = 'block';
    this.ui.rainOverlay.classList.remove('active');
    this.ui.ammoWrap.style.display = 'block';
    this.rainParticles.visible = false;
    this.projectiles.reset();

    // Online mode: clean remote players, show MP scoreboard
    if (this.mode === 'online') {
      for (const id of Object.keys(this.remotePlayers)) {
        this.remotePlayers[id].destroy();
      }
      this.remotePlayers = {};
      this.remoteScores = {};

      const mpSb = document.getElementById('mp-scoreboard');
      if (mpSb) mpSb.style.display = 'block';
    }

    // Police
    this.police.reset();
    this.frozen = false;
    this.freezeTimer = 0;

    // Music
    this.music.init();
    this.music.resume();
    this.police.music = this.music;
  }

  // --- Slow-motion ---
  updateSlowMo(realDelta) {
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDelta;
      if (this.slowMoTimer <= 0) {
        this.timeScale = 1;
        this.ui.slowmoVignette?.classList.remove('active');
      }
    }
  }

  triggerSlowMo() {
    this.timeScale = 0.2;
    this.slowMoTimer = 0.25; // 0.25 real seconds
    this.ui.slowmoVignette?.classList.add('active');
  }

  // --- Photo mode ---
  togglePhotoMode() {
    this.photoMode = !this.photoMode;
    if (this.photoMode) {
      this.ui.photoModeEl?.classList.add('active');
      this.ui.hud.style.display = 'none';
      this.ui.speedo.style.display = 'none';
      this.ui.boostWrap.style.display = 'none';
      this.ui.minimap.style.display = 'none';
      this.ui.ammoWrap.style.display = 'none';
      this.ui.controlsHint.style.display = 'none';
      this.ui.farePanel.style.display = 'none';
      this.photoOrbitAngle = this.vehicle.rotation;
    } else {
      this.ui.photoModeEl?.classList.remove('active');
      this.ui.hud.style.display = 'flex';
      this.ui.speedo.style.display = 'block';
      this.ui.boostWrap.style.display = 'block';
      this.ui.minimap.style.display = 'block';
      this.ui.ammoWrap.style.display = 'block';
      this.ui.controlsHint.style.display = 'block';
    }
  }

  // --- Main Update ---
  update(delta, keys) {
    if (this.state !== 'playing') return;
    if (this.photoMode) {
      this.photoOrbitAngle += delta * 0.5;
      const vPos = this.vehicle.position;
      const dist = 18;
      this.camera.position.set(
        vPos.x + Math.sin(this.photoOrbitAngle) * dist,
        8,
        vPos.z + Math.cos(this.photoOrbitAngle) * dist
      );
      this.camera.lookAt(vPos.x, 2, vPos.z);
      return;
    }

    this.gameTime += delta;
    this.timeLeft -= delta;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.gameOver(); return; }

    // Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.ui.comboDisplay.classList.remove('visible');
      }
    }

    // Cooldowns
    if (this.redLightCooldown > 0) this.redLightCooldown -= delta;
    if (this.crashFineCooldown > 0) this.crashFineCooldown -= delta;

    // Freeze state (police caught player)
    if (this.frozen) {
      this.freezeTimer -= delta;
      if (this.freezeTimer <= 0) {
        this.frozen = false;
      }
      // Still update camera and UI while frozen, but skip vehicle input
      this.vehicle.speed *= 0.9; // bleed off speed
      this.updateCamera(delta);
      this.updateUI();
      if (this.mode === 'single') this.updateMinimap();
      // Keep police visible during freeze
      this.police.update(delta, this.vehicle.position, this.city.getBuildingBounds());
      return;
    }

    // Input (in versus mode, arrows are P2-only)
    const isVs = this.mode === 'versus';
    const input = {
      forward: keys['KeyW'] || (!isVs && keys['ArrowUp']),
      backward: keys['KeyS'] || (!isVs && keys['ArrowDown']),
      left: keys['KeyA'] || (!isVs && keys['ArrowLeft']),
      right: keys['KeyD'] || (!isVs && keys['ArrowRight']),
      honk: keys['Space'],
      boost: keys['ShiftLeft'] || (!isVs && keys['ShiftRight']),
      fire: keys['KeyF'],
    };

    // Vehicle
    this.vehicle.update(delta, input);

    // Honk
    if (this.vehicle.honking) this.music.playHonk();

    // Engine sound
    this.music.updateEngine(this.vehicle.speed);
    this.music.setIntensity(0.4 + Math.abs(this.vehicle.speed) / 60 * 0.6);

    // Boost activation shake
    if (this.vehicle.boosting && !this._wasBoosting) {
      this.shakeIntensity = 0.2;
    }
    this._wasBoosting = this.vehicle.boosting;

    // Collisions
    this.checkBuildingCollisions();
    this.checkTrafficInteractions();
    this.checkWildlifeCollisions();

    // Speed bumps
    if (this.vehicle.checkSpeedBumps(this.city.getSpeedBumps())) {
      this.shakeIntensity = 0.15;
    }

    // Traffic lights & violations
    this.trafficLights.update(delta);
    this.checkTrafficViolation();

    // Traffic & wildlife
    this.traffic.update(delta, this.vehicle);
    this.wildlife.update(delta, this.vehicle.position);

    // Pigeon scatter
    if (this.city.pigeonGroups) this.updatePigeonScatter(delta);

    // Passengers
    this.passengers.setSurge(this.isRaining);
    const result = this.passengers.update(delta, this.vehicle.position, this.gameTime);
    if (result) this.handlePassengerEvent(result);

    // Weather
    this.updateWeather(delta);

    // Day cycle
    this.updateDayCycle();

    // Dust particles drift
    this.updateDust(delta);

    // Projectiles
    if (input.fire && !this._fireCooldown) {
      if (this.projectiles.fire(this.vehicle.position, this.vehicle.rotation, this.vehicle.speed)) {
        this.music.playHonk();
        this._fireCooldown = true;
      }
    }
    if (!input.fire) this._fireCooldown = false;
    this.projectiles.update(delta, this.traffic, this.wildlife, this.police);

    // Navigation arrows
    const navTarget = this.passengers.getDropoffPosition() || this.passengers.getPickupPosition();
    this.navigation.update(this.vehicle.position, navTarget);

    // Exhaust particles
    this.updateExhaust(delta);

    // Headlights (brighter at dusk)
    const dayProgress = this.gameTime / GAME.totalTime;
    const hlIntensity = dayProgress > 0.75 ? (dayProgress - 0.75) * 8 : 0;
    const vRot = this.vehicle.rotation;
    const vPos = this.vehicle.position;
    this.headlightL.intensity = hlIntensity;
    this.headlightR.intensity = hlIntensity;
    this.headlightL.position.set(vPos.x + Math.sin(vRot) * 3 - Math.cos(vRot) * 0.6, 1.5, vPos.z + Math.cos(vRot) * 3 + Math.sin(vRot) * 0.6);
    this.headlightR.position.set(vPos.x + Math.sin(vRot) * 3 + Math.cos(vRot) * 0.6, 1.5, vPos.z + Math.cos(vRot) * 3 - Math.sin(vRot) * 0.6);

    // Drift scoring
    this.updateDrift(delta, input);

    // Time bonus pickups
    this.updateTimeBonuses(delta);

    // Player trail
    this.trailTimer += delta;
    if (this.trailTimer > 0.15) {
      this.trailTimer = 0;
      this.trail.push({ x: this.vehicle.position.x, z: this.vehicle.position.z });
      if (this.trail.length > 80) this.trail.shift();
    }

    // Effects update (celebrations, sparks, debris, tire marks)
    this.effects.update(delta);

    // Speed trail update
    this.updateSpeedTrail();

    // Chromatic aberration on boost
    if (this.caPass) {
      const targetCA = this.vehicle.boosting ? 0.008 : (this.slowMoTimer > 0 ? 0.004 : 0);
      this.caPass.uniforms.amount.value += (targetCA - this.caPass.uniforms.amount.value) * Math.min(8 * delta, 1);
    }

    // Dynamic events
    this.updateDynamicEvents(delta);

    // Police chase
    const policeResult = this.police.update(delta, this.vehicle.position, this.city.getBuildingBounds());
    if (policeResult) {
      if (policeResult.type === 'caught') {
        const fine = 500;
        this.score = Math.max(0, this.score - fine);
        this.fines += fine;
        this.frozen = true;
        this.freezeTimer = 5;
        this.shakeIntensity = 0.6;
        this.showDialogue('policeCaught');
        this.showPoliceFine(fine);
        this.music.playViolation();
      } else if (policeResult.type === 'escaped') {
        const bonus = 50;
        this.score += bonus;
        this.showPassengerInfo(`${this.getDialogue('policeEscaped')} +Rs. ${bonus}`);
        setTimeout(() => this.hidePassengerInfo(), 2000);
      }
    }

    // Wind sound
    if (this.music.updateWind) {
      this.music.updateWind(Math.abs(this.vehicle.speed));
    }

    // Music time of day
    if (this.music.setTimeOfDay) {
      this.music.setTimeOfDay(this.gameTime / GAME.totalTime);
    }

    // Boost FOV change
    if (this.vehicle.boosting) {
      this.targetFOV = 80;
    } else if (this.slowMoTimer > 0) {
      this.targetFOV = 55;
    } else {
      this.targetFOV = this.baseFOV;
    }
    this.camera.fov += (this.targetFOV - this.camera.fov) * Math.min(6 * delta, 1);
    this.camera.updateProjectionMatrix();

    // Camera
    this.updateCamera(delta);

    // Shake decay
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.9;
      if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
    }

    // Speed lines
    const speedRatio = Math.abs(this.vehicle.speed) / 44;
    this.ui.speedLines.style.opacity = speedRatio > 0.7 ? (speedRatio - 0.7) * 2.5 : 0;

    // Online multiplayer sync
    if (this.mode === 'online' && this.network) {
      // Send own state
      this.network.sendState({
        x: this.vehicle.position.x,
        z: this.vehicle.position.z,
        rotation: this.vehicle.rotation,
        speed: this.vehicle.speed,
        boosting: this.vehicle.boosting,
      }, delta);

      // Send score periodically
      if (Math.floor(this.gameTime * 2) !== Math.floor((this.gameTime - delta) * 2)) {
        this.network.sendScoreUpdate({
          score: this.score,
          deliveries: this.deliveries,
          name: this.network.players.find(p => p.id === this.network.playerId)?.name || 'You',
        });
      }

      // Update remote players
      for (const id of Object.keys(this.remotePlayers)) {
        this.remotePlayers[id].update(delta);
      }

      // Check collisions with remote players
      this.checkRemotePlayerCollisions();

      this.updateOnlineUI();
    }

    // UI
    this.updateUI();
    if (this.mode === 'single') {
      this.updateMinimap();
      if (this.fullmapOpen) this.drawFullmap();
    }
  }

  // --- Remote player collisions (online) ---
  checkRemotePlayerCollisions() {
    const myPos = this.vehicle.position;
    for (const rp of Object.values(this.remotePlayers)) {
      const dx = myPos.x - rp.targetPos.x;
      const dz = myPos.z - rp.targetPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 3.5 && dist > 0.01) {
        const push = (3.5 - dist) * 0.3;
        myPos.x += (dx / dist) * push;
        myPos.z += (dz / dist) * push;
        this.vehicle.speed *= 0.4;
        this.shakeIntensity = 0.3;
      }
    }
  }

  updateOnlineUI() {
    const mpTimer = document.getElementById('mp-timer');
    const mpScores = document.getElementById('mp-scores');
    if (!mpTimer || !mpScores) return;

    const min = Math.floor(this.timeLeft / 60);
    const sec = Math.floor(this.timeLeft % 60);
    mpTimer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    mpTimer.className = this.timeLeft < 20 ? 'vl warn' : 'vl';

    // Build scoreboard
    const myName = this.network?.players.find(p => p.id === this.network.playerId)?.name || 'You';
    const allScores = [
      { name: myName, score: this.score, dels: this.deliveries, me: true },
      ...Object.values(this.remoteScores).map(s => ({ name: s.name, score: s.score, dels: s.deliveries, me: false })),
    ].sort((a, b) => b.score - a.score);

    mpScores.innerHTML = allScores.map(s =>
      `<span style="opacity:${s.me ? '1' : '.6'};${s.me ? 'color:#4ade80' : ''}">${s.name}: Rs.${s.score} (${s.dels})</span>`
    ).join(' | ');
  }

  // --- Collisions ---
  checkBuildingCollisions() {
    const pos = this.vehicle.position;
    const r = 1.8;
    for (const b of this.city.getBuildingBounds()) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < r) {
        const push = r - dist;
        if (dist > 0.001) { pos.x += (dx / dist) * push; pos.z += (dz / dist) * push; }
        else pos.x += push;
        if (Math.abs(this.vehicle.speed) > 5) {
          this.shakeIntensity = Math.min(Math.abs(this.vehicle.speed) * 0.02, 0.5);
          this.passengers.recordCrash();
          this.effects.spawnDebris(this.vehicle.position, 0x998877);
          if (this.music.playCollisionThud) this.music.playCollisionThud(Math.min(Math.abs(this.vehicle.speed) / 40, 1));
        }
        this.vehicle.speed *= 0.2;
      }
    }
    const citySize = GRID_SIZE * CELL_SIZE;
    pos.x = Math.max(2, Math.min(citySize - 2, pos.x));
    pos.z = Math.max(2, Math.min(citySize - 2, pos.z));
  }

  checkTrafficInteractions() {
    const vPos = this.vehicle.position;
    const vSpeed = Math.abs(this.vehicle.speed);
    const vR = 2;

    for (const npc of this.traffic.vehicles) {
      const dx = vPos.x - npc.position.x;
      const dz = vPos.z - npc.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < vR + npc.radius) {
        const push = (vR + npc.radius - dist) * 0.6;
        if (dist > 0.001) { vPos.x += (dx / dist) * push; vPos.z += (dz / dist) * push; }
        this.vehicle.speed *= 0.15;
        this.shakeIntensity = 0.4;
        this.passengers.recordCrash();
        // Debris on collision
        this.effects.spawnDebris(npc.position);
        if (this.music.playCollisionThud) this.music.playCollisionThud(Math.min(vSpeed / 40, 1));
        // Crash fine
        if (this.crashFineCooldown <= 0 && vSpeed > 8) {
          this.crashFineCooldown = 2;
          this.score = Math.max(0, this.score - this.crashFineAmount);
          this.fines += this.crashFineAmount;
          this.showDialogue('crash');
          this.showViolation();
          this.music.playViolation();

          // High-speed crash triggers police
          if (vSpeed > 30 && !this.police.isActive()) {
            this.police.activate(this.vehicle.position);
            this.showDialogue('policeChase');
          }
        }
      } else if (dist < GAME.nearMissDistance + npc.radius && vSpeed > 15) {
        if (!npc._nmCd || npc._nmCd <= 0) {
          npc._nmCd = 2;
          this.nearMisses++;
          this.score += GAME.nearMissBonus;
          this.showNearMiss();
          this.music.playNearMiss();
          // Slow-mo on near-miss!
          this.triggerSlowMo();
          this.effects.spawnNearMissFlash();
        }
      }
      if (npc._nmCd > 0) npc._nmCd -= 0.016;
    }
  }

  checkWildlifeCollisions() {
    const vPos = this.vehicle.position;
    const vR = 2;
    for (const a of this.wildlife.getColliders()) {
      const dx = vPos.x - a.position.x;
      const dz = vPos.z - a.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < vR + a.radius) {
        const push = (vR + a.radius - dist) * 0.6;
        if (dist > 0.001) { vPos.x += (dx / dist) * push; vPos.z += (dz / dist) * push; }
        this.vehicle.speed *= 0.1;
        this.shakeIntensity = 0.6;
        this.passengers.recordCrash();
      }
    }
  }

  // --- Traffic violations ---
  checkTrafficViolation() {
    const lightState = this.trafficLights.getStateAt(this.vehicle.position);
    const isInRedZone = lightState === 'red';
    const movingFast = Math.abs(this.vehicle.speed) > 5;

    if (isInRedZone && movingFast && !this.wasInRedZone && this.redLightCooldown <= 0) {
      this.violations++;
      this.fines += TRAFFIC_LIGHT.fineAmount;
      this.score = Math.max(0, this.score - TRAFFIC_LIGHT.fineAmount);
      this.passengers.recordRedLight();
      this.redLightCooldown = 3;
      this.showViolation();
      this.showDialogue('redLight');
      this.music.playViolation();

      // Trigger police after 3+ violations
      if (this.violations >= 3 && !this.police.isActive()) {
        this.police.activate(this.vehicle.position);
        this.showDialogue('policeChase');
      }
    }

    this.wasInRedZone = isInRedZone;
  }

  // --- Passenger events ---
  handlePassengerEvent(result) {
    if (result.type === 'pickup') {
      const dialogue = this.getDialogue('pickup');
      this.showPassengerInfo(`${result.name}: "${dialogue}" -- to ${result.destination}`);
      this.ui.farePanel.style.display = 'block';
      this.music.playPickup();
      setTimeout(() => this.hidePassengerInfo(), 3500);
    } else if (result.type === 'delivered') {
      this.combo = Math.min(this.combo + 1, GAME.comboMultipliers.length - 1);
      this.comboTimer = GAME.comboWindow;
      const mult = GAME.comboMultipliers[this.combo];
      const finalReward = Math.round(result.reward * mult);

      this.score += finalReward;
      this.deliveries++;
      this.totalStars += result.stars;

      const comboText = this.combo > 0 ? ` (x${mult} COMBO!)` : '';
      const delivDialogue = this.getDialogue('delivery');
      this.showPassengerInfo(`"${delivDialogue}" +Rs. ${finalReward}${comboText}`);
      this.showStarRating(result.stars);

      if (this.combo > 0) {
        this.ui.comboDisplay.textContent = `COMBO x${mult}`;
        this.ui.comboDisplay.classList.add('visible');
      }

      this.ui.farePanel.style.display = 'none';
      this.projectiles.refillAmmo(2);

      // Celebration effects!
      this.effects.spawnCelebration(this.vehicle.position);
      if (this.music.playCelebration) {
        this.music.playCelebration();
      } else {
        this.music.playDelivery();
      }

      // Combo milestone flash
      if (this.combo >= 2) {
        this.effects.spawnComboFlash();
        if (this.music.setComboLevel) this.music.setComboLevel(this.combo);
      }

      setTimeout(() => this.hidePassengerInfo(), 2500);

      // Level up check
      if (this.deliveries > 0 && this.deliveries % LEVELS.deliveriesPerLevel === 0) {
        this.levelUp();
      }
    } else if (result.type === 'timeout') {
      this.combo = 0;
      this.comboTimer = 0;
      this.ui.comboDisplay.classList.remove('visible');
      this.ui.farePanel.style.display = 'none';
      this.showPassengerInfo('Passenger left! Too slow...');
      setTimeout(() => this.hidePassengerInfo(), 2000);
    }
  }

  levelUp() {
    this.level++;
    this.traffic.addMore(LEVELS.extraTraffic);

    const el = this.ui.levelUp;
    el.textContent = `LEVEL ${this.level}!`;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'levelUpAnim 1.5s ease-out forwards';

    // Trigger rain at certain levels
    if (this.level === 3 && !this.isRaining) this.startRain();
  }

  // --- Weather ---
  updateWeather(delta) {
    this.rainCooldown -= delta;

    if (this.isRaining) {
      this.rainTimer -= delta;
      if (this.rainTimer <= 0) this.stopRain();
      else this.updateRainParticles(delta);
    } else if (this.rainCooldown <= 0 && Math.random() < 0.001) {
      this.startRain();
    }
  }

  startRain() {
    this.isRaining = true;
    this.rainTimer = 15 + Math.random() * 10;
    this.vehicle.gripMultiplier = 0.65;
    this.rainParticles.visible = true;
    this.ui.rainOverlay.classList.add('active');
    this.ui.fareSurge.textContent = 'SURGE x1.5';
    if (this.music.startRainSound) this.music.startRainSound();
    this.showPassengerInfo('Monsoon rain! Fares surge, roads slippery!');
    this.showDialogue('rain');
    setTimeout(() => this.hidePassengerInfo(), 2500);
  }

  stopRain() {
    this.isRaining = false;
    this.rainCooldown = 25 + Math.random() * 20;
    this.vehicle.gripMultiplier = 1;
    this.rainParticles.visible = false;
    this.ui.rainOverlay.classList.remove('active');
    this.ui.fareSurge.textContent = '';
    if (this.music.stopRainSound) this.music.stopRainSound();
  }

  updateRainParticles(delta) {
    const arr = this.rainParticles.geometry.attributes.position.array;
    const pPos = this.vehicle.position;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= 45 * delta;
      if (arr[i + 1] < 0) {
        arr[i] = pPos.x + (Math.random() - 0.5) * 200;
        arr[i + 1] = 40 + Math.random() * 15;
        arr[i + 2] = pPos.z + (Math.random() - 0.5) * 200;
      }
    }
    this.rainParticles.geometry.attributes.position.needsUpdate = true;
  }

  updateDust(delta) {
    const arr = this.dustParticles.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(i + this.gameTime) * 0.02;
      arr[i + 1] += Math.sin(i * 0.7 + this.gameTime * 0.5) * 0.01;
      if (arr[i + 1] > 15) arr[i + 1] = 0.5;
      if (arr[i + 1] < 0) arr[i + 1] = 15;
    }
    this.dustParticles.geometry.attributes.position.needsUpdate = true;
  }

  // --- Day cycle ---
  updateDayCycle() {
    const progress = this.gameTime / GAME.totalTime;

    let skyColor, sunColor, sunIntensity, fogDensity;

    if (progress < 0.15) {
      const t = progress / 0.15;
      skyColor = new THREE.Color(0xff9966).lerp(new THREE.Color(0x8ec8e8), t);
      sunColor = new THREE.Color(0xff8c00).lerp(new THREE.Color(0xfff4e0), t);
      sunIntensity = 0.5 + t * 0.4;
      fogDensity = 0.005 - t * 0.002;
    } else if (progress < 0.6) {
      skyColor = new THREE.Color(0x8ec8e8);
      sunColor = new THREE.Color(0xfff4e0);
      sunIntensity = 0.9;
      fogDensity = 0.003;
    } else if (progress < 0.82) {
      const t = (progress - 0.6) / 0.22;
      skyColor = new THREE.Color(0x8ec8e8).lerp(new THREE.Color(0xff6347), t);
      sunColor = new THREE.Color(0xfff4e0).lerp(new THREE.Color(0xff4500), t);
      sunIntensity = 0.9 - t * 0.35;
      fogDensity = 0.003 + t * 0.002;
    } else {
      const t = (progress - 0.82) / 0.18;
      skyColor = new THREE.Color(0xff6347).lerp(new THREE.Color(0x1a0a2e), t);
      sunColor = new THREE.Color(0xff4500).lerp(new THREE.Color(0x220044), t);
      sunIntensity = 0.55 - t * 0.3;
      fogDensity = 0.005 + t * 0.003;
    }

    // Apply rain darkening
    if (this.isRaining) {
      skyColor.multiplyScalar(0.6);
      sunIntensity *= 0.5;
      fogDensity += 0.002;
    }

    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(skyColor, fogDensity);
    this.sunLight.color = sunColor;
    this.sunLight.intensity = sunIntensity;

    // Temple bells at dusk (trigger once around 65% progress)
    if (progress > 0.63 && progress < 0.66 && !this._duskBellPlayed) {
      this._duskBellPlayed = true;
      if (this.music.playTempleBells) this.music.playTempleBells();
    }

    // Dynamic bloom: subtle during day, strong at dusk/night for neon glow
    if (this.bloomPass) {
      let bloomStrength = 0.3;
      if (progress < 0.15) {
        bloomStrength = 0.35; // dawn warmth
      } else if (progress < 0.6) {
        bloomStrength = 0.25; // day: subtle
      } else if (progress < 0.82) {
        bloomStrength = 0.35 + (progress - 0.6) / 0.22 * 0.3; // dusk: building up
      } else {
        bloomStrength = 0.65 + (progress - 0.82) / 0.18 * 0.35; // night: full glow
      }
      if (this.isRaining) bloomStrength += 0.1;
      this.bloomPass.strength = bloomStrength;
    }
  }

  // --- Camera ---
  updateCamera(delta) {
    const vPos = this.vehicle.position;
    const vRot = this.vehicle.rotation;
    const speed = Math.abs(this.vehicle.speed);

    // Close camera -- feels fast and dangerous
    const distBack = 10 + speed * 0.07;
    const distUp = 6 + speed * 0.035;

    this.camIdeal.set(
      vPos.x - Math.sin(vRot) * distBack,
      vPos.y + distUp,
      vPos.z - Math.cos(vRot) * distBack
    );

    const lerpFactor = Math.min((4 + speed * 0.06) * delta, 1);
    this.camera.position.lerp(this.camIdeal, lerpFactor);

    if (this.shakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.5;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeIntensity;
    }

    const lookAhead = 5 + speed * 0.12;
    this.camLookTarget.set(
      vPos.x + Math.sin(vRot) * lookAhead,
      vPos.y + 1.5,
      vPos.z + Math.cos(vRot) * lookAhead
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLookTarget);

    // Screen tilt on turns via up vector rotation
    const turnInput = (this.vehicle.tiltAngle || 0);
    const targetRoll = turnInput * 3.0 * Math.min(speed / 25, 1);
    this._camRoll = this._camRoll || 0;
    this._camRoll += (targetRoll - this._camRoll) * Math.min(5 * delta, 1);
    if (Math.abs(this._camRoll) > 0.002) {
      this.camera.up.set(Math.sin(this._camRoll), Math.cos(this._camRoll), 0);
      this.camera.lookAt(this.camLookTarget);
    }
  }

  // --- UI ---
  updateUI() {
    const min = Math.floor(this.timeLeft / 60);
    const sec = Math.floor(this.timeLeft % 60);
    this.ui.timer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    this.ui.timer.className = this.timeLeft < 20 ? 'vl warn' : 'vl';
    this.ui.score.textContent = `Rs. ${this.score}`;
    this.ui.deliveries.textContent = `${this.deliveries}`;
    this.ui.levelNum.textContent = this.level;

    // Stars
    const maxStars = this.deliveries * 3;
    this.ui.starsEarned.textContent = maxStars > 0 ? `${'★'.repeat(this.totalStars)}${'☆'.repeat(maxStars - this.totalStars)}` : '';

    // Speedometer
    const kmh = this.vehicle.getSpeedKmh();
    this.ui.speedoValue.textContent = kmh;
    this.ui.speedoBar.style.height = `${Math.min(kmh / 150 * 100, 100)}%`;

    // Boost gauge
    const boostPct = (this.vehicle.boostFuel / 2.5) * 100;
    this.ui.boostBar.style.height = `${boostPct}%`;
    this.ui.boostStatus.textContent = this.vehicle.boostCooldownTimer > 0 ? 'RECHARGING' : 'SHIFT';

    // Fare meter
    if (this.passengers.isCarrying()) {
      this.ui.fareValue.textContent = `Rs. ${this.passengers.getFare()}`;
    }

    // Ammo dots
    let dotsHtml = '';
    for (let i = 0; i < this.projectiles.maxAmmo; i++) {
      dotsHtml += `<div class="ammo-dot${i >= this.projectiles.ammo ? ' empty' : ''}"></div>`;
    }
    this.ui.ammoDots.innerHTML = dotsHtml;

    // Crosshair visibility (show when moving fast)
    const fast = Math.abs(this.vehicle.speed) > 10;
    this.ui.crosshair.classList.toggle('active', fast && this.projectiles.ammo > 0);
  }

  // --- Exhaust ---
  updateExhaust(delta) {
    const speed = Math.abs(this.vehicle.speed);
    if (speed < 3) return;

    this.exhaustTimer += delta;
    const interval = speed > 30 ? 0.03 : 0.06;

    if (this.exhaustTimer > interval) {
      this.exhaustTimer = 0;
      const rot = this.vehicle.rotation;
      const pos = this.vehicle.position;

      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + Math.random() * 0.15, 4, 4),
        new THREE.MeshBasicMaterial({
          color: this.vehicle.boosting ? 0xff6600 : 0x888888,
          transparent: true,
          opacity: 0.3,
        })
      );

      puff.position.set(
        pos.x - Math.sin(rot) * 2.5 + (Math.random() - 0.5) * 0.3,
        0.6 + Math.random() * 0.3,
        pos.z - Math.cos(rot) * 2.5 + (Math.random() - 0.5) * 0.3
      );
      this.scene.add(puff);
      this.exhaustParticles.push({ mesh: puff, life: 0.6 });
    }

    // Update existing puffs
    for (let i = this.exhaustParticles.length - 1; i >= 0; i--) {
      const p = this.exhaustParticles[i];
      p.life -= delta;
      p.mesh.position.y += delta * 1.5;
      p.mesh.scale.multiplyScalar(1 + delta * 2);
      p.mesh.material.opacity -= delta * 0.5;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.exhaustParticles.splice(i, 1);
      }
    }
  }

  // --- Drift ---
  updateDrift(delta, input) {
    const speed = Math.abs(this.vehicle.speed);
    const turning = input.left || input.right;
    const wasDrifting = this.isDrifting;

    this.isDrifting = turning && speed > 22 && this.vehicle.gripMultiplier < 1;
    // Also count as drift at very high speed turns even without rain
    if (!this.isDrifting) {
      this.isDrifting = turning && speed > 35;
    }

    if (this.isDrifting) {
      this.driftTimer += delta;
      this.driftScore += Math.floor(speed * delta * 2);
      // Drift sparks
      this.driftSparkTimer += delta;
      if (this.driftSparkTimer > 0.04) {
        this.driftSparkTimer = 0;
        this.effects.spawnSparks(this.vehicle.position, this.vehicle.rotation);
      }
      // Tire marks
      this.tireMarkTimer += delta;
      if (this.tireMarkTimer > 0.08) {
        this.tireMarkTimer = 0;
        this.effects.spawnTireMark(this.vehicle.position, this.vehicle.rotation);
      }
    } else if (wasDrifting && this.driftTimer > 0.8) {
      // Cash in drift
      const bonus = Math.min(this.driftScore, 200);
      this.score += bonus;
      this.showPassengerInfo(`DRIFT! +Rs. ${bonus}`);
      setTimeout(() => this.hidePassengerInfo(), 1500);
      this.driftTimer = 0;
      this.driftScore = 0;
    } else {
      this.driftTimer = 0;
      this.driftScore = 0;
    }
  }

  // --- Time Bonus Pickups ---
  updateTimeBonuses(delta) {
    this.timeBonusSpawnTimer -= delta;
    if (this.timeBonusSpawnTimer <= 0) {
      this.timeBonusSpawnTimer = 10 + Math.random() * 15;
      this.spawnTimeBonus();
    }

    const vPos = this.vehicle.position;
    for (let i = this.timeBonuses.length - 1; i >= 0; i--) {
      const tb = this.timeBonuses[i];
      tb.life -= delta;

      // Animate
      tb.mesh.position.y = 2 + Math.sin(performance.now() * 0.005 + i) * 0.5;
      tb.mesh.rotation.y += delta * 2;

      // Collect
      const dx = vPos.x - tb.position.x;
      const dz = vPos.z - tb.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 4) {
        this.timeLeft = Math.min(this.timeLeft + tb.seconds, GAME.totalTime);
        this.showPassengerInfo(`+${tb.seconds}s TIME BONUS!`);
        this.music.playPickup();
        setTimeout(() => this.hidePassengerInfo(), 1500);
        this.scene.remove(tb.mesh);
        this.timeBonuses.splice(i, 1);
        continue;
      }

      // Expire
      if (tb.life <= 0) {
        this.scene.remove(tb.mesh);
        this.timeBonuses.splice(i, 1);
      }
    }
  }

  spawnTimeBonus() {
    const roads = this.city.getRoadPositions();
    const rp = roads[Math.floor(Math.random() * roads.length)];

    const group = new THREE.Group();
    // Clock-like icon: torus + hands
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.15, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    group.add(center);

    // Plus sign
    const barH = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    group.add(barH);
    const barV = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.6, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    group.add(barV);

    // Glow ring on ground
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.2, 16),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -1.8;
    group.add(glow);

    group.position.set(rp.x, 2, rp.z);
    this.scene.add(group);

    const seconds = [5, 8, 10][Math.floor(Math.random() * 3)];
    this.timeBonuses.push({
      position: rp.clone(),
      mesh: group,
      seconds,
      life: 20,
    });
  }

  // --- Fullscreen map toggle ---
  toggleFullmap() {
    this.fullmapOpen = !this.fullmapOpen;
    this.ui.fullmap.style.display = this.fullmapOpen ? 'flex' : 'none';
    if (this.fullmapOpen) this.drawFullmap();
  }

  drawFullmap() {
    const ctx = this.fullmapCtx;
    const W = this.fullmapCanvas.width;
    const H = this.fullmapCanvas.height;
    const citySize = GRID_SIZE * CELL_SIZE;
    const s = W / citySize;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Grass areas (buildings)
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, W, H);

    // Roads
    ctx.fillStyle = '#2a2a30';
    for (const rp of this.city.getRoadPositions()) {
      ctx.fillRect((rp.x - CELL_SIZE / 2) * s, (rp.z - CELL_SIZE / 2) * s, CELL_SIZE * s, CELL_SIZE * s);
    }

    // Road center lines
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < GRID_SIZE; i += 3) {
      const p = i * CELL_SIZE * s + CELL_SIZE * s / 2;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
    }

    // Buildings
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.city.isRoad(x, z)) continue;
        ctx.fillStyle = this.city.grid[x][z] === 'temple' ? '#554422' : '#1d2433';
        const px = x * CELL_SIZE * s + 2;
        const pz = z * CELL_SIZE * s + 2;
        ctx.fillRect(px, pz, CELL_SIZE * s - 4, CELL_SIZE * s - 4);
      }
    }

    // Temple label
    const tc = Math.floor(GRID_SIZE / 2);
    const tcx = (tc - 0.5) * CELL_SIZE + CELL_SIZE / 2;
    const tcz = (tc - 0.5) * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#ffd700';
    ctx.font = '11px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText('STUPA', tcx * s, tcz * s + 4);

    // Traffic lights
    for (const tl of this.trafficLights.getLights()) {
      const colors = { green: '#00cc00', yellow: '#ccaa00', red: '#cc0000' };
      ctx.fillStyle = colors[tl.state];
      ctx.beginPath();
      ctx.arc(tl.position.x * s, tl.position.z * s, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Time bonuses
    ctx.fillStyle = '#22d3ee';
    for (const tb of this.timeBonuses) {
      ctx.beginPath();
      ctx.arc(tb.position.x * s, tb.position.z * s, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police
    if (this.police.isActive()) {
      const flash = Math.sin(performance.now() * 0.008) > 0;
      ctx.fillStyle = flash ? '#ff0000' : '#0044ff';
      ctx.beginPath();
      ctx.arc(this.police.position.x * s, this.police.position.z * s, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = flash ? 'rgba(255,0,0,.4)' : 'rgba(0,68,255,.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.police.position.x * s, this.police.position.z * s, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Trail
    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,68,68,.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x * s, this.trail[0].z * s);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x * s, this.trail[i].z * s);
      }
      ctx.stroke();
    }

    // Objectives
    const pickup = this.passengers.getPickupPosition();
    const dropoff = this.passengers.getDropoffPosition();
    if (pickup) {
      this.drawMapMarker(ctx, pickup.x * s, pickup.z * s, '#ffd700', 'PICKUP');
    }
    if (dropoff) {
      this.drawMapMarker(ctx, dropoff.x * s, dropoff.z * s, '#4ade80', 'DELIVER');
    }

    // Player
    const pos = this.vehicle.position;
    const rot = this.vehicle.rotation;
    ctx.save();
    ctx.translate(pos.x * s, pos.z * s);
    ctx.rotate(-rot);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Compass
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.font = 'bold 12px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 16);
    ctx.fillText('S', W / 2, H - 6);
    ctx.fillText('W', 10, H / 2 + 4);
    ctx.fillText('E', W - 10, H / 2 + 4);
  }

  drawMapMarker(ctx, x, y, color, label) {
    const pulse = Math.sin(performance.now() * 0.005) * 0.3 + 1;
    ctx.beginPath();
    ctx.arc(x, y, 7 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = color + '33';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 9px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 11);
  }

  // --- Minimap (player-centered, rotating) ---
  updateMinimap() {
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const citySize = GRID_SIZE * CELL_SIZE;
    const viewRadius = 80; // world units visible
    const s = (W / 2) / viewRadius;
    const pPos = this.vehicle.position;
    const pRot = this.vehicle.rotation;
    const time = performance.now() * 0.004;

    ctx.clearRect(0, 0, W, H);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // Rotate around player (player always faces up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pRot);

    // Helper: world to minimap coords
    const wx = (worldX) => (worldX - pPos.x) * s;
    const wz = (worldZ) => (worldZ - pPos.z) * s;

    // Roads
    ctx.fillStyle = '#1e1e28';
    for (const rp of this.city.getRoadPositions()) {
      const rx = wx(rp.x - CELL_SIZE / 2);
      const rz = wz(rp.z - CELL_SIZE / 2);
      const rw = CELL_SIZE * s;
      // Skip if too far
      if (Math.abs(rx) > cx + rw && Math.abs(rz) > cy + rw) continue;
      ctx.fillRect(rx, rz, rw, rw);
    }

    // Buildings
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.city.isRoad(x, z)) continue;
        const bx = wx(x * CELL_SIZE + 2);
        const bz = wz(z * CELL_SIZE + 2);
        const bw = (CELL_SIZE - 4) * s;
        if (Math.abs(bx) > cx + bw && Math.abs(bz) > cy + bw) continue;
        ctx.fillStyle = this.city.grid[x][z] === 'temple' ? '#3d3520' : '#151a24';
        ctx.fillRect(bx, bz, bw, bw);
      }
    }

    // Traffic lights
    for (const tl of this.trafficLights.getLights()) {
      const tx = wx(tl.position.x);
      const tz = wz(tl.position.z);
      if (Math.abs(tx) > cx + 5 || Math.abs(tz) > cy + 5) continue;
      const colors = { green: '#00dd00', yellow: '#ddaa00', red: '#dd0000' };
      ctx.fillStyle = colors[tl.state];
      ctx.beginPath();
      ctx.arc(tx, tz, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // NPC traffic
    ctx.fillStyle = 'rgba(100,130,255,.35)';
    for (const npc of this.traffic.vehicles) {
      const nx = wx(npc.position.x);
      const nz = wz(npc.position.z);
      if (Math.abs(nx) > cx || Math.abs(nz) > cy) continue;
      ctx.fillRect(nx - 1.5, nz - 1.5, 3, 3);
    }

    // Wildlife (large animals only)
    ctx.fillStyle = 'rgba(200,160,100,.4)';
    for (const a of this.wildlife.getColliders()) {
      const ax = wx(a.position.x);
      const az = wz(a.position.z);
      if (Math.abs(ax) > cx || Math.abs(az) > cy) continue;
      ctx.beginPath();
      ctx.arc(ax, az, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police (flashing red/blue blip)
    if (this.police.isActive()) {
      const px = wx(this.police.position.x);
      const pz = wz(this.police.position.z);
      if (Math.abs(px) <= cx && Math.abs(pz) <= cy) {
        const flash = Math.sin(time * 8) > 0;
        ctx.fillStyle = flash ? '#ff0000' : '#0044ff';
        ctx.beginPath();
        ctx.arc(px, pz, 4, 0, Math.PI * 2);
        ctx.fill();
        // Pulse ring
        const pulse = 6 + Math.sin(time * 4) * 2;
        ctx.strokeStyle = flash ? 'rgba(255,0,0,.3)' : 'rgba(0,68,255,.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, pz, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Time bonuses
    ctx.fillStyle = '#22d3ee';
    for (const tb of this.timeBonuses) {
      const bx = wx(tb.position.x);
      const bz = wz(tb.position.z);
      if (Math.abs(bx) > cx || Math.abs(bz) > cy) continue;
      const pulse = 2.5 + Math.sin(time + tb.life) * 0.8;
      ctx.beginPath();
      ctx.arc(bx, bz, pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trail
    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,68,68,.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx(this.trail[0].x), wz(this.trail[0].z));
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(wx(this.trail[i].x), wz(this.trail[i].z));
      }
      ctx.stroke();
    }

    // Passenger markers
    const pickup = this.passengers.getPickupPosition();
    const dropoff = this.passengers.getDropoffPosition();
    if (pickup) {
      const px = wx(pickup.x);
      const pz = wz(pickup.z);
      const pulse = 4 + Math.sin(time * 2) * 1.5;
      ctx.fillStyle = 'rgba(255,215,0,.15)';
      ctx.beginPath(); ctx.arc(px, pz, pulse + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (dropoff) {
      const dx = wx(dropoff.x);
      const dz = wz(dropoff.z);
      const pulse = 4 + Math.sin(time * 2 + 1) * 1.5;
      ctx.fillStyle = 'rgba(74,222,128,.15)';
      ctx.beginPath(); ctx.arc(dx, dz, pulse + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(dx, dz, 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore(); // end rotation

    // Player icon (always centered, always pointing up)
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // FOV cone
    ctx.fillStyle = 'rgba(255,68,68,.04)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - 30, cy - cx);
    ctx.lineTo(cx + 30, cy - cx);
    ctx.closePath();
    ctx.fill();

    // Circular border glow
    const grad = ctx.createRadialGradient(cx, cy, cx * 0.7, cx, cy, cx);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.restore(); // end clip

    // Compass (outside clip)
    const compassAngle = pRot;
    const nX = cx + Math.sin(compassAngle) * (cx - 14);
    const nY = cy - Math.cos(compassAngle) * (cy - 14);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 9px Rajdhani';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nX, nY);

    // Distance to objective
    const target = dropoff || pickup;
    if (target) {
      const dist = Math.round(Math.sqrt(
        (pPos.x - target.x) ** 2 + (pPos.z - target.z) ** 2
      ));
      this.ui.minimapDist.textContent = `${dist}m`;
    } else {
      this.ui.minimapDist.textContent = '';
    }
  }

  // --- Visual effects ---
  showPassengerInfo(text) {
    this.ui.passengerText.textContent = text;
    this.ui.passengerInfo.classList.add('visible');
  }
  hidePassengerInfo() {
    this.ui.passengerInfo.classList.remove('visible');
  }

  showNearMiss() {
    const el = this.ui.nearMiss;
    el.textContent = this.getDialogue('nearMiss') + ' +25';
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'nearMissAnim 0.8s ease-out forwards';
  }

  showDialogue(type) {
    const text = this.getDialogue(type);
    if (text) this.showPassengerInfo(text);
    if (type !== 'pickup' && type !== 'delivery') {
      setTimeout(() => this.hidePassengerInfo(), 2000);
    }
  }

  getDialogue(type) {
    const list = this.dialogues[type];
    if (!list || list.length === 0) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  showViolation() {
    this.ui.violationFlash.classList.remove('active');
    this.ui.violationFlash.offsetHeight;
    this.ui.violationFlash.classList.add('active');

    const el = this.ui.violationText;
    el.textContent = `RED LIGHT! -Rs. ${TRAFFIC_LIGHT.fineAmount}`;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'violationTextAnim 1.2s ease-out forwards';
  }

  showPoliceFine(amount) {
    this.ui.violationFlash.classList.remove('active');
    this.ui.violationFlash.offsetHeight;
    this.ui.violationFlash.classList.add('active');

    const el = this.ui.violationText;
    el.textContent = `BUSTED! -Rs. ${amount}`;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'violationTextAnim 1.2s ease-out forwards';
  }

  showStarRating(stars) {
    const el = this.ui.starPopup;
    el.textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆';
    el.style.color = stars >= 3 ? '#fbbf24' : stars >= 2 ? '#fb923c' : '#ef4444';
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'starAnim 1.5s ease-out forwards';
  }

  // --- Speed Trail ---
  updateSpeedTrail() {
    const speed = Math.abs(this.vehicle.speed);
    const pos = this.vehicle.position;
    const rot = this.vehicle.rotation;

    // Add new trail point at vehicle rear
    const i = this.trailIndex % this.trailLength;
    this.trailPositions[i * 3] = pos.x - Math.sin(rot) * 2.5;
    this.trailPositions[i * 3 + 1] = 0.5;
    this.trailPositions[i * 3 + 2] = pos.z - Math.cos(rot) * 2.5;
    this.glowTrailPositions[i * 3] = this.trailPositions[i * 3];
    this.glowTrailPositions[i * 3 + 1] = 0.5;
    this.glowTrailPositions[i * 3 + 2] = this.trailPositions[i * 3 + 2];
    this.trailIndex++;

    // Visibility based on speed
    const showTrail = speed > 15;
    this.speedTrail.visible = showTrail;
    this.glowTrail.visible = showTrail;

    if (showTrail) {
      const intensity = Math.min((speed - 15) / 30, 1);
      this.speedTrail.material.opacity = 0.4 * intensity;
      this.glowTrail.material.opacity = 0.2 * intensity;
      this.glowTrail.material.size = 0.8 + intensity * 1.5;

      // Color shifts with boost
      if (this.vehicle.boosting) {
        this.speedTrail.material.color.setHex(0xff6600);
        this.glowTrail.material.color.setHex(0xff8800);
      } else {
        this.speedTrail.material.color.setHex(0x22d3ee);
        this.glowTrail.material.color.setHex(0x4ade80);
      }
    }

    this.speedTrail.geometry.attributes.position.needsUpdate = true;
    this.glowTrail.geometry.attributes.position.needsUpdate = true;
  }

  // --- Pigeon Scatter ---
  updatePigeonScatter(delta) {
    const vPos = this.vehicle.position;
    const speed = Math.abs(this.vehicle.speed);
    if (speed < 5) return;

    for (const group of this.city.pigeonGroups) {
      const dx = vPos.x - group.position.x;
      const dz = vPos.z - group.position.z;
      const dist = dx * dx + dz * dz;

      if (dist < 64 && !group.scattered) {
        group.scattered = true;
        group.scatterTimer = 3;
        for (const pigeon of group.meshes) {
          pigeon.userData.scatterVY = 3 + Math.random() * 4;
          pigeon.userData.scatterVX = (Math.random() - 0.5) * 6;
          pigeon.userData.scatterVZ = (Math.random() - 0.5) * 6;
          pigeon.userData.scatterSpin = (Math.random() - 0.5) * 8;
        }
      }

      if (group.scattered) {
        group.scatterTimer -= delta;
        for (const pigeon of group.meshes) {
          if (pigeon.userData.scatterVY !== undefined) {
            pigeon.position.x += pigeon.userData.scatterVX * delta;
            pigeon.position.y += pigeon.userData.scatterVY * delta;
            pigeon.position.z += pigeon.userData.scatterVZ * delta;
            pigeon.rotation.z += pigeon.userData.scatterSpin * delta;
            pigeon.userData.scatterVY -= 3 * delta;
          }
        }
        // Reset after timer
        if (group.scatterTimer <= 0) {
          group.scattered = false;
          for (const pigeon of group.meshes) {
            // Return to ground near original position
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 3;
            pigeon.position.set(
              group.position.x + Math.cos(angle) * r,
              0,
              group.position.z + Math.sin(angle) * r
            );
            pigeon.rotation.z = 0;
            pigeon.rotation.y = Math.random() * Math.PI * 2;
            delete pigeon.userData.scatterVY;
            delete pigeon.userData.scatterVX;
            delete pigeon.userData.scatterVZ;
            delete pigeon.userData.scatterSpin;
          }
        }
      }
    }
  }

  // --- Dynamic Events ---
  updateDynamicEvents(delta) {
    this.dynamicEventTimer -= delta;
    if (this.dynamicEventTimer <= 0) {
      this.dynamicEventTimer = 25 + Math.random() * 20;
      this.spawnDynamicEvent();
    }

    // Update active events
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const ev = this.activeEvents[i];
      ev.life -= delta;

      if (ev.type === 'procession') {
        for (const npc of ev.meshes) {
          npc.position.x += ev.dirX * 2 * delta;
          npc.position.z += ev.dirZ * 2 * delta;
          npc.children[0].position.y = 1 + Math.sin(performance.now() * 0.005 + npc.userData.phase) * 0.15;
        }
      } else if (ev.type === 'sitting_cow') {
        ev.meshes[0].children[0].rotation.y = Math.sin(performance.now() * 0.001) * 0.1;
      }

      // Collision with player
      const vPos = this.vehicle.position;
      const vSpeed = Math.abs(this.vehicle.speed);
      if (vSpeed > 3 && !ev._hitCooldown) {
        for (const mesh of ev.meshes) {
          const dx = vPos.x - mesh.position.x;
          const dz = vPos.z - mesh.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const hitRadius = ev.type === 'sitting_cow' ? 2.5 : 1.5;
          if (dist < hitRadius) {
            // Push player back
            if (dist > 0.01) {
              vPos.x += (dx / dist) * (hitRadius - dist) * 0.5;
              vPos.z += (dz / dist) * (hitRadius - dist) * 0.5;
            }
            this.vehicle.speed *= 0.3;
            this.shakeIntensity = 0.3;
            this.effects.spawnDebris(mesh.position);
            ev._hitCooldown = 1.5;

            // Type-specific sounds
            if (ev.type === 'sitting_cow') {
              if (this.music.playMoo) this.music.playMoo();
            } else if (ev.type === 'procession') {
              if (this.music.playAiyaa) this.music.playAiyaa();
            } else {
              if (this.music.playSoftCrash) this.music.playSoftCrash();
            }
            break;
          }
        }
      }
      if (ev._hitCooldown > 0) ev._hitCooldown -= delta;

      if (ev.life <= 0) {
        for (const m of ev.meshes) this.scene.remove(m);
        this.activeEvents.splice(i, 1);
      }
    }
  }

  spawnDynamicEvent() {
    const roads = this.city.getRoadPositions();
    const rp = roads[Math.floor(Math.random() * roads.length)];
    const eventType = Math.random();

    if (eventType < 0.4) {
      // Festival procession - line of 6 NPCs with colorful outfits walking across a road
      const meshes = [];
      const isHoriz = Math.random() > 0.5;
      const dirX = isHoriz ? (Math.random() > 0.5 ? 1 : -1) : 0;
      const dirZ = isHoriz ? 0 : (Math.random() > 0.5 ? 1 : -1);
      const colors = [0xff4444, 0xff8800, 0xffcc00, 0x44ff44, 0x4488ff, 0xff44ff];

      for (let i = 0; i < 6; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.4, 1.2, 6),
          new THREE.MeshLambertMaterial({ color: colors[i % colors.length] })
        );
        body.position.y = 1;
        g.add(body);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 6, 6),
          new THREE.MeshLambertMaterial({ color: 0xc68642 })
        );
        head.position.y = 1.8;
        g.add(head);
        g.position.set(
          rp.x + (isHoriz ? -i * 1.5 * dirX : (Math.random() - 0.5) * 2),
          0,
          rp.z + (isHoriz ? (Math.random() - 0.5) * 2 : -i * 1.5 * dirZ)
        );
        g.userData.phase = i * 0.5;
        this.scene.add(g);
        meshes.push(g);
      }

      this.activeEvents.push({ type: 'procession', meshes, dirX, dirZ, life: 15 });
      this.showPassengerInfo('Festival procession! Watch out!');
      setTimeout(() => this.hidePassengerInfo(), 2000);
    } else if (eventType < 0.7) {
      // Sitting cow in the middle of the road
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.8, 2),
        new THREE.MeshLambertMaterial({ color: 0xd2b48c })
      );
      body.position.y = 0.4;
      g.add(body);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.5, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xd2b48c })
      );
      head.position.set(0, 0.6, 1.2);
      g.add(head);
      g.position.set(rp.x, 0, rp.z);
      this.scene.add(g);

      this.activeEvents.push({ type: 'sitting_cow', meshes: [g], life: 20 });
      this.showPassengerInfo('Cow blocking the road! Go around!');
      setTimeout(() => this.hidePassengerInfo(), 2000);
    } else {
      // Motorcycle rally - 8 fast motorcycles zooming past
      const meshes = [];
      const dir = Math.random() > 0.5 ? 1 : -1;
      for (let i = 0; i < 8; i++) {
        const bike = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.8, 1.2),
          new THREE.MeshLambertMaterial({ color: 0x222222 + Math.floor(Math.random() * 0x333333) })
        );
        bike.position.set(
          rp.x + (Math.random() - 0.5) * 4 - dir * i * 3,
          0.5,
          rp.z + (Math.random() - 0.5) * 3
        );
        const rider = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.6, 0.35),
          new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        rider.position.y = 0.7;
        bike.add(rider);
        this.scene.add(bike);
        meshes.push(bike);
      }

      this.activeEvents.push({
        type: 'procession', meshes, dirX: dir, dirZ: 0, life: 8,
      });
    }
  }

  // --- Game Over ---
  gameOver() {
    this.state = 'gameover';
    this.music.stop();

    // High score (solo only)
    if (this.mode === 'single') {
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('rickshaw-rush-hs', this.score.toString());
      }
      // Top 5 scores
      this.topScores.push({ score: this.score, deliveries: this.deliveries, level: this.level, date: new Date().toLocaleDateString() });
      this.topScores.sort((a, b) => b.score - a.score);
      this.topScores = this.topScores.slice(0, 5);
      localStorage.setItem('rickshaw-rush-top5', JSON.stringify(this.topScores));
    }

    // Hide ALL gameplay UI
    this.ui.hud.style.display = 'none';
    this.ui.controlsHint.style.display = 'none';
    this.ui.minimap.style.display = 'none';
    this.ui.speedo.style.display = 'none';
    this.ui.boostWrap.style.display = 'none';
    this.ui.farePanel.style.display = 'none';
    this.ui.ammoWrap.style.display = 'none';
    this.ui.crosshair.classList.remove('active');
    this.ui.comboDisplay.classList.remove('visible');
    this.ui.rainOverlay.classList.remove('active');
    this.hidePassengerInfo();

    const mpSb = document.getElementById('mp-scoreboard');
    if (mpSb) mpSb.style.display = 'none';

    // Cleanup
    this.police.reset();
    this.projectiles.reset();
    this.effects.cleanup();
    for (const ev of this.activeEvents) {
      for (const m of ev.meshes) this.scene.remove(m);
    }
    this.activeEvents = [];
    for (const p of this.exhaustParticles) this.scene.remove(p.mesh);
    this.exhaustParticles = [];

    // Clean remote players
    for (const rp of Object.values(this.remotePlayers)) rp.destroy();
    this.remotePlayers = {};

    if (this.mode === 'online') {
      // --- Online multiplayer game over ---
      const myName = this.network?.players.find(p => p.id === this.network?.playerId)?.name || 'You';
      const allScores = [
        { name: myName, score: this.score, dels: this.deliveries, stars: this.totalStars, me: true },
        ...Object.values(this.remoteScores).map(s => ({
          name: s.name, score: s.score, dels: s.deliveries, stars: 0, me: false,
        })),
      ].sort((a, b) => b.score - a.score);

      const leaderboard = allScores.map((s, i) => {
        const medal = i === 0 ? '&#x1F451;' : '';
        const style = s.me ? 'color:#4ade80;font-weight:700' : 'opacity:.7';
        return `<div style="${style};font-size:18px;line-height:2">${medal} ${i + 1}. ${s.name} -- Rs. ${s.score} (${s.dels} deliveries)</div>`;
      }).join('');

      const iWon = allScores[0]?.me;
      this.ui.overlay.innerHTML = `
        <h1>${iWon ? 'YOU WIN!' : 'GAME OVER'}</h1>
        <div style="margin:16px 0">${leaderboard}</div>
        <br>
        <div class="overlay-prompt">Press 1 for Solo or create a new room</div>
      `;

      this.network?.disconnect();
    } else {
      // --- Solo game over ---
      const avgReward = this.deliveries > 0 ? Math.round(this.score / this.deliveries) : 0;
      const maxStars = this.deliveries * 3;
      const isNewHigh = this.score >= this.highScore && this.score > 0;

      const achievements = [];
      if (this.deliveries >= 5) achievements.push('Busy Driver');
      if (this.deliveries >= 10) achievements.push('Road Warrior');
      if (this.nearMisses >= 5) achievements.push('Close Caller');
      if (this.totalStars >= 9) achievements.push('Star Collector');
      if (this.violations === 0 && this.deliveries > 0) achievements.push('Law Abiding');
      if (this.level >= 4) achievements.push('Level Boss');

      const achHtml = achievements.length > 0
        ? `<div class="overlay-achievements">${achievements.map(a =>
            `<div class="achievement earned">${a}</div>`).join('')}</div>`
        : '';

      // Top 5 leaderboard
      const top5Html = this.topScores.length > 0
        ? `<div style="margin-top:12px;font-size:13px;opacity:.5">
            <div style="margin-bottom:4px;letter-spacing:1px;text-transform:uppercase;font-size:10px;opacity:.6">TOP SCORES</div>
            ${this.topScores.map((s, i) =>
              `<div style="${s.score === this.score && s.deliveries === this.deliveries ? 'color:#4ade80' : ''}">${i + 1}. Rs. ${s.score} - Lv.${s.level} (${s.deliveries} del)</div>`
            ).join('')}
          </div>`
        : '';

      this.ui.overlay.innerHTML = `
        <h1>${isNewHigh ? 'NEW HIGH SCORE!' : "TIME'S UP!"}</h1>
        <div class="overlay-final-score">Rs. ${this.score}</div>
        <div class="overlay-stats">
          Level reached: ${this.level}<br>
          Deliveries: ${this.deliveries}<br>
          Stars: ${'★'.repeat(this.totalStars)}${'☆'.repeat(Math.max(0, maxStars - this.totalStars))} (${this.totalStars}/${maxStars})<br>
          Near misses: ${this.nearMisses}<br>
          Violations: ${this.violations} (Fines: Rs. ${this.fines})<br>
          Avg per delivery: Rs. ${avgReward}
        </div>
        ${top5Html}
        ${achHtml}
        <br>
        <div class="overlay-prompt">Press ENTER or tap SOLO to play again</div>
      `;
    }

    this.ui.overlay.classList.remove('hidden');
  }
}
