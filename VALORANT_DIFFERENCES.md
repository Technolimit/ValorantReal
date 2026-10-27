# Differences from Valorant

Every place where a Tapfire agent's kit still works differently from the Valorant agent it mirrors, checked
against the code in `js/abilities.js`, `js/game.js` and `js/prices.js` (October 2026). Numbers that already match
are not listed; see [ABILITIES.md](ABILITIES.md) for those.

Items marked *(unverified)* are ones where the Valorant value could not be confirmed from a primary source, so the
difference may not be real.

## All agents

- **Deathmatch has abilities.** Valorant's deathmatch has none. Tapfire gives every ability its own cooldown there.
- **Equip time.** Every ability takes the same 0.25 s to draw. In Valorant each ability has its own equip time
  (Boom Bot 1.1 s, for example).
- **Destructible utility.** Only these can be shot: Turret, Alarmbot, Nanoswarm, Spycam, Trapwire, Boom Bot,
  Prowler, Owl Drone, Trailblazer, Fakeout, ZERO/point, Haunt, Gatecrash rift, Lockdown, Cove. In Valorant these
  can be destroyed too and can't here: Recon Bolt, Leer, Seekers, Trademark, Sage's Barrier Orb (each segment has
  its own HP).
- **Missing agents.** Gekko, Deadlock, Vyse and Veto have no Tapfire counterpart.

## Zephyr (Jett)

- **Veil (Cloudburst):** the orb bursts when you let go of C and flies 7 m/s while held. In Valorant it bursts on
  impact; holding the key only curves it toward your crosshair.
- **Lift (Updraft):** 1 charge in 5v5 but 2 in deathmatch. Valorant uses one number for both *(check which)*.
- **Edgestorm (Blade Storm):** switching weapons drops the blades. In Valorant you can't put them away until the
  ultimate ends *(unverified)*.

## Cinder (Phoenix)

- **Firebreak (Blaze):** burn 30/s and heal 12.5/s *(unverified)*.
- **Ember (Hot Hands):** 3.5 m pool radius *(unverified)*.

## Umbra (Omen)

- **Shade (Dark Cover):** controls differ. Valorant: hold alt-fire to push the smoke farther, hold the ability key
  to pull it closer, Reload toggles phased mode. Tapfire: right click pushes (and wraps back to the start at max
  range), R toggles stopping at the first wall.
- **Nightwalk (From the Shadows):** can't be cancelled once the 4 s channel starts. In Valorant you can cancel it
  and keep the ultimate. Channel length *(unverified)*.

## Hawke (Sova)

- **Arc Dart / Sonar Bolt (Shock Bolt / Recon Bolt):** no bounces. Valorant lets you add up to 2 bounces with
  alt-fire before shooting.
- **Sonar Bolt (Recon Bolt):** can't be shot out.
- **Kestrel (Owl Drone):** ends as soon as your body takes damage. In Valorant you stay in the drone *(unverified)*.

## Bastion (Killjoy)

- **No deactivation range.** Killjoy's Nanoswarm, Alarmbot and Turret switch off when she is more than 40 m away.
  Tapfire's never switch off.
- **Hive (Nanoswarm):** pressing C sets off every placed grenade together. In Valorant each one is triggered on its
  own.
- **Sentry (Turret):** 7 damage a shot *(unverified)*.

## Blitz (Raze)

- **Splatter (Paint Shells):** the grenade and bomblets don't bounce off walls before going off.
- **Boomer (Boom Bot):** deploys at once. Valorant has a 1.1 s equip and a short deploy delay.

## Granite (Brimstone)

- **Rally (Stim Beacon):** only speeds up fire rate and movement. Valorant's Combat Stim also speeds up reload and
  weapon swaps *(unverified)*.
- **Napalm (Incendiary):** 7 s *(unverified, some sources say 8 s)*.

## Venom (Viper)

- **Toxin does real damage** (10/s through `damage`). In Valorant it is Decay: it can't kill and the lost HP comes
  back after you leave the gas.
- **Fuel:** minimum fuel to switch gas on and the drain rate *(unverified)*.
- **Toxic Wall (Toxic Screen):** 40 m long *(unverified)*.

## Vex (Reyna)

- **Glare (Leer):** can't be shot out.
- **Feast / Vanish (Devour / Dismiss):** use an orb at any distance. Valorant needs the orb to be nearby.
- **Soul orbs** drop only from enemies you kill. In Valorant an enemy you damaged who dies within 3 s also drops one.
- **Ravenous (Empress):** each kill heals 100 here. Valorant's Empress gives no automatic heal; you still need
  Devour.
- **Vanish** loses its speed boost on `main`; the fix is on this branch (commit 3b0419d) and not merged yet.

