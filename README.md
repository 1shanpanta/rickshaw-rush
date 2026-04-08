# Rickshaw Rush

A fast-paced 3D arcade driving game set in the chaotic streets of Kathmandu. Drive a Safa tempo through traffic, pick up passengers, and deliver them before time runs out.

Built with Three.js for the 2025 Vibe Coding Game Jam.

## Play

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and press ENTER to start.

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Drive |
| SPACE | Honk (scares traffic) |
| SHIFT | Boost |

## Gameplay

- **Pick up** passengers at gold diamond markers
- **Deliver** them to green markers before time runs out
- **Obey traffic lights** -- running reds costs Rs. 50
- **Chain deliveries** for combo multipliers (up to 3x)
- **Near misses** earn bonus points -- weave close to traffic at speed
- **Star ratings** (0-3 stars) per delivery based on speed, safety, and rule-following
- **Fare meter** ticks up based on distance -- surge pricing during rain
- **Level up** every 3 deliveries -- more traffic, more chaos

## Features

- 3D Kathmandu cityscape with Boudha-style stupa, prayer flags, shop signs, tea stalls
- Traffic system: buses, cars, motorcycles, cows -- all react to your honk
- Wildlife: elephants, rhinos, monkeys, goats, chickens, stray dogs
- Traffic lights with violation fines
- Day/night cycle: dawn to dusk over the course of a game
- Monsoon rain events with reduced grip and fare surge
- Procedural Nepali-inspired background music (madal drums + pentatonic melody)
- Engine sounds, honk, delivery chimes, violation alerts
- Speed bumps, dust particles, screen shake on collisions
- Minimap with traffic, signals, and objective markers
- High score persistence (localStorage)
- Achievements on game over

## Tech

- Three.js (3D rendering)
- Vite (dev server + build)
- Web Audio API (procedural music + SFX)
- Zero dependencies beyond Three.js

## Build

```bash
npm run build
```

Output goes to `dist/` -- deploy anywhere static.
