import type { GameConfigSnapshot, ShipMovementConfig } from '../config';
import type { ControlState } from '../input/controls';
import type { Vec2 } from '../math';
import { createArena, type Arena } from './arena';
import { resolveStaticCollisions } from './collision';

export interface ShipState {
  id: number;
  position: Vec2;
  /** Heading in radians; 0 points along +x, PI/2 along +y (screen down). */
  rotation: number;
  speed: number;
  health: number;
  maxHealth: number;
  radius: number;
  /** Pose at the start of the last step, used by the renderer to interpolate. */
  previousPosition: Vec2;
  previousRotation: number;
}

/**
 * Pure game rules. Knows nothing about PixiJS, the DOM or React; it is advanced
 * in fixed time steps and read by the renderer.
 */
export class Simulation {
  readonly arena: Arena;
  readonly player: ShipState;
  /** Simulated active time, in seconds. */
  elapsed = 0;
  private nextEntityId = 1;

  constructor(readonly config: GameConfigSnapshot) {
    this.arena = createArena(config.arena);
    this.player = this.createShip(config.player, { x: this.arena.width / 2, y: this.arena.height - 96 }, -Math.PI / 2);
  }

  step(dt: number, controls: ControlState): void {
    this.elapsed += dt;
    this.moveShip(this.player, this.config.player, controls, dt);
  }

  private moveShip(ship: ShipState, stats: ShipMovementConfig, controls: ControlState, dt: number): void {
    ship.previousPosition.x = ship.position.x;
    ship.previousPosition.y = ship.position.y;
    ship.previousRotation = ship.rotation;

    const turn = Number(controls.turnRight) - Number(controls.turnLeft);
    ship.rotation += turn * stats.turnSpeed * dt;

    if (controls.forward) {
      ship.speed = Math.min(stats.moveSpeed, ship.speed + stats.acceleration * dt);
    } else {
      ship.speed = Math.max(0, ship.speed - stats.deceleration * dt);
    }

    ship.position.x += Math.cos(ship.rotation) * ship.speed * dt;
    ship.position.y += Math.sin(ship.rotation) * ship.speed * dt;

    if (resolveStaticCollisions(ship.position, ship.radius, this.arena)) {
      // Scraping along a coast or wall bleeds speed instead of sliding at full pace.
      ship.speed *= 0.9;
    }
  }

  private createShip(stats: ShipMovementConfig, position: Vec2, rotation: number): ShipState {
    return {
      id: this.nextEntityId++,
      position: { ...position },
      rotation,
      speed: 0,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      radius: stats.radius,
      previousPosition: { ...position },
      previousRotation: rotation,
    };
  }
}
