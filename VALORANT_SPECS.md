# VALORANT Ability Specs for Code (Patch 13.10)

Oct 27, 2026 · Isaac

## How to read this

Each ability lists its delivery type, timings in seconds, and the other values code needs. Values match Patch 13.10 (Nov 10, 2026). 13.10 changed only Sentinel cooldowns and Sage's Healing Orb targeting (marked 13.10); the game-file values are still from the 13.09 extraction, because no 13.10 extraction exists yet.

- Unmarked numbers: game files, as extracted by valorant.gs (unofficial). Most agent pages are build 13.09. Pages for Sova, Reyna, Waylay, Fade, Brimstone, Omen, Astra, Harbor, Clove, Miks, Chamber and Deadlock still show 13.08, and Phoenix 13.06; the only 13.09 balance change among them is Clove's Pick-me-up (now x1.10).
- (patch) = Riot patch notes. (wiki) = community wiki. (derived) = computed from file values.
- raw: the files list the value but don't say what it controls. It's given with its file field name.
- (est.) = not in the files or any source found; my estimate, with its basis in the table under Missing values. Replace it once measured.
- Delivery types: Projectile (physics object, ballistic or steerable), Hitscan (instant trace), Placed (put on a surface), Map-targeted (placed on the tactical map), Entity (pilotable or autonomous object), Self (buff, state or movement), Area (zone, wall, cone or wave; not a projectile).
- Units: meters, seconds, m/s. Files use Unreal units (100 uu = 1 m); all distances and speeds here are converted.
- Gravity: "gravity x0.45" means the projectile's gravity scale relative to the engine default.

## Global constants

Implement these once and reuse them across agents.

| Rule | Value | Notes |
|---|---|---|
| Units | 100 uu = 1 m | Unreal Engine |
| Walk (run) speed | 5.6 m/s; Jett 5.9 m/s | Agent files |
| Flash: distance factor | 0 m: x1.3, 60 m: x0.1, linear between | Multiplies the ability's max flash. Files give the curves, not the formula; multiplying the factors is the usual reading |
| Flash: vertical angle factor | Up to 34 deg off center: x1; 75 deg: x0.068 | Pitch curve |
| Flash: horizontal angle factor | Up to 50 deg off center: x1; 80 deg: x0.068 | Yaw curve |
| Pop-flash curves | Distance 30 m: x1, 55 m: x0.25; pitch 34 deg: x1, 54 deg: x0.068; yaw 50 deg: x1, 65 deg: x0.068 | Second curve set in the files; max duration 1.5. Which flashes use it isn't stated |
| Flash fade-out | ~1 s | (wiki) |
| Concuss | Each ability sets its duration (usually 2.5 s) | No ADS or zoom, minimap blinded, dash x0.5 |
| Concuss movement slow | Over the concuss, as a fraction t of its length: t 0.1: -85%, t 0.9: -25%, t 1.0: 0 | Strong at start, eases off |
| Concuss fire rate and recovery | Fire rate x0.3 at t 0.1, x0.7 at 0.9, x1 at 1.0; spread recovery x0.3, x0.65, x1 | Marked "prototype" curves in the files |
| Nearsight | Vision capped per ability: Leer and Prowler 6 m; Paranoia, Seekers, Storm Surge, Reckoning 7.5 m | Minimap and detection off. Patch notes say 7 m; files differ per ability |
| Inside a smoke | Vision and minimap capped at 3 m | Smokes expand and contract over 1 s curves |
| Combat Stim | Reload x0.9, fire rate x1.1, draw x0.9, spread recovery x1.1 | Global stim buff |
| Haste | Run speed x1.1 (Brimstone, Miks, Waylay, Clove since 13.09); Neon High Gear x1.35 | Separate from Combat Stim since 13.09 |
| Vulnerable, Fragile | Damage taken x2 | Files: "Damage Reduction = 2". Duration per ability |
| Suppress | Default 4 s; equipment and abilities disabled | KAY/O and Tejo set 8 s |
| Detain | Move x0.167, disarmed, no abilities, use, reload or melee; jump force x0.7, jump move x0.5, silent | Same set used by Thrash (6 s), Lockdown (8 s), Hush's Suspension (4 s) |
| Hinder | Move, fire rate, reload, spread recovery and draw pushed to minimum 0 by curve; dash x0.5 | Waylay |
| Silence | Default 3 s; blocks abilities |   |
| Fire patch defaults | Active 8 s, fade 3 s, spreads at 6 m/s to 4.5 m radius | Molotov parent; abilities override |
| Revive (downed) | Hold 2 s within 2 m |   |
| Using the tactical map | Movement locked, no jump |   |
| Sitewide ult cast | Turn rate capped at 180 deg/s for 1 s |   |
| Bounce stop | Projectiles that stop on bounce stop on floors flatter than 44.765 deg |   |
| Sentinel devices | Disable beyond 40 m or on death; 2 s to reactivate (patch) | Killjoy files: 4,000 uu |
| Signature abilities | At least 1 charge per round; Initiator signature cooldown 50 s |   |
| Kill credit windows | Heal 10 s; reveal 3 s; blind +3 s after; detain +3 s; suppress +3 s; slow +2 s; gravity +2 s; smoke 1 s +2 s | How long an effect still credits the kill. Assists don't count toward "every two kills"; only kills do |
| Assists | Damage: more than 10 within 3 s before a teammate's kill, or 50+ at any time. Healing: counts only if the healed player gets a kill within 10 s after the heal ends | Documented in 13.10; live since 13.08 |
| Projectile classes (wiki) | 0.7: 6.3 m/s, g x0.3 · 1: 16.5 m/s, g x0.7 · 1.3: 20 m/s, g x0.7 · 2: 18 m/s, g x0.3 · 3: 29 m/s, g x0.45 · 4: 41.25 m/s, g x0.3 · 5: 41.25 m/s, g x0.15 · 6: 50 m/s, g x0.3 | The wiki's own labels, built from game-file speeds. Gravity is a scale on 9.8 m/s². Class 2 = thrown grenades (Hot Hands, Paint Shells, Nanoswarm, Mosh Pit, Flashbulb); 0.7 = their underhand lobs; 3 = launcher-style (Incendiary, Snake Bite, M-pulse) |
| Charges across rounds | Unused utility carries over to the next round. Exception: extra charges regenerated by cooldown or kills, and temporary charges, don't | Riot designer statement (2020) and wiki. Signature refresh is counted in kill points (13.09 notes); assists don't count; kill progress and part-recharged cooldowns reset each round |
| Decay | Fixed HP removed at once as temporary damage, then restored over time | Seize 75 over 5 s, Chokehold 75 over 4.5 s (wiki). Viper's gas is the exception: it keeps decaying 10/s while you're inside |

## Shared trajectories

Most thrown abilities use one of a few projectile settings, so one physics function per class covers them. Classes are the VALORANT Wiki's labels; "(files)" means the ability isn't on the wiki's list but its game-file speed and gravity match the class.

| Class | Speed | Gravity | Abilities |
|---|---|---|---|
| 0.7 | 6.3 m/s | x0.3 | Underhand / ALT lobs: Hot Hands, Paint Shells, Nanoswarm, Mosh Pit, Poison Cloud |
| 1 | 16.5 m/s | x0.7 | Blast Pack, Stim Beacon |
| 1.3 | 20 m/s | x0.7 | Barrier Mesh disc |
| 2 | 18 m/s | x0.3 | Hot Hands, Paint Shells, Nanoswarm, Mosh Pit, Flashbulb (thrown), Sova arrow uncharged, Seize; Dizzy (files) |
| 3 | 29 m/s | x0.45 | Incendiary (one wiki caption says Class 4), Snake Bite, M-pulse, Sova arrow 1 bar; Cloudburst, Blindside, Saturate, Slow Orb, Razorvine, Meddle, Storm Surge (files) |
| 4 | 41.25 m/s | x0.3 | Sova arrow 2 bars |
| 5 | 41.25 m/s | x0.15 | Sova arrow full charge; Relay Bolt, Special Delivery (files) |
| 6 | 50 m/s | x0.3 | Toxic Screen emitters |

Abilities with their own motion:

- Steered by crosshair: Cloudburst (while held), Guiding Light (18 m/s), Suspension (25 m/s, gravity x0.45), Flashbulb and Displacement after redirect (~32.5 m/s, est.), Blaze and High Tide walls (bend while held)
- Curved: Curveball (20 m/s, curves left or right)
- Straight line, ignores gravity: Paranoia (20 m/s, through walls), Undercut (22.5 m/s, through walls), Leer (22.5 m/s), Dark Cover and Cove (64 m/s to an aimed point), Flashpoint (24 m/s), Aftershock (25 m/s), Annihilation (82.5 m/s, 1 bounce), Showstopper rocket (~25 m/s, est.), Cyber Cage (20 m/s), Gatecrash tether (~8 m/s along the ground)
- Fast darts: Spycam dart and Trademark field (200 m/s)
- Ground creatures and drones: Boom Bot, Wingman (6.3 m/s), Thrash (11.22 m/s), Prowler (10-15 m/s), Trailblazer, Seekers, Owl Drone, Stealth Drone, Fakeout decoy
- Map-targeted (no flight path): Sky Smoke, Orbital Strike, Guided Salvo, Armageddon, Astra stars, Cosmic Divide, Ruse, Waveform, From the Shadows
- Hitscan: Blade Storm, Headhunter, Tour De Force, Hunter's Fury, Owl Drone dart, Overdrive
- Bounce stop: projectiles that stop on bounce stop on floors flatter than 44.765 deg (GravNet; M-pulse uses 44.5 deg). Some throws start 0.3-0.4 m ahead of the hand: same arc, shifted start

