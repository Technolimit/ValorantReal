# Abilities and their timings

Every agent's kit, with the numbers the game uses. Generated from `js/abilities.js` and `js/prices.js`, so it
matches the code. The numbers follow [VALORANT_SPECS.md](VALORANT_SPECS.md) (patch 13.10). Each agent is an original character whose kit mirrors one Valorant agent, ability by ability;
the Valorant names are in brackets.

## How charges come back

- **5v5 (rounds), as in Valorant.** C and Q are bought in the buy phase and never recharge on their own. Unused
  charges carry over to the next round, even through death. The signature (E) is free every round and then:
  - **recharges on its cooldown** (the *5v5 recharge* column), including the ones you can buy extra charges of
    (Shade / Dark Cover, Lantern Hawk / Guiding Light, Ruse);
  - **comes back after two kills** (Slipstream / Tailwind, Sunflare / Curveball, Splatter / Paint Shells,
    Riftwalk / Gatecrash, Refract), or
  - **does not come back that round** (Overcast / Sky Smoke, Toxic Wall / Toxic Screen, Missile Call / Guided Salvo).
  - Volt's slide (Neon's High Gear slide) is once a round and comes back after two kills.
  - Stella's Gravity Well and Nova Pulse are free and come back on a 60 s timer; her stars are the E charges
    (one free, up to five).
