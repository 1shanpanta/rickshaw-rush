import * as THREE from 'three';
import { City } from './City.js';
import { Vehicle } from './Vehicle.js';
import { Traffic } from './Traffic.js';
import { TrafficLights } from './TrafficLights.js';
import { Wildlife } from './Wildlife.js';
import { Projectiles } from './Projectiles.js';
import { MusicSystem } from './Music.js';
import { RemotePlayer } from './RemotePlayer.js';
import { RivalAI } from './RivalAI.js';
import { Effects } from './Effects.js';
import { Police } from './Police.js';
import { GAME, CELL_SIZE, GRID_SIZE, TRAFFIC_LIGHT, MAPS } from './constants.js';
import { removeAndDispose } from './utils.js';

// --- State machine ---
export const STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
const VALID_TRANSITIONS = {
  [STATE.MENU]: [STATE.PLAYING],
  [STATE.PLAYING]: [STATE.PAUSED, STATE.GAMEOVER],
  [STATE.PAUSED]: [STATE.PLAYING, STATE.GAMEOVER],
  [STATE.GAMEOVER]: [STATE.MENU, STATE.PLAYING],
};

export class Game {
  constructor(scene, camera, sunLight, network, postProcessing = {}) {
    this.scene = scene;
    this.camera = camera;
    this.sunLight = sunLight;
    this.network = network;
    this.bloomPass = postProcessing.bloomPass || null;
    this.caPass = postProcessing.caPass || null;
    this.state = STATE.MENU;
    this.mode = 'single'; // 'single' | 'online'

    // Slow-motion system
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.baseFOV = 65;
    this.targetFOV = 65;

    // Photo mode
    this.photoMode = false;
    this.photoOrbitAngle = 0;

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
    this.health = 100;
    this.timeLeft = GAME.totalTime;
    this.gameTime = 0;
    this.violations = 0;
    this.fines = 0;
    this.nearMisses = 0;
    this.highScore = parseInt(localStorage.getItem('rickshaw-rush-hs') || '0', 10);
    this.topScores = JSON.parse(localStorage.getItem('rickshaw-rush-top5') || '[]');

    // Camera
    this.shakeIntensity = 0;
    this.camIdeal = new THREE.Vector3();
    this.camLookTarget = new THREE.Vector3();

    // Weather (particles only — no rain logic)
    this.rainParticles = null;
    this.dustParticles = null;

    // Red light tracking
    this.wasInRedZone = false;
    this.redLightCooldown = 0;

    // Player trail (for minimap)
    this.trail = [];
    this.trailTimer = 0;

    // Fullscreen map
    this.fullmapOpen = false;

    // Crash fine tracking
    this.crashFineCooldown = 0;
    this.crashFineAmount = 30;

    // Power cut event
    this.powerCutCooldown = 45;

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
      powerCut: [
        'Batti gayo!',
        'Load shedding aayo!',
        'Andhyaro bhayo!',
      ],
      construction: [
        'Bato banda chha!',
        'Construction zone! Arko bato lau!',
        'Road block! Ghumera jau!',
      ],
      festival: [
        'Dashain aayo! Badhai chha!',
        'Tihar ko ramailo!',
        'Deusi re bhailo!',
      ],
    };

    // Map selection (set before start via setMap)
    this.selectedMap = 'kathmandu';
    this._currentMap = 'kathmandu';

    // Systems
    this.city = new City(scene, this.selectedMap);
    this.trafficLights = new TrafficLights(scene, this.city);
    this.vehicle = new Vehicle(scene);
    this.traffic = new Traffic(scene, this.city, this.trafficLights);
    this.wildlife = new Wildlife(scene, this.city);
    this.projectiles = new Projectiles(scene);
    this.rivalAI = new RivalAI(scene, this.city);
    this.music = new MusicSystem();
    this.effects = new Effects(scene);
    this.police = new Police(scene, this.city, null); // music ref set after init

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
      overlay: document.getElementById('screen-overlay'),
      passengerInfo: document.getElementById('passenger-info'),
      passengerText: document.getElementById('passenger-text'),
      comboDisplay: document.getElementById('combo-display'),
      nearMiss: document.getElementById('near-miss'),
      speedLines: document.getElementById('speed-lines'),
      controlsHint: document.getElementById('controls-hint'),
      minimap: document.getElementById('minimap'),
      speedoValue: document.getElementById('speedo-value'),
      speedo: document.getElementById('speedo'),
      boostBar: document.getElementById('boost-bar'),
      boostWrap: document.getElementById('boost-wrap'),
      boostStatus: document.getElementById('boost-status'),
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
      policeWarning: document.getElementById('police-warning'),
      festivalBanner: document.getElementById('festival-banner'),
      powercutOverlay: document.getElementById('powercut-overlay'),
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

