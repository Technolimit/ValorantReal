# Differences from Valorant

Every place where a Tapfire agent's kit still works differently from the Valorant agent it mirrors: timings,
controls, whether it is a projectile, whether it can be shot, ranges and effects. Tapfire's side was read from
`js/abilities.js`, `js/game.js`, `js/weapons.js` and `js/prices.js`. Valorant's side comes from the official VALORANT
wiki (wiki.playvalorant.com) as of patch 13.09 (27 October 2026). Abilities with nothing listed under them were
checked and match.

Each item reads **Tapfire → Valorant**. Where the wiki contradicts itself the item says so; those are worth
checking in game before changing anything.

## All agents

- **Equip time.** Tapfire: 0.25 s for every ability you hold, nothing for instant ones → Valorant: each ability
  has its own equip time, usually 0.5–1.1 s (listed per ability below).
- **Thrown utility.** Tapfire: grenades fly a fixed arc straight to the point you aim at (capped range) and go
  off when they arrive → Valorant: they are physics projectiles that bounce, roll and fall; most have a
  maximum air time or detonate on touching the floor.
- **Destructible utility.** Tapfire's HP differs or the thing can't be shot at all:

  | Utility | Tapfire | Valorant |
  |---|---|---|
  | Recon Bolt | can't be shot | 20 HP |
  | Leer | can't be shot | 60 HP |
  | Seekers | can't be shot | 120 HP each |
  | Trademark | can't be shot | 20 HP |
  | Barrier Orb | can't be shot | 400 HP per segment, 600 once fortified |
  | Rendezvous anchor | can't be shot | 50 HP |
  | Stealth Drone | can't be shot | 42 HP |
  | Spycam | 15 HP | 1 HP |
  | Fakeout | 1 HP | 150 HP |
  | ZERO/point | 1 HP | 20 HP |
  | Gatecrash tether | 1 HP | 20 HP |

- **Decay.** Viper's toxin and Fade's Nightfall do real damage in Tapfire. In Valorant both are Decay: it can't
  kill and the health comes back.
- **Deathmatch.** Tapfire gives every ability its own cooldown in deathmatch → Valorant's deathmatch has no
  abilities.
- **Missing agents.** Gekko, Deadlock, Vyse and Veto have no Tapfire counterpart.

## Zephyr (Jett)

**Veil (Cloudburst)**
- Letting go of C bursts the smoke in mid-air → letting go of the key drops the orb with gravity and it bursts
  when it hits a surface. Cast without holding, it can't be steered at all.
- Steered orb flies 7 m/s for up to 2 s → no speed given; steering changes direction and height.
- Valorant also slows the gun re-equip after Cloudburst (7.04).

**Lift (Updraft)**
- 0.2 s wind-up, then straight up about 3.5 m → no wind-up; a 0.6 s vertical dash of about 5 m that you can
  steer with the movement keys.
- Deathmatch kit holds 2 charges → 1 charge (cut in 7.04).

**Slipstream (Tailwind)**
- No differences (1 s wind-up, 7.5 s window, 0.45 s / 11 m dash, two-kill recharge).

**Edgestorm (Blade Storm)**
- Single throws every 0.33 s → every 0.167 s (6 per second).
- Blades are hitscan → thrown knives.
- Right-click fan: 150 to the head, full damage at any range, and a kill refills the blades → headshots ×2
  (100), damage falls off from 12 m, and a kill from the fan does not refill them.
- Switching weapons puts the blades away for good → you can switch to guns and abilities and reactivate to get
  the remaining blades back.
- Draw 1 s → about 1.02 s; equip 0.15 s.

**Drift (passive)**
- Valorant: no gliding while suppressed or detained. Tapfire doesn't block it.

## Cinder (Phoenix)

**Firebreak (Blaze)**
- Goes out the moment you press C → equip (0.8 s) then click; hold fire to bend.
- Wall grows to 15 m at 8 m/s → up to about 21 m, deploying in 0.125–0.75 s depending on length.
- Heals Phoenix 12.5/s → 50 in total over 8 s (about 6.25/s).
- Valorant: half damage to objects.

