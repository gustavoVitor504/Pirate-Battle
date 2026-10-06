import { distanceSq, type Vec2 } from '../math';
import type { Arena, Obstacle } from './arena';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Waypoints sit this much further out than the line-of-sight margin, so they are always visible from each other. */
const NODE_EXTRA_MARGIN = 10;

/**
 * Route planning around islands with a visibility graph.
 *
 * Every island gets four waypoints just off its corners. A ship that can see
 * its target goes straight; otherwise it takes the shortest chain of mutually
 * visible waypoints (Dijkstra). With only a few rectangular islands the graph
 * is tiny (a dozen nodes), so planning costs microseconds.
 *
 * Islands are treated as their bounding box grown by `margin`, which keeps the
 * hull clear of the coast while turning around a corner.
 */
export class Navigator {
  private readonly boxes: Box[];
  private readonly innerBoxes: Box[];
  private readonly nodes: Vec2[];
  /** Precomputed visibility between waypoints; they never move. */
  private readonly nodeLinks: boolean[][];

  constructor(
    private readonly arena: Arena,
    /** Hull radius plus the configured clearance. */
    margin: number,
  ) {
    this.boxes = arena.obstacles.map((obstacle) => expand(obstacle, margin));
    // Used instead of the full box when an endpoint already sits in the margin (e.g. hugging a coast).
    this.innerBoxes = arena.obstacles.map((obstacle) => expand(obstacle, -4));

    const nodeMargin = margin + NODE_EXTRA_MARGIN;
    this.nodes = arena.obstacles
      .flatMap((obstacle) => corners(expand(obstacle, nodeMargin)))
      .filter((node) => this.isNavigable(node, margin));
    this.nodeLinks = this.nodes.map((a) => this.nodes.map((b) => a !== b && this.hasLineOfSight(a, b)));
  }

  /** True when the straight path between two points stays clear of every island. */
  hasLineOfSight(from: Vec2, to: Vec2): boolean {
    return this.boxes.every((box, index) => {
      const startsInside = contains(box, from) || contains(box, to);
      return !segmentHitsBox(from, to, startsInside ? this.innerBoxes[index]! : box);
    });
  }

  /**
   * Shortest route from `from` to `to`, as the waypoints to visit (ending with
   * `to`). Returns null when the target cannot be reached.
   */
  findRoute(from: Vec2, to: Vec2): Vec2[] | null {
    if (this.hasLineOfSight(from, to)) return [to];

    // Graph indices: 0 = start, 1..n = waypoints, n + 1 = goal.
    const count = this.nodes.length + 2;
    const goal = count - 1;
    const point = (index: number): Vec2 => (index === 0 ? from : index === goal ? to : this.nodes[index - 1]!);
    const linked = (a: number, b: number): boolean => {
      if (a > 0 && a < goal && b > 0 && b < goal) return this.nodeLinks[a - 1]![b - 1]!;
      return this.hasLineOfSight(point(a), point(b));
    };

    const cost = new Array<number>(count).fill(Infinity);
    const previous = new Array<number>(count).fill(-1);
    const done = new Array<boolean>(count).fill(false);
    cost[0] = 0;

    for (let iteration = 0; iteration < count; iteration++) {
      let current = -1;
      for (let i = 0; i < count; i++) {
        if (!done[i] && cost[i]! < Infinity && (current < 0 || cost[i]! < cost[current]!)) current = i;
      }
      if (current < 0 || current === goal) break;
      done[current] = true;
      for (let next = 1; next < count; next++) {
        if (done[next] || !linked(current, next)) continue;
        const candidate = cost[current]! + Math.sqrt(distanceSq(point(current), point(next)));
        if (candidate < cost[next]!) {
          cost[next] = candidate;
          previous[next] = current;
        }
      }
    }

    if (previous[goal] === -1) return null;
    const route: Vec2[] = [];
    for (let index = goal; index !== 0; index = previous[index]!) route.unshift(point(index));
    return route;
  }

  /** Waypoints, exposed for debugging and tests. */
  get waypoints(): readonly Vec2[] {
    return this.nodes;
  }

  private isNavigable(node: Vec2, margin: number): boolean {
    const inside =
      node.x >= margin && node.y >= margin && node.x <= this.arena.width - margin && node.y <= this.arena.height - margin;
    return inside && !this.boxes.some((box) => contains(box, node));
  }
}

function expand(obstacle: Obstacle, margin: number): Box {
  return {
    minX: obstacle.x - margin,
    minY: obstacle.y - margin,
    maxX: obstacle.x + obstacle.width + margin,
    maxY: obstacle.y + obstacle.height + margin,
  };
}

function corners(box: Box): Vec2[] {
  return [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
}

function contains(box: Box, point: Vec2): boolean {
  return point.x > box.minX && point.x < box.maxX && point.y > box.minY && point.y < box.maxY;
}

/** Liang–Barsky clipping: does the segment a→b cross the box interior? */
function segmentHitsBox(a: Vec2, b: Vec2, box: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - box.minX, box.maxX - a.x, a.y - box.minY, box.maxY - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 < t1;
}
