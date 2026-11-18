# Differences from Valorant

Where a Tapfire agent's kit still works differently from the Valorant agent it mirrors.

The earlier version of this file listed every difference found against patch 13.09. That list was worked
through when the patch 13.10 spec ([VALORANT_SPECS.md](VALORANT_SPECS.md)) was applied: equip times, real
projectile flight, destructible utility and its health, Decay, flash and concuss curves, ranges, durations,
damage, cooldowns and charges now come from the spec. The current numbers are in [ABILITIES.md](ABILITIES.md).

What is left is below. Every ability was also played through the game's controls and measured against the
spec; see [Measured in game](#measured-in-game).

## Kept on purpose

- **Deathmatch has abilities.** Every ability gets its own cooldown there. Valorant's deathmatch has none.
- **Movement speed** depends on the weapon you hold. The spec's flat 5.6 m/s walk is not used.
- **Vex (Reyna)** can take a soul orb at any distance and without seeing it (issue #37). In Valorant the orb
  has to be in range and in sight.
- **Shade (Dark Cover)** keeps Tapfire's controls: the view follows the orb, right click pushes it farther,
  R makes it stop at walls.
- **Missing agents.** Hush, Gekko, Miks, Deadlock, Vyse and Veto are in the spec and have no Tapfire counterpart.
- **Names and looks.** Agents, abilities and weapons have their own names and models.

## Changed at the request of issues #77 and #78

These follow what the issues asked, where Valorant's own behaviour is uncertain or the spec's file value felt wrong
in play:

- **Fast Lane and High Gear (Static Lanes, Overclock)** are instant. Valorant's text for High Gear starts with
  "INSTANTLY"; the spec lists a 0.6 s equip and a 0.3 s cast.
- **Curveball (Sunflare)** pops 0.5 s after the throw, about 8 m along its curve. The spec: 0.7 s at 20 m/s (14 m).
- **ZERO/point (Zero Point)** only suppresses; it no longer reveals the enemies it catches.
- **Neon's slide** brings your best gun out at once and is as accurate as standing still.
- **Blast Pack (Kicker)** knocks back out to 5 m, 14 m/s sideways and 8.5 m/s up, leaning toward the way you were
  moving. The spec estimates 12 m/s with 8.5 up, replacing your velocity.
- **Paint Shells (Splatter)** fly a higher arc under more gravity (x0.5, not x0.3) and lose most of their speed when
  they land.
- **The Phantom** no longer loses damage past 30 m. Since Valorant patch 9.10 it has two bands: 156 / 39 / 33
  out to 20 m and 140 / 35 / 29 beyond. Tapfire had the older three bands (the last one 124 / 31 / 26 past 30 m).
- **Kept as Valorant has it:** Showstopper's damage still falls off to 30 at 7 m (the spec's 4.5 / 7 m).
- **Not done:**
  - The maps have no breakable walls for Missile Call to break, so its missiles fly around walls instead.
  - Iso's right click (Contingency at half speed) works in testing; the issue doesn't say which part fails.

## Changed at the request of issue #81

Issue #81 asked for these. Several go against Valorant on purpose; the current numbers are in
[ABILITIES.md](ABILITIES.md).

- **Guns.**
  - Wallbangs cost thickness × material density: wood and crates 0.6, ordinary walls 1, stone and concrete 1.25,
    metal 1.6, grates 0.3. Where two boxes overlap, as at a corner, that stretch is paid once.
  - A headshot, or a shot that kills, carries on to the enemy behind.
  - The Marshal and Operator drop out of the scope after each shot, the Outlaw once both barrels are fired.
- **Ultimates you can put away.** Finale, Talon Strike and Coup de Grace can be put away (X or switching weapons)
  and taken out again; their timers keep running. Finale shows its time left.
- **Buy phase (5v5).**
  - Abilities that aren't allowed can't even be taken out.
  - A signature on a cooldown comes back after 3 s.
  - The issue's wording ("used … with consuming its charge") was read literally: allowed abilities still spend
    their charge. Free charges would let sentinels place unlimited traps before the round.
- **Placed signatures.**
  - Sentry, Watcher and Anchor start no cooldown while they stand. Picked up, they come back 25 s later;
    destroyed, 45 s later.
  - Bastion holds E or Q to call her turret or alarm bot back from anywhere.
  - Lattice picks up his wire, camera and cages from any distance with no wall in between.
- **Smokes and mollies.**
  - Smokes placed on the map sit on the ground, their centre 0.3 m up.
  - Floor patches cover steps, boxes and ledges (2 m up, 2.5 m down), and only walls over 0.5 m thick stop them.
  - Hive burns a half dome through everything.
- **Duelists.**
  - Volt: the slide ignores WASD and jump.
  - Cinder: Sunflare follows a set curve laid along where you look and bounces off walls (twice). Firebreak is
    20 m long, still out in about 0.67 s.
  - Mirage: Double and Riftwalk work during Phase Out.
  - Vanta: Duel is an area 14 × 40 m that takes the closest enemy in it 0.8 s after the cast, not a travelling
    column.
  - Lumen: Convergent Paths takes two steps, with its strip shown; Lightspeed pauses 0.3 s between dashes.
- **Controllers.**
  - Umbra: Dread is drawn as a round disc.
  - Granite: Napalm skips along the ground and bursts 0.25 s after it settles.
  - Marina: Lagoon is placed like Shade; Undertow's wave is 10 m high.
  - Thistle: Pick-Me-Up gives 15% haste (was 10%).
- **Initiators.**
  - Hawke: Arc Dart waits 0.35 s before it goes off. Talon Strike has its own bow, and each shot can be nudged
    8° during its 0.4 s wind-up.
  - Quake: Rubble and Glimmer find the wall along your aim and treat touching boxes as one wall.
  - Nyx: Seize holds without revealing, with a line to each one held. Haunt reveals what it sees the whole time
    it is open. Terror trails show her team a line back to her.
  - Nyx's prowlers follow a trail at any range, float, hop up boxes only while chasing, and stop their clock
    while chasing (as a Boomer does).
  - Ballast: the Scout Drone is driven like a player (silent while creeping, Space jumps, left click hops and
    pulses). Missile Call's blasts are 0.3 s after landing, then 0.7 s apart. Sticky Charge drops more.
  - Override: Zero Point is thrown like a knife and tells the team who it caught. Downed in Overload, the 850 no
    longer drains away.
- **Sentinels.**
  - Solace: Frost Wall is 1.2 m thick and opaque, turns to any angle while right click is held, and anyone can
    shoot it down. Vanta's Push Wall is opaque too.
  - Lattice: cages are thrown at once and set off with F through walls, and enemies passing through the smoke are
    revealed. Watcher only reveals with its dart. Tripline slows on the spot. Cages and Hives show their owner an
    icon through walls.
  - Regent: Coup de Grace fires 1.6 rounds a second and is ready 1 s after the cast. Sovereign shows one pip per
    round.
- **Not done or unclear.**
  - Deadlock and Vyse aren't in Tapfire.
  - Venom's Q and E already toggle from anywhere without looking at the gas; nothing was changed there.
  - "His sticky grenade has to have more gravity" sits in the Sage item, and Sage has no sticky grenade. Tejo's
    Sticky Charge was made heavier, as asked later in the issue.
  - Smokes already differ in size by agent (Omen 4.1 m, Brimstone 4.15, Astra 4.75, Harbor 4.6, Clove 4, Viper
    4.5, Jett 3.35).

## Changed at the request of issue #84

- **Custom game.** A Custom entry in the queue sets the rules (deathmatch or 5v5), the lobby size, how many are
  bots, what the bots do, and cheats for you: infinite money, infinite abilities, ultimate always ready, infinite
  ammo, can't die. Offline only.
- **Abilities reach teammates.** Harmful effects catch the owner's teammates in range too, and ability damage
  hits them for a third. Reveals, trails, suppression, target-seeking gadgets and Clampdown stay enemy-only. A
  teammate killed by your ability gives no credit.
- **Duelists.**
  - Zephyr: Slipstream is 11 m in 0.3 s in a level line; Drift falls at 1.5 m/s; Veil steers faster; the rest of
    her kit works during Edgestorm.
  - Cinder: Firebreak turns faster; Rekindle brings him back in 1 s; Sunflare flies about 5.7 m.
- **Controllers.**
  - Umbra and Marina: Shade and Lagoon aim at any height, sink slowly to the ground if placed in the air, come
    closer while E is held, and are put away by switching weapons.
  - Marina: Lagoon's shell goes up only on a second E press.
  - Granite and Thistle: Overcast and Ruse place a smoke on each click; E or right click only closes the map.
    Rally's stim and haste show as a timer.
  - Venom: Nest spreads to 14 m.
- **Initiators.**
  - Hawke: C again leaves Kestrel.
  - Quake: Aftershock Wave throws people up and back further; Rubble's blast is a 10 m cylinder along your aim.
  - Fawn: Stalker is driven like the Scout Drone. Lantern Hawk bursts 0.3 s after an enemy has it in view, with a
    bird call when it blinds one. Hunters path around walls and chew through Frost Walls.
  - Nyx: terror trails are hidden by walls.
- **Sentinels.**
  - Bastion: Clampdown has a device in the middle, a countdown on everyone's screen, and a count of who it caught.
  - Regent: Snare is used up when it goes off. Coup de Grace handles like an Operator (2.5x / 5x, out of the scope
    after a shot) at 0.9 shots a second.
- **Not changed.** The gun models keep their sway and bob ("gun models should be immobile and not flexible" was
  tried and undone on request).

## Where the spec was unclear

These follow one reading of the spec, which may not be what Valorant does:

- **Chill (Slow Orb):** 9 m radius. The spec says "up to 9 m".
- **Fissure and Aftershock Wave (Fault Line, Rolling Thunder):** start 8 m in front of the caster.
- **Hive (Nanoswarm):** damages within 4.5 m; the spec's 5.25 m is used as its detection range.
- **Ember and Acid Vial (Hot Hands, Snake Bite):** 4.5 m radius from the spec's table, not its "8 m wide".
- **Kicker (Blast Pack):** 50 damage within 1.5 m, down to 10 at the edge.
- **Barrage (Armageddon):** the first blast lands 3.08 s after the cast, worked out from the spec's 8 s total.

## Not taken from the spec

- **Frost Wall (Barrier Orb):** 2.6 m high.
- **Sonar Bolt (Recon Bolt):** reveal length unchanged.
- **Stars (Astra):** a recalled star still comes back after 25 s.
- **Double (Fakeout):** the decoy flashes when it is shot; only bots set it off by looking at it.
- **Kestrel (Owl Drone):** the spec's "boost charge 1, boost cooldown 3" isn't used; no patch notes or guides
  describe a drone boost.
- **Fall damage** isn't in Tapfire. Valorant has some, but no numbers for it are published.
- **Overload (NULL/cmd):** a downed bot is picked up automatically by a teammate who reaches it.

## Measured in game

Every ability was played through the real controls (press the key, wait for it to come out, click) on the Range
against bots placed where it lands, with `node tools/measure-abilities.mjs` (November 2026). The script records
when the ability could first be used, where it went and how fast, what it left behind, and what it did to the bots
and to you: damage, Decay, statuses and how long they lasted. Each result was compared with
[VALORANT_SPECS.md](VALORANT_SPECS.md).

### Bugs found in play, now fixed

- **Finale (Showstopper).** The click that fired the rocket also fired one round from your gun, and the gun came
  back with no draw time. Now the click fires only the rocket and the gun takes its draw time to return.
- **Toxic Wall (Toxic Screen).** The gas only hurt in a circle 1.4 m wide around each emitter, 2 m apart, so an
  enemy walking through the wall between two emitters took no Decay. The whole wall applies it now.
- **Terror (Nightfall).** An enemy on the line between two of its zones, or walking along with the wave, lost
  Decay twice (75 + 75). Each enemy is hit once per cast now.
- **Strips touching (Barrage, Terror, Rubble, Aftershock Wave).** Someone standing exactly where two of these
  strips meet was hit by both. Strips no longer overlap.

### Fixed after measuring

The first measurement found these differences. They were fixed and measured again:

- **Equip and unequip times.** Every ability waits for its equip time before it can be used, and your gun waits
  for the ability's unequip time before it comes back. Ultimates with an equip time are drawn with X and used
  with a click; pressing X again puts them away.
- **Map-targeted abilities** (Overcast, Sky Hammer, Barrage, Ruse) equip the tablet first: 0.8, 0.74, 0.6 and
  0.6 s. Missile Call has no equip time in the spec, so its map still opens at once; your gun now takes the
  spec's 0.42 s to come back after it.
- **Overclock (High Gear)** has its 0.6 s equip and **Static Lanes (Fast Lane)** its 0.3 s cast.
- **Sunflare (Curveball)** flies 4 m straight, then curves: 14 m of path at 20 m/s, popping 0.7 s after the
  throw, 10.4 m ahead and 6.4 m to the side.
- **Gridlock (Cyber Cage)** is thrown at 20 m/s and goes up 0.35 s after it lands. The cage is a cylinder.
- **Miasma (Poison Cloud)** rises over 0.6 s and grows over 1.3 s.
- **Hound (Prowler)** lives 2.5 s in all.
- **Splatter (Paint Shells)** bomblets land 1.5 to 5.7 m from the main blast and go off 1.7 to 2 s after it.
- **Smokes** grow in over 0.75 s and shrink away over 1 s as they end.
- **Second pass:**
  - Sentry (Turret) takes 2 s to set up and opens fire 0.75 s after it spots someone (the spec's raw
    "2 / 0.75"); it used to fire 0.8 s after being placed.
  - Rift Line (Cosmic Divide) goes up after the spec's 3 s warmup, not 2.7 s.
  - Riftwalk (Gatecrash) can fake the teleport: F with the rift out plays its sound and flash where it is, you
    stay put, and a faint mark is left on the floor for 30 s.
  - An enemy flying Kestrel (Owl Drone) makes a warning sound when it can see you (patch 11.00).
- **Checked and kept:**
  - Ricochet (Relay Bolt)'s 1 s delay before each concuss is Valorant's windup, raised from 0.8 s to 1 s in
    patch 11.00. The spec file doesn't list it.
- **Smaller fixes:**
  - Lantern Hawk can't be set off in its first 0.25 s.
  - Zero Point's knife lasts 15 s.
  - Overload has its 1.2 s channel.
  - Phase Out goes off 0.2 s after the cast.
  - Whoever kills a player revived by Not Dead Yet gets an ultimate point and a signature charge.
  - Focus gives orbs for assists.
  - Mindread and the Watcher's dart are snapshot reveals: they show where the enemy was, not where they are.

### Status effects and area rules

These now follow the spec:

- **Slows** make jumps weaker (to 70%; Tripline's tether 25%, the gravity well 40%) and halve dashes. Slow
  fields and Detain also silence your footsteps.
- **Fire and acid on the ground** stop at walls and reach 1.2 to 1.5 m up.
- **Aftershock Wave and Undertow** limit turning to 180° a second while they go out.
- **Drones and cameras:** piloting one or watching through one ends when your own body takes damage.
- **Combat Stim** also speeds up spread recovery.

### Differences seen in play

- **Grasp (Seize)** holds for 4.5 s after a 0.7 s expand. That matches the spec's 5.2 s if the 5.2 s counts the
  expand.
- **Acid Vial (Snake Bite)** deals its 12.5 a second, doubled to 25 by its own Vulnerable as in Valorant, but in
  steps of 10 every 0.4 s instead of 1 every 0.08 s. All fire on the ground lands in steps of 5 damage, so
  each tick doesn't make its own hit marker, damage number and network message.
- **Arc Dart (Shock Bolt)** deals 41 to someone 3 m from where it hits; a straight 75-to-30 falloff from 1.5 m to
  4 m would give about 48. Tapfire measures from the middle of the body, not the feet.

### Every ability, measured

"Same" means the measured value matches the spec. Times are from the key press unless noted.

| Ability (Valorant) | Measured in game | Same as Valorant? |
|---|---|---|
| **Zephyr (Jett)** | | |
| Veil (Cloudburst) | Instant; 29 m/s, follows the crosshair while C is held, then falls; smoke where it lands (24 m) or after 2 s in the air (58 m); 3.35 m, 2.5 s | Same |
| Lift (Updraft) | Rises 4.9 m, starting 0.1 s after the press | Same |
| Slipstream (Tailwind) | Second press after the 1 s wind-up; dash of 11 m over 0.45 s | Same |
| Edgestorm (Blade Storm) | 50 a blade to the body | Same |
| **Cinder (Phoenix)** | | |
| Firebreak (Blaze) | Usable at 0.8 s; wall grows at 20 m/s to 14.6 m; lasts 8 s | Same |
| Ember (Hot Hands) | Usable at 0.8 s; 18 m/s throw; fire spreads to 4.5 m, 60 a second, 4 s (235 to someone in it) | Same |
| Sunflare (Curveball) | Usable at 0.8 s; pops 0.5 s after the throw, 6 m ahead and 3.5 m to the side; up to 1.5 s blind | Shorter and quicker (issue #77) |
| Rekindle (Run It Back) | Back to the mark after 10 s | Same |
| **Umbra (Omen)** | | |
| Rift (Shrouded Step) | Usable at 0.5 s; teleports 0.7 s after the click, then 0.5 s to arrive; 15 m | Same |
| Dread (Paranoia) | Usable at 1.1 s; 20 m/s through walls, 25 m; nearsight 2 s at 7.5 m, deafen 2 s | Same |
| Shade (Dark Cover) | Usable at 1 s; 64 m/s; smoke 0.3 s after it arrives; 4.1 m, 14.7 s | Same |
| Nightwalk (From the Shadows) | Teleports 4 s after you pick the spot; the shade has 1 HP | Same |
| **Hawke (Sova)** | | |
| Kestrel (Owl Drone) | Launches at 0.9 s; 7 s; 100 HP; enemies it sees hear a warning | Same (no boost) |
| Arc Dart (Shock Bolt) | Bow out at 0.8 s, full charge 1 s later; 41 m/s; 75 at the impact, 41 at 3 m | Falloff slightly steeper |
| Sonar Bolt (Recon Bolt) | First ping 0.7 s after it sticks, second 1.6 s later; 20 HP | Same |
| Talon Strike (Hunter's Fury) | Each beam 0.4 s after the click, after a warning line everyone sees; 80 a beam, 66 m long, through walls; reveal 1.2 s | Windup added (issue #77) |
| **Bastion (Killjoy)** | | |
| Hive (Nanoswarm) | Usable at 0.74 s; 18 m/s throw; hides where it lands (enemies see it, faintly, within 5.25 m); F sets off the one you look at; 20 HP; damage starts 0.5 s after you set it off | Same (radius 4.5 m, see above) |
| Watchdog (Alarmbot) | Placed at 0.85 s, 10 m away; arms 1.5 s later; Vulnerable 4 s on an enemy in range; 20 HP | Same |
| Sentry (Turret) | Placed at 1.1 s, 4.5 m away; first shot 2.75 s after placing (2 s setup, 0.75 s after spotting); bursts of 3 at 12 a second, 1 s apart; 8 a hit; hits slow 50% for 0.5 s; 100 HP | Same |
| Clampdown (Lockdown) | Goes off 13 s after placing; 32 m; detains 8 s (move ×0.167, no gun) | Same |
| **Blitz (Raze)** | | |
| Boomer (Boom Bot) | Usable at 1.1 s; finds an enemy 12 m away and blows up on them (73); 60 HP; 5 s | Same |
| Kicker (Blast Pack) | Instant; sticks; armed after 1.5 s: 50 at the satchel, 31 at 3 m; knockback out to 5 m; 20 HP | Knockback tuned (issue #77) |
| Splatter (Paint Shells) | Usable at 0.8 s; higher arc, gravity x0.5; main blast 2 s after the throw (55); four bomblets go off 1.7 to 2 s later | Arc tuned (issue #77) |
| Finale (Showstopper) | Rocket out at 1.4 s; kicks when fired; 150 within 4.5 m, falling to 30 at 7 m; a third of that to you | Same (bug fixed) |
| **Granite (Brimstone)** | | |
| Rally (Stim Beacon) | Instant throw at 16.5 m/s; field 0.5 s later; 6 m, 12 s | Same |
| Napalm (Incendiary) | Usable at 1.1 s; 29 m/s; hops once on landing; fire 7.75 s, 60 a second (20 to you and teammates), 4.5 m | Same |
| Overcast (Sky Smoke) | Tablet out at 0.8 s; smoke 1 s after you confirm; 4.15 m, 19.25 s | Same |
| Sky Hammer (Orbital Strike) | Tablet out at 0.74 s; damage starts 2 s later, 9 m, about 130 a second for 3 s then fading | Same |
| **Venom (Viper)** | | |
| Acid Vial (Snake Bite) | Usable at 0.8 s; 29 m/s; pool 4.5 m, 6.5 s; Vulnerable while inside and 2 s after; 25 a second | Same rate, coarser ticks |
| Miasma (Poison Cloud) | Usable at 0.8 s; gas rises over 0.6 s; Decay 10 on contact, then 10 a second | Same |
| Toxic Wall (Toxic Screen) | Usable at 0.8 s; click lays the emitters (shown while held, seen by all), E raises the wall; 60 m long, 6.75 m high; Decay anywhere you cross it | Same |
| Nest (Viper's Pit) | Spreads to 9 m over 5 s; Decay 50 on contact; nearsight 8.1 m for everyone inside, Venom too; enemies outlined for her team | Same |
| **Vex (Reyna)** | | |
| Glare (Leer) | Usable at 0.77 s; 22.5 m/s, 10 m through walls; opens 0.4 s after arriving; nearsight 6 m; 60 HP | Same |
| Feast (Devour) | Instant; +50 over 3 s | Same |
| Vanish (Dismiss) | Instant; untouchable 1.5 s | Same |
| Ravenous (Empress) | 1 s cast | Same |
| **Quake (Breach)** | | |
| Rubble (Aftershock) | Usable at 0.9 s; first burst 2.2 s after it reaches the wall; 3 bursts 0.6 s apart; 80 each | Same |
| Glimmer (Flashpoint) | Usable at 1.1 s; placed through the wall (marker shown through it), pops 0.5 s later; blind 2.25 s | Same |
| Fissure (Fault Line) | Usable at 0.8 s; full charge 1 s, moving at ×0.6; goes off 1.1 s after release; concuss 2.5 s; reaches 64 m | Same |
| Aftershock Wave (Rolling Thunder) | First zone 0.9 s after the cast, then every 0.255 s; concuss 4 s | Same |
| **Volt (Neon)** | | |
| Static Lanes (Fast Lane) | Instant; walls 3.5 m apart, 6.75 m high, 4 s | Instant (issues #77, #78) |
| Ricochet (Relay Bolt) | Instant; 41 m/s, bounces once; concuss 2.5 s within 5 m, 1 s after each impact | Same (1 s windup, patch 11.00) |
| Overclock (High Gear) | Sprint starts at once; the slide brings your best gun out at once | Same (Valorant: "INSTANTLY") |
| Overload (Overdrive) | 20 shots a second; 18 a hit up close | Same |
| **Mirage (Yoru)** | | |
| Double (Fakeout) | Usable at 0.8 s; walks at 5.6 m/s for 10 s; shooting it flashes the shooter | Same |
| Rebound (Blindside) | Usable at 0.8 s; 29 m/s; pops 0.7 s after it bounces; blind 1.5 s | Same |
| Riftwalk (Gatecrash) | Usable at 0.8 s; teleport 0.5 s after the second press; F fakes it; tether 60 HP, 20 s | Same |
| Phase Out (Dimensional Drift) | Untouchable and unseen 10 s | Same |
| **Fawn (Skye)** | | |
| Bloom (Regrowth) | Not measured here (needs teammates; covered by `check-abilities`) | — |
| Stalker (Trailblazer) | Usable at 0.8 s; 80 HP, 6 s; leap hits for 30 and concusses 4 s | Same |
| Lantern Hawk (Guiding Light) | Usable at 0.8 s; 18 m/s, 2 s; blind 2.25 s at full flight; 60 HP | Same |
| Hunters (Seekers) | One per enemy; about 7 m/s; nearsight 3 s at 7.5 m; 120 HP, 15 s | Same |
| **Lattice (Cypher)** | | |
| Tripline (Trapwire) | Usable at 0.8 s; 20 HP (arming and tether: `check-abilities`) | Same |
| Gridlock (Cyber Cage) | Thrown at 0.25 s; the cage goes up 0.35 s after it lands | Same |
| Watcher (Spycam) | Usable at 0.8 s; up to 20 m; 1 HP | Same |
| Mindread (Neural Theft) | Reveals all enemies 2 s and 4 s after the cast | Same |
| **Nyx (Fade)** | | |
| Hound (Prowler) | Usable at 1.1 s; 10 m/s; hand out steering it, no gun; nearsight 2.75 s at 6 m; 60 HP; 2.5 s of life | Same |
| Grasp (Seize) | Usable at 0.8 s; drops after 1.5 s; Decay 75 over 5 s; held and deafened 4.5 s after a 0.7 s expand | Same if the spec's 5.2 s counts the expand |
| Omen Eye (Haunt) | Drops after 1.5 s; reveals for 1.5 s; 1 HP | Same |
| Terror (Nightfall) | Zones 0.325 s apart; Decay 75 once; deafened and marked 8 s | Same (bug fixed) |
| **Solace (Sage)** | | |
| Frost Wall (Barrier Orb) | Usable at 0.8 s; 4 segments of 2.6 m, 0.9 m thick, 15 m away; 600 HP once fortified; cracks as it is shot; 40 s | Same |
| Chill (Slow Orb) | Usable at 0.5 s; 29 m/s; 9 m field, 7 s, slow 50% | Same |
| Mend (Healing Orb) | Usable at 0.5 s; heals | Same |
| Second Dawn (Resurrection) | Not measured here (needs a teammate's body; covered by `check-abilities`) | — |
| **Stella (Astra)** | | |
| Gravity Well | Pulls for 2 s after 1.25 s; Fragile 2.5 s | Same |
| Nova Pulse | Goes off 1 s after the press; concuss 2.5 s | Same |
| Astral Form | Stars placed where you click | Same |
| Rift Line (Cosmic Divide) | Blocks 3 s after you confirm | Same |
| **Regent (Chamber)** | | |
| Snare (Trademark) | Arms 2 s after placing; slows 0.9 s after spotting someone; field 6 m, 6 s, slow 50%; 20 HP | Same |
| Sovereign (Headhunter) | 55 to the body | Same |
| Anchor (Rendezvous) | Teleport 0.1 s after the press; untouchable 1.3 s; 50 HP | Same |
| Coup de Grace (Tour De Force) | Ready at 2.3 s; 127 to the legs | Same |
| **Marina (Harbor)** | | |
| Squall (Storm Surge) | Usable at 0.8 s; 29 m/s; one pulse: nearsight 2 s at 7.5 m, 0.6 s after it lands | Same |
| Riptide (High Tide) | Usable at 0.6 s; drawn at 20 m/s; 15 s; slow ×0.7 crossing it | Same |
| Lagoon (Cove) | Usable at 1 s; shell 680 HP; 19.25 s | Same |
| Undertow (Reckoning) | Wave rolls out through walls; nearsight 3 s at 7.5 m | Same |
| **Vanta (Iso)** | | |
| Push Wall (Contingency) | Usable at 0.8 s; 5.24 m wide wall that moves forward; stops bullets | Same |
| Sever (Undercut) | Usable at 0.8 s; 22.5 m/s through walls, 29.3 m; Fragile 4 s | Same |
| Focus (Double Tap) | 1 s wind-up | Same |
| Duel (Kill Contract) | Column starts 0.8 s after the cast; takes the first enemy it touches. Arena: 21 m apart, both healed to 150, two Push Wall covers for Vanta and one for the enemy, dropping 2.5 s into the fight; 1.5 s face-off, 13 s fight, no abilities. Winner back 2 s after the kill; both die on time-out. Casting gives the Focus shield | Same (wiki: column 36 m long and 15 m wide since 11.08; this keeps the 13.10 spec’s 40 m and r 7) |
| **Ballast (Tejo)** | | |
| Scout Drone (Stealth Drone) | Usable at 0.8 s; runs on the floor, 12 m of sight; 6 s; 42 HP; pulse suppresses and reveals 8 s | Grounded (issue #78) |
| Sticky Charge (Special Delivery) | Usable at 0.5 s; 41 m/s; goes off 0.8 s after it sticks: 35 close, 28 at 3 m; concuss 2.5 s | Same |
| Missile Call (Guided Salvo) | Map opens at once; missiles fly from you around walls (22 m/s; 14 m away: 0.98 s); three blasts of 65, 0.5 s apart; gun back 0.42 s after firing | Same |
| Barrage (Armageddon) | Tablet out at 0.6 s; first blast 3.08 s after confirming; 60 a blast | Same (overlap fixed) |
| **Override (KAY/O)** | | |
| Fragment (FRAG/ment) | Usable at 0.7 s; first blast 0.5 s after it lands, then 3 more 1 s apart; 60 close, 36 at 3 m | Same |
| Flashpoint (FLASH/drive) | Usable at 0.8 s; pops about 1.4 s after the throw; blind 2.25 s | Same |
| Zero Point (ZERO/point) | Usable at 0.8 s; sticks; suppresses 8 s, 1 s after sticking (no reveal); 20 HP | No reveal (issue #78) |
| Overload (NULL/cmd) | Pulses every 2 s out to 42.5 m; suppress 4 s each | Same |
| **Thistle (Clove)** | | |
| Pick-Me-Up | Takes 0.7 s; +50 temporary health; 10% faster for 3 s | Same |
| Meddle | Usable at 0.8 s; Decay 90 within 4 m | Same |
| Ruse | Tablet out at 0.6 s; smoke 1 s after confirming; 4 m, 13.5 s | Same |
| Not Dead Yet | Not measured here (needs you to die; covered by `check-abilities`) | — |
| **Lumen (Waylay)** | | |
| Saturate | Hinder 3 s within its radius | Same |
| Lightspeed | Usable at 0.8 s; two dashes 0.5 s apart, about 9 m each, the first one up | Same |
| Refract | Rewind takes 0.6 s for a 9.8 m path; a green haze 3 m out while rewinding | Lighter view (issue #78) |
| Convergent Paths | Goes off 1 s after the cast; Hinder 6 s; you get +10% speed for 7 s | Same |

## Outside the kits

- **Maps** are original layouts, not Valorant's, paced like Valorant's:
  - From the attackers' barriers it takes about 5 s to fight for mid and 10 to 15 s to come into view of a site.
  - No spot a defender would hold can see into the attackers' spawn.
  - Foundry's halls are 4 to 6 m wide. Divide has cover in its open areas.
- **Crouching** makes you more accurate, as in Valorant: spread x0.85 (the Classic x0.9, patch 1.04; shotguns x0.85
  since 12.09), and crouched while standing still, 15% less sideways recoil.
- **Bots** play by the same rules as you: the same guns, spread and movement, and no aim help. They place their
  crosshair on corners at head height, hold angles still, counter-strafe before shooting, trade teammates and back
  off when hurt. They share what they see with their team instead of talking. Over 39 measured rounds:
  - first contact at a median of 17 to 20 s
  - attackers win 44%
  - 69% of rounds have a plant
  - 11 to 22% of deaths are traded
- **Looks.** How players, guns, effects and abilities look is compared in
  [VISUAL_DIFFERENCES.md](VISUAL_DIFFERENCES.md).
