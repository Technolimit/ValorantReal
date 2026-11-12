# Differences from Valorant

Where a Tapfire agent's kit still works differently from the Valorant agent it mirrors.

The earlier version of this file listed every difference found against patch 13.09. That list was worked
through when the patch 13.10 spec ([VALORANT_SPECS.md](VALORANT_SPECS.md)) was applied: equip times, real
projectile flight, destructible utility and its health, Decay, flash and concuss curves, ranges, durations,
damage, cooldowns and charges now come from the spec. The current numbers are in [ABILITIES.md](ABILITIES.md).

What is left is below. Everything else was set from the spec, but has not been compared side by side in game.

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

## Outside the kits

- **Maps** are original layouts, not Valorant's.
