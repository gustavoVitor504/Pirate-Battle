import type { EnemyKind, GameConfigSnapshot, ProjectileConfig, ShipConfig, WeaponConfig } from '../config';
import type { ControlState } from '../input/controls';
import { distanceSq, type Vec2 } from '../math';
import { steerTowards } from './ai';
import { createArena, type Arena } from './arena';
import {
  circleHitsObstacle,
  hullCircles,
  hullIsBlocked,
  hullOverlapsCircle,
  hullsOverlap,
  isInsideArena,
  resolveHullCollisions,
} from './collision';
import type { Faction, GameEvent, MatchEndReason, Projectile, Ship, ShipKind, WeaponSlot } from './entities';
import { Random } from './random';

export type MatchStatus = 'running' | 'ended';

/** Delay before the first enemy, so both kinds appear even with the longest spawn interval. */
const FIRST_SPAWN_DELAY_SEC = 1.5;
const ENEMY_KINDS: readonly EnemyKind[] = ['chaser', 'shooter'];
/** Share of a ship-to-ship push applied to the player; enemies give way more. */
const PLAYER_PUSH_SHARE = 0.25;

/**
 * Pure game rules. Knows nothing about PixiJS, the DOM or React; it is advanced
 * in fixed time steps and read by the renderer.
 */
export class Simulation {
  readonly arena: Arena;
  readonly player: Ship;
  enemies: Ship[] = [];
  projectiles: Projectile[] = [];
  /** Active (simulated) play time, in seconds. */
  elapsed = 0;
  score = 0;
  status: MatchStatus = 'running';
  endReason: MatchEndReason | null = null;

  private readonly random: Random;
  private readonly pendingEvents: GameEvent[] = [];
  private nextEntityId = 1;
  private nextSpawnAt = FIRST_SPAWN_DELAY_SEC;
  private spawnCount = 0;

  constructor(
    readonly config: GameConfigSnapshot,
    seed: number,
  ) {
    this.random = new Random(seed);
    this.arena = createArena(config.arena);
    this.player = this.createShip('player', config.player.ship, {
      position: { x: this.arena.width / 2, y: this.arena.height - 96 },
      rotation: -Math.PI / 2,
    });
  }

  get remainingTime(): number {
    return Math.max(0, this.config.sessionDurationSec - this.elapsed);
  }

  /** Returns and clears the events produced since the last call. */
  drainEvents(): GameEvent[] {
    return this.pendingEvents.splice(0);
  }

  step(dt: number, controls: ControlState): void {
    if (this.status !== 'running') return;
    this.elapsed += dt;

    this.updatePlayer(controls, dt);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    this.separateShips();
    this.updateProjectiles(dt);
    this.enemies = this.enemies.filter((enemy) => enemy.alive);

    if (!this.player.alive) return this.end('player-destroyed');
    if (this.elapsed >= this.config.sessionDurationSec) return this.end('time-up');

    while (this.elapsed >= this.nextSpawnAt) {
      this.trySpawnEnemy();
      this.nextSpawnAt += this.config.enemySpawnIntervalSec;
    }
  }

