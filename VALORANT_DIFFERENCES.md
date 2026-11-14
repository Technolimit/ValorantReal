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

## Where the spec was unclear

These follow one reading of the spec, which may not be what Valorant does:

- **Chill (Slow Orb):** 9 m radius. The spec says "up to 9 m".
- **Fissure and Aftershock Wave (Fault Line, Rolling Thunder):** start 8 m in front of the caster.
- **Hive (Nanoswarm):** damages within 4.5 m; the spec's 5.25 m is used as its detection range.
- **Ember and Acid Vial (Hot Hands, Snake Bite):** 4.5 m radius from the spec's table, not its "8 m wide".
- **Kicker (Blast Pack):** 50 damage within 1.5 m, down to 10 at the edge.
- **Barrage (Armageddon):** the first blast lands 3.08 s after the cast, worked out from the spec's 8 s total.

## Not taken from the spec

- **Sunflare (Curveball):** only the 0.7 s timing was applied; the flare still flies Tapfire's short curve.
- **Frost Wall (Barrier Orb):** 2.6 m high.
- **Sonar Bolt (Recon Bolt):** reveal length unchanged.
- **Stars (Astra):** a recalled star still comes back after 25 s.
- **Double (Fakeout):** the decoy flashes when it is shot; only bots set it off by looking at it.
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

### Differences seen in play

- **Sunflare (Curveball)** pops about 4.4 m from you (3 m ahead, 3 m to the side) and blinds you for the full
  1.5 s if you face forward. Valorant's flies at 20 m/s for its 0.7 s, about 14 m along its curve.
- **Map-targeted abilities** (Overcast, Sky Hammer, Missile Call, Barrage, Ruse) open the map the moment you
  press the key. Valorant first equips the tablet: 0.8 s for Sky Smoke, 0.74 s for Orbital Strike, 0.6 s for
  Ruse and Armageddon.
- **Overclock (High Gear)** starts sprinting the moment you press it. Valorant: 0.6 s equip.
- **Static Lanes (Fast Lane)** goes up the moment you press it. Valorant: 0.3 s cast.
- **Gridlock (Cyber Cage)** appears where you aim, up to 15 m, with no flight. Valorant throws it at 20 m/s.
- **Miasma (Poison Cloud)** is full size the moment the emitter lands. Valorant: it rises over 0.6 s and grows
  over 1.3 s.
- **Grasp (Seize)** holds for 4.5 s. The spec's file value is 5.2 s.
- **Hound (Prowler)** keeps going 4 s after it locks on to someone. The spec gives 2.5 s of life in total.
- **Ricochet (Relay Bolt)** concusses 1 s after each impact. The spec gives no delay.
- **Rift Line (Cosmic Divide)** blocks 2.7 s after you confirm it. The spec lists a 0.7 s cast and a 3 s warmup.
- **Acid Vial (Snake Bite)** deals 10 every 0.4 s. That is 12.5 a second doubled by its own Vulnerable, so
  25 a second while you stand in it. The spec lists 12.5 a second, applied as 1 every 0.08 s.
