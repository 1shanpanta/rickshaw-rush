import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE, GAME, FARE, RATING } from './constants.js';

const PASSENGER_NAMES = [
  'Sita ji', 'Ram dai', 'Gita didi', 'Hari bhai',
  'Sunita aunty', 'Bikash uncle', 'Pooja didi', 'Rajan bhai',
  'Kamala ji', 'Santosh dai', 'Anita madam', 'Deepak sir',
  'Laxmi aunty', 'Suresh uncle', 'Maya didi', 'Prakash bhai',
  'Sarita didi', 'Binod dai', 'Nirmala ji', 'Rajesh bhai',
];

const DESTINATIONS = [
  'Thamel', 'Durbar Square', 'Boudha Stupa', 'Patan',
  'New Road', 'Swayambhu', 'Balaju', 'Ratnapark',
  'Kalimati', 'Jawalakhel', 'Lazimpat', 'Chabahil',
  'Maharajgunj', 'Koteshwor', 'Baneshwor', 'Kalanki',
  'Basantapur', 'Kirtipur', 'Bhaktapur', 'Sundhara',
];

export class PassengerSystem {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.state = 'waiting';
    this.pickupPosition = null;
    this.dropoffPosition = null;
    this.deliveryTimer = 0;
    this.passengerName = '';
    this.destinationName = '';

    // Fare tracking
    this.fareAmount = 0;
    this.distanceTraveled = 0;
    this.lastPosition = new THREE.Vector3();
    this.isSurge = false;

    // Star rating tracking per delivery
    this.deliveryCrashes = 0;
    this.deliveryRedLights = 0;
    this.deliveryStartTime = 0;

    // Visual
    this.pickupGroup = null;
    this.dropoffGroup = null;
    this.arrowMesh = null;
    this.passengerFigure = null;

