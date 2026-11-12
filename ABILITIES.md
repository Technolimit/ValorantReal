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
  after 20 s, Trademark after 30 s, stars after 25 s; Cyber Cage and Poison Cloud only in the buy phase
  (everything comes straight back in the buy phase).

## Zephyr (Jett) · Duelist

Passive: **Drift**: Hold Space while falling to glide down slowly.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Veil** (Cloudburst) | 2 × 200 | bought only | 16 s | Throw a smoke orb (29 m/s). Hold C and it curves toward your crosshair; let go and it falls. It bursts into a 2.5 s smoke on the first surface it touches, or after 2 s in the air. |
| Q | **Lift** (Updraft) | 1 × 150 | bought only | 9 s | Launch yourself about 5 m straight up. |
| E | **Slipstream** (Tailwind) | 1 free | 2 kills | 12 s | Press to gather the wind (1 s); press again within 7.5 s to dash ~11 m the way you are moving. Unused, the charge is lost. In 5v5 it comes back after two kills. |
| X | **Edgestorm** (Blade Storm) | 8 points | | | Draw five throwing blades: left click throws one (150 head / 50 body), right click fans out all of them. Each kill refills the set. |

## Cinder (Phoenix) · Duelist

Passive: **Kindled**: Your own fire heals you instead of hurting you.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Firebreak** (Blaze) | 1 × 150 | bought only | 25 s | Hold the flame, then left click: a wall of fire races out 13 m ahead (20 m/s). Keep the button held and turn to bend it. It stands 8 s, blocks sight, burns enemies (30/s) and heals you (up to 50). |
| Q | **Ember** (Hot Hands) | 1 × 200 | bought only | 18 s | Hold a fireball: left click throws it, right click lobs it short. It drops after 1.5 s in the air and bursts on the ground into a pool of fire that spreads to 4.5 m and burns for 4 s (60/s to enemies; heals you, up to 50). |
| E | **Sunflare** (Curveball) | 2 × 250 (1 free) | 2 kills | 14 s | Hold a flare in your hand (no gun), then left click to curve it left or right click to curve it right. It bursts around the corner 0.7 s later, blinding anyone facing it for up to 1.5 s. In 5v5 one is free each round and two kills bring a used one back. |
| X | **Rekindle** (Run It Back) | 7 points | | | Mark where you stand. For 10 s you can fight freely: if you die, or when time runs out, you return to the mark at full health. The death does not count. |

## Umbra (Omen) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rift** (Shrouded Step) | 2 × 100 | bought only | 25 s | Hold it: a marker shows where you will land (up to 15 m) and follows your aim. Left click to go; 0.7 s later you step through the shadows to it, and take another 0.5 s to arrive before you can shoot. |
| Q | **Dread** (Paranoia) | 1 × 250 | bought only | 30 s | Send a wave of shadow straight ahead (20 m/s, 25 m) that passes through walls. Everyone it touches, teammates included, is nearsighted and deafened for 2 s. |
| E | **Shade** (Dark Cover) | 2 × 150 (1 free) | 40 s | 40 s | Hold the orb: your view follows the smoke out through walls, and the sphere shows exactly where it will form. It passes through walls: hold right click to push it farther (up to 80 m), press R to make it stop at the first wall instead, left click to cast. The orb flies there at 64 m/s and the smoke lasts 14.7 s. |
| X | **Nightwalk** (From the Shadows) | 7 points | | | Open the map and click anywhere. You fade out (untouchable) while a shade of you forms there; after 4 s you step out of it. Enemies who shoot the shade first cancel it and you stay where you were. |

