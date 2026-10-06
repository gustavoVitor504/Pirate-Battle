import { angleDelta, clamp, type Vec2 } from '../math';
import type { Arena } from './arena';
import { circleHitsObstacle } from './collision';
import type { Ship } from './entities';

/** How far ahead of the bow enemies look for islands and walls. */
const LOOKAHEAD = 90;
/** Angles (relative to the heading) tried when the way ahead is blocked. */
const DETOUR_ANGLES = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

export interface SteeringResult {
  /** Turn input in [-1, 1]; negative turns left. */
  turn: number;
  /** Signed angle from the current heading to the target. */
  angleToTarget: number;
  distanceToTarget: number;
}

/**
 * Steers towards a target point while avoiding islands and the arena edge:
 * if the probe ahead is blocked, it picks the free detour closest to the
 * target direction.
 */
export function steerTowards(ship: Ship, target: Vec2, arena: Arena, dt: number): SteeringResult {
  const dx = target.x - ship.position.x;
  const dy = target.y - ship.position.y;
  const angleToTarget = angleDelta(ship.rotation, Math.atan2(dy, dx));
  const distanceToTarget = Math.hypot(dx, dy);

  let desired = angleToTarget;
  const bowOffset = Math.max(...ship.stats.hull.offsets);
  if (isPathBlocked(ship, ship.rotation, bowOffset, arena)) {
    const free = DETOUR_ANGLES.filter((offset) => !isPathBlocked(ship, ship.rotation + offset, bowOffset, arena));
    if (free.length > 0) {
      desired = free.reduce((best, offset) =>
        Math.abs(angleDelta(offset, angleToTarget)) < Math.abs(angleDelta(best, angleToTarget)) ? offset : best,
      );
    }
  }

  // Scale so the ship does not overshoot the desired heading within one step.
  const maxTurn = ship.stats.turnSpeed * dt;
  return { turn: clamp(desired / maxTurn, -1, 1), angleToTarget, distanceToTarget };
}

function isPathBlocked(ship: Ship, heading: number, bowOffset: number, arena: Arena): boolean {
  const radius = ship.stats.hull.radius;
  const reach = bowOffset + LOOKAHEAD;
  const probe = {
    x: ship.position.x + Math.cos(heading) * reach,
    y: ship.position.y + Math.sin(heading) * reach,
  };
  const outside =
    probe.x < radius || probe.y < radius || probe.x > arena.width - radius || probe.y > arena.height - radius;
  return outside || circleHitsObstacle(probe, radius, arena);
}
