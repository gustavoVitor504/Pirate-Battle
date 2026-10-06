import type { EnemyKind, ShipConfig } from '../config';
import type { Vec2 } from '../math';

export type ShipKind = 'player' | EnemyKind;
export type Faction = 'player' | 'enemy';

export interface Ship {
  id: number;
  kind: ShipKind;
  stats: ShipConfig;
  position: Vec2;
  /** Heading in radians; 0 points along +x, PI/2 along +y (screen down). */
  rotation: number;
  speed: number;
  health: number;
  /** False from the moment the ship is destroyed; it is removed at the end of the step. */
  alive: boolean;
  /** Seconds until each weapon may fire again. */
  cooldowns: Record<WeaponSlot, number>;
  /** Pose at the start of the last step, used by the renderer to interpolate. */
  previousPosition: Vec2;
  previousRotation: number;
}

export type WeaponSlot = 'front' | 'left' | 'right';

export interface Projectile {
  id: number;
  faction: Faction;
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  damage: number;
  radius: number;
  /** Distance still to travel before expiring. */
  remainingRange: number;
}

export type MatchEndReason = 'time-up' | 'player-destroyed';

export type GameEvent =
  | { type: 'shot'; faction: Faction; slot: WeaponSlot; x: number; y: number; rotation: number }
  | { type: 'impact'; target: 'ship' | 'island'; x: number; y: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'ship-damaged'; shipId: number; kind: ShipKind }
  | { type: 'ship-destroyed'; shipId: number; kind: ShipKind; x: number; y: number; rotation: number; scored: boolean }
  | { type: 'match-ended'; reason: MatchEndReason };