## How abilities look, move and interact

Riot and the wikis document only part of this. What's published is below; per-ability hand animations, which utility is team-tinted, and most audio ranges aren't documented anywhere and need recording with two clients in the Range.

### Rendering rules

| Rule | Detail | Source |
|---|---|---|
| Team colors | Characters get a colored rim (fresnel): enemies red, allies neutral blue. Enemy rims are larger and distant characters are brightened. Players can swap enemy red for purple or yellow, or turn outlines off | Riot tech blog (2020) |
| Team tint on utility | Which abilities are tinted by team isn't documented | — |
| Smokes | A hard-edged sphere that blocks vision the same from every angle; wisps on high settings are cosmetic. On the ground it reads as a hemisphere (sphere cut by the floor). A ceiling likely cuts it the same way (est.) | Riot tech blog; VFX artist observation |
| Shadows | No dynamic shadows in the play space; only first-person hands and weapon cast shadows | Riot tech blog |
| Equip sound | Enemies can't hear an ability being equipped, only after it's cast. Every ultimate plays a voice line all players hear | Wiki |
| Ability maps | A flash hides an open ability or tactical map (13.09 fix) | Patch 13.09 |
| Buff icons | Haste and Snapshot show their own timer or debuff icon (13.09) | Patch 13.09 |
| Possession | Drones and creatures (Owl Drone, Spycam, Trailblazer, Thrash, Stealth Drone): the agent's body stays where it is, and any damage to it ends control | Wiki |

### What the affected player sees

| Effect | Screen | Notes |
|---|---|---|
| Flash | Screen replaced by an opaque colored layer, fading over 1 s | Length scales with facing and distance (curves in Global constants) |
| Plasma blind (Dizzy) | Plasma blast covers most of the screen, fading over 1 s | — |
| Concuss | Blurry grayscale view with the edges fully covered; crosshair and view drift on their own; background noise added | Also slowed, lower fire rate, no scopes or ADS |
| Snapshot | A frozen silhouette from the moment of the reveal (Neural Theft, Spycam dart) | Other reveals (Recon Bolt, Haunt, drone dart) are live silhouettes |
| Paranoia | Warning effect on screen for agents in its path | — |
| Nearsight, Decay, Detain, Hinder, Vulnerable, Fragile, Suppress, Levitate, Deafen | Screen visuals not documented | Gameplay effects are in Global constants |

### Delivery categories

The VALORANT Wiki sorts every ability into one of these. Thrown projectiles use the classes in Shared trajectories.

| Category | Abilities |
|---|---|
| Missile, aimed straight (no gravity) | Spycam dart, Undercut, Fast Lane, Paranoia, Showstopper |
| Missile, steered while held | High Tide, Cloudburst (until released, then it falls), Blaze, Guiding Light |
| Missile, fixed path | Dark Cover, Curveball, Leer |
| Beam | Annihilation, Hunter's Fury |
| Pulses from the agent | NULL/cmd, Steel Garden |
| Aura | Regrowth |
| Ground effect that travels | Fault Line, Rolling Thunder, Nightfall, Reckoning, Kill Contract, Convergent Paths |
| Ground object | Prowler (steered), Wingman, Contingency, Boom Bot, Fakeout, Gatecrash (aimed), Seekers (targeted) |
| Hitscan | Headhunter, Tour De Force, Blade Storm, Overdrive, Owl Drone dart |
| Placed on the map | Cosmic Divide, Astra stars, Sky Smoke, Orbital Strike, Ruse, From the Shadows, Guided Salvo, Armageddon, Waveform |
| Placed on flat ground | Trademark, Rendezvous, Wingman (plant), Alarmbot, Turret, Lockdown, Shrouded Step, Barrier Orb, Viper's Pit, Shear, idle Fakeout, stationary Gatecrash |
| Placed on walls | Spycam, Sonic Sensor |
| Placed on any surface | Aftershock, Flashpoint, Trapwire, Arc Rose |
| Possession | Spycam, Thrash, Trailblazer, Owl Drone, Stealth Drone |
| Self | Pick-me-up, Not Dead Yet, Double Tap, Drift, High Gear, Run It Back, Devour, Healing Orb (self), Refract, Dimensional Drift |
| Targeted | Gravity Well and Nova Pulse (on a star), Neural Theft (corpse), Wingman defuse, Healing Orb (ally), Resurrection |

### Documented details per ability

| Ability | Looks and moves | Shape and size | Interactions |
|---|---|---|---|
| Hush: Flashbulb | Prepared bulb hovers in place; visible pause before it pops after a redirect | — | Flashes everyone looking at it, allies included |
| Hush: Displacement | Hush's first-person model hides on cast | Sphere 5.75 m; pull stops 0.2 m from center; collision check uses a capsule scaled x0.75 | Affects allies and Hush; concuss only on collision |
| Hush: Flow | Momentum carries like a Raze satchel rather than a Jett dash | Anchor trace 15 m | — |
| Hush: Suspension | Steered orb that looks like a Jett smoke being guided; lifted players float x0.8-1.2 height, rising over 1-1.2 s | Orb collision sphere 0.5 m; lifts players within 7 m, items within 9 m | Hits allies, not Hush |
| Jett: Cloudburst | Steered while the key is held, then falls under gravity | Expands on surface hit or timer | — |
| Yoru: Blindside | Thrown as a hard-to-see fragment; bounces off any surface | Fades after 2 s with no collision | — |
| Sova: Shock / Recon Bolt | Three charge bars under the crosshair; ALT sets 0-2 bounces | Recon sonar 30 m sphere, squashed vertically (scale 0.4) | Shock Bolt hurts allies at reduced damage; Recon needs line of sight; the arrow's flight sound is easy to hear |
| Sova: Owl Drone | Possession view | Drone capsule 0.35 m radius; dart is a 50 m hitscan line | — |
| Sova: Hunter's Fury | — | Capsule 1.76 m radius, ~66 m long | Sova may show on everyone's map 1.2 s per shot (file field, unverified) |
| Breach: Flashpoint | Placement marker is yellow when valid, red when it can't pass through | Through up to 10 m of wall; placed up to 35 m | Flashes allies; sound and visuals signal when to look away and back |
| Fade: Seize | Lands on flat ground; drops straight down on timer or reactivation | — | No friendly fire |
| Gekko: Dizzy | Its audio tells you whether blasts are aimed at you or an ally | — | Hits allies in range |
| Tejo: Special Delivery | Disappears after 3 s with no impact | — | Reduced damage to Tejo and allies |
| Brimstone: Stim Beacon | Enemies can't see its radius | — | Indestructible; no buff for enemies |
| Brimstone: Sky Smoke | Map centered on Brimstone; the marker's outer edge equals the smoke size; expiry warning at 17.75 s | Radius 4.15 m | — |
| Omen: Dark Cover | — | Hard sphere, radius 4.1 m | — |
| Omen: Paranoia | The projectile's effect matches its hitbox | — | Hits allies |
| Astra: Nebula | — | Radius ~4.75 m (guide) | — |
| Viper: Toxic Screen | Wall rises and falls quickly; emitters glow yellow while on cooldown | ~60 m long, ~4 m tall, emitters every 2 m (wiki, unconfirmed) | Suppression drops it instantly with a voice line; decay doesn't hit allies; Viper's Pit area shows on her team's minimap |
| Miks: Bassquake | — | Cone 60 deg, 40 m long, 30 m half-height | — |
| Deadlock: Barrier Mesh | — | Walls 3 m tall, reach 10 m from center, at least 1.25 m tall | Bullets and abilities pass through; blocks movement only |
| Deadlock: Annihilation | — | Beam capsule 1.5 m radius, 82.5 m/s, 40 m | — |
| Deadlock: Sonic Sensor | Placed on walls | Within 4.5 m height difference | — |
| Chamber: Trademark | — | Detects 4 m up, 10 m down | Triggers only on enemies it can see |
| Veto: Interceptor | — | 18 m (wiki, game files) vs 20 m (community test) vs 7 m (file field "range"); conflict | Destroys enemy utility that can be shot or would bounce off players, in range and line of sight; no activation delay; destroys a Cove thrown while active, not smokes already up |

### Effect area shapes