## Hawke (Sova) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Kestrel** (Owl Drone) | 1 × 400 | bought only | 40 s | Hold the drone, left click to launch it. Fly it with WASD and your mouse for up to 7 s while your body stands exposed (damage to your body ends it). Left click fires a tracking dart (every 5 s): an enemy it hits is revealed in two pings. |
| Q | **Arc Dart** (Shock Bolt) | 2 × 150 | bought only | 25 s | Draw the bow. Hold left click to charge (three bars over 1 s: each one flies faster and flatter), release to fire. Right click sets 0, 1 or 2 bounces. The dart explodes where it ends up: 75 damage within 1.5 m, down to 30 at 4 m. |
| E | **Sonar Bolt** (Recon Bolt) | 1 free | 50 s | 50 s | Draw the bow. Hold left click to charge (three bars over 1 s), release to fire; right click sets 0, 1 or 2 bounces. The bolt sticks where it lands and pulses twice (0.7 s after landing, then 1.6 s later), revealing every enemy in its line of sight within 30 m. Enemies can shoot it out (20 HP). |
| X | **Talon Strike** (Hunter's Fury) | 8 points | | | Fire up to three map-wide energy beams within 6 s. They go through every wall, dealing 80 damage and revealing whoever they hit. |

## Bastion (Killjoy) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Hive** (Nanoswarm) | 2 × 200 | bought only | 40 s | Throw a swarm grenade (left click) or lob it short (right click); it hides where it lands. Once both are out — or you have none left — press C again to set them off: 0.5 s later, 45/s for 5 s in a 4.5 m radius. |
| Q | **Watchdog** (Alarmbot) | 1 × 200 | bought only | 40 s | Deploy an alarm bot (10 m); it takes 1.5 s to dig in. When an enemy comes within 6 m it chases them and bursts 2.5 m from them: Vulnerable (double damage taken) for 4 s. It switches off while you are more than 40 m away. |
| E | **Sentry** (Turret) | 1 free | 45 s | 45 s | Deploy a turret (4.5 m) facing where you aim. It fires three-round bursts at enemies in its 100° view out to 40 m (8 damage a shot up close, 6 past 20 m, 4 past 35 m; hits slow) until it is destroyed (45 s to get it back) or picked up (20 s). It switches off while you are more than 40 m away. Placing a new one takes the old one down. |
| X | **Clampdown** (Lockdown) | 9 points | | | Plant a device that charges for 13 s, then detains every enemy within 32.5 m for 8 s: they cannot fire and move 60% slower. |

## Blitz (Raze) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Boomer** (Boom Bot) | 1 × 300 | bought only | 35 s | Deploy a bot that unpacks for 0.5 s, then rolls forward and bounces off walls. It locks onto the first enemy it sees ahead within 15 m and explodes 2.5 m from them: 80 within 2 m, down to 30 at 6 m. It lasts 5 s and has 60 HP. |
| Q | **Kicker** (Blast Pack) | 2 × 200 | bought only | 12 s | Instantly throws a satchel (16.5 m/s) that sticks to the first thing it hits. Press Q again to blow it, even while it is still in the air; it goes off by itself after 5 s. It launches anyone nearby, you included. Once armed (1.5 s) it also deals 50 within 1.5 m, down to 10 at 5 m, never to you. Enemies can shoot it (20 HP). |
| E | **Splatter** (Paint Shells) | 1 free | 2 kills | 30 s | Throw a cluster grenade (left click) or lob it short (right click). It bounces, and 2 s after the throw explodes (55 within 2.5 m, down to 1 at 5.5 m), tossing out four bomblets that go off for 55 each. In 5v5 it comes back after two kills. |
| X | **Finale** (Showstopper) | 8 points | | | Pull out a rocket launcher and left click to fire one rocket within 10 s: 150 damage within 4 m, falling to 30 at 7 m. It hurts you too, so don’t fire it at your feet. |

## Granite (Brimstone) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rally** (Stim Beacon) | 1 × 200 | bought only | 30 s | Instantly toss a beacon that sets up a 6 m field for 12 s where it lands. You and teammates in it get Combat Stim (10% faster fire rate, reload, draw and recovery) and 10% faster movement, lasting 4 s after you leave. |
| Q | **Napalm** (Incendiary) | 1 × 250 | bought only | 25 s | Fire an incendiary grenade from the launcher (29 m/s). It bounces off walls and bursts on the floor into a fire that spreads to 4.5 m and burns for 7 s (60/s). |
| E | **Overcast** (Sky Smoke) | 3 × 100 (1 free) | once a round | 35 s | Open the map and click up to three spots (one per charge) for sky smokes; press E again to call them in. Each lasts 19.25 s. |
| X | **Sky Hammer** (Orbital Strike) | 8 points | | | Open the map and click a spot: after 2 s an 8 m orbital strike burns it for 4 s (125/s). |

## Venom (Viper) · Controller

Passive: **Fuel**: Gas drains fuel while on and refills while everything is off. Toxin decays enemies inside it.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Acid Vial** (Snake Bite) | 2 × 300 | bought only | 25 s | Launch a vial (29 m/s) that bursts on the floor into a 4.5 m pool of acid for 6.5 s: 12.5/s, and Vulnerable (double damage, so 25/s) while you stand in it and for 2 s after. |
| Q | **Miasma** (Poison Cloud) | 1 × 200 | bought only | — | Throw a gas emitter (left click) or lob it short (right click). Where it lands it releases a 4.5 m toxic cloud; press Q again to switch the cloud off and on (uses fuel; 5.5 s before it can come back on). |
| E | **Toxic Wall** (Toxic Screen) | 1 free | once a round | — | Fire a line of emitters straight ahead, through walls, up to 60 m (one every 2 m). A second later they raise a wall of toxic gas 6.75 m high. Press E again to switch it off and on (uses fuel; 5 s before it can come back on). |
| X | **Nest** (Viper's Pit) | 9 points | | | Flood the area around you with a huge toxic cloud. It lasts as long as you stay inside it, and 8 s after you leave. Enemies inside are nearsighted and decaying; you can see through it and enemies inside are outlined for you. |

## Vex (Reyna) · Duelist

Passive: **Soul Harvest**: An enemy who dies within 3 s of taking your damage drops a soul orb for 3 s.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Glare** (Leer) | 2 × 250 | bought only | 20 s | Hold the eye: a marker shows where it will go, 10 m straight ahead, through walls. Left click to cast it (22.5 m/s). It opens 0.4 s after it arrives and nearsights every enemy who looks at it for the 2 s it lasts. Enemies can shoot it out (60 HP). |
| Q | **Feast** (Devour) | 2 × 200 (1 free) | bought only | — | Press Q to consume your nearest soul orb, at any distance: heal 50 over 3 s. You can go above 100 HP; the extra stays 10 s, then fades. In Ravenous every kill does this by itself (over 2.5 s), leaves the orb for Vanish, and the extra health stays. Shares its 2 charges with Vanish. |
| E | **Vanish** (Dismiss) | 2 free | — | — | Press E to consume your nearest soul orb, at any distance: for 1.5 s you’re intangible (and invisible in Ravenous) and move much faster in any direction, but can’t use your gun. Uses Feast’s charges; in Ravenous it costs none. |
| X | **Ravenous** (Empress) | 7 points | | | Enter a frenzy for 30 s: 15% faster fire rate, equip and reload, and every kill heals you 100 and resets the timer. |

## Quake (Breach) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rubble** (Aftershock) | 1 × 200 | bought only | 25 s | Fire a charge at a wall up to 35 m ahead (25 m/s). 2.2 s later it blasts the far side three times, 0.6 s apart: 80 damage each to everyone in a strip 10 m deep and 6 m wide behind the wall. |
| Q | **Glimmer** (Flashpoint) | 2 × 250 | bought only | 18 s | Fire a flash charge at a wall up to 35 m ahead (24 m/s). It passes through and bursts on the far side 0.5 s later, blinding for up to 2.25 s. |
| E | **Fissure** (Fault Line) | 1 free | 50 s | 50 s | Hold left click to charge its length (8 m up to 56 m over 1 s, shown on the ground; you move slower while you charge), release to send a seismic line through walls. It starts 8 m ahead of you, is 8 m wide, and 1.1 s later concusses everyone on it for 2.5 s. |
| X | **Aftershock Wave** (Rolling Thunder) | 8 points | | | Unleash a huge 32 m cone of seismic force through every wall: enemies in it are knocked up and stunned for 4 s. |

## Volt (Neon) · Duelist

Passive: **Energy**: Overclock runs on energy: a full bar is 16 s of sprinting and takes 60 s to refill.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Static Lanes** (Fast Lane) | 1 × 300 | bought only | 25 s | Instantly fire two parallel walls of static, 3.5 m apart and 6.75 m high, from 1.5 m behind you to 45 m ahead, through walls. They block sight for 4 s. |
| Q | **Ricochet** (Relay Bolt) | 1 × 200 | bought only | 25 s | Instantly throw a bolt (41 m/s) that bounces once. At each of the two surfaces it hits it charges the ground below, and 1 s later everyone within 5 m of that spot is concussed for 2.5 s. |
| E | **Overclock** (High Gear) | 1 free | — | — | Put your gun away and sprint (9.1 m/s) while energy lasts; press E again to stop. Right click mid-sprint, while moving, to slide 7 m (12 m/s for 0.6 s): the slide ends the sprint and your gun comes back out (one slide per round in 5v5, back after two kills; one every 8 s in deathmatch). |
| X | **Overload** (Overdrive) | 8 points | | | Fire a lightning beam from your fingertip: hold left click (27 body / 54 head, accurate while running and sliding). Starts your sprint with full energy and a fresh slide. Overload runs on its own meter (20 s); kills refill it and give your slide back. |

## Mirage (Yoru) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Double** (Fakeout) | 1 × 200 | bought only | 30 s | Send out a decoy of yourself that walks forward for 10 s. An enemy who shoots it sets it off: it bursts into a flash that blinds for up to 2 s. |
| Q | **Rebound** (Blindside) | 1 × 250 | bought only | 18 s | Throw a flash (29 m/s) that bounces off the first surface it hits and bursts 0.7 s later (or 2 s after the throw if it hits nothing), blinding anyone facing it for up to 1.5 s. |
| E | **Riftwalk** (Gatecrash) | 2 × 150 (1 free) | 2 kills | 30 s | Hold the rift: left click sends it along the ground (8 m/s), right click leaves it where you stand. Press E again any time in the next 20 s to teleport to it (0.5 s, untouchable on the way). Enemies can shoot it (60 HP). In 5v5 one is free each round, a second costs 150, and two kills bring a used one back. |
| X | **Phase Out** (Dimensional Drift) | 8 points | | | Slip into another dimension for 10 s: enemies can’t see or hurt you, but you can’t shoot. Press X to come back early. |

## Fawn (Skye) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Bloom** (Regrowth) | 1 × 150 | bought only | 25 s | Hold C to channel: every hurt teammate you can see within 18 m heals 20 HP/s. One charge holds a 100 HP pool — let go to stop, hold C again to keep spending it. You cannot shoot while channelling, and it cannot heal you. |
| Q | **Stalker** (Trailblazer) | 1 × 300 | bought only | 40 s | Hold the tiger, left click to send it. You see through its eyes and steer with the mouse for up to 6 s (6.4 m/s, 80 HP). Left click makes it leap up to 12 m: the first enemy it hits takes 30, and everyone within 3.5 m of where it lands is concussed for up to 4 s. |
| E | **Lantern Hawk** (Guiding Light) | 2 × 250 (1 free) | 50 s | 50 s | Hold the hawk, left click to release it; it flies where you aim (18 m/s, 60 HP). Press E again to make it burst 0.3 s later, blinding anyone facing it for 1 to 2.25 s: the full time once it has flown 0.75 s (it bursts on its own after 2 s). In 5v5 one is free each round and a second costs 250. |
| X | **Hunters** (Seekers) | 8 points | | | Release three seekers that track the three closest enemies, through walls. Each one that reaches its target nearsights them for 3 s. |

## Lattice (Cypher) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Tripline** (Trapwire) | 2 × 200 | bought only | 30 s | Hold the wire, aim at a wall (up to 20 m) and left click to stretch it across the gap at that height (up to 15 m); it arms 1.5 s later. An enemy who crosses it is tethered and slowed by half. 0.7 s later it zaps them: slowed for another second and revealed for as long as it holds them. Tearing free (6.2 m) costs a zap too; shooting the wire (20 HP) frees them. It resets and can catch again. |
| Q | **Gridlock** (Cyber Cage) | 2 × 100 | bought only | 30 s | Hold a cage, left click to place it where you aim (15 m). To trigger one, look at it and press Q: it becomes a 7.25 s smoke. Each cage is triggered separately. |
| E | **Watcher** (Spycam) | 1 free | 45 s | 45 s | Hold the camera, left click to stick it on the surface you aim at (20 m). Press E again to look through it; enemies it sees are revealed, and left click fires a tracking dart (pings every 2 s for 8 s). E again to leave. One shot destroys it (45 s to get it back; 20 s if you pick it up). |
| X | **Mindread** (Neural Theft) | 7 points | | | Look at an enemy’s body (12 m) and press X to read their mind: every living enemy is revealed twice, 2 s apart. |

## Nyx (Fade) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Hound** (Prowler) | 2 × 250 | bought only | 25 s | Send a prowler (10 m/s, 60 HP) that follows your crosshair for 2.5 s. It chases the first enemy it sees within 15 m, or one marked by a terror trail, and bites from 2.5 m: nearsighted for 2.75 s. |
| Q | **Grasp** (Seize) | 1 × 200 | bought only | 25 s | Throw an orb. It drops straight down after 1.5 s in the air, or when you press Q again, and bursts 0.7 s after landing: enemies within 6.6 m are held in place and deafened for 4.5 s and lose 75 health to Decay (never lethal; it comes back over 5 s). |
| E | **Omen Eye** (Haunt) | 1 free | 50 s | 50 s | Throw an eye. It drops straight down after 1.5 s in the air, or when you press E again, and opens where it lands: for 1.5 s every enemy in its line of sight within 30 m is revealed and marked with a terror trail for 12 s, which prowlers follow. One shot destroys it. |
| X | **Terror** (Nightfall) | 8 points | | | Unleash a 40 m wave of nightmare through walls: everyone it hits is revealed and deafened for 8 s and decays (loses up to 75 health, never lethal). |

## Solace (Sage) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Frost Wall** (Barrier Orb) | 1 × 300 | bought only | 40 s | Hold the crystal: a preview shows the wall where you aim (15 m). Right click rotates it, left click raises a solid ice wall of four pieces (10.4 m × 2.6 m) for 40 s. Each piece has 400 HP, hardening to 600 after 2 s, and enemies can shoot it down. You can stand on it — raise it under yourself to boost up. |
| Q | **Chill** (Slow Orb) | 2 × 200 | bought only | 25 s | Hold the orb, left click to throw it (29 m/s). It shatters on the floor into a field up to 9 m across the ground for 7 s that slows enemies by 50%. |
| E | **Mend** (Healing Orb) | 1 free | 45 s | 45 s | Hold the healing orb. Aim at a teammate you can see (20 m) and left click to heal them 60 HP over 5 s (30 s cooldown); aim anywhere else to heal yourself 100 HP over 5 s (45 s cooldown). |
| X | **Second Dawn** (Resurrection) | 7 points | | | Look at a fallen teammate’s body (12 m) and press X: after 2 s of channelling they rise where they fell with full health. |

## Stella (Astra) · Controller

Passive: **Stars**: You have up to 5 stars (in 5v5 one is free each round and more cost 150). Press E (not looking at a star) to place them on the map, then look at a star and press C, Q or E to turn it into that ability. Each ability has its own charges: Gravity Well and Nova Pulse one each (60 s to come back), Nebula two (35 s each).

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Gravity Well** (Gravity Well) | 1 free | 60 s | 60 s | Look at one of your stars and press C: after 1.25 s it pulls nearby enemies (4.75 m) to its centre for 2 s, then makes them Vulnerable (double damage) for 2.5 s. One charge, back after 60 s. |
| Q | **Nova Pulse** (Nova Pulse) | 1 free | 60 s | 60 s | Look at one of your stars and press Q: after 1 s it bursts, concussing enemies within 5.25 m for 2.5 s. One charge, back after 60 s. |
| E | **Astral Form** (Nebula / Dissipate) | 5 × 150 (1 free) | — | — | Press E to open the map and click to place your stars (as many as you have). Look at a placed star and press E to turn it into a Nebula: a 14.25 s smoke that forms 0.75 s later (two charges, 35 s each to come back). Pick a star back up (F) and it leaves a 1.75 s fake smoke; the star returns after 25 s. |
| X | **Rift Line** (Astral Form / Cosmic Divide) | 7 points | | | Open the map and click a point: a wall of cosmic energy splits the whole map through it (along the way you face) for 21 s, after a 2.7 s windup. Nothing gets through — not bullets, not sight. |

## Regent (Chamber) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Snare** (Trademark) | 1 × 200 | bought only | 30 s | Hold the trap, left click to place it on the floor (12 m); it arms after 2 s. When it sees an enemy within 10 m, 0.9 s later the ground around it breaks into a 6 m field that slows by half for 6 s. It resets 10 s later. Enemies can shoot it (20 HP). |
| Q | **Sovereign** (Headhunter) | 8 × 100 | bought only | 30 s | Draw a heavy pistol (8 rounds; 159 to the head, right click to aim). Press Q again to holster it and keep the rest of the rounds. |
| E | **Anchor** (Rendezvous) | 1 free | — | — | Hold the anchor, left click to place it on the floor (8.5 m). Press E again anywhere within 18 m of it to teleport back (1.3 s, invulnerable on the way; 30 s cooldown between teleports). Enemies can shoot it (50 HP). |
| X | **Coup de Grace** (Tour De Force) | 8 points | | | Draw a custom sniper rifle (5 rounds): one hit to the body or head kills, and every kill leaves a slowing field where the target fell. Right click to scope. |

## Marina (Harbor) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Squall** (Storm Surge) | 1 × 200 | bought only | 30 s | Hold the water, left click to throw it (29 m/s). It bursts into a whirlpool where it lands, and 0.6 s later every enemy within 6 m is nearsighted for 2 s, seen or not. |
| Q | **Riptide** (High Tide) | 1 × 300 | bought only | 40 s | Hold the water, then left click: a wall of water 8 m high races forward along the ground (20 m/s, up to 60 m), through walls. Keep the button held and turn to steer it; right click stops it early. It stands 15 s, blocks sight and slows whoever crosses it. |
| E | **Lagoon** (Cove) | 1 free | 30 s | 30 s | Hold the orb, left click to send it to the spot you aim at (64 m/s, up to 80 m). It becomes a water dome 9.2 m across for 19.25 s that blocks sight; 0.8 s later its shell forms and stops bullets until it takes 680 damage. |
| X | **Undertow** (Reckoning) | 7 points | | | Flood the ground ahead (30 m cone, through walls). Three geysers strike over 3 s; every enemy standing in it when one hits is stunned for 3 s. |

## Vanta (Iso) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Push Wall** (Contingency) | 1 × 200 | bought only | 30 s | Hold the barrier: left click pushes a wall (5.2 m × 3 m) forward at 3.6 m/s for 3.5 s, right click at half that speed. It blocks bullets and sight and can’t be broken, but players can walk through it; it stops at walls. |
| Q | **Sever** (Undercut) | 1 × 300 | bought only | 20 s | Hold the bolt, left click to fire it straight ahead (22.5 m/s, 29.5 m), through walls. Every enemy within 3 m of it as it passes is Vulnerable (double damage) for 4 s. |
| E | **Focus** (Double Tap) | 1 free | 30 s | 30 s | After a 1 s wind-up you get a shield that blocks one hit, for 12 s. Every enemy you kill in that time drops an orb above their body for 3 s: shoot it to refresh the shield and the 12 s timer. |
| X | **Duel** (Kill Contract) | 7 points | | | Look at an enemy (any distance, through walls) and press X: you and they are pulled into a sealed arena for up to 15 s. Whoever survives is sent back. |

## Ballast (Tejo) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Scout Drone** (Stealth Drone) | 1 × 400 | bought only | 40 s | Hold the drone, left click to launch it. Fly it with your mouse for up to 6 s (7.5 m/s, 42 HP). Left click pulses (from 0.6 s after launch, then every 1.5 s): enemies within 16 m are revealed and suppressed (no abilities) for 8 s. |
| Q | **Sticky Charge** (Special Delivery) | 1 × 200 | bought only | 25 s | Hold the charge: left click throws it (41 m/s) to stick to the first thing it hits, right click lets it bounce once first. 0.8 s after it sticks it bursts: 35 damage within 1.25 m, down to 20 at 5.25 m, and everyone caught is concussed for 2.5 s. |
| E | **Missile Call** (Guided Salvo) | 2 × 150 (1 free) | once a round | 35 s | Open the map and mark a target per charge (2 charges, 45 m); press E (or right click) to fire. Each missile comes down 1.5 s later and goes off three times, half a second apart: 65 within 2.5 m, down to 50 at 4.5 m, each time. |
| X | **Barrage** (Armageddon) | 9 points | | | Open the map and click a start point: a line of 15 explosions walks 30 m forward from it (the way you face), 150 damage each. |

## Override (KAY/O) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Fragment** (FRAG/ment) | 1 × 200 | bought only | 30 s | Hold the frag, left click to throw it (18 m/s). It bounces off walls and sticks to the floor; 0.5 s later it goes off four times, a second apart: 60 within 1 m, down to 25 at 4 m, each time. |
| Q | **Flashpoint** (FLASH/drive) | 2 × 250 | bought only | 20 s | Hold the flash. Left click: overhand throw that pops 1.6 s later. Right click: underhand lob that pops after 1 s. If it bounces off something first, it pops 0.8 s after the bounce. Blinds anyone facing it for up to 2.25 s. |
| E | **Zero Point** (ZERO/point) | 1 free | 50 s | 50 s | Hold the knife, left click to throw it (30 m). It sticks to the first surface and after 1 s pulses 15 m: enemies caught are revealed and suppressed (no abilities) for 8 s. Enemies can shoot it out first (20 HP). |
| X | **Overload** (NULL/cmd) | 8 points | | | Overload for 12 s: pulses every 2 s reveal and suppress enemies within 42.5 m for 4 s, you fire 10% faster — and if you would die, you go down instead and reboot 3 s later at full health. |

## Thistle (Clove) · Controller

Passive: **Afterlife**: Ruse (E) works even while you are dead, until the round (or your respawn) comes.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Pick-Me-Up** (Pick-Me-Up) | 1 × 200 | bought only | 30 s | Absorb the life force of an enemy you killed or damaged who died in the last 6 s. It takes 0.7 s, then gives +50 temporary health (it lasts 10 s, then fades) and 10% haste for 3 s. |
| Q | **Meddle** (Meddle) | 1 × 250 | bought only | 25 s | Hold the fragment, left click to throw it (29 m/s). 0.75 s after it lands it erupts in a 4 m burst: enemies caught lose 90 health to Decay (never lethal), which comes back over 5 s. |
| E | **Ruse** (Ruse) | 2 × 150 (1 free) | 40 s | 40 s | Open the map and click up to two spots (one per charge, within 55 m); press E or right click to drop smokes there 1 s later (13.5 s). Works while you are dead: one smoke, 5.5 s, within 42.5 m. |
| X | **Not Dead Yet** (Not Dead Yet) | 8 points | | | After you die, press X to come back where you fell. You then have 10 s to get a kill or damage an enemy — otherwise you die again. |

## Lumen (Waylay) · Duelist

Passive: **Refraction**: Refract comes back after two kills instead of on a timer.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Saturate** (Saturate) | 1 × 300 | bought only | 30 s | Hold a cluster of light, left click to throw it (29 m/s). It drops straight down after 1 s in the air and bursts where it lands: everyone within 6 m, you and teammates included, is Hindered for 3 s (30% slower, lower jumps, 20% slower fire rate). |
| Q | **Lightspeed** (Lightspeed) | 1 × 300 | bought only | 25 s | Hold the light: left click dashes twice, right click once. Each dash is about 9 m in 0.45 s, the way you are moving; the first also carries you upward. |
| E | **Refract** (Refract) | 1 free | 2 kills | 2 kills | Drop a beacon of light where you stand. From 1 s later, and within 8 s, press E again to travel back to it (0.35 s from 2.5 m away up to 2 s from 50 m). You are untouchable on the way but can barely see. Recharges after two kills. |
| X | **Convergent Paths** (Convergent Paths) | 8 points | | | Focus your light and cast a beam 36 m ahead, through walls. Casting briefly slows your aim and movement. After 1 s the beam expands to 13.5 m wide: everyone in it is Hindered for 6 s, and you gain 10% speed for 7 s. |

## Sources

The numbers come from [VALORANT_SPECS.md](VALORANT_SPECS.md), the patch 13.10 ability spec: equip times,
projectile speeds and gravity, radii, durations, damage, health of destructible utility, cooldowns and charges.
Prices are the wiki's ability list (`js/prices.js`). Where the spec gives no number, the value from the earlier
wiki passes (October 2026) stays.

Thrown abilities fly as real projectiles with the spec's five trajectory classes (speed in m/s, gravity as a
share of 9.8 m/s²): lob 6.3 / 0.3, class 1 16.5 / 0.7, class 2 18 / 0.3, class 3 29 / 0.45, classes 4 and 5
41.25 / 0.3 and 0.15.

Where the spec was unclear or says two things, this is what the game does:

- Chill (Slow Orb) covers a 9 m radius (the spec says "up to 9 m").
- Fissure (Fault Line) and Aftershock Wave (Rolling Thunder) start 8 m in front of you.
- Hive (Nanoswarm) damages within 4.5 m; the 5.25 m in the spec is treated as its detection range.
- Ember and Acid Vial (Hot Hands, Snake Bite) use the 4.5 m radius from the table, not "8 m wide".
- Kicker (Blast Pack) deals 50 within 1.5 m, down to 10 at its edge.
- Sunflare (Curveball) keeps its short curved path; only the 0.7 s timing was taken.
- Frost Wall (Barrier Orb) keeps its 2.6 m height.
- Barrage (Armageddon) starts 3.08 s after the cast, worked out from the spec's 8 s total.
- Movement speeds are still per weapon; the spec's flat 5.6 m/s walk is not used.
- Vex can still take a soul orb at any distance (issue #37), which Valorant does not allow.
- Shade (Dark Cover) keeps its controls, Sonar Bolt its reveal length and star recall its 25 s.

Agents in the spec that Tapfire does not have (Hush, Gekko, Miks, Deadlock, Vyse, Veto) were not added.