## Quake (Breach)

- **Fissure (Fault Line):** 40 m maximum *(unverified)*.
- **Aftershock Wave (Rolling Thunder):** 32 m range *(unverified)*.

## Volt (Neon)

- **Ricochet (Relay Bolt):** only shocks where it lands. In Valorant it goes off at the bounce point and where it
  lands.
- **Overclock (High Gear):** sliding ends the sprint. In Valorant you keep running after a slide *(unverified)*.
- **Energy:** refill rate *(unverified)*.

## Mirage (Yoru)

- **Double (Fakeout):** blinds whoever looks at it. In Valorant the decoy flashes when it is shot, and alt-fire
  places a standing decoy, which Tapfire doesn't have.
- **Riftwalk (Gatecrash):** no fake teleport (Valorant lets you trigger a fake teleport sound at the rift). Valorant
  may also now sell a second charge for 150 *(unverified)*.
- **Phase Out (Dimensional Drift):** no abilities while drifting. Valorant lets Yoru use his abilities in it.

## Fawn (Skye)

- **Stalker (Trailblazer):** pounces on its own. In Valorant you press fire to leap, and the leap deals damage only
  on a direct hit.
- **Hunters (Seekers):** can't be shot out.
- **Lantern Hawk (Guiding Light):** price and charges *(unverified)*.

## Lattice (Cypher)

- **Tripline (Trapwire):** reveals for 5 s, holds for 2 s, then stuns for 3 s. Valorant's current Trapwire works
  differently: a short wind-up, a small zap with a slow, and the victim can break the wire to escape
  *(details unverified)*.
- **Mindread (Neural Theft):** works on any body. Valorant only allows bodies that died in the last 20 s.

## Nyx (Fade)

- **Omen Eye (Haunt) and Terror (Nightfall):** no terror trail. In Valorant revealed enemies leave a trail that
  Prowlers follow.

## Solace (Sage)

- **Frost Wall (Barrier Orb):** can't be broken. Valorant's wall segments have HP and can be shot down.
- **Mend (Healing Orb):** self-heal 50 over 5 s *(unverified)*.

## Stella (Astra)

- **Stars don't use up C/Q charges.** Gravity Well, Nova Pulse and Nebula only need a star, so buying Gravity Well
  or Nova Pulse does nothing, and all 4 stars can be Nebulas. In Valorant each activation uses a charge of that
  ability.
- **Key layout:** placing stars (Astral Form) is on E and Cosmic Divide is the ultimate. In Valorant Astral Form
  (placing stars and Cosmic Divide) is the ultimate key.
- **No Dissipate.** Valorant lets you turn a star into a short fake smoke and take the star back.

## Regent (Chamber)

- No differences found, but Rendezvous (50 m, 20 s between teleports) and Trademark were not confirmed against
  the current patch *(unverified)*.

## Marina (Harbor)

- **Breaker (Cascade):** Valorant replaced Cascade with Storm Surge (a thrown orb that nearsights, slows and
  reveals). Tapfire still has the old wave.
- **Undertow (Reckoning):** Valorant reworked Reckoning; Tapfire keeps the old three-geyser stun *(details
  unverified)*.

## Vanta (Iso)

- **Duel (Kill Contract):** picks any enemy you look at, at any distance, through walls. Valorant fires a 36 m long,
  15 m wide column and takes the first enemy it hits.
- **Duel arena:** doesn't refill health, shields or ammo. Valorant's arena does.
- **Push Wall (Contingency):** 3.5 s. Valorant's wall lasts longer *(unverified)*.

## Ballast (Tejo)

- **Missile Call (Guided Salvo):** each missile makes one explosion where it lands. In Valorant the missiles travel
  along the ground path and go off several times *(unverified)*.
- **Barrage (Armageddon):** you pick a start point and it walks the way you face. In Valorant you pick a start
  point and an end point.
- **Scout Drone (Stealth Drone):** pulse effect *(unverified)*.

## Override (KAY/O)

- **Overload (NULL/cmd):** if you would die you reboot on your own after 3 s. In Valorant KAY/O is downed and a
  teammate has to revive him.
- **Fragment (FRAG/ment):** no underhand throw.
- **Zero Point (ZERO/point):** 50 s cooldown; some sources say 60 s *(unverified)*.

## Thistle (Clove)

- **Not Dead Yet:** the revive is instant. In Valorant there is a short revive cast and brief protection before you
  can fight.

## Lumen (Waylay)

- **Lightspeed:** each dash takes 0.15 s. Valorant's are slower, about 0.45 s each *(unverified)*.
- **Saturate:** no wind-up before the throw *(unverified)*.