Six primitives cover almost every area. The game files name them by field: "Sphere Radius" is a sphere, "Capsule Radius" + "Capsule Half Height" a capsule, "Clamped Radius" + "Cell Size" a grid patch on the floor, "Detection Radius2D" + "Height Above/Below" an uneven cylinder, "Wall Height" + range a wall segment.

- Smokes: sphere on the landing point. Controller smokes share a height cap (patch 4.04 matched Brimstone's to the others), but its value isn't published. Estimate: the top sits about one radius above the floor, 4.1-4.75 m (est.).
- Explosions: sphere with linear damage falloff from the inner to the outer radius. Walls block the damage: the game checks for a clear line from the explosion's center to the player (Riot developer, via Dot Esports).
- Flashes: a view-angle check from the burst point, not a volume.
- Ground zones (mollies, nets, slows): a grid patch projected onto the floor with a short height (GravNet 1.5-1.8 m), so it follows terrain and stops at walls.
- Walls: segments dropped onto the terrain under a moving projectile (Blaze, Toxic Screen, High Tide) or set at fixed angles (Barrier Mesh).
- Long ults and lines: capsules.

| Ability | Shape | Size (m) | Origin and vertical reach | Notes |
|---|---|---|---|---|
| Cloudburst | Sphere | r 3.35 | Where it lands, or mid-air after 2 s | Forms over 0.6 s |
| Sky Smoke | Sphere | r 4.15 | Drops to the ground or roof under the marker | Shared smoke height |
| Dark Cover | Hard sphere | r 4.1 | Falls until its core reaches the ground (guide) | — |
| Nebula | Sphere | r 4.75 | On the star | — |
| Poison Cloud | Sphere | r 4.5 | On the emitter | Forms 1 s after a 0.75 s windup |
| Cove | Sphere with bullet-blocking shell | r 4.6 | Any height | Clear vision inside |
| Ruse | Sphere | r 4 | Map point | — |
| Waveform | Sphere | r 4.72 | Map point | — |
| Cyber Cage | Hollow vertical cylinder | r 3.45 (files; wiki 3.72); overlap capsule r 3.35, half-height 3.63 | Centered on the device; extends above and below ground | Edges fall from the top as it ends |
| Viper's Pit | Grid of 2 m cells on the floor | Up to r 9; 2.4 m tall (overlap check 3.5 m); vision cap 8.1 | Centered within 7.25 m of Viper; spreads across floors up to 5.7 m apart in height | Expands over 5 s |
| Shock Bolt | Explosion sphere | 1.5 / 4 | Impact | 75 -> 30 |
| Paint Shells | Explosion spheres | 2.5 / 5.5; submunitions 5.25 | Impact | Submunitions likely 9 m/s, gravity x1, thrown out at 45 deg (files, inferred) |
| Boom Bot | Explosion sphere | 2 / 6 | Bot | The bot itself is a capsule r 0.14, half-height 0.32 |
| Blast Pack | Explosion sphere | 2 / 5 | Pack | — |
| Showstopper | Explosion sphere | 4 / 7 | Impact | — |
| FRAG/ment | Explosion sphere | 1 / 4 | Floor | — |
| Special Delivery | Explosion sphere | 1.25 / 5.25 | Impact | — |
| Guided Salvo | Explosion spheres | 2.5 / 4.5 | Target point | — |
| Mosh Pit | Ground patch, then explosion | 5.5 / 6.2 | Floor | — |
| Incendiary, Hot Hands | Ground patch | r 4.5 | Floor at impact; Incendiary uses 2 m grid cells | Hot Hands spreads over 0.75 s |
| Snake Bite | Ground patch | r 4.5 | Floor | Catches players up to 1.2 m above it |
| Nanoswarm | Ground patch | r 4.5 (wiki); files 5.25 | Floor | Enemies see it within 5.25 m |
| Razorvine | Ground patch | r 6.25 | Floor | — |
| GravNet | Grid ground patch | r 6.5, cell 1.8, 1.5-1.8 m tall | Floor; stops on slopes up to 44.8 deg | Patch 7.10 said 8 m; files now 6.5 m |
| Trademark | Uneven cylinder (detect); grid patch (slow) | Detect r 10, 4 up, 10 down; slow r 6, cell 2.8 | Device | Only triggers on enemies it can see |
| Slow Orb | Ground patch | Up to r 9 (files) | Floor | — |
| Orbital Strike | Vertical cylinder (inferred) | r 9 | Map point | Shrinks to the center during the 0.75 s fade; blocks line of sight for flashes and recon |
| Aftershock | Cylinder through the wall | r 3, 10 long | Charge on the wall | — |
| Displacement | Sphere | r 5.75 | Burst point | Pull stops 0.2 m from center |
| Suspension | Sphere | Players r 7; items r 9; orb r 0.5 | Burst point | Not through walls (hands-on) |
| Gravity Well | Sphere (est.) | r 4.75 | Star | — |
| Nova Pulse | Sphere (files) | r 5.25 (files: sphere and concuss range; wiki says 4.75) | Star | Conflict |
| Seize, Chokehold | Sphere (est.) | r 6.58 | Landing point | — |
| M-pulse | Sphere (inferred) | r 5.25 | Device | — |
| Stim Beacon | Sphere | inner 6, outer 6.5; files scale its effect separately for allies and enemies | Beacon | — |
| Recon Bolt | Flattened sphere | r 30; vertical scale 0.4 (~12 m up and down, inferred) | Bolt | Needs line of sight |
| Stealth Drone pulse | Flattened sphere | r 16; vertical scale 0.4 | Drone | — |
| Haunt, ZERO/point | Sphere (est.) | r 30 / r 15 | Device | Haunt needs line of sight |
| Hunter's Fury | Capsule | r 1.76, 66 long | From Sova along aim | Passes through walls |
| Annihilation | Capsule sweep, then capture zone | Sweep r 1.5, 40 long; capture r 6.5 | From Deadlock | — |
| Owl Drone dart | Thin capsule | r 0.05, 50 long | Drone | — |
| Undercut | Capsule | r 3; reaches 29.5 | From Iso | Through walls |
| Kill Contract | Column | r 7, half-height 29; reaches up to 40 | Travels forward | — |
| Trapwire | Line | Up to 15; wire r 0.03 | Wall to wall | Tether 6.2; enemies see it within 3 m |
| Sonic Sensor | Ground line | 0.1 wide; 4.5 height window | Sensor | — |
| Bassquake | Cone | 60 deg, 40 long, 30 half-height | From Miks | — |
| Turret | Cone | 100 deg, 40 | Turret | — |
| Fault Line | Ground strip | 8 wide, 8-56 long, starts 8 ahead | From Breach | — |
| Rolling Thunder | Ground strip | 18 wide, starts 8 ahead; ~30 long (est.) | From Breach | Zones 0.255 s apart |
| Nightfall | Strip through walls | 20 wide; ~40 long (est.) | From Fade | — |
| Convergent Paths | Strip | 13.5 wide, 36 long | From Waylay | — |
| Reckoning | 5 strips of strikes | 5.6 wide each, 40 long, 4 tall collision; moves 8 m/s and drops up to 8 m to follow terrain | From Harbor | Each strike a cylinder r ~2.8, 4 tall (est.) |
| Lockdown | Sphere (est.) | r 32.5 | Device | — |
| Steel Garden | Cylinder, no height limit | r 28 | Vyse | — |
| Barrier Orb | 4 wall segments | 2.6 wide, 1.5 high each (one fan recreation says 2.5 high) | Spawns only where a segment touches flat ground; cast up to 15 | — |
| Barrier Mesh | 4 walls at 45 deg | 3 high (at least 1.25), reach 10 | Disc | Transparent; height follows terrain |
| Blaze | Wall on the floor under the path | Up to ~21 long, 6.75 high, anchor points every 1.25 m; ~1 thick (est.) | From Phoenix | Grows from Phoenix outward |
| Fast Lane | Two walls | 3.5 apart, 46.5 long (45 ahead, 1.5 behind), 6.75 high | From Neon | — |
| High Tide | Wall following the ground | 60 long, 8 high, anchor points every 2 m, starts 3.1 ahead; ~1 thick (est.) | Under the steered path; passes through walls | — |
| Toxic Screen | Wall of emitter segments | Up to 60 long, emitters every 2 m (30 max); 6.75 high (files; wiki says 4); ~1 thick (est.) | Emitters drop to the ground under the path | Rises emitter by emitter, 1.55 s at full length |
| Cosmic Divide | Vertical plane | Runs past the playable area and up to the sky (est.); ~0.5 thick (est.) | Between two map points | Blocks bullets and sound; non-hitscan abilities pass |
| Shear | Box wall | 1-12 long (files), 1 wide, 2.5 high (wiki, unconfirmed) | Behind the enemy who crossed it | — |
| Interceptor | Range check with line of sight | 18 (wiki) vs 20 (community test) | Device | — |

Stealth utility shows itself to enemies inside fixed ranges: Trapwire 3 m, Nanoswarm 5.25 m, Alarmbot 7 m, Spycam 8 m (12 m when active). Gatecrash is heard within 12.5 m.

## Duelists

### Jett

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Passive: Drift | Self (movement) | — | Hold jump while falling to glide. Fall speed capped at ~2.5 m/s (est.) |
| C: Cloudburst | Projectile; curves toward crosshair while key held | Commit 0.15; re-equip 0.25; forms on any surface or after 2 in flight; expand 0.6; smoke 2.5; end warning 0.75 | 200, 2 charges. 29 m/s, gravity x0.45. Smoke radius 3.35 m |
| Q: Updraft | Self (instant launch) | Start delay 0.1; boost 0.25 (raw timer 0.35) | 150, 1 charge. Raw: horizontal force 1,000. Height ~5 m (wiki, unconfirmed); launch ~10 m/s up (est.). Fall-damage grace 3 m |
| E: Tailwind | Self (dash) | Prime 1; window 7.5 (+0.2 grace); dash 0.45; unequip 0.15 | Free, 1 charge, every 2 kills. Base dash velocity 45 m/s; distance ~11 m (wiki, unconfirmed). Dashes in movement direction, forward if still. Raw: force duration 0.25, braking start 0.85, min angle to stop 50 |
| X: Blade Storm | Hitscan weapon (knife flight is visual only) | First equip 1.02; re-equip 0.5 (fast 0.15, instant 0.1); per-knife commit 0.17; ALT burst 0.45 | 8 pts. 5 knives; a kill refreshes them. 150 head / 50 body / 42 legs (wiki). |

### Phoenix

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Blaze | Area: wall drawn by a line moving 20 m/s; bends toward crosshair while FIRE held | Equip 0.8; unequip 0.5; draw 0.67; wall 8; end warning 1; dissolve 1 | 150. Height 6.75 m. Length ~13.4 m (derived: 20 m/s x 0.67 s). Blocks vision. 30 dps to enemies (1 per 0.033 s); heals Phoenix 1 HP per 0.16 s, 50 max (wiki). Wiki length 1-21 m (unconfirmed) |
| Q: Hot Hands | Projectile; FIRE throw, ALT lob; drops at gravity x2 | Equip 0.8; unequip 0.7; fuse 1.5 | 200. Fire zone 4 s (0.75 spread + 3.25 at full size), 8 m wide; 60 dps to enemies (1 per tick, 60 ticks/s), 20 dps to allies; heals Phoenix 1 HP every 0.08 s (12.5 HP/s), max 50 (wiki). x0.5 damage to objects. Throw 18 m/s, gravity x0.3; lob 6.3 m/s (wiki classes) |
| E: Curveball | Projectile; FIRE curves left, ALT right | Equip 0.8; unequip 0.48; detonates 0.7 after throw; hidden first 0.07 | Free signature (file cost 250), 2 charges, every 2 kills. 20 m/s. Max flash 1.5 (files list 1.1 base, 1.5 current) |
| X: Run It Back | Self (state) | 10; on death: 1 + 1.4 respawn | 7 pts. Returns to marker with full HP and the armor he had at cast |
| Passive: Heating Up | Self | — | Heals in his own fire instead of taking damage |

### Raze

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Boom Bot | Entity (ground, autonomous) | Equip 1.1; unequip 0.7; unpack 0.5; life 5 | 300, 60 HP. Bounces off walls; chases first enemy seen; sees enemies within 15 m (wiki); explodes within 2.5 m (5 m vertical). 80 -> 30 damage, radius 2 / 6 m. Drops target if it teleports (13.09). Move speed ~6 m/s (est.; raw default speed 300) |
| Q: Blast Pack | Projectile; sticks to surfaces | Throw and detonate throttle 0.15; arm 1.5; expires 5; knockback 0.6; unequip 0.7 | 200, 2 charges, 20 HP. 16.5 m/s, gravity x0.7 (wiki class). Damage only when armed: 50 -> 10, radius 1.5 / 5 m. No self-damage. Knockback ~12 m/s, ~8.5 m/s of it upward, replacing current velocity (est.); one satchel lifts about one storey, two about two (community); about 15 m forward with one, 25 m with two (est.) |
| E: Paint Shells | Projectile (grenade); FIRE throw, ALT lob | Equip 0.8; unequip 0.7; main fuse 2 (raw pre-explosion 0.5); submunitions fuse at least 1.3, or 0.3 after stopping, 0.1 apart | Free, every 2 kills. Main: 55 -> 1, radius 2.5 / 5.5 m. 4 submunitions, launched at 45 deg, radius 5.25 m. Main grenade 18 m/s, gravity x0.3; lob 6.3 m/s (wiki classes). Wiki fuse 2.25 main / 0.667 submunitions (unconfirmed). Submunitions likely 9 m/s, gravity x1, thrown out at 45 deg and 70 deg down (file fields, inferred). Submunitions pop 0.667 after release (wiki, tested) |
| X: Showstopper | Weapon; rocket projectile | Equip 1.4 (quick 0.7); window 10; unequip 0.4 | 8 pts. 150 -> 30 damage, radius 4.5 / 7 m (wiki: 4 m inner). Rocket flies straight with no gravity (wiki); speed ~25 m/s (est.; raw 250 x object scale 10) |

### Reyna

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Soul Harvest | Pickup | Orb lasts 3 | An enemy who dies within 3 s of taking Reyna's damage drops an orb. Pickup cone 55-60 deg, line-of-sight grace 0.6 |
| C: Leer | Projectile through walls, becomes an eye | Equip 0.77; unequip 0.5; deploy 0.4; reaches 10 m in ~0.55 (wiki); eye lasts 2 | 250, 2 charges, 60 HP. 22.5 m/s. Nearsights enemies who look at it (vision 6 m), max 47.5 m |
| Q: Devour | Self (uses an orb) | Heal over 3 (2.5 in Empress); unequip 0.5 | 200, 2 charges. +50 temporary HP over 3 s, or 2.5 s in Empress (wiki; files also list an older 100 over 3 s). Overheal decays after 10 s. In Empress: casts automatically, keeps the orb, heal is permanent |
| E: Dismiss | Self (uses an orb) | 1.5; unequip 0.6 | Free. Intangible, invulnerable, silent. Can't use items. In Empress also invisible |
| X: Empress | Self (Combat Stim) | Cast 1; no timer in files (lasts until death or round end) | 7 pts. Stim; unlimited Soul Harvest charges |

### Yoru

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Fakeout | Entity (decoy walks forward) | Equip 0.8; spawn 0.7; life 10; reactivate 0.05; unequip 0.7 | 200, 1 charge. Decoy is invulnerable. Shooting it flashes the shooter 2 s (max angle 30 deg). Holds Yoru's last-equipped weapon |
| Q: Blindside | Projectile; bounces once, then pops | Equip 0.8; unequip 0.5; pops 0.7 after bounce; pops after 2 if no bounce | 250, 1 charge (patch 12.05). 29 m/s, gravity x0.45. Max flash 1.5 |
| E: Gatecrash | Entity (tether travels forward) | Equip 0.8; teleport 0.5; unequip after teleport 0.7; tether 20 | Free, max 2 charges, every 2 kills. Tether 60 HP; fake tether 20 HP. Blind-immune, intangible and invulnerable while teleporting. Tether speed 800 (patch 4.04, no unit; likely 8 m/s) |
| X: Dimensional Drift | Self (state) | Equip 0.8; cast 0.2; duration 10; exit 2 | 8 pts. Invisible, untrackable, can't fire, plant or defuse. Footsteps x0.5 |

### Neon

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Passive: Battery | Resource | Full refill 60; full sprint 16 (patch) | Kills refill only during Overdrive (patch). Slide needs 2% battery |
| C: Fast Lane | Area (two walls race forward) | Cast 0.3; unequip 0.7; walls 4; dissolve 2 | 300. Up to 45 m long, walls 3.5 m apart, 6.75 m high. Block vision. No damage |
| Q: Relay Bolt | Projectile; bounces once | Unequip 0.7; concuss 2.5 | 200. 41.25 m/s, gravity x0.15, range 100 m, life 5. Concuss radius 5 m at each impact |
| E: High Gear | Self (sprint) | Equip 0.6; slide input buffer 0.1; resume 0.2 | Free. Run x1.35 (Haste) = 9.11 m/s (patch 8.11). ALT slide: 12 m/s, 0.6 s, ~7 m (wiki), needs at least 3 m/s; 1 slide charge (refills in Overdrive). No air speed bonus (12.09) |
| X: Overdrive | Weapon (beam) + self | Load 2; battery regen pauses 0.5 after firing | 8 pts. 20 shots/s. Lasts 10 s (patch 9.11). Unlimited battery; kills refill. 18 damage up to 20 m, falling to 10 at 43 m+; head x3, legs x0.85. 40-round magazine; reload starts 0.5 after firing stops, 1 round per 0.05 (wiki) |

### Iso

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Contingency | Area (wall moves forward) | Equip 0.8; unequip 0.5 | 200. Indestructible; blocks bullets. Front wall 2.62 m. Height ~3 m (est.). Raw: movement speed 3.6 / 1.8 |
| Q: Undercut | Projectile through walls | Equip 0.8; unequip 0.5; flight 1.55; Fragile 4 | 300. 22.5 m/s, reaches 29.5 m. Hit capsule radius 3 m. Fragile = damage taken x2 |
| E: Double Tap | Self (timer) | Cast 1; focus 0.25; orb life 3 | Free. Kills or damage spawn orbs (1 HP); shooting one gives a shield that absorbs one hit. Focus lasts 12 s with +25% reload speed (wiki). Raw: assist window 8 |
| X: Kill Contract | Area (column travels forward) | Equip 1.1; unequip 0.8; start 0.8; travel 4; face-off 1.5; duel limit 13; after duel 3.5 | 7 pts. Column radius 7 m. Pulls Iso and the first enemy hit into a 1v1 arena |

### Waylay

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Saturate | Projectile; drops straight down after 1 s in flight | Unequip 0.3; Hinder 3 | 300. 29 m/s, gravity x0.45, then x2.5 on drop. Radius 5 m (debuff reaches 6 m). Hits allies and Waylay too (patch) |
| Q: Lightspeed | Self (dash) | Equip 0.8; unequip 0.2; each dash 0.4-0.45 (wiki sources differ), 0.05 between dashes | 300, 1 charge. FIRE = 2 dashes, ALT = 1. Only the first goes up. Cancels fall damage. ~9 m per dash (VALORANT Wiki) |
| E: Refract | Placed (instant, at feet) | Equip 0.1; arms 1; rewind window 8 (+0.2); reactivate 0.05; rewind 0.35-2 | Free, every 2 kills. Rewind time scales with path length: 2.5 m = 0.35 s, 50 m = 2 s. During rewind: invulnerable, intangible, vision 1 m |
| X: Convergent Paths | Area (beam forward) | Cast 0.6; beam 0.45; activates 1; life 3 | 8 pts. Caster turn capped at 180 deg/s for 1 s. Allies: run x1.1 for 7 s. Enemies: Hinder 6 s |

### Hush

Game files, build 13.09, plus hands-on tests. Several Hush fields don't say what they control; those are marked raw. A 13.09 hotfix fixed Hush server crashes; a fix for Flow traveling farther than intended shipped around Oct 29-30 (fan reports; NamuWiki calls it 13.09b). Riot published no numbers with either fix.

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Passive: Telekinesis | Self | — | Picks up weapons, the Spike (attackers only) and uses switches from longer range. Range 35-37 m (50 m while line of sight is held, a bug); 30 s cooldown; needs line of sight (hands-on tests) |
| C: Flow | Placed (instant anchor), then self-propel | Hands 0.35; unequip 0.7; propel force 0.4; raw timer 2.5 | 200, 1 charge. Anchor trace 15 m. Propel 22.5 m/s, upward capped at 5 m/s. Hovers first if airborne. Fall-damage grace 10 m. Anchor can go on ground, walls or mid-air and is visible to enemies; Hush can steer with movement keys after launch. Dashes a fixed amount toward the anchor, not always all the way (NamuWiki). Anchor up to ~15 m (preview build). Can't be cast in buy phase. Delay before propel and airborne hover ~0.35 s each (est.); raw 2.5 is likely the longest flight |
| Q: Flashbulb | Projectile; REACTIVATE redirects toward crosshair | Equip 0.8; cast 0.5; thrown: pops after up to 3 (~1.5 after touching a surface); prepared: expires after ~8; prepared then redirected: pops after 1, or instantly on contact; raw 0.5 / 0.3 unknown | 250, 1 charge. Max flash 1.5 s (Liquipedia, which lists 2.5 s separately as how long it can be held; the files' 2.5 is a DPT field). Can be shot down. Redirect target 32.5-65 m. Flashes everyone looking at it. Thrown 18 m/s, gravity x0.3 (wiki class); redirect speed ~32.5 m/s (est.) |
| E: Displacement | Projectile; REACTIVATE redirects | Equip 0.8; cast 0.5; fuse and prepared timeout same as Flashbulb (raw 3 / 8); pull 0.5; concuss 1.5 | Free, 1 charge, every 2 kills. Radius 5.75 m. Pull force 1,750; sideways velocity x0.7; pull stops within 0.2 m of center. Concuss only if pulled into a wall, a player or Sage's wall; no collision, no debuff. Affects allies and Hush. Needs line of sight. Range ~20 m (preview build). Redirect target 50-65 m; redirect speed ~32.5 m/s (est.) |
| X: Suspension | Projectile; follows crosshair; FIRE again detonates | Equip 1 (instant 0.4); commit 0.15; flight 2 (~50 m at 25 m/s, measured); raw fizzle 6; levitate 4 | 8 pts. 25 m/s (console x0.75), gravity x0.45. Hits players within 7 m, items within 9 m. Levitated: move x0.167, float up to 5 m/s, no weapons, abilities, use, reload or crouch, silent, jump force x0.7. Detonates on the ground, a direct player hit, the timer, or reactivation; boxes: sources disagree (est.: detonates on a box top, not a side). Keeps flying after hitting walls; stops on the ground. Can't be shot. Doesn't reach through walls. Hits allies, not Hush. Also lifts dropped weapons and the Spike |

## Initiators

### Sova

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Passive: Bow | Weapon (charged shot) | Charge bars at 0.333 / 0.667 / 1.0 (wiki, unconfirmed); bow equip 0.8 | ALT cycles 0-2 bounces. Arrow speed by charge: 0 bars 18 m/s, g x0.3; 1 bar 29 m/s, g x0.45; 2 bars 41.25 m/s, g x0.3; full 41.25 m/s, g x0.15 (wiki) |
| Q: Shock Bolt | Projectile (arrow) | Initial delay 0.4; max life 4 | 150, 2 charges. 75 -> 30 damage, radius 1.5 / 4 m |
| E: Recon Bolt | Projectile (arrow); sticks | Ping 1 at 0.7 after landing; ping 2 1.6 later; assist 4; cooldown 50 | Free, 20 HP. Sonar 30 m; reveals enemies within 42.5 m in the bolt's line of sight; vertical scale 0.4 |
| C: Owl Drone | Entity (pilotable); dart is a projectile | Equip 0.9; deploy 0.18; unequip 0.7; life 7; dart pings at 1.6, then every 1.2; boost charge 1, boost cooldown 3 | 400. Files: drone "Life 1,000" (unexplained); real HP 100 (wiki, patch 4.08). The dart is hitscan. Raw: EMP radius 3.5 m. Drone speed ~7 m/s (est.) |
| X: Hunter's Fury | Hitscan (capsule through walls) | Equip 0.8; window 6; at least 0.75 between blasts | 8 pts. 3 blasts, 80 damage each (wiki Range test; files also list an unexplained 200 -> 75). Length 64-66 m, half-width ~1.8 m. Reveal 1.2 per hit. Can't move or jump |

### Breach

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Aftershock | Placed charge (25 m/s to the wall), blasts on far side | Equip 0.9; unequip 0.7; charge 2.2; 3 bursts (patch) | 200. 80 per burst; blast area 10 m long x 6 m wide; falloff range 8 m. Placement up to 35 m. ~0.6 s between bursts (guide, unconfirmed) |
| Q: Flashpoint | Placed charge; flash projectile through the wall | Equip 1.1; unequip 0.7; pop 0.5 | 250, 2 charges. 24 m/s, life 3. Max flash 2.25 (raw also 2.5). Placement up to 35 m |
| E: Fault Line | Area (line through walls); hold to extend | Equip 0.8; windup 1.1; concuss 2.5; cooldown 50 | Free. Line travels 150 m/s. Breach moves x0.6 while charging. Full charge 1 s; starts 8 m ahead; length 8-56 m by charge (wiki, unconfirmed) |
| X: Rolling Thunder | Area (cone of zones) | Equip 1.1; cast 0.6; first zone 0.3; 0.255 between zones; knock-up 0.5; concuss 4 | 8 pts |

### Skye

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Regrowth | Self (channeled heal) | Equip 0.5; unequip 0.7 | 150. Radius 18 m; allies in line of sight, not Skye. 20 HP/s (1 HP every 0.05 s) from a 100 HP pool (wiki) |
| Q: Trailblazer | Entity (pilotable) | Equip 0.8; possess 0.18; unequip 0.7; life 6 | 300, 80 HP. Run x1.15 (~6.4 m/s, derived). Leap ~12 m (wiki, tested): 30 damage on direct hit; concuss up to 4 s within 3.5 m. Skye's vision while piloting 19.1 m |
| E: Guiding Light | Projectile, steered | Equip 0.8; activation 0.25; pop 0.3 (raw also 0.75); life 2; unequip 0.85; cooldown 50 | 250, 2 charges. 18 m/s, 60 HP. Flash 1-2.25 s, reaching max after 0.75 s of flight (wiki) |
| X: Seekers | Entity x3 (autonomous) | Equip 0.8; spawn 0.1; follow 15; unequip 0.55 | 8 pts, 120 HP each. Run x1.15 (~6.4 m/s, derived). On hit: Nearsight 3 (vision 7.5 m), slow 5 (raw), dash x0.5 for 1 |

### KAY/O

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: FRAG/ment | Projectile; sticks to the floor | Equip 0.7; windup 0.5; explosions 1 apart | 200. 60 -> 25 damage, radius 1 / 4 m. Raw: 2 scheduled explosions after the first |
| Q: FLASH/drive | Projectile (grenade); FIRE overhand, ALT underhand | Equip 0.8; pops 1.6 overhand / 1.0 underhand after throw (file fuse 1.3 / 0.7 + 0.3 telegraph); 0.8 after a bounce; unequip 0.6 | 250, 2 charges. Max flash 2.25 |
| E: ZERO/point | Projectile (knife); sticks to first surface | Equip 0.8; windup 1; unequip 0.5; life 15; cooldown 50 | Free, 20 HP. Suppresses 8 s and reveals within 15 m |
| X: NULL/cmd | Self (state) + pulses | Cast 1.2; duration 12; revive hold 1.5 within 3 m; revive 1.35 | 8 pts. Combat Stim for 12 s; downed instead of killed. Pulse radius 42.5 m, pulse spreads over 0.7. Raw: 850 / 500 HP fields |

### Fade

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Prowler | Entity (steer by holding FIRE) | Equip 1.1; unequip 0.7; life 2.5; Nearsight 2.75 | 250, 2 charges, 60 HP. Moves 10 m/s, 12 m/s after spotting an agent, 15 m/s on a Terror Trail (wiki, game files). Detonates within 2.5 m. Vision 6 m |
| Q: Seize | Projectile; drops after fuse or on reactivate | Fuse 1.5 (then drops at gravity x2.7); expand 0.7; hold 5.2 | 200. Radius 6.58 m. Tether + Deafen; 75 Decay applied at once, restored over 5 s (wiki). Raw: max player speed 15 m/s |
| E: Haunt | Projectile; drops, becomes an eye | Fuse 1.5; activate 0.325; reveal 1.5; cooldown 50 | Free, 1 HP. Reveals within 30 m (line of sight up to 47.5 m); marks trails |
| X: Nightfall | Area (wave through walls) | Unequip 1; first zone 0.1; 0.325 between zones; mark and Deafen 8 | 8 pts. Decay 75 (patch) |

### Gekko

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Globules | Pickup | Reclaim cooldown 15 (patch 13.00); globule stays 20 (guide) | Each expired ability drops a globule to reclaim |
| C: Mosh Pit | Projectile; spreads a zone, then explodes | Equip 0.9; unequip 0.85; raw zone 4, raw explosion timer 3 | 250. Zone: 1 per tick every 0.1 s for 3 s (30 total); then 3 explosion ticks 0.1 s apart of 50 center / 25 edge (150 / 75) (wiki). Radius 5.5 / 6.2 m. Reclaimable |
| Q: Wingman | Entity (autonomous) | Equip 0.9; cast 0.4; unpack 0.6; seeks up to 5; concuss 2.5 | 300, 60 HP. Runs 6.3 m/s (wiki, game files). Attacks within 14 m; vision cone 70 deg; path up to 70 m. ALT = plant or defuse |
| E: Dizzy | Entity (flies forward), fires plasma | Equip 0.9; unequip 0.85; pre-fire 0.35; raw active 1 / timed 3 | Free, 20 HP. Flies 18 m/s, gravity x0.3. Targets within 32.5 m. Hit: blind 1 s full + 1 s fade (wiki, game files), minimap off 2, raw 3 s slow x0.6 |
| X: Thrash | Entity (pilotable) | Equip 1; deploy 0.6; life 6; lunge charge 1 | 8 pts, 180 HP. Speed 11.22 m/s. Detain 6 within 5 m |

### Tejo

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Stealth Drone | Entity (pilotable) | Equip 0.8; possess 0.3; life 6; first pulse 0.6, then every 1.5 | 400, 42 HP. Run x1.35. Pulse radius 16 m, vertical scale 0.4. Suppress 8 + reveal (patch) |
| Q: Special Delivery | Projectile; FIRE sticks, ALT bounces once | Equip 0.5; unequip 0.4; raw arm 0.8; timeout 3 | 200. 41.25 m/s, gravity x0.15. Radius 5.25 m; 35 -> 20 damage (inner 1.25 m). Concuss 2.5 |
| E: Guided Salvo | Map-targeted homing missiles | Fire delay 0.5; unequip 0.42; life 3 | 150 each, max 2. Map range 45 m. Each missile: 3 explosions of 65 -> 50 (= 195 / 150 total), radius 2.5 / 4.5 m; x0.5 vs objects. Final descent from 10 m |
| X: Armageddon | Map-targeted path | Equip 0.6; strike spawn 0.33; life 8 | 9 pts. Map range 52.5 m. 4 waves, 18 segment blasts of 60 damage, 2 m segments |

## Controllers

### Brimstone

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Stim Beacon | Projectile (thrown), creates zone | Unequip 0.7; zone 12; buff lingers 4 after leaving | 200, 200 HP. Radius 6 m (outer 6.5 m). Combat Stim + run x1.1 (Haste) |
| Q: Incendiary | Projectile (launcher) | Equip 1.1; unequip 0.7 | 250. 29 m/s, gravity x0.45. Fire zone ~7-7.75 s; 1 damage per tick, 60 ticks/s (wiki); global fire patch spreads to 4.5 m. x0.5 vs objects |
| E: Sky Smoke | Map-targeted | Equip 0.8; unequip 0.7; spawn delay 1; expand 0.75; smoke 19.25 | 100 each, 3 charges. Map range 55 m. FIRE places, ALT deploys |
| X: Orbital Strike | Map-targeted | Equip 0.74; unequip 1; telegraph 2; strike 3 (wiki) | 8 pts. Map range 60 m. Radius 9 m. 20 per tick every 0.15 s; 3 s at full size + 0.75 s fade (wiki). 125 vs objects |

### Omen

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Shrouded Step | Self (teleport to aimed point) | Equip 0.5; unequip 0.7; teleport 0.7 windup (patch 4.04) + 0.5 arrival (wiki) | 100, 2 charges. Range 15 m. Tell at destination |
| Q: Paranoia | Projectile through walls | Equip 1.1; unequip 0.7; Nearsight 2 | 250. 20 m/s, range 25 m, radius 4.3 m. Vision 7.5 m. Hits Omen's allies too |
| E: Dark Cover | Projectile to an aimed 3D point (hold to set distance) | Deploy 1; smoke delay 0.3; smoke 14.7; contract 1; cooldown 40 | 150, 2 charges. 64 m/s, max 80 m. Radius 4.1 m (wiki, game files); 15 s total including the 0.3 delay. ALT = phase through walls |
| X: From the Shadows | Map-targeted teleport | Equip 0.5; unequip 0.7; shade 3.5; raw 0.75 / 2.5 / 1.5 | 7 pts. Map range 85 m. Killing the shade cancels the teleport. Materializes after ~4 s (guide) |

### Astra

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Stars | Map-targeted (Astral Form) | Recalled star returns after 8 (raw) | 150 each, max 5. Each star is activated as one ability below |
| Nova Pulse | Area (from a star) | Windup 1; concuss 2.5; cooldown 60 | Radius 5.25 m |
| Nebula, Dissipate | Area (smoke from a star) | Expand 0.75; Dissipate fake smoke 1.75; recharge 35 | 2 charges. Nebula 14.25 s (wiki) |
| Gravity Well | Area (from a star) | Expand 1.25; pull 2; Fragile 2.5; cooldown 60 | Radius 4.75 m. Pull force 685 (max 10,000); backward velocity x2.4, sideways x0.7. Fragile = damage x2; jump force min x0.4 |
| X: Cosmic Divide | Map-targeted wall | Cast 0.7; warmup 3; activate 1.25; usable 1.4; unequip 0.4 | 7 pts. Blocks bullets and sound. ~21 s plus 2.5 s to fade (wiki estimate) |

### Viper

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Passive: Fuel | Resource | Drain starts 0.5 after activation | 100 total, shared by Poison Cloud and Toxic Screen. Needs 30 to activate. Drains 8.33/s with one ability up, 12.5/s with both; regens 3.33/s (0 to 100 in 30 s) (wiki) |
| Passive: Toxin | — | — | Gas applies 10 Decay on first contact (patch 11.08), then 10/s (1 per 0.1 s; an older 15/s was reverted); lingers 1.5-2.5 s after leaving, then restores 25 HP/s (wiki) |
| C: Snake Bite | Projectile, leaves acid pool | Equip 0.8; unequip 0.7; pool 6.5; Vulnerable while inside + 2 | 300, max 2. 29 m/s, gravity x0.45. 12.5 dps: 1 per tick every 0.08 s (wiki); allies take less. Pool 8 m wide; lasts 6.5 s (patch 8.08) |
| Q: Poison Cloud | Projectile (emitter) | Equip 0.8; unequip 0.7; rise 0.6; expand 1.3; contract 1.2; cooldown after turning off 5.5; recall 1 | 200. Pick up within 4 m to redeploy |
| E: Toxic Screen | Placed (line of emitters through walls) | Equip 0.8; wall delay 1; turn-off delay 0.8; cooldown after turning off 5 | Free. Up to 60 m long, 6.75 m high. Emitters travel 50 m/s |
| X: Viper's Pit | Area (around Viper) | Equip 0.5; expand 5; unequip 1.35; collapses 0.5 + 1.75 after she leaves; max 8 outside | 9 pts. While casting: move x0.7, turn 50 deg/s. Decay at least 50 inside. Nearsight inside 8.1 m; max radius ~9 m (wiki) |

### Harbor

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Q: High Tide | Area (wall follows crosshair while held) | Equip 0.6; unequip 0.6; wall 15; raw auto-stop 3 | 300. Drawn at 20 m/s; up to 60 m; 8 m high. Passing through slows 0.6 (raw also 2): move x0.7, dash x0.5, jump x0.7 |
| E: Cove | Projectile, becomes a sphere | Deploy 1; shell forms 0.8; smoke 19.25; cooldown 30 | Free, shell 680 HP (blocks bullets). 64 m/s, max 80 m |
| C: Storm Surge | Projectile | Equip 0.8; unequip 0.4; Nearsight 2 | 200. 29 m/s, gravity x0.45. Radius 5-6 m. Vision 7.5 m |
| X: Reckoning | Area (wave) | Equip 0.8; spawn 0.2; start 0.4; reactivate to hold 7 (earliest 0.92) | 7 pts. 8 m/s, range 40 m, 5 chunks 5.6 m wide. Nearsight 3 (vision 7.5 m) |

### Clove

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| E: Ruse | Map-targeted | Equip 0.6; unequip 0.7; spawn 1; expand 0.75; smoke 13.5 (5.5 cast after death); cooldown 40 | 150, 2 charges (1 after death). Map range 55 m alive, 42.5 m dead |
| Q: Meddle | Projectile | Equip 0.8; unequip 0.7; raw fuse 0.5; Decay 5 | 250. 29 m/s, gravity x0.45. Radius 4 m. Decay up to 90 (wiki); windup 0.75 |
| C: Pick-me-up | Self (absorb an enemy kill) | Absorb 0.7; buff 13; temp HP lasts 9 | 200. Run x1.10 (13.09; files show 1.15). 50 temporary HP, overheal lasts 10 s; Haste lasts 3 s; absorb within 6 s of the kill (wiki, patch notes) |
| X: Not Dead Yet | Self (revive) | Reposition 2; revive 1.5; must get a kill or assist within 10 | 8 pts. Killing Clove after the revive gives the killer 1 ult point and 1 signature refresh point (13.09) |

### Miks

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Q: Harmonize | Targeted ally (FIRE) or self (ALT) | Equip 0.3; cast 0.1; finish 0.3; buff 8, refreshes on kill | 200, 1 charge. Combat Stim + run x1.1 |
| E: Waveform | Map-targeted | Spawn delay 1; expand 0.75; smoke 16.25; contract 1; cooldown 40 | Free. Map range 55.5 m. 2 charges: 1 free, 1 for 100 (wiki). Radius ~4.72 m (wiki, unconfirmed) |
| C: M-pulse | Projectile | Equip 0.71; unequip 0.6; mode switch 0.3; after landing: lift 0.8, windup 1, then 3 pulses 2 apart | 250, 2 charges, 50 HP. 29 m/s, gravity x0.45. Radius 5.25 m. Concuss up to 2 per pulse, or heal 6.67 HP/s plus 20 per pulse (~93 total) |
| X: Bassquake | Area (cone) | Equip 1; windup 1.6 (can't move or turn); slow and Deafen 8; unequip 1.85 | 8 pts. 60 deg cone, 40 m long, 30 m half-height. Knockback. Footsteps muted; dash x0.5 |

## Sentinels

### Sage

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Barrier Orb | Placed (wall) | Cast 0.8; unequip 0.7; fortify 2; starts self-damage 35; gone 40 | 300. 4 segments x 2.6 m. 400 HP each, 600 fortified. Placement up to 15 m. ALT rotates |
| Q: Slow Orb | Projectile, creates slow field | Equip 0.5; unequip 0.4; field 7; fade 1 | 200, 2 charges. 29 m/s, gravity x0.45. Field up to 9 m radius. Slow: move x0.5, dash x0.5, jump force x0.7, jump move x0.5, silent footsteps |
| E: Healing Orb | Targeted ally, or self | Equip 0.5; unequip 0.7; heal over 5; cooldown 30 (ally) / 45 (self) | Free. Ally: 60 HP over 5 s, 12 ticks/s (wiki); needs line of sight to the ally, targeting matches Miks' Harmonize, crosshair shown while targeting (13.10). Self: 100 total (patch 13.00; wiki still shows 60 over 10 s) |
| X: Resurrection | Targeted (ally corpse) | Equip 0.8; channel 3; unequip 1; revived ally invulnerable 2, frozen 3.3 | 7 pts. Range 12 m. Revives at full HP |

### Cypher

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Trapwire | Placed (wall to wall) | Equip 0.8; unequip 0.7; windup 0.7 (patch 13.00); deploy 1.5 (wiki, game files); zap slow 1; re-arm 1 | 200, 2 charges, 20 HP. Max length 15 m; targeting 20 m. Trigger: tether (max 6.2 m) + slow: move x0.5, dash x0.5, jump x0.25. Breaking free = zap: 1 s slow + reveal, no concuss |
| Q: Cyber Cage | Projectile (20 m/s); activate for the zone | Deploy 0.35; full size 6.4; contract 0.5 (7.25 total) | 100, 2 charges. Radius 3.45 m. Blocks vision; audio cue when crossed. Pick up in buy phase within 4 m |
| E: Spycam | Placed; dart is a projectile (200 m/s) | Equip 0.8; recall cooldown 20 (13.10, was 15); destroyed cooldown 45 (13.10, was 60); dart reveal 2 after marking | Free, 1 HP. Placement 20 m. Enemies see it within 8 m and hear it within 12 m when active |
| X: Neural Theft | Targeted (enemy corpse up to ~20 s old) | Telegraph 2; 2 reveals 2 apart | 7 pts. Snapshot reveal of all living enemies |

### Killjoy

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Range rule | — | Reactivate 2 (patch) | Devices disable beyond 40 m or when Killjoy dies |
| E: Turret | Placed (entity) | Equip 1.1; destroyed cooldown 45 (13.10, was 60); recall cooldown 20 (wiki); raw 2 / 0.75 | Free. 12 shots/s in 3-round bursts, 1 s between bursts (1.25 s cycle) (wiki); bullet speed 300 m/s; placement 4.5 m. Hits slow 50% (patch). Damage 8 / 6 / 4 by range and HP 100 (wiki). Detection cone 100 deg (wiki). Hold ALT to rotate; ACTIVATE flips |
| Q: Alarmbot | Placed (entity) | Burrow 1.5; raw pickup cooldown 7; Vulnerable 4 (wiki) | 20 HP. Placement 10 m. Detects 5.5-7.5 m; detonates within 2.5 m. Vulnerable = damage x2 |
| C: Nanoswarm | Projectile; hides on landing | Equip 0.74; unequip 0.7; arm 0.2; damage starts 0.5; swarm 5 | 200, 2 charges, 20 HP. Radius 5.25 m. 45 dps: 1 per tick, 45 ticks/s (wiki). Pick up within 4 m |
| X: Lockdown | Placed (device) | Equip 0.8; cast 0.52; windup 13; unequip 0.15 | 9 pts, 200 HP. Radius 32 m. Detain 8 (move x0.167, disarmed) |

### Chamber

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Q: Headhunter | Weapon (hitscan) | Equip 0.3; 0.25 between shots (derived from 4 shots/s) | 100 per bullet, max 8. 159 head / 55 body / 46 legs, no falloff. 4 shots/s, semi-auto; no reload (bullets are bought). Equip 0.3; ADS zoom x1.5 (wiki) |
| E: Rendezvous | Placed (anchor) | Place 0.6 / 1.1; teleport equip 0.1; unequip 1.2; recall 0.7; teleport cooldown 30 (3 in pre-round) | Free, 50 HP. Placement 8.5 m; teleport range 18 m. Must be on the ground |
| C: Trademark | Placed (sensor) | Arm 2; acquire target 0.9; re-arm 1; trap cooldown 10; slow field 6; recall cooldown 30 | 200, 20 HP. Placement 12 m. Detects within 10 m (4 m up, 10 m down). Field radius 6 m: move x0.5, jump x0.7, dash x0.5, silent. Destroyed = gone for the round |
| X: Tour De Force | Weapon (hitscan) | Equip 2.3 (wiki) | 8 pts, 5 rounds. 150 body; head x1.7 (255), legs x0.85 (127). 0.9 shots/s. A kill leaves a 6 m slow field for 4 s (wiki) |

### Deadlock

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| Q: Sonic Sensor | Placed | Equip 0.8; unequip 0.7; trigger delay 0.5; concuss 2.5; recall 0.5 | 200, 2 charges, 20 HP. Placement 14 m. Concuss line travels 150 m/s. Triggered by footsteps, gunfire, loud noise |
| E: GravNet | Projectile (grenade); FIRE throws, ALT lobs | Equip 0.8; unequip 0.7; raw field 3; removal hold 1.5; cooldown 50 | Free. Radius 6.5 m. Forced crouch; move x0.3; gravity x2.25; dash x0.4 |
| C: Barrier Mesh | Projectile (disc, 20 m/s), deploys walls | Equip 0.8; fortify 3; self-damage from 25; gone 30 | 300. Center 680 -> 1,200 HP; outer nodes 320 -> 480 (raw max 570). Walls 3 m high, up to 10 m out. Blocks movement, not bullets |
| X: Annihilation | Projectile (pulse) | Equip 1.1 (quick 0.7); fire window 10; capture 0.5; drag 7 | 7 pts. 82.5 m/s, range 40 m, 1 bounce, radius 1.5 m. Cocoon 600 HP; the captured player dies unless freed |

### Vyse

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| E: Arc Rose | Placed (ALT places through the surface) | Equip 0.8; cast 0.7; arm 0.8; flash 2; recall or activate cooldown 20; destroyed cooldown 45 (13.10, was 60) | Free, 20 HP. Placement 20 m. Flash radius 10 m. Can be destroyed during the windup |
| C: Razorvine | Projectile, becomes hidden field | Equip 0.8; unequip 0.8; arm 0.45; active 6; recall 0.5 | 150, 2 charges, 20 HP. 29 m/s, gravity x0.45. Radius 6.25 m. 10 damage per 1.25 m moved. Slow: move x0.85, jump force x0.7, dash x0.5 |
| Q: Shear | Placed (hidden wall trap) | Arm 2; trigger 0.01; wall 6; recall 0.5; cooldown 20 | 200, wall 400 HP. Placement 15 m. Wall 1-12 m long |
| X: Steel Garden | Area (around Vyse) | Equip 0.7; cast 0.8; jam spreads over 4; jam 8 | 8 pts. Radius 28 m. Primary weapons can't fire, reload or zoom. Crouching at the edge no longer avoids it on uneven ground (13.10 fix) |

### Veto

| Ability | Delivery | Timings (s) | Values and rules |
|---|---|---|---|
| C: Crosscut | Placed | Equip 0.8; usable after 0.75; hold 1; teleport unequip 0.8 | 200, 2 charges, 20 HP. Placement 20 m. Teleport range 30 m (patch; raw use distance 14 m); must look at it. Reclaim only in buy phase |
| Q: Chokehold | Projectile (thrown trap) | Equip 0.8; arm 1.5; trigger 0.5; expand 0.4; hold 4.5 | 200, 1 charge, 20 HP. Radius 6.58 m. Tether + Deafen; 75 Decay applied at once, restored over 4.5 s (wiki) |
| E: Interceptor | Placed | Equip 0.8; arm 0.5; active 9; reclaim 0.2 + 0.65; cooldown 45 | Free, 20 HP. Range 7 m. 80 instant + 800/s to utility; shots 0.125 apart |
| X: Evolution | Self (buff) | Equip 1; heal starts 2 after damage | 7 pts. Combat Stim; heals 40 HP/s after 2 s without damage: +2 HP per tick, so a tick every 0.05 s (derived); immune to debuffs and displacement. Lasts until death or round end (wiki) |

## Missing values

None of these are in the game files or any source found. Each has an estimate for now, marked (est.) in the tables; replace them once measured in the Range. Movement estimates assume players fall at 9.8 m/s².

| Value | Estimate | How estimated |
|---|---|---|
| Showstopper rocket speed | 25 m/s | The file's speed field (250) times its x10 object scale = 2,500 uu/s |
| Owl Drone speed | 7 m/s | Guess: a little faster than a running agent (5.6 m/s) |
| Boom Bot speed | 6 m/s | Guess from how far it travels in its 5 s life; the file's "Default Speed 300" may be a starting speed |
| Trailblazer and Seekers speed | 6.4 m/s | 5.6 m/s agent speed x the files' 1.15 run bonus |
| Hush redirect speed (Flashbulb, Displacement) | 32.5 m/s | Covers the shortest redirect distance (32.5 m) within the 1 s pop time |
| Drift fall speed | 2.5 m/s max | Guess |
| Updraft launch | 10 m/s up | 5 m peak at 9.8 m/s²: √(2 x 9.8 x 5) ≈ 9.9 m/s |
| Blast Pack knockback | 12 m/s total, about 8.5 m/s up; replaces the current velocity | A one-storey (3.5 m) peak needs 8.3 m/s up. Two satchels reaching two storeys fits replacing velocity, not adding to it |
| Satchel jump distance | About 15 m with one, 25 m with two | Flight of a 12 m/s launch at 45 deg, the second fired at the peak |
| Cosmic Divide | Lasts 21 s plus 2.5 s fade; spans the map and reaches the sky; 0.5 m thick | Duration is the wiki's estimate; size and thickness are guesses |
| Flow | 0.35 s before the propel, and 0.35 s of hover if cast in the air; raw 2.5 s is likely the longest flight | Matches the 0.35 s hands time |
| Displacement and Suspension radius in play | Same as the files: 5.75 m; 7 m for players, 9 m for items | Nothing found that contradicts the files |
| Suspension on boxes | Detonates on a box top, keeps flying off a box side | Same rule as floors and walls |
| Smoke height | Top about one radius above the floor: 4.1-4.75 m | The center sits on the floor (Dark Cover's core reaches the ground; Riot's tech blog shows a hemisphere) |
| Smoke under a ceiling | Cut off by the ceiling, as by the floor | Guess |
| Wall thickness: Blaze, High Tide, Toxic Screen | 1 m | Guess. At 128 server ticks a running agent moves 0.04 m per tick, so any thickness above that still registers |
| Contingency size | 3 m tall; 5.2 m wide if the 2.62 m front wall is a half-width | Guess |
| Rolling Thunder length | 30 m | Guess |
| Nightfall length | 40 m | Guess |
| Reckoning strike | Cylinder, r 2.8 m (half the 5.6 m strip), 4 m tall | Strip width and collision height |
| Undocumented area shapes (Gravity Well, Seize, Chokehold, Haunt, ZERO/point, Lockdown) | Spheres | Most areas the files give only a radius for are spheres |
| Headhunter timing | 0.25 s between shots; no reload | 4 shots/s; bullets are bought, not reloaded |
| Ability sound range | 50 m | Same as KAY/O's documented voice-line range |
| "DPT" fields | Not live; ignore | Recon Bolt DPT 60 vs live 50 |
| Visuals: hand animations, ally vs enemy colors, status screen effects | Not estimated | Needs footage |
| Raw fields | Not estimated | Listed with their field names in the tables |

## Sources

- valorant.gs agent pages (game files, builds 13.06-13.09; one page per agent; no 13.10 build yet)
- valorant.gs status effects (flash and concuss curves, shared buffs, assist windows)
- Patch 13.09 notes (Riot)
- Patch 11.08 notes (Riot)
- Patch 13.01 notes (Riot)
- Patch 12.05 notes (Riot)
- VALORANT Fandom Wiki (values marked wiki)
- valorant.gs ability cooldowns (cost, charges, cooldown table, build 13.09)
- Liquipedia: Neon (Overdrive duration)
- VALORANT Wiki post on Lightspeed (dash distance and timing)
- Strafe: Hush hands-on (Telekinesis range and cooldown)
- Switchblade Gaming: Gekko guide (Dizzy blind, Mosh Pit ticks)
- Boosting Ground: Omen guide (Shrouded Step timing)
- VALORANT Wiki: Deployment types (projectile classes)
- VALORANT Wiki: Hunter's Fury, Guiding Light, Double Tap, Mosh Pit, Dizzy, Orbital Strike, Incendiary
- VALORANT Wiki: Turret, Evolution, Snake Bite, Nanoswarm, High Gear, Viper's Pit
- esports.gg: Hush (Suspension 4 s levitate)
- Beebom: Hush guide (Telekinesis range)
- GameRiv: Patch 13.10 and esportnow: Patch 13.10 (13.10 Sentinel and Healing Orb changes)
- Dot Esports: Riot developer on Raze rocket damage (explosions check line of sight from the center)
- Switchblade Gaming: Raze guide (satchel jump heights)
