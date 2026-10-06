import type { HullConfig } from '../config';
import { clamp, type Vec2 } from '../math';
import type { Arena, Obstacle } from './arena';

/**
 * Penetration of a circle into a rounded rectangle.
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

export function circleHitsObstacle(center: Vec2, radius: number, arena: Arena): boolean {
  return arena.obstacles.some((obstacle) => circleVsObstacle(center, radius, obstacle) !== null);
}

export function isInsideArena(point: Vec2, arena: Arena): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= arena.width && point.y <= arena.height;
}

/** World-space centers of a hull's circles. */
export function hullCircles(position: Vec2, rotation: number, hull: HullConfig): Vec2[] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return hull.offsets.map((offset) => ({ x: position.x + cos * offset, y: position.y + sin * offset }));
}

export function hullOverlapsCircle(
  position: Vec2,
  rotation: number,
  hull: HullConfig,
  center: Vec2,
  radius: number,
): boolean {
  const reach = hull.radius + radius;
  return hullCircles(position, rotation, hull).some(
    (c) => (c.x - center.x) ** 2 + (c.y - center.y) ** 2 < reach * reach,
  );
}

export function hullsOverlap(
  a: { position: Vec2; rotation: number; hull: HullConfig },
  b: { position: Vec2; rotation: number; hull: HullConfig },
): boolean {
  const circlesB = hullCircles(b.position, b.rotation, b.hull);
  return hullCircles(a.position, a.rotation, a.hull).some((ca) =>
    circlesB.some((cb) => (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 < (a.hull.radius + b.hull.radius) ** 2),
  );
}

/** True when the hull overlaps an island or pokes outside the arena (plus `clearance`). */
export function hullIsBlocked(position: Vec2, rotation: number, hull: HullConfig, arena: Arena, clearance = 0): boolean {
  const radius = hull.radius + clearance;
  return hullCircles(position, rotation, hull).some(
    (c) =>
      c.x < radius ||
      c.y < radius ||
      c.x > arena.width - radius ||
      c.y > arena.height - radius ||
      circleHitsObstacle(c, radius, arena),
  );
}

/**
 * Moves a hull out of every island and back inside the arena bounds.
 * Mutates `position`; returns true when any correction was applied.
 */
export function resolveHullCollisions(position: Vec2, rotation: number, hull: HullConfig, arena: Arena): boolean {
  let corrected = false;
  // A few passes settle being pushed by one circle into another obstacle.
  for (let pass = 0; pass < 3; pass++) {
    let movedThisPass = false;
    for (const offset of hull.offsets) {
      const circle = {
        x: position.x + Math.cos(rotation) * offset,
        y: position.y + Math.sin(rotation) * offset,
      };
      let dx = 0;
      let dy = 0;
      for (const obstacle of arena.obstacles) {
        const push = circleVsObstacle(circle, hull.radius, obstacle);
        if (push) {
          dx += push.x;
          dy += push.y;
        }
      }
      dx += clamp(circle.x, hull.radius, arena.width - hull.radius) - circle.x;
      dy += clamp(circle.y, hull.radius, arena.height - hull.radius) - circle.y;
      if (dx !== 0 || dy !== 0) {
        position.x += dx;
        position.y += dy;
        movedThisPass = true;
      }
    }
    if (!movedThisPass) break;
    corrected = true;
  }
  return corrected;
}