**Ember (Hot Hands)**
- Lands where you aim → the fireball explodes when it hits the ground or after a set time in the air.
- 4 s fire → wiki lists 3.25 s at full size; damage is listed as both 60/s and 30/s on different wiki pages.

**Sunflare (Curveball)**
- Equip 0.8 s in Valorant. The pop timing matches (about 0.6 s).

**Rekindle (Run It Back)**
- You're back at the mark the instant you die → the return takes 2.4 s (1 s fade + 1.4 s respawn).
- No reload on return → all weapons are reloaded on respawn.
- Valorant counts the 1 s activation inside the 10 s.

## Umbra (Omen)

**Rift (Shrouded Step)**
- Arrives instantly after the 0.7 s wind-up → 0.7 s wind-up plus 0.5 s arrival (1.2 s total).
- Valorant: a sound at the start that everyone hears and a smaller arrival cue (12.5 m). Equip 0.5 s.

**Dread (Paranoia)**
- Hits everyone on the line at once, about 0.95 s after the cast → the orb (20 m/s, 25 m) affects people as it
  reaches them.
- Equip 1.1 s.

**Shade (Dark Cover)**
- Left click casts, hold right click pushes farther (and wraps back), R makes it stop at walls → the ability key
  throws it, hold Fire moves the marker farther, hold Alt Fire brings it closer, Reload switches between the
  see-through view and the normal view.
- Smoke drops from above 0.4 s after the cast → thrown from Omen as a projectile.

**Nightwalk (From the Shadows)**
- You stay at your start point, hidden and untouchable, for 4 s while a shade stands at the target → 1.5 s
  wind-up, then 2.5 s standing at the destination as a Shade, rooted, with your view there (vision starts at
  zero and grows).
- Can't be cancelled → pressing the key again cancels it (you still lose the points).
- Equip 0.5 s.

## Hawke (Sova)

**Kestrel (Owl Drone)**
- Equip 0.9 s, deploy 0.25 s in Valorant. Otherwise matches (100 HP, 7 s, dart every 5 s, ends if Sova's body is
  hit).

**Arc Dart (Shock Bolt)**
- No bounces → Alt Fire adds up to 2 bounces.
- Full charge takes 1.2 s → 1.0 s (power steps at 0.33, 0.67 and 1.0 s).
- Flies in a straight line to the aim point → a real arrow arc.
- Equip 0.8 s, wind-up 0.4 s.

**Sonar Bolt (Recon Bolt)**
- Can't be shot → 20 HP.
- No bounces → up to 2 with Alt Fire.
- Pulses 1 s apart, each reveal lasting 2.5 s → pulses 1.6 s apart.
- Full charge 1.2 s → 1.0 s.