- **Deathmatch.** Valorant's deathmatch has no abilities, so every ability recharges on the *Deathmatch cooldown*
  instead (like Valorant's Team Deathmatch). Charges refill on respawn.
- **Ultimates** cost the listed points. You get a point for a kill, a death, planting, defusing and each ultimate
  orb (hold F for 3 s). Points reset at halftime.
- **Picking utility back up (F):** Trapwire and Rendezvous come back at once, Spycam, Alarmbot and Turret
  after 20 s, Trademark after 30 s, stars after 25 s; Poison Cloud at once, from up to 4 m away; Cyber Cage
  only in the buy phase (everything comes straight back in the buy phase).

## Zephyr (Jett) · Duelist

Passive: **Drift**: Hold Space while falling to glide down slowly.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Veil** (Cloudburst) | 2 × 200 | bought only | 16 s | Throw a smoke orb (29 m/s). Hold C and it curves toward your crosshair; let go and it falls. It bursts into a 2.5 s smoke on the first surface it touches, or after 2 s in the air. |
| Q | **Lift** (Updraft) | 1 × 150 | bought only | 9 s | Launch yourself about 5 m straight up. |
| E | **Slipstream** (Tailwind) | 1 free | 2 kills | 12 s | Press to gather the wind (1 s); press again within 7.5 s to dash ~11 m the way you are moving. Unused, the charge is lost. In 5v5 it comes back after two kills. |
| X | **Edgestorm** (Blade Storm) | 8 points | | | Draw five throwing blades: left click throws one (150 head / 50 body / 42 legs), right click fans out all of them. Each kill refills the set. Switch to a gun and the blades you have left wait for you: press X to take them out again. |

## Cinder (Phoenix) · Duelist

Passive: **Kindled**: Your own fire heals you instead of hurting you.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Firebreak** (Blaze) | 1 × 150 | bought only | 25 s | Hold the flame, then left click: a wall of fire races out 13 m ahead (20 m/s). Keep the button held and turn to bend it. It stands 8 s, blocks sight, burns enemies (30/s) and heals you (up to 50). |
| Q | **Ember** (Hot Hands) | 1 × 200 | bought only | 18 s | Hold a fireball: left click throws it, right click lobs it short. It drops after 1.5 s in the air and bursts on the ground into a pool of fire that spreads to 4.5 m and burns for 4 s (60/s to enemies; heals you, up to 50). |
| E | **Sunflare** (Curveball) | 2 × 250 (1 free) | 2 kills | 14 s | Hold a flare in your hand (no gun), then left click to curve it left or right click to curve it right. It bursts around the corner 0.7 s later, blinding anyone facing it for up to 1.5 s. In 5v5 one is free each round and two kills bring a used one back. |
| X | **Rekindle** (Run It Back) | 7 points | | | Mark where you stand. For 10 s you can fight freely: if you die, or when time runs out, you burn away and re-form at the mark 2.4 s later at full health, with the shields you had. The death does not count. |

## Umbra (Omen) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rift** (Shrouded Step) | 2 × 100 | bought only | 25 s | Hold it: a marker shows where you will land (up to 15 m) and follows your aim. Left click to go; 0.7 s later you step through the shadows to it, and take another 0.5 s to arrive before you can shoot. |
| Q | **Dread** (Paranoia) | 1 × 250 | bought only | 30 s | Send a wave of shadow straight ahead (20 m/s, 25 m) that passes through walls. Everyone it touches, teammates included, is nearsighted and deafened for 2 s. |
| E | **Shade** (Dark Cover) | 2 × 150 (1 free) | 40 s | 40 s | Hold the orb: your view follows the smoke out through walls, and the sphere shows exactly where it will form. It passes through walls: hold right click to push it farther (up to 80 m), press R to make it stop at the first wall instead, left click to cast. The orb flies there at 64 m/s and the smoke lasts 14.7 s. |
| X | **Nightwalk** (From the Shadows) | 7 points | | | Take out the tablet (0.5 s), then click anywhere on the map. You fade out (untouchable) while a shade of you forms there; after 4 s you step out of it. Enemies who shoot the shade first cancel it and you stay where you were. |

## Hawke (Sova) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Kestrel** (Owl Drone) | 1 × 400 | bought only | 40 s | Hold the drone, left click to launch it. Fly it with WASD and your mouse for up to 7 s while your body stands exposed (damage to your body ends it). Left click fires a tracking dart (every 5 s): an enemy it hits is revealed in two pings. |
| Q | **Arc Dart** (Shock Bolt) | 2 × 150 | bought only | 25 s | Draw the bow. Hold left click to charge (three bars over 1 s: each one flies faster and flatter), release to fire. Right click sets 0, 1 or 2 bounces. The dart explodes where it ends up: 75 damage within 1.5 m, down to 30 at 4 m. |
| E | **Sonar Bolt** (Recon Bolt) | 1 free | 50 s | 50 s | Draw the bow. Hold left click to charge (three bars over 1 s), release to fire; right click sets 0, 1 or 2 bounces. The bolt sticks where it lands and pulses twice (0.7 s after landing, then 1.6 s later), revealing every enemy in its line of sight within 30 m. Enemies can shoot it out (20 HP). |
| X | **Talon Strike** (Hunter's Fury) | 8 points | | | Fire up to three energy beams (66 m long, 3.5 m across) within 6 s, at least 0.75 s apart. They go through every wall, dealing 80 damage and revealing whoever they hit. You stand still while you do. |

## Bastion (Killjoy) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Hive** (Nanoswarm) | 2 × 200 | bought only | 40 s | Throw a swarm grenade (left click) or lob it short (right click); it hides where it lands, and enemies only see it from within 5.25 m. Look at one and press F to set off just that one, or press C again once both are out (or you have none left) to set them all off: 0.5 s later, 45/s for 5 s in a 4.5 m radius. |
| Q | **Watchdog** (Alarmbot) | 1 × 200 | bought only | 40 s | Deploy an alarm bot (10 m); it takes 1.5 s to dig in. When an enemy comes within 6 m it chases them and bursts 2.5 m from them: Vulnerable (double damage taken) for 4 s. It switches off while you are more than 40 m away. |
| E | **Sentry** (Turret) | 1 free | 45 s | 45 s | Deploy a turret (4.5 m) facing where you aim. It fires three-round bursts at enemies in its 100° view out to 40 m (8 damage a shot up close, 6 past 20 m, 4 past 35 m; hits slow) until it is destroyed (45 s to get it back) or picked up (20 s). It takes 2 s to set up, and opens fire 0.75 s after it spots someone. It switches off while you are more than 40 m away. Placing a new one takes the old one down. |
| X | **Clampdown** (Lockdown) | 9 points | | | Take out the device (0.8 s), then left click to plant it. It can be shot (200 HP) while it charges for 13 s, and everyone sees the sphere it covers; then it detains every enemy within 32 m of it for 8 s: they cannot fire or use abilities and can barely move. |

## Blitz (Raze) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Boomer** (Boom Bot) | 1 × 300 | bought only | 35 s | Deploy a bot that unpacks for 0.5 s, then rolls forward and bounces off walls. It locks onto the first enemy it sees ahead within 15 m and explodes 2.5 m from them: 80 within 2 m, down to 30 at 6 m. It lasts 5 s, but the clock stops while it can see its target; if it loses sight of them it goes back to rolling. 60 HP. |
| Q | **Kicker** (Blast Pack) | 2 × 200 | bought only | 12 s | Instantly throws a satchel (16.5 m/s) that sticks to the first thing it hits. Press Q again to blow it, even while it is still in the air; it goes off by itself after 5 s. It launches anyone nearby, you included. Once armed (1.5 s) it also deals 50 within 1.5 m, down to 10 at 5 m, never to you. Enemies can shoot it (20 HP). |
| E | **Splatter** (Paint Shells) | 1 free | 2 kills | 30 s | Throw a cluster grenade (left click) or lob it short (right click). It flies in a high arc, loses most of its speed when it lands, and 2 s after the throw explodes (55 within 2.5 m, down to 1 at 5.5 m), tossing out four bomblets that go off for 55 each. In 5v5 it comes back after two kills. |
| X | **Finale** (Showstopper) | 8 points | | | Pull out a rocket launcher and left click to fire one rocket within 10 s. It kicks when it fires, flies straight (25 m/s) and explodes on whatever it hits: exactly 150 damage within 4.5 m, falling off evenly to 30 at 7 m. It hurts you too (a third as much), so don’t fire it at your feet. |

## Granite (Brimstone) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rally** (Stim Beacon) | 1 × 200 | bought only | 30 s | Instantly toss a beacon that sets up a 6 m field for 12 s where it lands. You and teammates in it get Combat Stim (10% faster fire rate, reload, draw and recovery) and 10% faster movement, lasting 4 s after you leave. |
| Q | **Napalm** (Incendiary) | 1 × 250 | bought only | 25 s | Fire an incendiary grenade from the launcher (29 m/s). It bounces off walls, hops once when it lands, and then bursts into a fire that spreads to 4.5 m and burns for 7 s (60/s; a third of that to you and teammates). |
| E | **Overcast** (Sky Smoke) | 3 × 100 (1 free) | once a round | 35 s | Take out the tablet (0.8 s), then the map opens: click up to three spots (one per charge) for sky smokes; press E again to call them in. Each lasts 19.25 s. |
| X | **Sky Hammer** (Orbital Strike) | 8 points | | | Take out the tablet (0.74 s), then click a spot on the map within 60 m: after 2 s a 9 m orbital strike burns it for 3 s (20 every 0.15 s), then shrinks away over 0.75 s. |

## Venom (Viper) · Controller

Passive: **Fuel**: Gas drains fuel while on and refills while everything is off. Toxin decays enemies inside it.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Acid Vial** (Snake Bite) | 2 × 300 | bought only | 25 s | Launch a vial (29 m/s) that bursts on the floor into a 4.5 m pool of acid for 6.5 s: 12.5/s, and Vulnerable (double damage, so 25/s) while you stand in it and for 2 s after. |
| Q | **Miasma** (Poison Cloud) | 1 × 200 | bought only | — | Throw a gas emitter (left click) or lob it short (right click). Where it lands it releases a 4.5 m toxic cloud; press Q again to switch the cloud off and on (uses fuel; 5.5 s before it can come back on). |
| E | **Toxic Wall** (Toxic Screen) | 1 free | once a round | — | Hold the launcher: the line where its emitters will land is shown, straight ahead through walls up to 60 m (one every 2 m). Left click to fire them: they lie on the floor, where everyone can see them. Press E to raise a wall of toxic gas 6.75 m high along them, and again to drop it (uses fuel; 5 s before it can come back on). Anyone in the gas takes Decay. |
| X | **Nest** (Viper's Pit) | 9 points | | | Flood the area around you with a toxic cloud that spreads to 9 m over 5 s. It lasts as long as you stay inside it, and 8 s after you leave. Everyone inside, you included, is nearsighted (8 m); enemies also lose 50 health to Decay at once, then 10 a second. Enemies inside are outlined in red for your team, which makes them stand out but doesn’t show them through walls or past what you can see. |

## Vex (Reyna) · Duelist

Passive: **Soul Harvest**: An enemy who dies within 3 s of taking your damage drops a soul orb for 3 s.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Glare** (Leer) | 2 × 250 | bought only | 20 s | Hold the eye: a marker shows where it will go, 10 m straight ahead, through walls. Left click to cast it (22.5 m/s). It opens 0.4 s after it arrives and nearsights every enemy who looks at it for the 2 s it lasts. Enemies can shoot it out (60 HP). |
| Q | **Feast** (Devour) | 2 × 200 (1 free) | bought only | — | Press Q to consume your nearest soul orb, at any distance: heal 50 over 3 s. You can go above 100 HP; the extra stays 10 s, then fades. In Ravenous every kill does this by itself (over 2.5 s), leaves the orb for Vanish, and the extra health stays. Shares its 2 charges with Vanish. |
| E | **Vanish** (Dismiss) | 2 free | — | — | Press E to consume your nearest soul orb, at any distance: for 1.5 s you’re intangible (and invisible in Ravenous) and move much faster in any direction, but can’t use your gun. Uses Feast’s charges; in Ravenous it costs none. |
| X | **Ravenous** (Empress) | 7 points | | | Enter a frenzy (1 s to cast) that lasts until you die or the round ends: Combat Stim (10% faster fire rate, reload and draw), every kill Feasts by itself, and Vanish costs no charges. |

## Quake (Breach) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rubble** (Aftershock) | 1 × 200 | bought only | 25 s | Fire a charge at a wall up to 35 m ahead (25 m/s). 2.2 s later it blasts the far side three times, 0.6 s apart: 80 damage each to everyone in a strip 10 m deep and 6 m wide behind the wall. |
| Q | **Glimmer** (Flashpoint) | 2 × 250 | bought only | 18 s | Fire a flash charge at a wall up to 35 m ahead (24 m/s). It passes through and bursts on the far side 0.5 s later, blinding for up to 2.25 s. |
| E | **Fissure** (Fault Line) | 1 free | 50 s | 50 s | Hold left click to charge its length (8 m up to 56 m over 1 s, shown on the ground; you move slower while you charge), release to send a seismic line through walls. It starts 8 m ahead of you, is 8 m wide, and 1.1 s later concusses everyone on it for 2.5 s. |
| X | **Aftershock Wave** (Rolling Thunder) | 8 points | | | Send a seismic charge rolling out through every wall: a strip 18 m wide that starts 8 m ahead of you and runs 30 m, going off zone by zone (the first 0.9 s after the cast, then every 0.255 s). Enemies in a zone when it goes are knocked up and concussed for 4 s. |

## Volt (Neon) · Duelist

Passive: **Energy**: Overclock runs on energy: a full bar is 16 s of sprinting and takes 60 s to refill.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Static Lanes** (Fast Lane) | 1 × 300 | bought only | 25 s | Instantly fire two parallel walls of static, 3.5 m apart and 6.75 m high, from 1.5 m behind you to 45 m ahead, through walls. They block sight for 4 s. |
| Q | **Ricochet** (Relay Bolt) | 1 × 200 | bought only | 25 s | Instantly throw a bolt (41 m/s) that bounces once. At each of the two surfaces it hits it charges the ground below, and 1 s later everyone in an upright cylinder there (5 m around, up to 4 m above and 1 m below) is concussed for 2.5 s. |
| E | **Overclock** (High Gear) | 1 free | — | — | Instantly put your gun away and sprint (9.1 m/s) while energy lasts; press E again to stop. Right click mid-sprint, while moving, to slide 7 m (12 m/s for 0.6 s): the slide ends the sprint, your best gun is out at once and you shoot as accurately as standing still while you slide (one slide per round in 5v5, back after two kills; one every 8 s in deathmatch). |
| X | **Overload** (Overdrive) | 8 points | | | Fire a lightning beam from your fingertip: hold left click (20 shots a second; 18 body / 54 head out to 20 m, falling to 10 body at 43 m; accurate while running and sliding). It has 40 shots that refill by themselves when you stop firing. Starts your sprint with full energy and a fresh slide. Overload lasts 10 s; kills refill it and give your slide back. |

## Mirage (Yoru) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Double** (Fakeout) | 1 × 200 | bought only | 30 s | Send out a decoy of yourself that walks forward for 10 s. An enemy who shoots it sets it off: it bursts into a flash that blinds for up to 2 s. |
| Q | **Rebound** (Blindside) | 1 × 250 | bought only | 18 s | Throw a flash (29 m/s) that bounces off the first surface it hits and bursts 0.7 s later (or 2 s after the throw if it hits nothing), blinding anyone facing it for up to 1.5 s. |
| E | **Riftwalk** (Gatecrash) | 2 × 150 (1 free) | 2 kills | 30 s | Hold the rift: left click sends it along the ground (8 m/s), right click leaves it where you stand. Press E again any time in the next 20 s to teleport to it (0.5 s, untouchable on the way). Or press F to fake it: the rift makes the teleport’s sound and flash and you stay where you are, leaving a faint mark on the floor for 30 s. Enemies can shoot it (60 HP). In 5v5 one is free each round, a second costs 150, and two kills bring a used one back. |
| X | **Phase Out** (Dimensional Drift) | 8 points | | | Slip into another dimension for 10 s: enemies can’t see or hurt you, but you can’t shoot. Press X to come back early. |

## Fawn (Skye) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Bloom** (Regrowth) | 1 × 150 | bought only | 25 s | Hold C to channel: every hurt teammate you can see within 18 m heals 20 HP/s. One charge holds a 100 HP pool — let go to stop, hold C again to keep spending it. You cannot shoot while channelling, and it cannot heal you. |
| Q | **Stalker** (Trailblazer) | 1 × 300 | bought only | 40 s | Hold the tiger, left click to send it. You see through its eyes and steer with the mouse for up to 6 s (6.4 m/s, 80 HP). Left click makes it leap up to 12 m: the first enemy it hits takes 30, and everyone within 3.5 m of where it lands is concussed for up to 4 s. |
| E | **Lantern Hawk** (Guiding Light) | 2 × 250 (1 free) | 50 s | 50 s | Hold the hawk, left click to release it; it flies where you aim (18 m/s, 60 HP). Press E again to make it burst 0.3 s later, blinding anyone facing it for 1 to 2.25 s: the full time once it has flown 0.75 s (it bursts on its own after 2 s). In 5v5 one is free each round and a second costs 250. |
| X | **Hunters** (Seekers) | 8 points | | | Release three seekers (120 HP each) that track the three closest enemies for up to 15 s, through walls. Each one that reaches its target nearsights them for 3 s. |

## Lattice (Cypher) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Tripline** (Trapwire) | 2 × 200 | bought only | 30 s | Hold the wire, aim at a wall (up to 20 m) and left click to stretch it across the gap at that height (up to 15 m); it arms 1.5 s later. An enemy who crosses it is tethered and slowed by half. 0.7 s later it zaps them: slowed for another second and revealed for as long as it holds them. Tearing free (6.2 m) costs a zap too; shooting the wire (20 HP) frees them. It resets and can catch again. |
| Q | **Gridlock** (Cyber Cage) | 2 × 100 | bought only | 30 s | Hold a cage, left click to throw it (20 m/s); it sets up 0.35 s after it lands. To trigger one, look at it and press Q: it becomes a 7.25 s smoke. Each cage is triggered separately. |
| E | **Watcher** (Spycam) | 1 free | 45 s | 45 s | Hold the camera, left click to stick it on the surface you aim at (20 m). Press E again to look through it; enemies it sees are revealed, and left click fires a tracking dart (pings every 2 s for 8 s). E again to leave. One shot destroys it (45 s to get it back; 20 s if you pick it up). |
| X | **Mindread** (Neural Theft) | 7 points | | | Look at the body of an enemy who died in the last 20 s (12 m) and press X to read their mind: every living enemy is revealed twice, 2 s apart. |

## Nyx (Fade) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Hound** (Prowler) | 2 × 250 | bought only | 25 s | Send a prowler (10 m/s, 60 HP) that follows your crosshair for 2.5 s. It chases the first enemy it sees within 15 m, or one marked by a terror trail, and bites from 2.5 m: nearsighted for 2.75 s. |
| Q | **Grasp** (Seize) | 1 × 200 | bought only | 25 s | Throw an orb. It drops straight down after 1.5 s in the air, or when you press Q again, and bursts 0.7 s after landing: enemies within 6.6 m are held in place and deafened for 4.5 s and lose 75 health to Decay (never lethal; it comes back over 5 s). |
| E | **Omen Eye** (Haunt) | 1 free | 50 s | 50 s | Throw an eye. It drops straight down after 1.5 s in the air, or when you press E again, and opens where it lands: for 1.5 s every enemy in its line of sight within 30 m is revealed and marked with a terror trail for 12 s, which prowlers follow. One shot destroys it. |
| X | **Terror** (Nightfall) | 8 points | | | Unleash a wave of nightmare through walls, 20 m wide and 40 m long, rolling out zone by zone: everyone it reaches is marked (revealed, with a terror trail) and deafened for 8 s and loses 75 health to Decay (never lethal; it comes back). |

## Solace (Sage) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Frost Wall** (Barrier Orb) | 1 × 300 | bought only | 40 s | Hold the crystal: a preview shows the wall where you aim (15 m). Right click rotates it, left click raises a solid ice wall of four pieces (10.4 m × 2.6 m) for 40 s. Each piece has 400 HP, hardening to 600 after 2 s, and enemies can shoot it down. You can stand on it — raise it under yourself to boost up. |
| Q | **Chill** (Slow Orb) | 2 × 200 | bought only | 25 s | Hold the orb, left click to throw it (29 m/s). It shatters on the floor into a field up to 9 m across the ground for 7 s that slows enemies by 50%. |
| E | **Mend** (Healing Orb) | 1 free | 45 s | 45 s | Hold the healing orb. Aim at a teammate you can see (20 m) and left click to heal them 60 HP over 5 s (30 s cooldown); aim anywhere else to heal yourself 100 HP over 5 s (45 s cooldown). |
| X | **Second Dawn** (Resurrection) | 7 points | | | Look at a fallen teammate’s body (12 m) and press X: after 3 s of channelling they rise where they fell with full health. They can’t be hurt for 2 s, and take 1.3 s to get moving. |

## Stella (Astra) · Controller

Passive: **Stars**: You have up to 5 stars (in 5v5 one is free each round and more cost 150). Press E (not looking at a star) to place them on the map, then look at a star and press C, Q or E to turn it into that ability. Each ability has its own charges: Gravity Well and Nova Pulse one each (60 s to come back), Nebula two (35 s each).

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Gravity Well** (Gravity Well) | 1 free | 60 s | 60 s | Look at one of your stars and press C: after 1.25 s it pulls nearby enemies (4.75 m) to its centre for 2 s, then makes them Vulnerable (double damage) for 2.5 s. One charge, back after 60 s. |
| Q | **Nova Pulse** (Nova Pulse) | 1 free | 60 s | 60 s | Look at one of your stars and press Q: after 1 s it bursts, concussing enemies within 5.25 m for 2.5 s. One charge, back after 60 s. |
| E | **Astral Form** (Nebula / Dissipate) | 5 × 150 (1 free) | — | — | Press E to open the map and click to place your stars (as many as you have). Look at a placed star and press E to turn it into a Nebula: a 14.25 s smoke that forms 0.75 s later (two charges, 35 s each to come back). Pick a star back up (F) and it leaves a 1.75 s fake smoke; the star returns after 25 s. |
| X | **Rift Line** (Astral Form / Cosmic Divide) | 7 points | | | Open the map and click two points: a wall of cosmic energy splits the whole map through the first, running toward the second (it snaps to the map’s grid), for 21 s after a 3 s windup. It stops bullets and sight; thrown abilities pass through. |

## Regent (Chamber) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Snare** (Trademark) | 1 × 200 | bought only | 30 s | Hold the trap, left click to place it on the floor (12 m); it arms after 2 s. When it sees an enemy within 10 m, 0.9 s later the ground around it breaks into a 6 m field that slows by half for 6 s. It resets 10 s later. Enemies can shoot it (20 HP). |
| Q | **Sovereign** (Headhunter) | 8 × 100 | bought only | 30 s | Draw a heavy pistol (8 rounds; 159 to the head, right click to aim). Press Q again to holster it and keep the rest of the rounds. |
| E | **Anchor** (Rendezvous) | 1 free | — | — | Hold the anchor, left click to place it on the floor (8.5 m). Press E again anywhere within 18 m of it to teleport back (1.3 s, invulnerable on the way; 30 s cooldown between teleports). Enemies can shoot it (50 HP). |
| X | **Coup de Grace** (Tour De Force) | 8 points | | | Summon a custom sniper rifle (2.3 s; 5 rounds): one hit to the body or head kills, and every kill leaves a 6 m field that slows by half for 4 s where the target fell. Right click to scope. |

## Marina (Harbor) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Squall** (Cascade; Valorant now has Storm Surge here) | 1 × 200 | bought only | 30 s | Hold the water, left click to throw it (29 m/s). It bursts into a whirlpool where it lands, and 0.6 s later every enemy within 6 m is nearsighted for 2 s, seen or not. |
| Q | **Riptide** (High Tide) | 1 × 300 | bought only | 40 s | Hold the water, then left click: a wall of water 8 m high races forward along the ground (20 m/s, up to 60 m), through walls. Keep the button held and turn to steer it; right click stops it early. It stands 15 s, blocks sight and slows whoever crosses it. |
| E | **Lagoon** (Cove) | 1 free | 30 s | 30 s | Hold the orb, left click to send it to the spot you aim at (64 m/s, up to 80 m). It becomes a water dome 9.2 m across for 19.25 s that blocks sight; 0.8 s later its shell forms and stops bullets until it takes 680 damage. |
| X | **Undertow** (Reckoning) | 7 points | | | Send a tall wave of water rolling out ahead of you through walls: 28 m wide, 8 m/s, for 40 m. It blocks sight as it goes, and every enemy it washes over is nearsighted for 3 s. |

## Vanta (Iso) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Push Wall** (Contingency) | 1 × 200 | bought only | 30 s | Hold the barrier: left click pushes a wall (5.2 m × 3 m) forward at 3.6 m/s for 3.5 s, right click at half that speed. It blocks bullets and sight and can’t be broken, but players can walk through it; it stops at walls. |
| Q | **Sever** (Undercut) | 1 × 300 | bought only | 20 s | Hold the bolt, left click to fire it straight ahead (22.5 m/s, 29.5 m), through walls. Every enemy within 3 m of it as it passes is Vulnerable (double damage) for 4 s. |
| E | **Focus** (Double Tap) | 1 free | 30 s | 30 s | After a 1 s wind-up you get a shield that blocks one hit, for 12 s. Every enemy you kill in that time drops an orb above their body for 3 s: shoot it to refresh the shield and the 12 s timer. |
| X | **Duel** (Kill Contract) | 7 points | | | Send a column of energy ahead of you (14 m wide, through walls, 40 m over 4 s, starting 0.8 s after the cast). You and the first enemy it reaches are pulled into a sealed arena: 1.5 s to face off, then up to 13 s to fight. Whoever survives is sent back. |

## Ballast (Tejo) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Scout Drone** (Stealth Drone) | 1 × 400 | bought only | 40 s | Hold the drone, left click to launch it. Fly it with your mouse for up to 6 s (7.5 m/s, 42 HP). Left click pulses (from 0.6 s after launch, then every 1.5 s): enemies within 16 m are revealed and suppressed (no abilities) for 8 s. |
| Q | **Sticky Charge** (Special Delivery) | 1 × 200 | bought only | 25 s | Hold the charge: left click throws it (41 m/s) to stick to the first thing it hits, right click lets it bounce once first. 0.8 s after it sticks it bursts: 35 damage within 1.25 m, down to 20 at 5.25 m, and everyone caught is concussed for 2.5 s. |
| E | **Missile Call** (Guided Salvo) | 2 × 150 (1 free) | once a round | 35 s | Open the map and mark a target per charge (2 charges, 45 m); press E (or right click) to fire. Each missile comes down 1.5 s later and goes off three times, half a second apart: 65 within 2.5 m, down to 50 at 4.5 m, each time. |
| X | **Barrage** (Armageddon) | 9 points | | | Take out the tablet (0.6 s), then click where it starts on the map (within 52.5 m), then a second point it runs toward. 3 s later a strike walks 36 m along that line, 2 m at a time: each stretch (12 m wide) is hit four times for 60, a quarter of a second apart. |

## Override (KAY/O) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Fragment** (FRAG/ment) | 1 × 200 | bought only | 30 s | Hold the frag, left click to throw it (18 m/s). It bounces off walls and sticks to the floor; 0.5 s later it goes off four times, a second apart: 60 within 1 m, down to 25 at 4 m, each time. |
| Q | **Flashpoint** (FLASH/drive) | 2 × 250 | bought only | 20 s | Hold the flash. Left click: overhand throw that pops 1.6 s later. Right click: underhand lob that pops after 1 s. If it bounces off something first, it pops 0.8 s after the bounce. Blinds anyone facing it for up to 2.25 s. |
| E | **Zero Point** (ZERO/point) | 1 free | 50 s | 50 s | Hold the knife, left click to throw it (30 m). It sticks to the first surface and after 1 s pulses 15 m: enemies caught are revealed and suppressed (no abilities) for 8 s. Enemies can shoot it out first (20 HP). |
| X | **Overload** (NULL/cmd) | 8 points | | | Overload for 12 s: pulses every 2 s reveal and suppress enemies within 42.5 m for 4 s, and you get Combat Stim (10% faster fire rate, reload and draw). If you would die, you go down instead: a teammate within 3 m who holds F for 1.5 s (bots just need to stand there) gets you back up at full health. Nobody comes within 15 s, or the enemy finishes you (850 HP), and you’re dead. |

## Thistle (Clove) · Controller

Passive: **Afterlife**: Ruse (E) works even while you are dead, until the round (or your respawn) comes.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Pick-Me-Up** (Pick-Me-Up) | 1 × 200 | bought only | 30 s | Absorb the life force of an enemy you killed or damaged who died in the last 6 s. It takes 0.7 s, then gives +50 temporary health (it lasts 10 s, then fades) and 10% haste for 3 s. |
| Q | **Meddle** (Meddle) | 1 × 250 | bought only | 25 s | Hold the fragment, left click to throw it (29 m/s). 0.75 s after it lands it erupts in a 4 m burst: enemies caught lose 90 health to Decay (never lethal), which comes back over 5 s. |
| E | **Ruse** (Ruse) | 2 × 150 (1 free) | 40 s | 40 s | Take out the tablet (0.6 s), then click up to two spots on the map (one per charge, within 55 m); press E or right click to drop smokes there 1 s later (13.5 s). Works while you are dead: one smoke, 5.5 s, within 42.5 m. |
| X | **Not Dead Yet** (Not Dead Yet) | 8 points | | | After you die, press X to come back where you fell. Reviving takes 1.5 s, untouchable. You then have 10 s to get a kill or damage an enemy — otherwise you die again. |

## Lumen (Waylay) · Duelist

Passive: **Refraction**: Refract comes back after two kills instead of on a timer.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Saturate** (Saturate) | 1 × 300 | bought only | 30 s | Hold a cluster of light, left click to throw it (29 m/s). It drops straight down after 1 s in the air and bursts where it lands: everyone within 6 m, you and teammates included, is Hindered for 3 s (30% slower, lower jumps, 20% slower fire rate). |
| Q | **Lightspeed** (Lightspeed) | 1 × 300 | bought only | 25 s | Hold the light: left click dashes twice, right click once. Each dash is about 9 m in 0.45 s, the way you are moving; the first also carries you upward. |
| E | **Refract** (Refract) | 1 free | 2 kills | 2 kills | Drop a beacon of light where you stand. From 1 s later, and within 8 s, press E again to travel back to it (0.35 s from 2.5 m away up to 2 s from 50 m). You are untouchable on the way but can barely see. Recharges after two kills. |
| X | **Convergent Paths** (Convergent Paths) | 8 points | | | Focus your light and cast a beam 36 m ahead, through walls. Casting briefly slows your aim and movement. After 1 s the beam expands to 13.5 m wide: everyone in it is Hindered for 6 s, and you gain 10% speed for 7 s. |

## Sources

Values were checked against the official VALORANT wiki (wiki.playvalorant.com) and current patch notes where
they could be found (October 2026), with Liquipedia and other stat sites as a fallback. Changes from this pass:

- Signature cooldowns: Dark Cover 40 s, Recon Bolt 50 s (13.00), Fault Line 50 s (13.00), Haunt 50 s, ZERO/point
  50 s, Guiding Light 60 s, Ruse 40 s (10.04). Healing Orb (45 s) and Turret (45 s destroyed, 20 s picked up)
  were already right.
- Two-kill signatures: Tailwind, Hot Hands, Paint Shells, Refract; Neon's slide.
- Durations: Cloudburst 2.5 s, Tailwind wind-up 1 s (7.04), Curveball blind up to 1.5 s (5.01), Fault Line
  concuss 2.5 s, Gatecrash rift 15 s (12.05), Cyber Cage 7.25 s, Sky Smoke 19.25 s, Nebula 14.25 s, Cosmic
  Divide 21 s, Boom Bot 5 s and 30-80 damage, Owl Drone dart pings 1.6 s and 2.8 s after the hit.
- Ultimate costs: Jett, Brimstone, Neon, Yoru, Skye and KAY/O 8; Phoenix (13.02), Reyna 7; Viper and Tejo 9.
- Damage: Shock Bolt up to 75 (4.08), Snake Bite 12/s doubled by its Vulnerable (about 78 over 6.5 s, as listed),
  Showstopper 30-150 over 7 m, Boom Bot 30-80.
- Vex (Reyna), issue #37: Glare (Leer) shows where it goes and travels straight through walls; Feast and Vanish
  (Devour, Dismiss) use the nearest soul orb as soon as you press the key.

Second pass, every ability against its official wiki page (October 2026):

- Kits that moved keys in Valorant: Phoenix's Curveball is now the signature (E: 1 free, a second for 250 or
  two kills) and Hot Hands a 200-credit basic (Q); Harbor's Cove is the signature (E: 30 s, 19.25 s, 680 HP
  shield) and High Tide the 300-credit Q. Reyna's Devour and Dismiss share one pool of 2 charges.
- Jett: Cloudburst 3.35 m, flies 2 s; Tailwind dash 11 m over 0.45 s; Blade Storm 1 s draw, 150/50/42.
- Omen: Shrouded Step 15 m, 0.7 s; Paranoia 25 m at 20 m/s, 4.3 m wide; Dark Cover up to 80 m.
- Sova: Shock Bolt 75 within 1.5 m, 1 at 4 m; Recon Bolt scans 1 s apart; Owl Drone 100 HP; Hunter's Fury
  66 m x 1.76 m, 1 s reveal.
- Killjoy: Nanoswarm 1 s windup then 5 s; Turret 100 HP, 50% faster fire, 60 s after destruction, one at a
  time, no time limit; Alarmbot 50% faster; Lockdown 32.5 m, 200 HP.
- Raze: Boom Bot 60 HP; Blast Pack 50 within 2 m to 20 at 5 m; Paint Shells 2.25 s fuse, 5.5 m, bomblets
  0.67 s later, 5.25 m; Showstopper 1.4 s draw, 10 s to fire, 150 within 4 m to 30 at 7 m.
- Brimstone: Stim +10% speed; Sky Smoke 5 m radius, 55 m range; Orbital Strike 8 m, 4 s, 125/s.
- Viper: Snake Bite 12.5/s; Viper's Pit lasts while she is inside and 8 s after she leaves.
- Reyna: Leer 2 s; Devour 50 HP over 3 s (2.5 s in Empress), overheal kept 10 s (for good in Empress);
  Dismiss 1.5 s, invisible in Empress.
- Breach: Aftershock 2 x 80; Flashpoint 2.25 s, 0.5 s pop; Fault Line 1.1 s windup, 8 m wide; Rolling Thunder
  1.2 s windup, 18 m wide, 4 s concuss.
- Neon: Fast Lane 45 m, 4 s; High Gear drains 10/s.
- Yoru: Fakeout 2 s blind; Gatecrash 20 s tether; Dimensional Drift 10 s.
- Skye: Regrowth 20/s; Trailblazer 80 HP, 4 s concuss; Guiding Light 2 s flight, 1-2.25 s blind by flight.
- Cypher: Cyber Cage 3.72 m; Spycam 60 s after destruction, dart every 6 s; Neural Theft 7 points, reveals
  at 2 s and 4 s.
- Fade: Prowler 60 HP; Seize 6.58 m; Haunt eye 1.5 s; Nightfall 8 s, 20 m wide, 75 decay.
- Sage: Barrier 40 s; self heal 50 over 5 s (heals no longer overheal); Resurrection 7 points, 2 s.
- Astra: Gravity Well 1.25 s windup, 4.75 m, 2.5 s Vulnerable; Nova Pulse 2.5 s; Nebula 4.75 m, 0.75 s to
  form; Cosmic Divide rises after 2.7 s.
- Tejo: Stealth Drone pulse 16 m; Special Delivery 35 damage and 2.5 s concuss in 5.25 m; Guided Salvo
  150 x 2 (1 free), one missile per charge, 65 damage, 45 m.
- KAY/O: FRAG/ment 4 m; FLASH/drive lob 2.25 s; NULL/cmd pulses 42.5 m, 4 s suppress.
- Clove: Pick-me-up +50 overheal for 10 s, 3 s haste; Meddle 0.75 s, 90 decay; Ruse 4 m, 60 m, one 6 s
  smoke while dead; Not Dead Yet 10 s.
- Waylay: Saturate 3 s hinder; Refract beacon 8 s, travel 0.35-2 s.

Still not checked against a primary source (kept as they were): basic-ability cooldowns used in deathmatch,
Chamber's kit, Harbor's Storm Surge (our Breaker still works like the old Cascade), Neon's Relay Bolt, Iso,
and a few damage numbers the wiki pages didn't show (Turret, Incendiary length).

