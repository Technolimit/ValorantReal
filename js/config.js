// Global tuning. Distances in meters, angles in degrees, time in seconds.

export const TICK_RATE = 128;
export const DT = 1 / TICK_RATE;
export const CELL = 2; // map grid cell size

// Body size. Riot hasn't published hitbox dimensions; these follow the community figures: every agent
// shares one hitbox at a reported 1.96 m in-game height, and the head is about 13% of that (~0.25 m).
// Bodies are scaled up 8% to fit the map's proportions; the head keeps its real size.
const BODY_K = 1.08;
const STAND_H = +(1.96 * BODY_K).toFixed(3);
const CROUCH_H = +(1.4 * BODY_K).toFixed(3);
const HEAD_H = 0.255;
const HEAD_HALF_W = 0.12;

export const PLAYER = {
  radius: 0.345,
  standHeight: STAND_H,
  crouchHeight: CROUCH_H,
  standEye: +(STAND_H - 0.14).toFixed(3), // inside the head box, a little above its middle
  crouchEye: +(CROUCH_H - 0.14).toFixed(3),
  stepHeight: 0.45,
  jumpVelocity: 6.95, // ~1.1 m apex
  gravity: 22,
  accel: 52, // ground acceleration toward wish velocity
  decel: 44, // braking with no input
  airAccel: 22, // air strafe responsiveness (m/s² toward the held direction)
  airStandFrac: 0.6, // a standing jump can be steered up to this share of run speed
  walkMult: 0.6,
  crouchMult: 0.5,
  knifeSpeed: 6.75,
  hp: 100,
  armor: 50, // heavy shield, absorbs damage 1:1 before health
};

// Getting hit slows movement. Values from the 3.0 patch (72.5%); shotgun pellets past 10 m only slow 30%.
export const TAG = { slow: 0.725, hold: 0.25, fade: 0.25, shotgunFarSlow: 0.3, shotgunFarRange: 10 };

export const CROUCH_SPREAD = 0.85; // spread multiplier while crouched on the ground
export const VIEW_RECOIL = 0.5; // share of bullet recoil that moves the camera; bullets land above the crosshair
export const PEN_DEPTH = { low: 1.0, medium: 2.2, high: 4.4 }; // meters of penetrable material a bullet can cross
export const MAX_RANGE = 250;

// Hitboxes relative to feet, for standing and fully crouched. [yMin, yMax, halfWidth]
export const HITBOX = {
  stand: { legs: [0, 0.94 * BODY_K, 0.19 * BODY_K], body: [0.94 * BODY_K, STAND_H - HEAD_H, 0.23 * BODY_K], head: [STAND_H - HEAD_H, STAND_H, HEAD_HALF_W] },
  crouch: { legs: [0, 0.6 * BODY_K, 0.21 * BODY_K], body: [0.6 * BODY_K, CROUCH_H - HEAD_H, 0.23 * BODY_K], head: [CROUCH_H - HEAD_H, CROUCH_H, HEAD_HALF_W] },
};
// Where a third-person gun sits (chest height), standing and crouched.
export const GUN_HEIGHT = [STAND_H - HEAD_H - 0.2, CROUCH_H - HEAD_H - 0.1];

export const HFOV = 103; // horizontal FOV at 16:9
export const YAW_PER_COUNT = 0.07; // degrees per mouse count at sensitivity 1.0 (same scale as Valorant)

export const MATCH = { respawn: 3, healOnKill: true };