  private end(reason: MatchEndReason): void {
    this.status = 'ended';
    this.endReason = reason;
    this.elapsed = Math.min(this.elapsed, this.config.sessionDurationSec);
    this.player.speed = 0;
    for (const enemy of this.enemies) enemy.speed = 0;
    this.emit({ type: 'match-ended', reason });
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(controls: ControlState, dt: number): void {
    const player = this.player;
    const turn = Number(controls.turnRight) - Number(controls.turnLeft);
    this.moveShip(player, controls.forward, turn, dt);
    tickCooldowns(player, dt);

    const { frontCannon, broadside } = this.config.player;
    if (controls.fireFront && player.cooldowns.front <= 0) {
      this.fireForward(player, 'player', frontCannon);
    }
    if (controls.fireLeft && player.cooldowns.left <= 0) {
      this.fireBroadside(player, 'left');
      player.cooldowns.left = broadside.cooldownSec;
    }
    if (controls.fireRight && player.cooldowns.right <= 0) {
      this.fireBroadside(player, 'right');
      player.cooldowns.right = broadside.cooldownSec;
    }
  }

  private fireBroadside(ship: Ship, side: 'left' | 'right'): void {
    const { broadside } = this.config.player;
    const direction = ship.rotation + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);
    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);
    for (let i = 0; i < broadside.count; i++) {
      const along = (i - (broadside.count - 1) / 2) * broadside.spacing;
      const origin = { x: ship.position.x + cos * along, y: ship.position.y + sin * along };
      this.spawnProjectile('player', origin, direction, broadside.muzzleOffset, broadside.projectile);
    }
    this.emitShot(ship, 'player', side, direction, broadside.muzzleOffset);
  }

  private fireForward(ship: Ship, faction: Faction, weapon: WeaponConfig): void {
    this.spawnProjectile(faction, ship.position, ship.rotation, weapon.muzzleOffset, weapon.projectile);
    ship.cooldowns.front = weapon.cooldownSec;
    this.emitShot(ship, faction, 'front', ship.rotation, weapon.muzzleOffset);
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemy(enemy: Ship, dt: number): void {
    if (!enemy.alive) return;
    tickCooldowns(enemy, dt);
    const steering = steerTowards(enemy, this.player.position, this.arena, dt);

    if (enemy.kind === 'chaser') {
      // Ease off while facing away so it turns tighter instead of circling wide.
      const thrust = Math.abs(steering.angleToTarget) < Math.PI / 2;
      this.moveShip(enemy, thrust, steering.turn, dt);
      if (this.player.alive && hullsOverlapShips(enemy, this.player)) {
        this.damage(this.player, this.config.chaser.ramDamage, false);
        this.destroy(enemy, false);
      }
      return;
    }

    const shooter = this.config.shooter;
    this.moveShip(enemy, steering.distanceToTarget > shooter.holdDistance, steering.turn, dt);
    if (
      this.player.alive &&
      enemy.cooldowns.front <= 0 &&
      steering.distanceToTarget <= shooter.attackRange &&
      Math.abs(steering.angleToTarget) <= shooter.aimTolerance
    ) {
      this.fireForward(enemy, 'enemy', shooter.cannon);
    }
  }

  private trySpawnEnemy(): void {
    const { spawn } = this.config;
    if (this.enemies.length >= spawn.maxAlive) return;

    // The first volley contains one of each kind so both always appear in a match.
    const kind = ENEMY_KINDS[this.spawnCount] ?? this.random.weighted(spawn.weights);
    const stats = this.config[kind].ship;
    const halfLength = Math.max(...stats.hull.offsets.map(Math.abs)) + stats.hull.radius;
    const minDistSq = spawn.minDistanceFromPlayer ** 2;

    for (let attempt = 0; attempt < spawn.maxAttempts; attempt++) {
      const position = {
        x: this.random.range(halfLength, this.arena.width - halfLength),
        y: this.random.range(halfLength, this.arena.height - halfLength),
      };
      if (distanceSq(position, this.player.position) < minDistSq) continue;
      const rotation = Math.atan2(this.player.position.y - position.y, this.player.position.x - position.x);
      if (hullIsBlocked(position, rotation, stats.hull, this.arena, spawn.clearance)) continue;
      const crowded = this.enemies.some((other) => distanceSq(other.position, position) < (halfLength * 2) ** 2);
      if (crowded) continue;

      this.enemies.push(this.createShip(kind, stats, { position, rotation }));
      this.spawnCount++;
      return;
    }
  }

  // ---------------------------------------------------------------- shared

  private moveShip(ship: Ship, thrust: boolean, turn: number, dt: number): void {
    ship.previousPosition.x = ship.position.x;
    ship.previousPosition.y = ship.position.y;
    ship.previousRotation = ship.rotation;

    const { stats } = ship;
    ship.rotation += turn * stats.turnSpeed * dt;
    ship.speed = thrust
      ? Math.min(stats.moveSpeed, ship.speed + stats.acceleration * dt)
      : Math.max(0, ship.speed - stats.deceleration * dt);

    ship.position.x += Math.cos(ship.rotation) * ship.speed * dt;
    ship.position.y += Math.sin(ship.rotation) * ship.speed * dt;

    if (resolveHullCollisions(ship.position, ship.rotation, stats.hull, this.arena)) {
      // Scraping along a coast or wall bleeds speed instead of sliding at full pace.
      ship.speed *= 0.9;
    }
  }

  /** Pushes overlapping ships apart (rams are resolved before this and never reach here). */
  private separateShips(): void {
    const ships = [this.player, ...this.enemies].filter((ship) => ship.alive);
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i]!;
        const b = ships[j]!;
        const push = hullPush(a, b);
        if (!push) continue;
        const shareA = a.kind === 'player' ? PLAYER_PUSH_SHARE : b.kind === 'player' ? 1 - PLAYER_PUSH_SHARE : 0.5;
        a.position.x -= push.x * shareA;
        a.position.y -= push.y * shareA;
        b.position.x += push.x * (1 - shareA);
        b.position.y += push.y * (1 - shareA);
        resolveHullCollisions(a.position, a.rotation, a.stats.hull, this.arena);
        resolveHullCollisions(b.position, b.rotation, b.stats.hull, this.arena);
      }
    }
  }

  private spawnProjectile(
    faction: Faction,
    origin: Vec2,
    direction: number,
    muzzleOffset: number,
    stats: ProjectileConfig,
  ): void {
    const cos = Math.cos(direction);
    const sin = Math.sin(direction);
    const position = { x: origin.x + cos * muzzleOffset, y: origin.y + sin * muzzleOffset };
    this.projectiles.push({
      id: this.nextEntityId++,
      faction,
      position,
      previousPosition: { ...position },
      velocity: { x: cos * stats.speed, y: sin * stats.speed },
      damage: stats.damage,
      radius: stats.radius,
      remainingRange: stats.range,
    });
  }

  private updateProjectiles(dt: number): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.previousPosition.x = projectile.position.x;
      projectile.previousPosition.y = projectile.position.y;
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.y += projectile.velocity.y * dt;
      projectile.remainingRange -= Math.hypot(projectile.velocity.x, projectile.velocity.y) * dt;

      const { x, y } = projectile.position;
      const targets = projectile.faction === 'player' ? this.enemies : [this.player];
      const hit = targets.find(
        (ship) =>
          ship.alive &&
          hullOverlapsCircle(ship.position, ship.rotation, ship.stats.hull, projectile.position, projectile.radius),
      );
      if (hit) {
        this.emit({ type: 'impact', target: 'ship', x, y });
        this.damage(hit, projectile.damage, projectile.faction === 'player');
        return false;
      }
      if (circleHitsObstacle(projectile.position, projectile.radius, this.arena)) {
        this.emit({ type: 'impact', target: 'island', x, y });
        return false;
      }
      if (!isInsideArena(projectile.position, this.arena)) return false;
      if (projectile.remainingRange <= 0) {
        this.emit({ type: 'splash', x, y });
        return false;
      }
      return true;
    });
  }

  private damage(ship: Ship, amount: number, byPlayer: boolean): void {
    if (!ship.alive) return;
    ship.health = Math.max(0, ship.health - amount);
    if (ship.health <= 0) this.destroy(ship, byPlayer);
    else this.emit({ type: 'ship-damaged', shipId: ship.id, kind: ship.kind });
  }

  /** @param byPlayer Whether the player's weapons destroyed it, which is what scores. */
  private destroy(ship: Ship, byPlayer: boolean): void {
    if (!ship.alive) return;
    ship.alive = false;
    ship.health = 0;
    ship.speed = 0;
    const scored = byPlayer && ship.kind !== 'player';
    if (scored) this.score += 1;
    const { x, y } = ship.position;
    this.emit({ type: 'ship-destroyed', shipId: ship.id, kind: ship.kind, x, y, rotation: ship.rotation, scored });
  }

  private emitShot(ship: Ship, faction: Faction, slot: WeaponSlot, direction: number, muzzleOffset: number): void {
    this.emit({
      type: 'shot',
      faction,
      slot,
      x: ship.position.x + Math.cos(direction) * muzzleOffset,
      y: ship.position.y + Math.sin(direction) * muzzleOffset,
      rotation: direction,
    });
  }

  private emit(event: GameEvent): void {
    this.pendingEvents.push(event);
  }

  private createShip(kind: ShipKind, stats: ShipConfig, pose: { position: Vec2; rotation: number }): Ship {
    return {
      id: this.nextEntityId++,
      kind,
      stats,
      position: { ...pose.position },
      rotation: pose.rotation,
      speed: 0,
      health: stats.maxHealth,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
      previousPosition: { ...pose.position },
      previousRotation: pose.rotation,
    };
  }
}