**Talon Strike (Hunter's Fury)**
- Fires the instant you click, 1 s between shots → each shot has a 1 s wind-up, one shot every 2.125 s.
- Doesn't hit utility → also damages utility (Recon Bolt, Nanoswarm, Trapwire and others).
- Equip 0.8 s.

## Bastion (Killjoy)

**Range limit (Alarmbot and Turret)**
- None → they switch off when Killjoy is more than 40 m away and come back 2 s after she returns.

**Hive (Nanoswarm)**
- 3 m damage radius → 4.5 m.
- Equip 0.74 s.

**Watchdog (Alarmbot)**
- Active 1 s after placing → 1.85 s deploy; equip 0.85 s.
- Also reveals the target for 4 s → wiki lists only Vulnerable (4 s).

**Sentry (Turret)**
- Placed up to 10 m away → 4.5 m.
- Starts shooting 0.8 s after placing → 2.7 s deploy; equip 1.1 s.
- 180° view → 100°.
- 7 damage a shot, steady stream, 70% of shots hit → 8 / 6 / 4 damage at 0–20 / 20–35 / 35+ m, in 3-shot bursts;
  bullets slow the target 50%. (The wiki's 1 s burst interval may predate the 13.00 fire-rate buff.)

**Clampdown (Lockdown)**
- No differences found (13 s, 32.5 m, 8 s detain, 200 HP).

## Blitz (Raze)

**Boomer (Boom Bot)**
- Deploys instantly → 1.1 s equip, 0.7 s deploy.
- Locks on within 12 m → 15 m cone.
- Explodes on contact (1.3 m), 3 m blast → explodes within 2.5 m of the target; 2 m inner / 6 m outer radius.

**Kicker (Blast Pack)**
- 5–15 damage before it arms → no damage before the 1.5 s arm time.
- Disappears after 5 s → explodes when the 5 s run out.

**Splatter (Paint Shells)**
- No underhand throw → Alt Fire lobs it underhand.
- Grenade does at least 15 at the edge → 1 at the edge.
- Doesn't bounce → bounces as a normal grenade.
- Equip 0.8 s.

**Finale (Showstopper)**
- No differences found (1.4 s draw, 10 s, 30–150).

## Granite (Brimstone)

**Rally (Stim Beacon)**
- Appears at the aim point → thrown.
- Speeds up fire rate and movement only → also equip, reload and recovery (all 10%).

**Napalm (Incendiary)**
- Lands at the aim point → bounces up to twice on floors, then goes off on the next contact.
- 7 s → 8 s (spreads, then 7 s at full size).
- Equip 1.1 s.

**Overcast (Sky Smoke)**
- Smokes land 0.8 s after you confirm → 1 s.

**Sky Hammer (Orbital Strike)**
- 8 m radius → 9 m.
- 4 s at 125/s → 3 s at full size plus 0.75 s shrinking, 20 every 0.15 s (about 133/s).
- No range limit → 60 m.
- Doesn't block sight → blocks line of sight.

## Venom (Viper)

**Fuel (passive)**
- Gas needs 15 fuel to switch on → 30.
- One source drains 7/s, two drain 14/s → 8.33/s and 12.5/s.
- Refills 12/s → 100 fuel takes 30 s (3.33/s).
- No limit per source → each source runs at most 12 s (8.5 s with both on).
- No cooldown on switching → 5 s after switching on, 2 s after switching off.

**Toxin**
- Real damage, 10/s, can kill → Decay: 10 on first contact, then 10/s; can't kill; health comes back 1.5 s after
  leaving.

**Acid Vial (Snake Bite)**
- 3.5 m pool → 4.5 m.
- Vulnerable only while you stand in it → lasts 2 s after leaving.
- Lands at the aim point → detonates when the canister touches a floor.
- Deathmatch kit holds 2 → 1 charge.

**Miasma (Poison Cloud)**
- Smoke appears the moment it switches on → 1.75 s wind-up (fuel spent after 0.75 s, 1 s to form);
  switching off takes 0.8 s.

**Toxic Wall (Toxic Screen)**
- 40 m, appears at once → 60 m (30 emitters 2 m apart), 0.5 s wind-up, grows out over 1.55 s.

**Nest (Viper's Pit)**
- Full size instantly, 10 damage/s → spreads out over 6 s; enemies lose 30 to Decay on contact, then 10/s.
- Valorant also hides the minimap of enemies inside.

## Vex (Reyna)

**Soul Harvest (passive)**
- Orbs drop only from your kills → also from enemies you damaged who die within 3 s.
- In Ravenous kills drop no orbs (they heal you instead) → orbs keep dropping and Devour / Dismiss have
  unlimited charges.

**Glare (Leer)**
- 12 m → 10 m (shorter if pushed back by terrain).
- Can't be shot → 60 HP.
- Valorant: 0.4 s wind-up after it arrives; equip 0.77 s.

**Feast (Devour)**
- No differences found (50 over 3 s, 2.5 s in Empress, extra health lasts 10 s).

**Vanish (Dismiss)**
- Can't be ended early → recasting ends it.

**Ravenous (Empress)**
- 30 s, kills reset the timer → no timer: it lasts until Reyna dies or the round ends (11.08).
- 15% faster fire rate, equip and reload → 10% each, plus recovery.
- Each kill heals 100 → no heal on kill.
- No wind-up → 1 s wind-up.

## Quake (Breach)

**Rubble (Aftershock)**
- The wall must be within 8 m → fires a charge up to 35 m.
- 3 m sphere blasts at 1.9 s and 2.5 s → 2.2 s wind-up, then two 80-damage blasts 0.6 s apart in a cylinder
  10 m deep and 3 m in radius behind the wall.
- Equip 0.9 s.

**Glimmer (Flashpoint)**
- The wall must be within 8 m → up to 35 m away, through up to 10 m of wall.
- Equip 1.1 s.

**Fissure (Fault Line)**
- Full charge 1.5 s → 1.0 s.

**Aftershock Wave (Rolling Thunder)**
- A 32 m cone, one hit 1.2 s after cast → a line 32 m long and 18 m wide starting 8 m ahead (not a cone since an
  early patch), eight blasts 0.255 s apart that roll forward, each knocking up and concussing for 4 s.
- Equip 1.1 s.

## Volt (Neon)

**Static Lanes (Fast Lane)**
- Starts 1.5 m ahead → also extends 1.5 m behind you.
- Valorant walls take 2 s to fade (with a 1 s warning).

**Ricochet (Relay Bolt)**
- Stuns for 3.5 s → 2.5 s (11.08).
- Only goes off where it lands → goes off at the bounce point and where it lands.

**Overclock (High Gear)**
- Slide lasts 0.32 s (about 4 m) → 0.6 s, 7 m; only while moving forward or sideways.
- Crouch also slides → Alt Fire only.
- Energy refills in 25 s → 60 s.

**Overload (Overdrive)**
- 27 body / 54 head / 22 legs, no falloff → 18 body / 54 head / 15 legs, falling to 10 body by 43 m.
- 15 shots a second → 20.
- No magazine → 40-shot magazine that needs 10 to fire, refilling on its own.
- 0.4 s wind-up → 1 s.
- Meter lasts 20 s → wiki lists both 10 s and 16 s.
- Valorant beam goes through enemies (not walls).

## Mirage (Yoru)

**Double (Fakeout)**
- Blinds the first enemy who looks at it, for 1.75 s → flashes when enemies destroy it (150 HP), for 2 s.
- No standing decoy → Alt Fire places an inactive echo; press again to send it off.

**Rebound (Blindside)**
- Pops as soon as it reaches its spot just past the bounce (about 0.2 s) → 0.6 s wind-up.
- Deathmatch kit holds 2 → 1 charge (12.05).

**Riftwalk (Gatecrash)**
- 1 free charge on a 30 s cooldown → 2 charges at 150 that come back after two kills.
- Teleport 0.4 s → 0.5 s wind-up + 0.7 s arrival.
- No fake → you can trigger a fake teleport.
- Equip 0.8 s.

**Phase Out (Dimensional Drift)**
- Fully invisible → enemies get an outline when you're in their line of sight, and can hear your footsteps
  within 15 m.
- No abilities → can cast Gatecrash and reactivate Gatecrash and Fakeout (11.10).
- Instant → 0.4 s cast delay, 0.8 s to come back.

## Fawn (Skye)

**Bloom (Regrowth)**
- Hold C → equip, then hold Fire.

**Stalker (Trailblazer)**
- Pounces on its own when it gets near an enemy → you click to leap (12 m).
- 30 damage to everyone in the blast, 3 s stun, 4 m → 30 only on direct contact; concuss 2.5–4 s by distance from
  the centre; 3.5 m.

**Lantern Hawk (Guiding Light)**
- 60 s cooldown → 50 s (13.00).
- Flies 9 m/s → 18 m/s.
- Pops 0.3 s after you press again → 0.75 s.

**Hunters (Seekers)**
- Last 12 s → 15 s.
- Can't be shot → 120 HP each.
- Nearsight only → nearsight plus a 60% slow for 5 s (wiki).

## Lattice (Cypher)

**Tripline (Trapwire)**
- Anchor wall within 6 m, wire up to 12 m → place up to 20 m, wire up to 15 m.
- Armed at once → 1.5 s deploy.
- Crossing it reveals for 5 s, holds for 2 s, then stuns until 5 s, and the wire is used up → no tether or
  stun since 11.08/11.10: the victim is slowed while tagged; after a 0.7 s wind-up it keeps slowing and zaps for
  5 damage until the wire is shot or the victim gets about 4 m away.

**Gridlock (Cyber Cage)**
- Appears at the aim point (15 m) → tossed in front of you.

**Watcher (Spycam)**
- 30 m → 20 m (and at most 4.5 m high).
- Dart pings for 8 s → until the target removes it (1.85 s).
- 15 HP → 1 HP.

**Mindread (Neural Theft)**
- 12 m → 18 m; any body, no time limit (same in both).
- Reveals 2 s apart → 4 s apart.

## Nyx (Fade)

**Hound (Prowler)**
- Nearsight 2.5 s → 2.75 s.
- Moves 9 m/s → 10 m/s, 12 m/s once it has a target, 15 m/s on a trail.
- No bite wind-up → 0.6 s.
- Equip 1.1 s.

**Grasp (Seize)**
- Lands at the aim point, then 0.6 s → drops after at most 1.5 s in the air (or early when you press again),
  then 0.7 s wind-up.
- Decay doesn't come back → the 75 comes back over 5 s.

**Omen Eye (Haunt)**
- Reveal 4 s → the eye is active 1.5 s (11.08), and enemies it sees get a 12 s terror trail.
- Can't be dropped early → drops after at most 1.5 s or when you press again.
- No terror trail → trail that Prowlers follow.

**Terror (Nightfall)**
- Full reveal 8 s → terror trail plus deafen for 8 s.
- 75 real damage (never lethal) → 75 Decay that comes back over 12 s.

## Solace (Sage)

**Frost Wall (Barrier Orb)**
- 6 m long → four segments, about 10.4 m.
- Up to 12 m away → 15 m (11.04).
- Can't be shot → 400 HP per segment, 600 after 2 s.
- Appears at once → 1.35 s deploy.
- Right click rotates → recast rotates 90°, Alt Fire gives a free angle.
- Valorant walls start to fade at 35 s.

**Chill (Slow Orb)**
- Slows only enemies → also slows allies and Sage.
- Valorant also halves dash speed in the field.

**Mend (Healing Orb)**
- Self-heal 50 → 100 (13.00).

**Second Dawn (Resurrection)**
- Ally stands up right after the 2 s channel → then a 1.3 s rise, untouchable.

## Stella (Astra)

**Stars**
- 4 stars → 5 (9.05).
- Using a star for Gravity Well, Nova Pulse or Nebula doesn't spend a charge → each activation uses that ability's
  charge (Gravity Well 1, Nova Pulse 1, Nebula 2).
- No Dissipate → turn a star into a short fake smoke and get it back after 25 s.
- Placing stars is on E → it's done in Astral Form (the X key).

**Rift Line (Cosmic Divide)**
- One point, wall runs the way you face → you pick two points and the wall joins them.
- Valorant: the wall also blocks sound; non-hitscan abilities can pass through.

## Regent (Chamber)

**Snare (Trademark)**
- Arms in 1 s → 2 s (5.12 patch notes say 4 s).
- 5 m field, 60% slow for 6 s → 50% slow for 4 s.
- Can't be shot → 20 HP.

**Sovereign (Headhunter)**
- Equip 0.5 s → 0.3 s.
- Falloff past 30 m → no falloff.

**Anchor (Rendezvous)**
- Place up to 13 m → 8.5 m.
- Teleport within 50 m → within 18 m (9.05).
- 20 s between teleports → 30 s after a teleport or pickup.
- Teleport 0.5 s → 1.3 s (0.1 s wind-up + 1.2 s arrival).
- Can't be shot → 50 HP.

**Coup de Grace (Tour De Force)**
- Draws in 0.8 s → 2.3 s summon.
- 3.5× scope → 2.5× and 5×.
- Kill field: 4.5 m, 60% for 6 s, enemies only → 6 m, 50% for 4 s, slows allies too.

## Marina (Harbor)

Harbor was reworked in 11.10.

**Breaker (Cascade → Storm Surge)**
- Tapfire still has the old Cascade wave → Storm Surge: a thrown whirlpool that goes off after 0.6 s, nearsights
  and slows enemies within 6 m for 2 s each, no line of sight needed.

**Riptide (High Tide)**
- 40 m → 60 m (12.02).
- Moves 15 m/s → 25 m/s, turning up to 180°/s.
- Hold Q to steer → hold Fire at the cast to steer; Alt Fire stops it early.

**Lagoon (Cove)**
- Blocks bullets from the start → a plain smoke until you reactivate it; the shield takes 0.8 s.

**Undertow (Reckoning)**
- Three geysers stun for 3 s in a 30 m cone → a tall wave that rolls forward through walls at 8 m/s,
  nearsighting for 3 s and slowing for 2 s.

## Vanta (Iso)

**Push Wall (Contingency)**
- Appears 2.2 m ahead, lasts 3.5 s → 5 m ahead, 5.4 s (4.6 s at full size), travels 27.5 m.
- No Alt Fire → Alt Fire sends it at half speed.

**Sever (Undercut)**
- Everyone on the 30 m line is hit 0.6 s after the cast → a bolt (22.5 m/s, about 35 m, 3 m wide) hits people
  as it reaches them.
- Vulnerable only → Vulnerable and Suppressed for 4 s.
- Deathmatch kit holds 2 → 1 charge.

**Focus (Double Tap)**
- No reload bonus → 25% faster reload while active.

**Duel (Kill Contract)**
- Takes whoever you look at, at any range, through walls → fires a 36 m × 15 m column and takes the first enemy
  in it.
- Instant → 0.9 s capture + 0.5 s transport + 1.5 s arena build.
- 15 s → 13 s.
- Start 12 m apart, no refill → 21 m apart, health and shields refilled.

## Ballast (Tejo)

**Scout Drone (Stealth Drone)**
- Reveals for 4 s and nearsights → reveals and Suppresses for 8 s.
- Can't be shot → 42 HP.

**Sticky Charge (Special Delivery)**
- Goes off 1.2 s after sticking → 0.9 s.
- No bounce option → Alt Fire adds one bounce.
- Deathmatch kit holds 2 → 1 charge.
- Valorant: also hits allies and Tejo for reduced damage.

**Missile Call (Guided Salvo)**
- One explosion 1.5 s after firing → 1.25 s wind-up, then each missile detonates 3 times within 1.6 s (50–65
  each).
- 45 m range → no range limit (12.06).

**Barrage (Armageddon)**
- Start point plus facing → pick a start and an end point.
- 1 s wind-up → 3.08 s.
- 15 single blasts of 150, 0.15 s apart → 16 segments (12 m wide, 2 m long), each hit 4 times for 60, 0.25 s
  apart.
- No range limit → 52.5 m.

## Override (KAY/O)

**Fragment (FRAG/ment)**
- No underhand throw → Alt Fire lobs it.

**Flashpoint (FLASH/drive)**
- Short lob pops after 0.7 s → 1 s.
- Long throw blinds 2 s → 2.25 s (11.08).
- Valorant: if it bounces off something it pops 0.8 s later.

**Zero Point (ZERO/point)**
- Also reveals where enemies are → only tells you who was suppressed, not where.
- 1 HP → 20 HP.

**Overload (NULL/cmd)**
- Pulses every 2 s from the cast → 1 s wind-up, then every 3 s (5 pulses).
- Only fire rate → fire rate, reload, recovery and equip (10% each).
- If killed, gets back up after 3 s on its own → downed for up to 15 s (850 HP) and a teammate has to revive
  him.

## Thistle (Clove)

**Pick-Me-Up**
- Works on an enemy who died in the last 10 s that you damaged at any point → must be used within 4.5 s of a
  kill, on an enemy you killed or damaged in the 6 s before they died.
- Instant, all 50 at once → 0.7 s wind-up, heals 50/s.
- 15% faster → 10% (13.09).

**Meddle**
- 6 m → 4 m (12.05).
- Lands at the aim point → sticks when it touches a floor.

**Ruse**
- No differences found.

**Not Dead Yet**
- Instant → 1.5 s revive, up to 2 s intangible.
- Valorant: killing Clove after she uses it gives the killer an ultimate point and a signature charge (13.09).

## Lumen (Waylay)

**Saturate**
- 5 m → 6 m.
- Bursts on landing → 0.6 s wind-up; at most 1 s in the air.

**Lightspeed**
- Two 0.15 s dashes of about 6 m → 0.45 s and 9 m each.
- No single dash → Alt Fire does one dash.

**Refract**
- Can go back after 0.3 s → 1 s.
- Valorant: nearsighted while travelling, 0.2 s blind on arrival.

**Convergent Paths**
- No differences found.