  // --- State machine ---
  setState(newState) {
    const allowed = VALID_TRANSITIONS[this.state];
    if (!allowed || !allowed.includes(newState)) {
      console.warn(`Invalid state transition: ${this.state} -> ${newState}`);
      return;
    }
    this.state = newState;
  }

  // --- Map selection ---
  setMap(mapId) {
    this.selectedMap = mapId;
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
    this.remoteScores[data.id] = { score: data.score, name: data.name };
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

  // --- Return to main menu from pause ---
  returnToMenu() {
    this.music.stop();
    this.police.reset();
    this.effects.cleanup();
    // Hide gameplay UI
    this.ui.hud.style.display = 'none';
    this.ui.controlsHint.style.display = 'none';
    this.ui.minimap.style.display = 'none';
    this.ui.speedo.style.display = 'none';
    this.ui.boostWrap.style.display = 'none';
    this.ui.ammoWrap.style.display = 'none';
    this.ui.policeWarning?.classList.remove('active');
    this.ui.powercutOverlay?.classList.remove('active');
    const hudArrow = document.getElementById('hud-arrow');
    if (hudArrow) hudArrow.style.display = 'none';
    // Show main menu
    const menuMain = document.getElementById('menu-main');
    if (menuMain) menuMain.style.display = '';
    const menuJoin = document.getElementById('menu-join');
    if (menuJoin) menuJoin.style.display = 'none';
    const menuLobby = document.getElementById('menu-lobby');
    if (menuLobby) menuLobby.style.display = 'none';
    this.ui.overlay.classList.remove('hidden');
    this.state = STATE.MENU;
  }

  // --- Start / Reset ---
  handleStart() {
    if (this.state !== STATE.MENU && this.state !== STATE.GAMEOVER) return;
    console.log('[rickshaw] handleStart called, state:', this.state, 'map:', this.selectedMap);

    try {
    this.setState(STATE.PLAYING);

    // Apply map config to scene atmosphere
    try {
      const mapCfg = MAPS[this.selectedMap] || MAPS.kathmandu;
      console.log('[rickshaw] Starting game with map:', this.selectedMap);
      this.scene.background.set(mapCfg.skyColor);
      if (this.scene.fog) {
        this.scene.fog.color.set(mapCfg.fogColor);
        this.scene.fog.density = mapCfg.fogDensity;
      }
      // Update sun intensity per map
      if (this.sunLight) {
        this.sunLight.intensity = mapCfg.sunIntensity;
      }
      // Update terrain height calculations
      this.city.mapConfig = mapCfg;
      this._currentMap = this.selectedMap;
      console.log('[rickshaw] Map config applied:', mapCfg.name);
    } catch (e) {
      console.error('[rickshaw] Failed to apply map config:', e);
    }

    this.score = 0;
    this.health = 100;
    this.timeLeft = GAME.totalTime;
    this.gameTime = 0;
    this.violations = 0;
    this.fines = 0;
    this.nearMisses = 0;

    const start = this.getStartPosition();
    this.vehicle.setPosition(start.x, 0, start.z);
    this.vehicle.speed = 0;
    this.vehicle.rotation = 0;
    this.vehicle.gripMultiplier = 1;

    
    this.traffic.reset();
    this.wildlife.reset();
    this.rivalAI.reset();
    // Race setup — pick a destination and spawn 3 AI racers
    const roads = this.city.getRoadPositions();
    const startPos = this.vehicle.position;
    // Pick a destination far from start
    let bestDest = null;
    let bestDist = 0;
    for (let i = 0; i < 20; i++) {
      const rp = roads[Math.floor(Math.random() * roads.length)];
      const d = startPos.distanceTo(rp);
      if (d > bestDist) { bestDist = d; bestDest = rp.clone(); }
    }
    this.raceDestination = bestDest;
    this.currentRound = 1;
    this.totalRounds = 3;
    this.playerFinished = false;
    this.playerFinishTime = 0;
    this._raceEndTimer = null;

    // Destination marker in 3D
    if (this._destMarker) this.scene.remove(this._destMarker);
    this._destMarker = new THREE.Group();
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 40, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    );
    beacon.position.y = 20;
    this._destMarker.add(beacon);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1, 4, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x4ade80 })
    );
    flag.position.y = 6;
    this._destMarker.add(flag);
    this._destMarker.position.set(this.raceDestination.x, 0, this.raceDestination.z);
    this.scene.add(this._destMarker);

    this.rivalAI.setDestination(this.raceDestination);
    this.rivalAI.spawn(3, start);

    this.trail = [];
    this.fullmapOpen = false;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.targetFOV = this.baseFOV;
    this.camera.fov = this.baseFOV;
    this.photoMode = false;
    this.effects.cleanup();
    this._duskBellPlayed = false;
    if (this.ui.fullmap) this.ui.fullmap.style.display = 'none';

    // Power cut
    this.powerCutCooldown = 45;
    this.trafficLights.endPowerCut();

    // UI
    this.ui.overlay.classList.add('hidden');
    this.ui.hud.style.display = 'flex';
    this.ui.controlsHint.style.display = 'block';
    this.ui.minimap.style.display = 'block';
    this.ui.speedo.style.display = 'block';
    this.ui.boostWrap.style.display = 'block';
    this.ui.ammoWrap.style.display = 'block';
    const healthWrap = document.getElementById('health-bar-wrap');
    if (healthWrap) healthWrap.style.display = 'block';
    this.projectiles.reset();

    // Race countdown (3, 2, 1, GO!)
    this._countdownTimer = 3.5;
    this._countdownFrozen = true;
    this._showCountdown(3);

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
    this.policeCaught = false;

    // Music
    this.music.init();
    this.music.resume();
    this.police.music = this.music;
    console.log('[rickshaw] Game started successfully');
    } catch (e) {
      console.error('[rickshaw] handleStart FAILED:', e);
    }
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
    if (this.state !== STATE.PLAYING) return;
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

    // Race countdown
    if (this._countdownFrozen) {
      const prevSec = Math.ceil(this._countdownTimer);
      this._countdownTimer -= delta;
      const curSec = Math.ceil(this._countdownTimer);
      if (curSec !== prevSec && curSec > 0) this._showCountdown(curSec);
      if (this._countdownTimer <= 0) {
        this._countdownFrozen = false;
        this._showCountdown(0); // "GO!"
      }
      this.updateCamera(delta);
      this.updateUI();
      return;
    }

    this.gameTime += delta;
    this.timeLeft -= delta;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.gameOver(); return; }

    // Cooldowns
    if (this.redLightCooldown > 0) this.redLightCooldown -= delta;
    if (this.crashFineCooldown > 0) this.crashFineCooldown -= delta;

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
    this.vehicle.terrainHeight = this.city.getTerrainHeight(this.vehicle.position.x, this.vehicle.position.z);
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
    this.checkTrafficInteractions(delta);
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
    // Rival AI racers
    this.rivalAI.update(delta, this.city.getNearbyBuildings(this.vehicle.position.x, this.vehicle.position.z), this.gameTime);

    // Check if player reached destination (within ~30 units / same road area)
    if (this.raceDestination && !this.playerFinished) {
      const dx = this.vehicle.position.x - this.raceDestination.x;
      const dz = this.vehicle.position.z - this.raceDestination.z;
      if (dx * dx + dz * dz < 900) { // within 30 units — same road area
        this.playerFinished = true;
        this.playerFinishTime = this.gameTime;
        // Show finish announcement
        const positions = this.rivalAI.getPositions(this.vehicle.position, true, this.gameTime, this.gameTime);
        const pos = positions.findIndex(p => p.isPlayer) + 1;
        const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
        const msg = pos === 1 ? `🏆 ${pos}${suffix} PLACE! +500 pts` : `${pos}${suffix} PLACE! +${[500,300,150,50][pos-1]} pts`;
        this.showPassengerInfo(msg);
        setTimeout(() => this.hidePassengerInfo(), 3000);
      }
    }

    // Check if round ended (player or all AI finished)
    if (this.playerFinished || this.rivalAI.getRivals().every(r => r.finished)) {
      if (!this._raceEndTimer) this._raceEndTimer = 2;
      this._raceEndTimer -= delta;
      if (this._raceEndTimer <= 0) {
        this._raceEndTimer = null;
        // Score points based on position
        const positions = this.rivalAI.getPositions(this.vehicle.position, this.playerFinished, this.playerFinishTime, this.gameTime);
        const playerPos = positions.findIndex(p => p.isPlayer);
        const roundPoints = [500, 300, 150, 50];
        this.score += roundPoints[playerPos] || 0;

        this.currentRound++;
        if (this.currentRound > this.totalRounds) {
          this.gameOver();
          return;
        }
        // Start next round
        this.startNextRound();
      }
    }

    // Update race position HUD
    this.updateRacePosition();

    // Day cycle
    this.updateDayCycle();

    // Dust particles drift
    this.updateDust(delta);

    // Projectiles — continuous fire with rate limit
    if (!this._fireRate) this._fireRate = 0;
    if (this._fireRate > 0) this._fireRate -= delta;
    if (input.fire && this._fireRate <= 0) {
      if (this.projectiles.fire(this.vehicle.position, this.vehicle.rotation, this.vehicle.speed)) {
        this._fireRate = 0.08; // fire every 80ms while held — rapid fire
      }
    }
    this.projectiles.update(delta, this.traffic, this.wildlife, this.police, this.rivalAI);

    // HUD direction arrow — points to race destination
    const hudArrow = document.getElementById('hud-arrow');
    if (hudArrow) {
      if (this.raceDestination && !this.playerFinished) {
        hudArrow.style.display = 'block';
        // Project destination to screen space — always accurate regardless of camera angle
        const dest3D = new THREE.Vector3(this.raceDestination.x, 2, this.raceDestination.z);
        const projected = dest3D.clone().project(this.camera);
        // projected.x/y are in NDC (-1 to 1), where +x = right, +y = up
        const screenAngle = Math.atan2(projected.x, projected.y);
        const arrowSvg = hudArrow.querySelector('svg');
        if (arrowSvg) arrowSvg.style.transform = `rotate(${screenAngle * 180 / Math.PI}deg)`;
        const poly = hudArrow.querySelector('polygon');
        if (poly) poly.setAttribute('fill', '#4ade80');
        const dx = this.raceDestination.x - this.vehicle.position.x;
        const dz = this.raceDestination.z - this.vehicle.position.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
        const label = document.getElementById('hud-arrow-label');
        if (label) label.textContent = `FINISH ${dist}m`;
      } else {
        hudArrow.style.display = 'none';
      }
    }

    // Player trail
    this.trailTimer += delta;
    if (this.trailTimer > 0.15) {
      this.trailTimer = 0;
      this.trail.push({ x: this.vehicle.position.x, z: this.vehicle.position.z });
      if (this.trail.length > 80) this.trail.shift();
    }

    // Effects update (celebrations, sparks, debris, tire marks)
    this.effects.update(delta);

    // Chromatic aberration on boost
    if (this.caPass) {
      const targetCA = this.vehicle.boosting ? 0.008 : (this.slowMoTimer > 0 ? 0.004 : 0);
      this.caPass.uniforms.amount.value += (targetCA - this.caPass.uniforms.amount.value) * Math.min(8 * delta, 1);
    }

    // Power cut event
    this.updatePowerCut(delta);

    // Police chase
    const policeResult = this.police.update(delta, this.vehicle.position, this.city.getNearbyBuildings(this.police.position.x, this.police.position.z));

    // Distance-based warnings
    if (this.police.isActive()) {
      const pdx = this.vehicle.position.x - this.police.position.x;
      const pdz = this.vehicle.position.z - this.police.position.z;
      const distSq = pdx * pdx + pdz * pdz;
      const tier = distSq < 100 ? 0 : distSq < 400 ? 1 : distSq < 1225 ? 2 : 3;
      if (tier !== this._lastPoliceTier) {
        this._lastPoliceTier = tier;
        const warning = this.ui.policeWarning;
        if (warning) {
          const msgs = ['POLICE! ALMOST CAUGHT!', 'POLICE CLOSING IN!', 'POLICE APPROACHING!', 'POLICE! ESCAPE!'];
          const sizes = ['26px', '22px', '18px', '20px'];
          warning.textContent = msgs[tier];
          warning.style.fontSize = sizes[tier];
        }
      }
      if (distSq < 225) this.shakeIntensity = Math.max(this.shakeIntensity, 0.15);
    }

    if (policeResult) {
      if (policeResult.type === 'caught') {
        this.shakeIntensity = 0.8;
        this.music.playViolation();
        this.showDialogue('policeCaught');
        this.policeCaught = true;
        this.score = Math.max(0, this.score - 500);
        this.fines += 500;
        this.gameOver();
        return;
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

    // Police warning overlay
    this.ui.policeWarning?.classList.toggle('active', this.police.isActive());

    // Power cut overlay
    this.ui.powercutOverlay?.classList.toggle('active', this.trafficLights.isPowerCut());

    if (this.mode === 'single') {
      this._minimapFrame = (this._minimapFrame || 0) + 1;
      if (this._minimapFrame % 2 === 0) this.updateMinimap();
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
      { name: myName, score: this.score, me: true },
      ...Object.values(this.remoteScores).map(s => ({ name: s.name, score: s.score, me: false })),
    ].sort((a, b) => b.score - a.score);

    mpScores.innerHTML = allScores.map(s =>
      `<span style="opacity:${s.me ? '1' : '.6'};${s.me ? 'color:#4ade80' : ''}">${s.name}: ${s.score} pts</span>`
    ).join(' | ');
  }

  // --- Collisions ---
  checkBuildingCollisions() {
    const pos = this.vehicle.position;
    const r = 2.5;
    for (const b of this.city.getNearbyBuildings(pos.x, pos.z)) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < r) {
        // Hard push-out + bounce
        const pushStr = (r - dist) + 2.0;
        if (dist > 0.001) { pos.x += (dx / dist) * pushStr; pos.z += (dz / dist) * pushStr; }
        else { pos.x += pushStr; }
        // Bounce speed on first contact
        if (this.crashFineCooldown <= 0) {
          const bounceForce = Math.min(Math.abs(this.vehicle.speed) * 0.4, 20);
          this.vehicle.speed = -Math.sign(this.vehicle.speed || 1) * bounceForce;
          this.shakeIntensity = 0.3;
          this.health -= 5;
          
          if (this.music.playCollisionThud) this.music.playCollisionThud(Math.min(Math.abs(this.vehicle.speed) / 40, 1));
          this.crashFineCooldown = 0.5;
          const flash = document.getElementById('screen-flash');
          if (flash) { flash.style.background = 'rgba(255,50,50,0.25)'; flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 150); }
          if (this.health <= 0) { this.health = 0; this.gameOver(); return; }
        }
      }
    }
    const citySize = GRID_SIZE * CELL_SIZE;
    pos.x = Math.max(2, Math.min(citySize - 2, pos.x));
    pos.z = Math.max(2, Math.min(citySize - 2, pos.z));
  }

  checkTrafficInteractions(delta) {
    const vPos = this.vehicle.position;
    const vSpeed = Math.abs(this.vehicle.speed);
    const vR = 2;

    for (const npc of this.traffic.getNearby(vPos.x, vPos.z)) {
      const dx = vPos.x - npc.position.x;
      const dz = vPos.z - npc.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < vR + npc.radius) {
        // Always push out hard — guarantee escape
        const overlap = vR + npc.radius - dist;
        const pushStr = overlap + 2.0;
        if (dist > 0.001) {
          vPos.x += (dx / dist) * pushStr;
          vPos.z += (dz / dist) * pushStr;
        } else {
          vPos.x += pushStr;
        }
        // Also push the NPC away
        if (dist > 0.001) {
          npc.position.x -= (dx / dist) * overlap * 0.5;
          npc.position.z -= (dz / dist) * overlap * 0.5;
        }
        // Bounce + effects only on first contact (cooldown-gated)
        if (this.crashFineCooldown <= 0) {
          const bounceForce = Math.min(vSpeed * 0.35, 18);
          this.vehicle.speed = -Math.sign(this.vehicle.speed || 1) * bounceForce;
          this.shakeIntensity = 0.3;
          this.health -= 10;
          
          if (this.health <= 0) { this.health = 0; this.gameOver(); return; }
          if (this.music.playCollisionThud) this.music.playCollisionThud(Math.min(vSpeed / 40, 1));
          const flash = document.getElementById('screen-flash');
          if (flash) { flash.style.background = 'rgba(255,50,50,0.25)'; flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 150); }
          if (vSpeed > 8) {
            this.crashFineCooldown = 1.5;
            this.score = Math.max(0, this.score - this.crashFineAmount);
            this.fines += this.crashFineAmount;
            this.showDialogue('crash');
            this.showViolation();
            this.music.playViolation();
            if (vSpeed > 30 && !this.police.isActive()) {
              this.police.activate(this.vehicle.position);
              this.showDialogue('policeChase');
            }
          } else {
            this.crashFineCooldown = 0.5;
          }
        }
        // On subsequent overlap frames, just push — no speed change
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
      if (npc._nmCd > 0) npc._nmCd -= delta;
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
        const pushStr = (vR + a.radius - dist) + 2.5;
        if (dist > 0.001) { vPos.x += (dx / dist) * pushStr; vPos.z += (dz / dist) * pushStr; }
        if (this.crashFineCooldown <= 0) {
          const bounceForce = Math.min(Math.abs(this.vehicle.speed) * 0.5, 22);
          this.vehicle.speed = -Math.sign(this.vehicle.speed || 1) * bounceForce;
          this.shakeIntensity = 0.5;
          this.health -= 8;
          
          this.crashFineCooldown = 0.5;
          const flash = document.getElementById('screen-flash');
          if (flash) { flash.style.background = 'rgba(255,50,50,0.25)'; flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 150); }
          if (this.health <= 0) { this.health = 0; this.gameOver(); return; }
        }
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
  _showCountdown(num) {
    let el = document.getElementById('countdown-display');
    if (!el) {
      el = document.createElement('div');
      el.id = 'countdown-display';
      el.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);z-index:25;pointer-events:none;text-align:center;color:#fff;font-size:80px;font-weight:700;text-shadow:0 4px 20px rgba(0,0,0,.7);transition:transform .3s,opacity .3s';
      document.body.appendChild(el);
    }
    if (num > 0) {
      el.textContent = Math.ceil(num);
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%,-50%) scale(1.2)';
      setTimeout(() => { el.style.transform = 'translate(-50%,-50%) scale(1)'; }, 100);
    } else {
      el.textContent = 'GO!';
      el.style.color = '#4ade80';
      el.style.opacity = '1';
      setTimeout(() => { el.style.opacity = '0'; }, 800);
    }
  }

  updateRacePosition() {
    const positions = this.rivalAI.getPositions(
      this.vehicle.position, this.playerFinished, this.playerFinishTime, this.gameTime
    );
    const playerIdx = positions.findIndex(p => p.isPlayer);
    const pos = playerIdx + 1;
    const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';

    let raceEl = document.getElementById('race-position');
    if (!raceEl) {
      raceEl = document.createElement('div');
      raceEl.id = 'race-position';
      raceEl.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:11;pointer-events:none;text-align:center;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)';
      document.body.appendChild(raceEl);
    }
    const posColor = pos === 1 ? '#4ade80' : pos === 2 ? '#fbbf24' : '#ff6b6b';
    const roundText = `Round ${this.currentRound}/${this.totalRounds}`;
    raceEl.innerHTML = `<div style="font-size:48px;font-weight:700;color:${posColor};line-height:1">${pos}${suffix}</div><div style="font-size:11px;opacity:.5;margin-top:2px">${roundText}</div><div style="font-size:12px;opacity:.6">${positions.map((p, i) => `${i + 1}. ${p.name}${p.finished ? ' ✓' : ''}`).join(' &middot; ')}</div>`;
  }

  startNextRound() {
    // Pick new destination far from current position
    const roads = this.city.getRoadPositions();
    let bestDest = null;
    let bestDist = 0;
    for (let i = 0; i < 20; i++) {
      const rp = roads[Math.floor(Math.random() * roads.length)];
      const d = this.vehicle.position.distanceTo(rp);
      if (d > bestDist) { bestDist = d; bestDest = rp.clone(); }
    }
    this.raceDestination = bestDest;
    this.playerFinished = false;
    this.playerFinishTime = 0;

    // Move destination marker
    if (this._destMarker) {
      this._destMarker.position.set(this.raceDestination.x, 0, this.raceDestination.z);
    }

    // Reset rival racers — new destination, not finished
    this.rivalAI.setDestination(this.raceDestination);
    for (const r of this.rivalAI.getRivals()) {
      r.finished = false;
      r.finishTime = 0;
      r.target = this.raceDestination.clone();
      r.slowTimer = 0;
    }

    // Flash round announcement
    this.showPassengerInfo(`ROUND ${this.currentRound} — GO!`);
    setTimeout(() => this.hidePassengerInfo(), 2000);
  }

  updateUI() {
    const min = Math.floor(this.timeLeft / 60);
    const sec = Math.floor(this.timeLeft % 60);
    this.ui.timer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    this.ui.timer.className = this.timeLeft < 20 ? 'vl warn' : 'vl';
    this.ui.score.textContent = `${this.score} pts`;
    if (this.ui.deliveries) this.ui.deliveries.textContent = `R${this.currentRound || 1}`;
    if (this.ui.levelNum) this.ui.levelNum.textContent = this.totalRounds || 3;

    // Health bar
    const hb = document.getElementById('health-bar');
    if (hb) hb.style.width = `${Math.max(0, this.health)}%`;

    // Speedometer
    const kmh = this.vehicle.getSpeedKmh();

    // Crosshair visibility
    const fast = Math.abs(this.vehicle.speed) > 10;
    this.ui.crosshair.classList.toggle('active', fast);
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
    for (let i = 0; i < GRID_SIZE; i += 2) {
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

    // Race destination
    if (this.raceDestination) {
      this.drawMapMarker(ctx, this.raceDestination.x * s, this.raceDestination.z * s, '#4ade80', 'FINISH');
    }

    // Rival racers on fullmap
    const fmRivalColors = ['#cc3333', '#cc8800', '#8833cc'];
    const fmRivalNames = ['RED', 'GOLD', 'PURPLE'];
    for (let i = 0; i < this.rivalAI.getRivals().length; i++) {
      const r = this.rivalAI.getRivals()[i];
      ctx.fillStyle = fmRivalColors[i % fmRivalColors.length];
      ctx.beginPath();
      ctx.arc(r.position.x * s, r.position.z * s, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Rajdhani';
      ctx.textAlign = 'center';
      ctx.fillText(fmRivalNames[i], r.position.x * s, r.position.z * s - 10);
    }

    // Player
    const pos = this.vehicle.position;
    const rot = this.vehicle.rotation;
    ctx.save();
    ctx.translate(pos.x * s, pos.z * s);
    ctx.rotate(Math.PI - rot);
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
    ctx.rotate(pRot + Math.PI);

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

    // Rival racers on minimap
    const rivalColors = ['#cc3333', '#cc8800', '#8833cc'];
    for (let i = 0; i < this.rivalAI.getRivals().length; i++) {
      const r = this.rivalAI.getRivals()[i];
      const rx = wx(r.position.x);
      const rz = wz(r.position.z);
      if (Math.abs(rx) > cx + 5 || Math.abs(rz) > cy + 5) continue;
      ctx.fillStyle = rivalColors[i % rivalColors.length];
      ctx.beginPath();
      ctx.arc(rx, rz, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Race destination on minimap
    if (this.raceDestination) {
      const fx = wx(this.raceDestination.x);
      const fz = wz(this.raceDestination.z);
      const pulse = 5 + Math.sin(time * 3) * 2;
      ctx.fillStyle = 'rgba(74,222,128,.2)';
      ctx.beginPath(); ctx.arc(fx, fz, pulse + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(fx, fz, 4, 0, Math.PI * 2); ctx.fill();
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

    // Race destination on minimap (already added above with rivals)

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

    // Distance to finish
    if (this.raceDestination) {
      const dist = Math.round(Math.sqrt(
        (pPos.x - this.raceDestination.x) ** 2 + (pPos.z - this.raceDestination.z) ** 2
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


  // --- Power Cut ---
  updatePowerCut(delta) {
    if (this.trafficLights.isPowerCut()) return;
    this.powerCutCooldown -= delta;
    if (this.powerCutCooldown <= 0) {
      this.powerCutCooldown = 40 + Math.random() * 30;
      const duration = 10 + Math.random() * 8;
      this.trafficLights.startPowerCut(duration);
      this.showDialogue('powerCut');
      this.showPassengerInfo('LOAD SHEDDING! Traffic lights are out!');
      setTimeout(() => this.hidePassengerInfo(), 2500);
    }
  }

  // --- Game Over ---
  gameOver() {
    if (this._gameOverPending) return;
    this._gameOverPending = true;
    // Brief slow-mo, then transition
    this.timeScale = 0.3;
    setTimeout(() => {
      this.timeScale = 1;
      this._gameOverPending = false;
      this.setState(STATE.GAMEOVER);
      this._showGameOver();
    }, 800);
  }

  _showGameOver() {
    this.music.stop();

    // High score (solo only)
    if (this.mode === 'single') {
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('rickshaw-rush-hs', this.score.toString());
      }
      // Top 5 scores
      this.topScores.push({ score: this.score, date: new Date().toLocaleDateString() });
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
    this.ui.ammoWrap.style.display = 'none';
    this.ui.crosshair.classList.remove('active');
    this.ui.comboDisplay.classList.remove('visible');
    this.hidePassengerInfo();

    const mpSb = document.getElementById('mp-scoreboard');
    if (mpSb) mpSb.style.display = 'none';

    // Cleanup
    this.police.reset();
    this.projectiles.reset();
    this.effects.cleanup();
    this.trafficLights.endPowerCut();

    // Clean remote players
    for (const rp of Object.values(this.remotePlayers)) rp.destroy();
    this.remotePlayers = {};

    if (this.mode === 'online') {
      // --- Online multiplayer game over ---
      const myName = this.network?.players.find(p => p.id === this.network?.playerId)?.name || 'You';
      const allScores = [
        { name: myName, score: this.score, me: true },
        ...Object.values(this.remoteScores).map(s => ({ name: s.name, score: s.score, me: false })),
      ].sort((a, b) => b.score - a.score);

      const leaderboard = allScores.map((s, i) => {
        const medal = i === 0 ? '&#x1F451;' : '';
        const style = s.me ? 'color:#4ade80;font-weight:700' : 'opacity:.7';
        return `<div style="${style};font-size:18px;line-height:2">${medal} ${i + 1}. ${s.name} — ${s.score} pts</div>`;
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
      // --- Solo race game over ---
      const isNewHigh = this.score >= this.highScore && this.score > 0;

      const achievements = [];
      if (this.nearMisses >= 5) achievements.push('Close Caller');
      if (this.score >= 1000) achievements.push('Rs. 1000 Club');
      if (this.fines === 0 && this.violations === 0) achievements.push('Clean Record');
      if (this.score >= 1500) achievements.push('Kathmandu Legend');

      const achHtml = achievements.length > 0
        ? `<div class="overlay-achievements">${achievements.map(a =>
            `<div class="achievement earned">${a}</div>`).join('')}</div>`
        : '';

      // Top 5 leaderboard
      const top5Html = this.topScores.length > 0
        ? `<div style="margin-top:12px;font-size:13px;opacity:.5">
            <div style="margin-bottom:4px;letter-spacing:1px;text-transform:uppercase;font-size:10px;opacity:.6">TOP SCORES</div>
            ${this.topScores.map((s, i) =>
              `<div style="${s.score === this.score ? 'color:#4ade80' : ''}">${i + 1}. ${s.score} pts &middot; ${s.date}</div>`
            ).join('')}
          </div>`
        : '';

      this.ui.overlay.innerHTML = `
        <h1>${this.policeCaught ? 'BUSTED!' : isNewHigh ? 'NEW HIGH SCORE!' : "TIME'S UP!"}</h1>
        ${this.policeCaught ? '<div style="font-size:16px;color:#ff6b6b;margin-bottom:8px">Caught by police — Rs. 500 fine deducted</div>' : ''}
        <div class="overlay-final-score">${this.score} pts</div>
        <div class="overlay-stats">
          Rounds: ${Math.min(this.currentRound - 1, this.totalRounds)} / ${this.totalRounds}<br>
          Near misses: ${this.nearMisses}<br>
          Violations: ${this.violations} (Fines: Rs. ${this.fines})<br>
          Best score: ${this.highScore} pts
        </div>
        ${top5Html}
        ${achHtml}
        <br>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px">
          <div id="btn-play-again" class="menu-btn" style="border-color:#4ade80;background:rgba(74,222,128,.1);pointer-events:auto">PLAY AGAIN (R)</div>
          <div id="btn-exit-gameover" class="menu-btn" style="border-color:#ff6b6b;background:rgba(255,107,107,.1);pointer-events:auto">EXIT TO MENU</div>
          <div id="btn-share" class="menu-btn" style="border-color:#22d3ee;background:rgba(34,211,238,.1);pointer-events:auto">SHARE</div>
        </div>
      `;

      // Attach game over button handlers
      setTimeout(() => {
        document.getElementById('btn-play-again')?.addEventListener('click', () => {
          this.setMode('single');
          this.handleStart();
        });
        document.getElementById('btn-exit-gameover')?.addEventListener('click', () => {
          this.returnToMenu();
        });
        document.getElementById('btn-share')?.addEventListener('click', () => {
          const text = `I scored ${this.score} pts in Rickshaw Rush! Race through Kathmandu! 🛺\n\nCan you beat me? #RickshawRush #vibejam`;
          const url = window.location.href;
          window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        });
      }, 100);
    }

    this.ui.overlay.classList.remove('hidden');
  }
}
