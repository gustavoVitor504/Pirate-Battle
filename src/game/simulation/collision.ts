import { clamp, type Vec2 } from '../math';
import type { Arena, Obstacle } from './arena';

/**
 * Signed penetration of a circle into a rounded rectangle.
 * Returns the push-out vector, or null when they do not overlap.
 *
 * A rounded rectangle is the inner rectangle (shrunk by the corner radius)
 * inflated by that radius, so the test reduces to circle-vs-point distance
 * against the closest point of the inner rectangle.
 */
export function circleVsObstacle(center: Vec2, radius: number, obstacle: Obstacle): Vec2 | null {
  const r = obstacle.cornerRadius;
  const innerLeft = obstacle.x + r;
  const innerTop = obstacle.y + r;
  const innerRight = obstacle.x + obstacle.width - r;
  const innerBottom = obstacle.y + obstacle.height - r;

  const closestX = clamp(center.x, innerLeft, innerRight);
  const closestY = clamp(center.y, innerTop, innerBottom);
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  const reach = radius + r;
  const distSq = dx * dx + dy * dy;
  if (distSq >= reach * reach) return null;

  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    const push = reach - dist;
    return { x: (dx / dist) * push, y: (dy / dist) * push };
  }

  // Center is inside the inner rectangle: push out along the shallowest axis.
  const toLeft = center.x - innerLeft + reach;
  const toRight = innerRight - center.x + reach;
  const toTop = center.y - innerTop + reach;
  const toBottom = innerBottom - center.y + reach;
  const min = Math.min(toLeft, toRight, toTop, toBottom);
  if (min === toLeft) return { x: -toLeft, y: 0 };
  if (min === toRight) return { x: toRight, y: 0 };
  if (min === toTop) return { x: 0, y: -toTop };
  return { x: 0, y: toBottom };
}

export function overlapsAnyObstacle(center: Vec2, radius: number, arena: Arena): boolean {
  return arena.obstacles.some((obstacle) => circleVsObstacle(center, radius, obstacle) !== null);
}

/**
 * Moves a circle out of every obstacle and back inside the arena bounds.
 * Mutates `position`; returns true when any correction was applied.
 */
export function resolveStaticCollisions(position: Vec2, radius: number, arena: Arena): boolean {
  let corrected = false;
  // Two passes settle the rare case of being pushed from one island into another.
  for (let pass = 0; pass < 2; pass++) {
    for (const obstacle of arena.obstacles) {
      const push = circleVsObstacle(position, radius, obstacle);
      if (push) {
        position.x += push.x;
        position.y += push.y;
        corrected = true;
      }
    }
  }

  const x = clamp(position.x, radius, arena.width - radius);
  const y = clamp(position.y, radius, arena.height - radius);
  if (x !== position.x || y !== position.y) {
    position.x = x;
    position.y = y;
    corrected = true;
  }
  return corrected;
}
