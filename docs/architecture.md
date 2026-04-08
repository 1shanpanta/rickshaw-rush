# Architecture

## Overview

Rickshaw Rush is a browser-based 3D arcade game. The architecture is a classic game loop pattern with modular systems.

## Core Loop

```
main.js (entry)
  -> Scene, Renderer, Camera, Lighting setup
  -> Game (orchestrator)
    -> City (static world)
    -> Vehicle (player)
    -> Traffic (NPC vehicles)
    -> TrafficLights (signal system)
    -> PassengerSystem (objectives)
    -> Wildlife (animals)
    -> MusicSystem (audio)
  -> requestAnimationFrame loop
```

## Module Responsibilities

| Module | Role |
|--------|------|
| `main.js` | Three.js setup, input handling, render loop |
| `Game.js` | Game state machine, system orchestration, UI, collisions, weather, day cycle |
| `City.js` | Procedural city generation (grid, buildings, roads, decorations) |
| `Vehicle.js` | Player rickshaw physics, boost, grip, speed bump detection |
| `Traffic.js` | NPC vehicles (buses, cars, motorcycles, cows), AI behavior, traffic light awareness |
| `TrafficLights.js` | Traffic signal placement, state cycling, violation detection |
| `Passenger.js` | Pickup/delivery system, fare meter, star ratings, 3D passenger figure |
| `Wildlife.js` | Animals (elephants, rhinos, monkeys, dogs, goats, chickens), flee behavior |
| `Music.js` | Web Audio procedural music, engine sound, SFX |
| `constants.js` | All tunable game parameters |

## City Grid

The city is a `GRID_SIZE x GRID_SIZE` grid of cells (`CELL_SIZE` units each). Roads are placed at every 3rd row/column, creating building blocks between them. A stupa landmark occupies the center.

## Game State Flow

```
MENU -> (Enter/Click) -> PLAYING -> (time=0) -> GAMEOVER -> (Enter/Click) -> PLAYING
```

## Data Flow

- Game.update() is called every frame with delta time and keyboard state
- Game delegates to each subsystem's update()
- Collision detection happens in Game after movement
- UI updates are DOM-based (not rendered in Three.js)
- Minimap is a 2D canvas overlay

## Audio

All audio is procedural via Web Audio API:
- Background music: tanpura drone + madal drum pattern + pentatonic melody
- Engine: sawtooth oscillator with frequency mapped to speed
- SFX: synthesized honk, delivery chime, violation buzz, near-miss ping