function tickCooldowns(ship: Ship, dt: number): void {
  ship.cooldowns.front = Math.max(0, ship.cooldowns.front - dt);
  ship.cooldowns.left = Math.max(0, ship.cooldowns.left - dt);
  ship.cooldowns.right = Math.max(0, ship.cooldowns.right - dt);
}

function hullsOverlapShips(a: Ship, b: Ship): boolean {
  return hullsOverlap(
    { position: a.position, rotation: a.rotation, hull: a.stats.hull },
    { position: b.position, rotation: b.rotation, hull: b.stats.hull },
  );
}

/** Average vector to move `b` away from `a` over their overlapping circle pairs, or null. */
function hullPush(a: Ship, b: Ship): Vec2 | null {
  const circlesA = hullCircles(a.position, a.rotation, a.stats.hull);
  const circlesB = hullCircles(b.position, b.rotation, b.stats.hull);
  const reach = a.stats.hull.radius + b.stats.hull.radius;
  let x = 0;
  let y = 0;
  let pairs = 0;
  for (const ca of circlesA) {
    for (const cb of circlesB) {
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= reach) continue;
      pairs++;
      if (dist < 1e-6) {
        x += reach;
        continue;
      }
      x += (dx / dist) * (reach - dist);
      y += (dy / dist) * (reach - dist);
    }
  }
  return pairs === 0 ? null : { x: x / pairs, y: y / pairs };
}
