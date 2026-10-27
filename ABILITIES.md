# Abilities and their timings

Every agent's kit, with the numbers the game uses. Generated from `js/abilities.js` and `js/prices.js`, so it
matches the code. Each agent is an original character whose kit mirrors one Valorant agent, ability by ability;
the Valorant names are in brackets.

## How charges come back

- **5v5 (rounds), as in Valorant.** C and Q are bought in the buy phase and never recharge on their own. Unused
  charges carry over to the next round, even through death. The signature (E) is free every round and then:
  - **recharges on its cooldown** (the *5v5 recharge* column), including the ones you can buy extra charges of
    (Shade / Dark Cover, Ruse);
  - **comes back after two kills** (Slipstream / Tailwind, Sunflare / Curveball, Splatter / Paint Shells,
    Refract), or
  - **does not come back that round** (Overcast / Sky Smoke, Toxic Wall / Toxic Screen, Missile Call / Guided Salvo).
  - Volt's slide (Neon's High Gear slide) is once a round and comes back after two kills.
- **Deathmatch.** Valorant's deathmatch has no abilities, so every ability recharges on the *Deathmatch cooldown*
  instead (like Valorant's Team Deathmatch). Charges refill on respawn.
- **Ultimates** cost the listed points. You get a point for a kill, a death, planting, defusing and each ultimate
  orb (hold F for 3 s). Points reset at halftime.
- **Picking utility back up (F):** Trapwire and Rendezvous come back at once, Spycam after 15 s, Alarmbot and
  Turret after 20 s, Trademark after 30 s, stars after 25 s; Cyber Cage and Poison Cloud only in the buy phase
  (everything comes straight back in the buy phase).

## Zephyr (Jett) · Duelist

Passive: **Drift**: Hold Space while falling to glide down slowly.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Veil** (Cloudburst) | 2 × 200 | bought only | 16 s | Throw a smoke orb that flies slowly where you look while you hold C; release C to burst it into a smoke (2.5 s). |
| Q | **Lift** (Updraft) | 1 × 150 | bought only | 9 s | After a short wind-up, launch yourself about 3.5 m straight up. |
| E | **Slipstream** (Tailwind) | 1 free | 2 kills | 12 s | Press to gather the wind (1 s); press again within 7.5 s to dash ~11 m the way you are moving. Unused, the charge is lost. In 5v5 it comes back after two kills. |
| X | **Edgestorm** (Blade Storm) | 8 points | | | Draw five throwing blades: left click throws one (150 head / 50 body), right click fans out all of them. Each kill refills the set. |

## Cinder (Phoenix) · Duelist

Passive: **Kindled**: Your own fire heals you instead of hurting you.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Firebreak** (Blaze) | 1 × 150 | bought only | 25 s | Send out a wall of flame that grows forward (8 m/s, up to 15 m). Hold C and turn to bend it. It blocks sight for 8 s, burns enemies (30/s) and heals you (12.5/s). |
| Q | **Ember** (Hot Hands) | 1 × 200 | bought only | 18 s | Hold a fireball, then left click to lob it. It leaves a 3.5 m pool of fire for 4 s (60/s to enemies; heals you). |
| E | **Sunflare** (Curveball) | 2 × 250 (1 free) | 2 kills | 14 s | Hold a flare in your hand (no gun), then left click to curve it left or right click to curve it right. It bursts around the corner, blinding anyone facing it for up to 1.5 s. In 5v5 one is free each round and two kills bring a used one back. |
| X | **Rekindle** (Run It Back) | 7 points | | | Mark where you stand. For 10 s you can fight freely: if you die, or when time runs out, you return to the mark at full health. The death does not count. |

## Umbra (Omen) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rift** (Shrouded Step) | 2 × 100 | bought only | 25 s | Hold it: a marker shows where you will land (up to 15 m) and follows your aim. Left click to go; 0.7 s later you step through the shadows to it. |
| Q | **Dread** (Paranoia) | 1 × 250 | bought only | 30 s | Send a wave of shadow straight ahead (25 m) that passes through walls, nearsighting and deafening every enemy it touches for 2 s. |
| E | **Shade** (Dark Cover) | 2 × 150 (1 free) | 40 s | 40 s | Hold the orb: your view follows the smoke out through walls, and the sphere shows exactly where it will form. It passes through walls: hold right click to push it farther (up to 80 m), press R to make it stop at the first wall instead, left click to cast. Lasts 15 s. |
| X | **Nightwalk** (From the Shadows) | 7 points | | | Open the map and click anywhere. You fade out (untouchable) while a shade of you forms there; after 4 s you step out of it. Enemies who shoot the shade first cancel it and you stay where you were. |

## Hawke (Sova) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Kestrel** (Owl Drone) | 1 × 400 | bought only | 40 s | Hold the drone, left click to launch it. Fly it with WASD and your mouse for up to 7 s while your body stands exposed (damage to your body ends it). Left click fires a tracking dart (every 5 s): an enemy it hits is revealed in two pings. |
| Q | **Arc Dart** (Shock Bolt) | 2 × 150 | bought only | 25 s | Draw the bow. Hold left click to charge (longer = farther, up to 50 m), release to fire. The dart explodes where it lands, up to 75 damage within 4 m. |
| E | **Sonar Bolt** (Recon Bolt) | 1 free | 50 s | 50 s | Draw the bow. Hold left click to charge (up to 60 m), release to fire. The bolt pulses twice, 1 s apart, revealing every enemy in its line of sight within 30 m. |
| X | **Talon Strike** (Hunter's Fury) | 8 points | | | Fire up to three map-wide energy beams within 6 s. They go through every wall, dealing 80 damage and revealing whoever they hit. |

## Bastion (Killjoy) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Hive** (Nanoswarm) | 2 × 200 | bought only | 40 s | Throw a hidden swarm grenade (15 m). Once both are out — or you have none left — press C again to detonate them: after 1 s, 45/s for 5 s in a 3 m radius. |
| Q | **Watchdog** (Alarmbot) | 1 × 200 | bought only | 40 s | Deploy an alarm bot (10 m). When an enemy comes within 6 m it chases them down and makes them Vulnerable (double damage taken) and revealed for 4 s. |
| E | **Sentry** (Turret) | 1 free | 60 s | 60 s | Deploy a turret (10 m) facing where you aim. It shoots enemies in its 180° view (7 damage a shot) until it is destroyed (60 s to get it back) or picked up (20 s). Placing a new one takes the old one down. |
| X | **Clampdown** (Lockdown) | 9 points | | | Plant a device that charges for 13 s, then detains every enemy within 32.5 m for 8 s: they cannot fire and move 60% slower. |

## Blitz (Raze) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Boomer** (Boom Bot) | 1 × 300 | bought only | 35 s | Deploy a bot that rolls forward and bounces off walls. It locks onto the first enemy in front of it and explodes for up to 80. It lasts 5 s. |
| Q | **Kicker** (Blast Pack) | 2 × 200 | bought only | 12 s | Instantly throws a satchel that sticks where it lands (12 m) and lasts 5 s. Press Q again to blow it, even while it is still in the air: it launches anyone nearby, you included, and deals 20-50 (only 5-15 in its first 1.5 s). |
| E | **Splatter** (Paint Shells) | 1 free | 2 kills | 30 s | Throw a cluster grenade (20 m): it explodes for 55, then scatters four bomblets that explode for 55 each. In 5v5 it comes back after two kills. |
| X | **Finale** (Showstopper) | 8 points | | | Pull out a rocket launcher and left click to fire one rocket within 10 s: 150 damage within 4 m, falling to 30 at 7 m. It hurts you too, so don’t fire it at your feet. |

## Granite (Brimstone) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rally** (Stim Beacon) | 1 × 200 | bought only | 30 s | Throw a beacon (10 m) that sets up a field for 12 s. You and teammates standing in it get 10% faster fire rate and 10% faster movement, lasting 4 s after you leave. |
| Q | **Napalm** (Incendiary) | 1 × 250 | bought only | 25 s | Fire an incendiary grenade (20 m) that leaves a 4.5 m fire for 7 s (60/s). |
| E | **Overcast** (Sky Smoke) | 3 × 100 (1 free) | once a round | 35 s | Open the map and click up to three spots (one per charge) for sky smokes; press E again to call them in. Each lasts 19.25 s. |
| X | **Sky Hammer** (Orbital Strike) | 8 points | | | Open the map and click a spot: after 2 s an 8 m orbital strike burns it for 4 s (125/s). |

## Venom (Viper) · Controller

Passive: **Fuel**: Gas drains fuel while on and refills while everything is off. Toxin decays enemies inside it.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Acid Vial** (Snake Bite) | 1 × 300 | bought only | 25 s | Throw a vial (20 m) that leaves a pool of acid for 6.5 s: 12.5/s and Vulnerable (double damage, so 25/s) while standing in it. |
| Q | **Miasma** (Poison Cloud) | 1 × 200 | bought only | — | Throw a gas emitter (12 m). It releases a toxic cloud; press Q again to switch the cloud off and on (uses fuel). |
| E | **Toxic Wall** (Toxic Screen) | 1 free | once a round | — | Raise a 40 m wall of toxic gas straight ahead, through walls. Press E again to switch it off and on (uses fuel). |
| X | **Nest** (Viper's Pit) | 9 points | | | Flood the area around you with a huge toxic cloud. It lasts as long as you stay inside it, and 8 s after you leave. Enemies inside are nearsighted and decaying; you can see through it and enemies inside are outlined for you. |

## Vex (Reyna) · Duelist

Passive: **Soul Harvest**: Enemies you kill drop a soul orb for 3 s.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Glare** (Leer) | 2 × 250 | bought only | 20 s | Hold the eye: a marker shows where it will go, 12 m straight ahead, through walls. Left click to cast it. Every enemy who looks at it is nearsighted. The eye lasts 2 s. |
| Q | **Feast** (Devour) | 2 × 200 (1 free) | bought only | — | Press Q to consume the nearest soul orb within 15 m: heal 50 over 3 s (2.5 s in Ravenous). You can go above 100 HP; the extra stays 10 s, then fades (it stays for good in Ravenous). Shares its 2 charges with Vanish. |
| E | **Vanish** (Dismiss) | 2 free | — | — | Press E to consume the nearest soul orb within 15 m: it pulls you along at high speed for 1.5 s, intangible (and invisible in Ravenous). Uses Feast’s charges. You steer with the mouse but can’t stop or slow down, and can’t shoot. |
| X | **Ravenous** (Empress) | 7 points | | | Enter a frenzy for 30 s: 15% faster fire rate, equip and reload, and every kill heals you 100 and resets the timer. |

## Quake (Breach) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Rubble** (Aftershock) | 1 × 200 | bought only | 25 s | Set a charge on the wall in front of you (8 m): two bursts on the far side, 80 damage each. |
| Q | **Glimmer** (Flashpoint) | 2 × 250 | bought only | 18 s | Fire a flash through the wall in front of you (8 m). It bursts on the far side after 0.5 s, blinding for 2.25 s. |
| E | **Fissure** (Fault Line) | 1 free | 50 s | 50 s | Hold left click to charge the distance (8 m up to 40 m, shown on the ground), release to send a seismic line through walls. Everyone it reaches is stunned for 2.5 s. |
| X | **Aftershock Wave** (Rolling Thunder) | 8 points | | | Unleash a huge 32 m cone of seismic force through every wall: enemies in it are knocked up and stunned for 4 s. |

## Volt (Neon) · Duelist

Passive: **Energy**: High Gear runs on energy, which drains while sprinting and slowly refills.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Static Lanes** (Fast Lane) | 1 × 300 | bought only | 25 s | Instantly fire two parallel walls of static 45 m straight ahead, through walls. They block sight for 4 s. |
| Q | **Ricochet** (Relay Bolt) | 1 × 200 | bought only | 25 s | Instantly throw a bolt that bounces off the first wall (25 m) and lands. After 1 s it shocks everyone within 5 m: stunned for 3.5 s. |
| E | **Overclock** (High Gear) | 1 free | — | — | Put your gun away and sprint (9 m/s) while energy lasts; press E again to stop. Crouch or right click mid-sprint to slide forward: the slide ends the sprint and your gun comes back out (one slide per round in 5v5, back after two kills; one every 8 s in deathmatch). |
| X | **Overload** (Overdrive) | 8 points | | | Fire a lightning beam from your fingertip: hold left click (27 body / 54 head, accurate while running and sliding). Starts your sprint with full energy and a fresh slide. Overload runs on its own meter (20 s); kills refill it and give your slide back. |

## Mirage (Yoru) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Double** (Fakeout) | 1 × 200 | bought only | 30 s | Send out a decoy of yourself that runs forward. The first enemy to look at it is blinded for 1.75 s. |
| Q | **Rebound** (Blindside) | 1 × 250 | bought only | 18 s | Throw a flash that bounces off the first wall (20 m) and bursts 0.5 s later, blinding anyone facing it for 1.5 s. |
| E | **Riftwalk** (Gatecrash) | 1 free | 30 s | 30 s | Hold the rift: left click sends it crawling forward along the ground, right click leaves it where you stand. Press E again any time in the next 20 s to teleport to it. Enemies can shoot it. |
| X | **Phase Out** (Dimensional Drift) | 8 points | | | Slip into another dimension for 10 s: enemies can’t see or hurt you, but you can’t shoot. Press X to come back early. |

## Fawn (Skye) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Bloom** (Regrowth) | 1 × 150 | bought only | 25 s | Hold C to channel: every hurt teammate you can see within 18 m heals 20 HP/s. One charge holds a 100 HP pool — let go to stop, hold C again to keep spending it. You cannot shoot while channelling, and it cannot heal you. |
| Q | **Stalker** (Trailblazer) | 1 × 300 | bought only | 40 s | Hold the tiger, left click to send it. You see through its eyes and steer with the mouse for up to 6 s. It pounces on the first enemy it gets near (or when time runs out) and dies; anyone within 4 m of the pounce takes 30 and is stunned for 3 s. |
| E | **Lantern Hawk** (Guiding Light) | 2 free | 60 s | 60 s | Hold the hawk, left click to release it; it flies slowly where you aim. Press E again to make it burst, blinding anyone facing it for 1 to 2.25 s, longer the farther it flew (it bursts on its own after 2 s). |
| X | **Hunters** (Seekers) | 8 points | | | Release three seekers that track the three closest enemies, through walls. Each one that reaches its target nearsights them for 3 s. |

## Lattice (Cypher) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Tripline** (Trapwire) | 2 × 200 | bought only | 30 s | Hold the wire, aim at a wall (6 m) and left click to stretch it across the gap at that height. An enemy who crosses it is revealed, held and then stunned for 3 s. |
| Q | **Gridlock** (Cyber Cage) | 2 × 100 | bought only | 30 s | Hold a cage, left click to place it where you aim (15 m). To trigger one, look at it and press Q: it becomes a 7.25 s smoke. Each cage is triggered separately. |
| E | **Watcher** (Spycam) | 1 free | 60 s | 60 s | Hold the camera, left click to stick it on the surface you aim at (30 m). Press E again to look through it; enemies it sees are revealed, and left click fires a tracking dart (pings every 2 s for 8 s). E again to leave. |
| X | **Mindread** (Neural Theft) | 7 points | | | Look at an enemy’s body (12 m) and press X to read their mind: every living enemy is revealed twice, 2 s apart. |

## Nyx (Fade) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Hound** (Prowler) | 2 × 250 | bought only | 25 s | Send a prowler that follows your crosshair for 2.5 s; it locks onto the first enemy it sees and nearsights them for 2.5 s. |
| Q | **Grasp** (Seize) | 1 × 200 | bought only | 25 s | Throw an orb (20 m) that bursts 0.6 s after landing: enemies within 6.6 m are held in place and deafened for 4.5 s and lose 75 health to Decay (never lethal). |
| E | **Omen Eye** (Haunt) | 1 free | 50 s | 50 s | Throw an eye (30 m) that drops and reveals every enemy in its line of sight within 30 m for 4 s. |
| X | **Terror** (Nightfall) | 8 points | | | Unleash a 40 m wave of nightmare through walls: everyone it hits is revealed and deafened for 8 s and decays (loses up to 75 health, never lethal). |

## Solace (Sage) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Frost Wall** (Barrier Orb) | 1 × 300 | bought only | 40 s | Hold the crystal: a preview shows the wall where you aim (12 m). Right click rotates it, left click raises a solid ice wall (6 m × 2.6 m) that stops bullets for 40 s. You can stand on it — raise it under yourself to boost up. |
| Q | **Chill** (Slow Orb) | 2 × 200 | bought only | 25 s | Hold the orb, left click to throw it. It shatters into a 5 m field for 7 s that slows enemies by 50%. |
| E | **Mend** (Healing Orb) | 1 free | 45 s | 45 s | Hold the healing orb. Aim at a teammate (20 m) and left click to heal them 100 HP over 5 s; aim anywhere else to heal yourself 50 HP over 5 s. |
| X | **Second Dawn** (Resurrection) | 7 points | | | Look at a fallen teammate’s body (12 m) and press X: after 2 s of channelling they rise where they fell with full health. |

## Stella (Astra) · Controller

Passive: **Stars**: You have 4 stars per life. Press E (not looking at a star) to place them on the map, then look at a star and press C, Q or E to activate it.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Gravity Well** (Gravity Well) | 1 × 150 | bought only | — | Look at one of your stars and press C: after 1.25 s it pulls nearby enemies (4.75 m) to its centre for 2 s, then makes them Vulnerable (double damage) for 2.5 s. |
| Q | **Nova Pulse** (Nova Pulse) | 1 × 150 | bought only | — | Look at one of your stars and press Q: after 1 s it bursts, stunning enemies within 4.75 m for 2.5 s. |
| E | **Astral Form** (Nebula / Dissipate) | 1 free | — | — | Press E to open the map and click to place your stars (up to the 4 you have). Look at a placed star and press E to turn it into a 14.25 s smoke (it forms 0.75 s later). |
| X | **Rift Line** (Astral Form / Cosmic Divide) | 7 points | | | Open the map and click a point: a wall of cosmic energy splits the whole map through it (along the way you face) for 21 s, after a 2.7 s windup. Nothing gets through — not bullets, not sight. |

## Regent (Chamber) · Sentinel

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Snare** (Trademark) | 1 × 200 | bought only | 30 s | Hold the trap, left click to place it on the floor (10 m). When an enemy comes within 6 m it bursts into a 5 m field that slows them by 60% for 6 s. |
| Q | **Sovereign** (Headhunter) | 8 × 100 | bought only | 30 s | Draw a heavy pistol (8 rounds; 159 to the head, right click to aim). Press Q again to holster it and keep the rest of the rounds. |
| E | **Anchor** (Rendezvous) | 1 free | — | — | Hold the anchor, left click to place it on the floor (13 m). Press E again anywhere within 50 m to teleport back to it, invulnerable while you teleport (20 s cooldown between teleports). |
| X | **Coup de Grace** (Tour De Force) | 8 points | | | Draw a custom sniper rifle (5 rounds): one hit to the body or head kills, and every kill leaves a slowing field where the target fell. Right click to scope. |

## Marina (Harbor) · Controller

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Breaker** (Cascade; Valorant now has Storm Surge here) | 1 × 200 | bought only | 30 s | Hold the water, left click to send a wave rolling forward (7 m/s) through walls for 18 m. It blocks sight and slows anyone it passes through. |
| Q | **Riptide** (High Tide) | 1 × 300 | bought only | 40 s | Send a wall of water racing forward up to 40 m, through walls. Hold Q and turn to steer it. It blocks sight and slows for 15 s. |
| E | **Lagoon** (Cove) | 1 free | 30 s | 30 s | Hold the orb, left click to throw it (20 m). It becomes a water dome 4.5 m across for 19.25 s that blocks sight and stops bullets until it takes 680 damage. |
| X | **Undertow** (Reckoning) | 7 points | | | Flood the ground ahead (30 m cone, through walls). Three geysers strike over 3 s; every enemy standing in it when one hits is stunned for 3 s. |

## Vanta (Iso) · Duelist

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Push Wall** (Contingency) | 1 × 200 | bought only | 30 s | Hold the barrier, left click to push a wall (5 m × 3 m) forward for 3.5 s. It blocks bullets and sight but players can walk through it; it stops at walls. |
| Q | **Sever** (Undercut) | 1 × 300 | bought only | 20 s | Hold the bolt, left click to fire it straight ahead 30 m, through walls. Every enemy it touches is Vulnerable (double damage) for 4 s. |
| E | **Focus** (Double Tap) | 1 free | 30 s | 30 s | After a 1 s wind-up you get a shield that blocks one hit, for 12 s. Every enemy you kill in that time drops an orb above their body for 3 s: shoot it to refresh the shield and the 12 s timer. |
| X | **Duel** (Kill Contract) | 7 points | | | Look at an enemy (any distance, through walls) and press X: you and they are pulled into a sealed arena for up to 15 s. Whoever survives is sent back. |

## Ballast (Tejo) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Scout Drone** (Stealth Drone) | 1 × 400 | bought only | 40 s | Hold the drone, left click to launch it. Fly it with your mouse for up to 6 s; left click to pulse: enemies within 16 m are revealed for 4 s and nearsighted. |
| Q | **Sticky Charge** (Special Delivery) | 1 × 200 | bought only | 25 s | Hold the charge, left click to throw it (20 m). It sticks where it lands and 1.2 s later bursts: up to 35 damage and a 2.5 s stun within 5.25 m. |
| E | **Missile Call** (Guided Salvo) | 2 × 150 (1 free) | once a round | 35 s | Open the map and mark a target per charge (2 charges, 45 m); press E (or right click) to fire. Each missile lands 1.5 s later for up to 65 damage in 4.5 m. |
| X | **Barrage** (Armageddon) | 9 points | | | Open the map and click a start point: a line of 15 explosions walks 30 m forward from it (the way you face), 150 damage each. |

## Override (KAY/O) · Initiator

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Fragment** (FRAG/ment) | 1 × 200 | bought only | 30 s | Hold the frag, left click to throw it (20 m). It sticks to the floor and pulses four times over 3 s (up to 60 per pulse, 4 m). |
| Q | **Flashpoint** (FLASH/drive) | 2 × 250 | bought only | 20 s | Hold the flash. Left click: long throw that pops after 1.6 s. Right click: short lob that pops after 0.7 s. Blinds anyone facing it for 2 s (2.25 s for the lob). |
| E | **Zero Point** (ZERO/point) | 1 free | 50 s | 50 s | Hold the knife, left click to throw it (30 m). It sticks to the first surface and after 1 s pulses 15 m: enemies caught are revealed and suppressed (no abilities) for 8 s. |
| X | **Overload** (NULL/cmd) | 8 points | | | Overload for 12 s: pulses every 2 s reveal and suppress enemies within 42.5 m for 4 s, you fire 10% faster — and if you would die, you go down instead and reboot 3 s later at full health. |

## Thistle (Clove) · Controller

Passive: **Afterlife**: Ruse (E) works even while you are dead, until the round (or your respawn) comes.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Pick-Me-Up** (Pick-Me-Up) | 1 × 200 | bought only | 30 s | Instantly absorb the life force of an enemy who died in the last 10 s that you damaged: +50 temporary health for 10 s (then it fades) and 15% haste for 3 s. |
| Q | **Meddle** (Meddle) | 1 × 250 | bought only | 25 s | Hold the fragment, left click to throw it (20 m). 0.75 s after landing it erupts in a 6 m burst: enemies caught lose 90 health to Decay (never lethal), which slowly comes back. |
| E | **Ruse** (Ruse) | 2 × 150 (1 free) | 40 s | 40 s | Open the map and click up to two spots (one per charge); press E or right click to drop smokes there (14 s; 60 m). Works while you are dead: one smoke, 6 s. |
| X | **Not Dead Yet** (Not Dead Yet) | 8 points | | | After you die, press X to come back where you fell. You then have 10 s to get a kill or damage an enemy — otherwise you die again. |

## Lumen (Waylay) · Duelist

Passive: **Refraction**: Refract comes back after two kills instead of on a timer.

| Key | Ability | 5v5 charges · price | 5v5 recharge | Deathmatch cooldown | What it does |
|---|---|---|---|---|---|
| C | **Saturate** (Saturate) | 1 × 300 | bought only | 30 s | Hold a cluster of light, left click to throw it (20 m). It bursts where it lands: every enemy within 5 m is Hindered for 3 s (30% slower, lower jumps, 20% slower fire rate). |
| Q | **Lightspeed** (Lightspeed) | 1 × 300 | bought only | 25 s | Dash twice, ~6 m each, the way you are moving: the first dash also carries you upward, the second follows 0.35 s later. |
| E | **Refract** (Refract) | 1 free | 2 kills | 2 kills | Drop a beacon of light where you stand. Press E again within 8 s to travel back to it (0.35 to 2 s, by distance), untouchable on the way. Recharges after two kills. |
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