    this.createMarkers();
    this.spawnPassenger();
  }

  createMarkers() {
    // Pickup marker (gold)
    this.pickupGroup = new THREE.Group();

    const dGeo = new THREE.OctahedronGeometry(1.2, 0);
    this.pickupDiamond = new THREE.Mesh(dGeo, new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    this.pickupGroup.add(this.pickupDiamond);

    const rGeo = new THREE.RingGeometry(2, 3, 20);
    const rMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    this.pickupRing = new THREE.Mesh(rGeo, rMat);
    this.pickupRing.rotation.x = -Math.PI / 2;
    this.pickupGroup.add(this.pickupRing);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 1.5, 18, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
    );
    beam.position.y = 9;
    this.pickupGroup.add(beam);

    this.scene.add(this.pickupGroup);

    // Dropoff marker (green)
    this.dropoffGroup = new THREE.Group();
    this.dropoffGroup.visible = false;

    this.dropoffDiamond = new THREE.Mesh(dGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    this.dropoffGroup.add(this.dropoffDiamond);

    this.dropoffRing = new THREE.Mesh(rGeo.clone(),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
    this.dropoffRing.rotation.x = -Math.PI / 2;
    this.dropoffGroup.add(this.dropoffRing);

    const dBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 1.5, 18, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
    );
    dBeam.position.y = 9;
    this.dropoffGroup.add(dBeam);

    this.scene.add(this.dropoffGroup);

    // Arrow
    const arrowGeo = new THREE.ConeGeometry(0.6, 2, 4);
    arrowGeo.rotateX(Math.PI / 2);
    this.arrowMesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    this.arrowMesh.visible = false;
    this.scene.add(this.arrowMesh);

    // Passenger figure (waiting at pickup)
    this.passengerFigure = this.createPassengerFigure();
    this.scene.add(this.passengerFigure);
  }

  createPassengerFigure() {
    const g = new THREE.Group();
    const skinColor = 0xc68642;

    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 1, 6),
      new THREE.MeshLambertMaterial({ color: 0xcc3333 })
    );
    body.position.y = 1;
    g.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshLambertMaterial({ color: skinColor })
    );
    head.position.y = 1.72;
    g.add(head);

    // Hair
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    hair.position.y = 1.78;
    g.add(hair);

    // Bag
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.3, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x8b4513 })
    );
    bag.position.set(0.35, 0.8, 0);
    g.add(bag);

    // Wave hand (signals the rickshaw)
    this.waveArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 4),
      new THREE.MeshLambertMaterial({ color: skinColor })
    );
    this.waveArm.position.set(-0.35, 1.4, 0);
    g.add(this.waveArm);

    g.visible = false;
    return g;
  }

  getRandomRoadPosition() {
    const roads = this.city.getRoadPositions();
    return roads[Math.floor(Math.random() * roads.length)].clone();
  }

  spawnPassenger() {
    this.state = 'waiting';
    this.pickupPosition = this.getRandomRoadPosition();

    do {
      this.dropoffPosition = this.getRandomRoadPosition();
    } while (this.pickupPosition.distanceTo(this.dropoffPosition) < CELL_SIZE * 4);

    this.passengerName = PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)];
    this.destinationName = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];

    // Reset fare/rating
    this.fareAmount = FARE.baseFare;
    this.distanceTraveled = 0;
    this.deliveryCrashes = 0;
    this.deliveryRedLights = 0;
    this.deliveryStartTime = 0;

    // Show pickup
    this.pickupGroup.position.set(this.pickupPosition.x, 0, this.pickupPosition.z);
    this.pickupGroup.visible = true;

    // Show passenger figure
    this.passengerFigure.position.set(
      this.pickupPosition.x + 2,
      0,
      this.pickupPosition.z + 1
    );
    this.passengerFigure.visible = true;

    // Hide dropoff
    this.dropoffGroup.visible = false;
    this.arrowMesh.visible = false;
  }

  update(delta, vehiclePosition, gameTime) {
    const time = performance.now() * 0.003;

    // Animate markers
    if (this.pickupGroup.visible) {
      this.pickupDiamond.position.y = 5 + Math.sin(time) * 0.8;
      this.pickupDiamond.rotation.y = time * 0.8;
      this.pickupRing.position.y = 0.15;
      this.pickupRing.scale.setScalar(1 + Math.sin(time * 2) * 0.12);
    }

    if (this.dropoffGroup.visible) {
      this.dropoffDiamond.position.y = 5 + Math.sin(time + 1) * 0.8;
      this.dropoffDiamond.rotation.y = time * 0.8;
      this.dropoffRing.position.y = 0.15;
      this.dropoffRing.scale.setScalar(1 + Math.sin(time * 2 + 1) * 0.12);
    }

    // Wave arm animation
    if (this.passengerFigure.visible && this.state === 'waiting') {
      this.waveArm.rotation.z = Math.sin(time * 4) * 0.6 + 0.8;
      this.passengerFigure.lookAt(vehiclePosition.x, 0, vehiclePosition.z);
    }

    if (this.state === 'waiting') {
      const dist = this.distXZ(vehiclePosition, this.pickupPosition);
      if (dist < 5) {
        this.state = 'carrying';
        this.deliveryTimer = 30;
        this.deliveryStartTime = gameTime;
        this.lastPosition.copy(vehiclePosition);

        this.pickupGroup.visible = false;
        this.passengerFigure.visible = false;
        this.dropoffGroup.position.set(this.dropoffPosition.x, 0, this.dropoffPosition.z);
        this.dropoffGroup.visible = true;
        this.arrowMesh.visible = true;

        return {
          type: 'pickup',
          name: this.passengerName,
          destination: this.destinationName,
        };
      }
    } else if (this.state === 'carrying') {
      this.deliveryTimer -= delta;

      // Track distance for fare
      const moved = this.distXZ(vehiclePosition, this.lastPosition);
      this.distanceTraveled += moved;
      this.lastPosition.copy(vehiclePosition);

      const surgeRate = this.isSurge ? FARE.surgeMult : 1;
      this.fareAmount = FARE.baseFare + Math.floor(this.distanceTraveled * FARE.ratePerUnit * surgeRate);

      // Arrow
      const dx = this.dropoffPosition.x - vehiclePosition.x;
      const dz = this.dropoffPosition.z - vehiclePosition.z;
      const angle = Math.atan2(dx, dz);

      this.arrowMesh.position.set(
        vehiclePosition.x + Math.sin(angle) * 4,
        4.5 + Math.sin(time * 3) * 0.3,
        vehiclePosition.z + Math.cos(angle) * 4
      );
      this.arrowMesh.rotation.set(0, angle, 0);

      // Delivery check
      const dist = this.distXZ(vehiclePosition, this.dropoffPosition);
      if (dist < 5) {
        const stars = this.calculateStars(gameTime);
        const tipMult = RATING.tipMultipliers[stars];
        const totalFare = Math.round(this.fareAmount * tipMult);

        this.spawnPassenger();
        return {
          type: 'delivered',
          reward: totalFare,
          fare: this.fareAmount,
          stars,
          name: this.passengerName,
        };
      }

      if (this.deliveryTimer <= 0) {
        this.spawnPassenger();
        return { type: 'timeout' };
      }
    }

    return null;
  }

  calculateStars(gameTime) {
    let stars = 3;

    // Time penalty
    const elapsed = gameTime - this.deliveryStartTime;
    if (elapsed > RATING.timeThreshold) stars--;

    // Crash penalty
    if (this.deliveryCrashes > 0) stars--;

    // Red light penalty
    if (this.deliveryRedLights > 0) stars--;

    return Math.max(0, stars);
  }

  recordCrash() {
    if (this.state === 'carrying') this.deliveryCrashes++;
  }

  recordRedLight() {
    if (this.state === 'carrying') this.deliveryRedLights++;
  }

  setSurge(active) {
    this.isSurge = active;
  }

  distXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  getFare() { return this.fareAmount; }
  getPickupPosition() { return this.state === 'waiting' ? this.pickupPosition : null; }
  getDropoffPosition() { return this.state === 'carrying' ? this.dropoffPosition : null; }
  isCarrying() { return this.state === 'carrying'; }

  reset() {
    this.spawnPassenger();
  }
}