- **Splatter (Paint Shells)** bomblets go off 0.67 s after the main blast, 0.1 s apart (the wiki's timing). The
  spec's file values say at least 1.3 s, or 0.3 s after they stop.
- **Arc Dart (Shock Bolt)** deals 41 to someone 3 m from where it hits; a straight 75-to-30 falloff from 1.5 m to
  4 m would give about 48. Tapfire measures from the middle of the body, not the feet.
- **Sentry (Turret)** fires its first shot 0.8 s after it is placed.

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
| Sunflare (Curveball) | Usable at 0.8 s; pops 0.7 s after the throw, 4.4 m away; up to 1.5 s blind | Pop distance differs |
| Rekindle (Run It Back) | Back to the mark after 10 s | Same |
| **Umbra (Omen)** | | |
| Rift (Shrouded Step) | Usable at 0.5 s; teleports 0.7 s after the click, then 0.5 s to arrive; 15 m | Same |
| Dread (Paranoia) | Usable at 1.1 s; 20 m/s through walls, 25 m; nearsight 2 s at 7.5 m, deafen 2 s | Same |
| Shade (Dark Cover) | Usable at 1 s; 64 m/s; smoke 0.3 s after it arrives; 4.1 m, 14.7 s | Same |
| Nightwalk (From the Shadows) | Teleports 4 s after you pick the spot; the shade has 1 HP | Same |
| **Hawke (Sova)** | | |
| Kestrel (Owl Drone) | Launches at 0.9 s; 7 s; 100 HP | Same |
| Arc Dart (Shock Bolt) | Bow out at 0.8 s, full charge 1 s later; 41 m/s; 75 at the impact, 41 at 3 m | Falloff slightly steeper |
| Sonar Bolt (Recon Bolt) | First ping 0.7 s after it sticks, second 1.6 s later; 20 HP | Same |
| Talon Strike (Hunter's Fury) | 80 a beam, 66 m long, through walls; reveal 1.2 s | Same |
| **Bastion (Killjoy)** | | |
| Hive (Nanoswarm) | Usable at 0.74 s; 18 m/s throw; hides where it lands; 20 HP; damage starts 0.5 s after you set it off | Same (radius 4.5 m, see above) |
| Watchdog (Alarmbot) | Placed at 0.85 s, 10 m away; arms 1.5 s later; Vulnerable 4 s on an enemy in range; 20 HP | Same |
| Sentry (Turret) | Placed at 1.1 s, 4.5 m away; bursts of 3 at 12 a second, 1 s apart; 8 a hit; hits slow 50% for 0.5 s; 100 HP | Same (first shot 0.8 s after placing) |
| Clampdown (Lockdown) | Goes off 13 s after placing; 32 m; detains 8 s (move ×0.167, no gun) | Same |
| **Blitz (Raze)** | | |
| Boomer (Boom Bot) | Usable at 1.1 s; finds an enemy 12 m away and blows up on them (73); 60 HP; 5 s | Same |
| Kicker (Blast Pack) | Instant; sticks; armed after 1.5 s: 50 at the satchel, 31 at 3 m; 20 HP | Same |
| Splatter (Paint Shells) | Usable at 0.8 s; main blast 2 s after the throw (55); four bomblets 0.67 s later | Bomblet timing differs |
| Finale (Showstopper) | Rocket out at 1.4 s; 150 close, falling to 30 at 7 m | Same (bug fixed) |
| **Granite (Brimstone)** | | |
| Rally (Stim Beacon) | Instant throw at 16.5 m/s; field 0.5 s later; 6 m, 12 s | Same |
| Napalm (Incendiary) | Usable at 1.1 s; 29 m/s; fire 7.75 s, 60 a second, 4.5 m | Same |
| Overcast (Sky Smoke) | Map opens at once; smoke 1 s after you confirm; 4.15 m, 19.25 s | No 0.8 s equip |
| Sky Hammer (Orbital Strike) | Map opens at once; damage starts 2 s later, 9 m, about 130 a second for 3 s then fading | No 0.74 s equip |
| **Venom (Viper)** | | |
| Acid Vial (Snake Bite) | Usable at 0.8 s; 29 m/s; pool 4.5 m, 6.5 s; Vulnerable while inside and 2 s after; 25 a second | Damage rate differs |
| Miasma (Poison Cloud) | Usable at 0.8 s; gas full size as it lands; Decay 10 on contact, then 10 a second | Gas appears at once |
| Toxic Wall (Toxic Screen) | Usable at 0.8 s; rises 1 s later; 60 m long, 6.75 m high; Decay anywhere you cross it | Same (bug fixed) |
| Nest (Viper's Pit) | Spreads to 9 m over 5 s; Decay 50 on contact; nearsight 8.1 m | Same |
| **Vex (Reyna)** | | |
| Glare (Leer) | Usable at 0.77 s; 22.5 m/s, 10 m through walls; opens 0.4 s after arriving; nearsight 6 m; 60 HP | Same |
| Feast (Devour) | Instant; +50 over 3 s | Same |
| Vanish (Dismiss) | Instant; untouchable 1.5 s | Same |
| Ravenous (Empress) | 1 s cast | Same |
| **Quake (Breach)** | | |
| Rubble (Aftershock) | Usable at 0.9 s; first burst 2.2 s after it reaches the wall; 3 bursts 0.6 s apart; 80 each | Same |
| Glimmer (Flashpoint) | Usable at 1.1 s; pops through the wall; blind 2.25 s | Same |
| Fissure (Fault Line) | Usable at 0.8 s; full charge 1 s, moving at ×0.6; goes off 1.1 s after release; concuss 2.5 s; reaches 64 m | Same |
| Aftershock Wave (Rolling Thunder) | First zone 0.9 s after the cast, then every 0.255 s; concuss 4 s | Same |
| **Volt (Neon)** | | |
| Static Lanes (Fast Lane) | Instant; walls 3.5 m apart, 6.75 m high, 4 s | No 0.3 s cast |
| Ricochet (Relay Bolt) | Instant; 41 m/s, bounces once; concuss 2.5 s within 5 m, 1 s after each impact | Delay not in the spec |
| Overclock (High Gear) | Sprint starts at once | No 0.6 s equip |
| Overload (Overdrive) | 20 shots a second; 18 a hit up close | Same |
| **Mirage (Yoru)** | | |
| Double (Fakeout) | Usable at 0.8 s; walks at 5.6 m/s for 10 s; shooting it flashes the shooter | Same |
| Rebound (Blindside) | Usable at 0.8 s; 29 m/s; pops 0.7 s after it bounces; blind 1.5 s | Same |
| Riftwalk (Gatecrash) | Usable at 0.8 s; teleport 0.5 s after the second press; tether 60 HP, 20 s | Same |
| Phase Out (Dimensional Drift) | Untouchable and unseen 10 s | Same |
| **Fawn (Skye)** | | |
| Bloom (Regrowth) | Not measured here (needs teammates; covered by `check-abilities`) | — |
| Stalker (Trailblazer) | Usable at 0.8 s; 80 HP, 6 s; leap hits for 30 and concusses 4 s | Same |
| Lantern Hawk (Guiding Light) | Usable at 0.8 s; 18 m/s, 2 s; blind 2.25 s at full flight; 60 HP | Same |
| Hunters (Seekers) | One per enemy; about 7 m/s; nearsight 3 s at 7.5 m; 120 HP, 15 s | Same |
| **Lattice (Cypher)** | | |
| Tripline (Trapwire) | Usable at 0.8 s; 20 HP (arming and tether: `check-abilities`) | Same |
| Gridlock (Cyber Cage) | Placed at 0.25 s where you aim, up to 15 m | Not thrown |
| Watcher (Spycam) | Usable at 0.8 s; up to 20 m; 1 HP | Same |
| Mindread (Neural Theft) | Reveals all enemies 2 s and 4 s after the cast | Same |
| **Nyx (Fade)** | | |
| Hound (Prowler) | Usable at 1.1 s; 10 m/s; nearsight 2.75 s at 6 m; 60 HP; 4 more seconds once it locks on | Lifetime differs |
| Grasp (Seize) | Usable at 0.8 s; drops after 1.5 s; Decay 75 over 5 s; held and deafened 4.5 s | Hold 4.5 s, spec 5.2 s |
| Omen Eye (Haunt) | Drops after 1.5 s; reveals for 1.5 s; 1 HP | Same |
| Terror (Nightfall) | Zones 0.325 s apart; Decay 75 once; deafened and marked 8 s | Same (bug fixed) |
| **Solace (Sage)** | | |
| Frost Wall (Barrier Orb) | Usable at 0.8 s; 4 segments of 2.6 m, 15 m away; 600 HP once fortified; 40 s | Same |
| Chill (Slow Orb) | Usable at 0.5 s; 29 m/s; 9 m field, 7 s, slow 50% | Same |
| Mend (Healing Orb) | Usable at 0.5 s; heals | Same |
| Second Dawn (Resurrection) | Not measured here (needs a teammate's body; covered by `check-abilities`) | — |
| **Stella (Astra)** | | |
| Gravity Well | Pulls for 2 s after 1.25 s; Fragile 2.5 s | Same |
| Nova Pulse | Goes off 1 s after the press; concuss 2.5 s | Same |
| Astral Form | Stars placed where you click | Same |
| Rift Line (Cosmic Divide) | Blocks 2.7 s after you confirm | Spec reads about 3.7 s |
| **Regent (Chamber)** | | |
| Snare (Trademark) | Arms 2 s after placing; slows 0.9 s after spotting someone; field 6 m, 6 s, slow 50%; 20 HP | Same |
| Sovereign (Headhunter) | 55 to the body | Same |
| Anchor (Rendezvous) | Teleport 0.1 s after the press; untouchable 1.3 s; 50 HP | Same |
| Coup de Grace (Tour De Force) | Ready at 2.3 s; 127 to the legs | Same |
| **Marina (Harbor)** | | |
| Squall (Storm Surge) | Usable at 0.8 s; 29 m/s; nearsight 2 s at 7.5 m, 0.6 s after it lands | Same |
| Riptide (High Tide) | Usable at 0.6 s; drawn at 20 m/s; 15 s; slow ×0.7 crossing it | Same |
| Lagoon (Cove) | Usable at 1 s; shell 680 HP; 19.25 s | Same |
| Undertow (Reckoning) | Wave rolls out through walls; nearsight 3 s at 7.5 m | Same |
| **Vanta (Iso)** | | |
| Push Wall (Contingency) | Usable at 0.8 s; 5.24 m wide wall that moves forward; stops bullets | Same |
| Sever (Undercut) | Usable at 0.8 s; 22.5 m/s through walls, 29.3 m; Fragile 4 s | Same |
| Focus (Double Tap) | 1 s wind-up | Same |
| Duel (Kill Contract) | Column starts 0.8 s after the cast; takes the first enemy it touches; 1.5 s face-off | Same |
| **Ballast (Tejo)** | | |
| Scout Drone (Stealth Drone) | Usable at 0.8 s; 6 s; 42 HP; pulse suppresses and reveals 8 s | Same |
| Sticky Charge (Special Delivery) | Usable at 0.5 s; 41 m/s; goes off 0.8 s after it sticks: 35 close, 28 at 3 m; concuss 2.5 s | Same |
| Missile Call (Guided Salvo) | Map opens at once; three blasts of 65, 0.5 s apart | Same |
| Barrage (Armageddon) | First blast 3.08 s after confirming; 60 a blast | Same (overlap fixed) |
| **Override (KAY/O)** | | |
| Fragment (FRAG/ment) | Usable at 0.7 s; first blast 0.5 s after it lands, then 3 more 1 s apart; 60 close, 36 at 3 m | Same |
| Flashpoint (FLASH/drive) | Usable at 0.8 s; pops about 1.4 s after the throw; blind 2.25 s | Same |
| Zero Point (ZERO/point) | Usable at 0.8 s; sticks; suppresses and reveals 8 s, 1 s after sticking; 20 HP | Same |
| Overload (NULL/cmd) | Pulses every 2 s out to 42.5 m; suppress 4 s each | Same |
| **Thistle (Clove)** | | |
| Pick-Me-Up | Takes 0.7 s; +50 temporary health; 10% faster for 3 s | Same |
| Meddle | Usable at 0.8 s; Decay 90 within 4 m | Same |
| Ruse | Map opens at once; smoke 1 s after confirming; 4 m, 13.5 s | No 0.6 s equip |
| Not Dead Yet | Not measured here (needs you to die; covered by `check-abilities`) | — |
| **Lumen (Waylay)** | | |
| Saturate | Hinder 3 s within its radius | Same |
| Lightspeed | Usable at 0.8 s; two dashes 0.5 s apart, about 9 m each, the first one up | Same |
| Refract | Rewind takes 0.6 s for a 9.8 m path; vision 1 m while rewinding | Same |
| Convergent Paths | Goes off 1 s after the cast; Hinder 6 s; you get +10% speed for 7 s | Same |

## Outside the kits

- **Maps** are original layouts, not Valorant's.
- **Looks.** How players, guns, effects and abilities look is compared in
  [VISUAL_DIFFERENCES.md](VISUAL_DIFFERENCES.md).
