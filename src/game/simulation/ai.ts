import { angleDelta, clamp, distanceSq, type Vec2 } from '../math';
import type { Ship } from './entities';
import type { Navigator } from './navigation';

/** A waypoint closer than this counts as reached. */
const WAYPOINT_REACHED = 36;

export interface SteeringResult {
  /** Turn input in [-1, 1]; negative turns left. */
  turn: number;
  /** Signed angle from the current heading to where the ship is steering (a waypoint or the target). */
  angleToCourse: number;
  /** Signed angle from the current heading to the target itself. */
  angleToTarget: number;
  distanceToTarget: number;
  /** Whether the straight line to the target is clear of islands. */
  lineOfSight: boolean;
}

/**
 * Steers a ship towards a target. With a clear line of sight it heads
 * straight there; otherwise it follows a planned route around the islands,
 * replanning periodically as the target moves. Committing to a route is what
 * stops it dithering in front of an island.
 */
export function steerTowards(
  ship: Ship,
  target: Vec2,
  navigator: Navigator,
  replanIntervalSec: number,
  dt: number,
): SteeringResult {
  const nav = ship.navigation;
  const lineOfSight = navigator.hasLineOfSight(ship.position, target);
  let course = target;

  if (lineOfSight) {
    nav.route = [];
    nav.replanIn = 0;
  } else {
    nav.replanIn -= dt;
    if (nav.route.length === 0 || nav.replanIn <= 0) {
      nav.route = navigator.findRoute(ship.position, target) ?? [];
      nav.replanIn = replanIntervalSec;
    }
    // Drop waypoints already reached, or skippable because the next one is in view.
    while (
      nav.route.length > 1 &&
      (distanceSq(ship.position, nav.route[0]!) < WAYPOINT_REACHED ** 2 ||
        navigator.hasLineOfSight(ship.position, nav.route[1]!))
    ) {
      nav.route.shift();
    }
    course = nav.route[0] ?? target;
  }

  const angleToCourse = headingTo(ship, course);
  const maxTurn = ship.stats.turnSpeed * dt;
  return {
    // Scaled so the ship does not overshoot the desired heading within one step.
    turn: clamp(angleToCourse / maxTurn, -1, 1),
    angleToCourse,
    angleToTarget: lineOfSight ? angleToCourse : headingTo(ship, target),
    distanceToTarget: Math.sqrt(distanceSq(ship.position, target)),
    lineOfSight,
  };
}

function headingTo(ship: Ship, point: Vec2): number {
  return angleDelta(ship.rotation, Math.atan2(point.y - ship.position.y, point.x - ship.position.x));
}
