# Visual differences from Valorant

How Tapfire looks while you play, next to how Valorant looks: other players moving, your own view, shooting,
status effects, the spike and the abilities. Timings, damage and other numbers are in
[VALORANT_DIFFERENCES.md](VALORANT_DIFFERENCES.md) and [ABILITIES.md](ABILITIES.md).

Tapfire's side comes from screenshots of the game (Divide and the Range, November 2026) and from `js/render.js`,
`js/models.js` and `js/hud.js`. Each item reads **Tapfire → Valorant**.

## Other players

- **Bodies.** Four boxes (legs, body, head and a dark visor) in a flat team colour: teal for your team, red for
  the enemy (in deathmatch each player has their own colour) → fully modelled agents, each with its own look.
  Bodies are not coloured by team.
- **Enemy outline.** None; enemies stand out only by colour → every enemy has a thin outline in red, yellow or
  purple (a setting).
- **Running, walking, strafing.** The boxes slide along the floor with no leg or arm movement → run, walk and
  crouch-walk cycles, with the upper body following the aim.
- **Jumping and falling.** The boxes move up and down with no change of pose → jump, fall and landing poses.
- **Crouching.** The boxes get shorter → a crouch pose.
- **The gun in their hands.** The real weapon model in their skin, floating at chest height and tilting with
  their aim → held in both hands, with reload, equip, firing and knife animations.
- **Holding or casting an ability.** The gun disappears and nothing replaces it → each ability has a visible
  cast animation (Sova drawing his bow, Brimstone using his wrist device, Phoenix with fire in his hand).
- **Planting and defusing.** No pose → kneeling animation with the spike or the defuser in hand.
- **Getting hit.** The body flashes dark red for 80 ms and throws a burst of small square particles (white on a
  headshot, red otherwise) → small hit effects on the model (blood is a setting).
- **Dying.** The body tips over backwards in about half a second. It stays for the round in 5v5 and disappears
  after about a second in deathmatch → death animations; the body stays where it fell.
- **Flashed.** A white bulb floats over a blinded player's head → no marker.
- **Revealed.** The whole body glows red and is drawn through walls for as long as the reveal lasts → a red
  highlight through walls.
- **Snapshot reveals** (Mindread, the Watcher's dart). A red ghost of the enemy is left where they stood and
  stays still, on screen and on the minimap → a frozen red silhouette. Close to Valorant.

## Your view while moving

- **Hands.** Small blocky sleeve and glove pieces on the gun; the arms are missing → each agent's own gloved
  hands and sleeves on every weapon.
- **Camera.** No head bob; the view eases down when you crouch and smooths step-ups. Close to Valorant.
- **Gun movement.** The gun bobs in a figure eight when you run, breathes when you stand still, trails behind
  mouse turns, tilts when you strafe, lifts when you jump and dips when you land. Valorant's gun moves the same
  ways; Tapfire's motion is procedural, not animated by hand.
- **Jett's dash and updraft (Zephyr).** The field of view widens for a moment and speed lines cross the screen
  → a wind effect around the screen.
- **Neon's sprint (Volt).** Blocky arms pump with no gun → her arms crackle with electricity.

## Shooting

- **Muzzle flash.** A large round glow at the muzzle for 40 ms (25 ms and smaller on suppressed guns) → a
  small, shaped flash that depends on the skin; suppressed guns barely flash.
- **Tracers.** A thin streak for every bullet: yellow for yours, orange-red for others → fainter tracers.
- **Bullet holes.** Dark square marks that fade after 6 s (a setting), the same on every surface, with grey
  square debris → holes and impact effects that depend on the material (sparks on metal, splinters on wood,
  dust on stone), which stay longer.
- **Damage numbers.** Numbers float up from where you hit; on by default → none in matches.
- **Spray trainer.** An overlay on the right draws the gun's spray pattern and where your shots went; on by
  default → no such overlay.
- **Reloads.** Each gun type has its own animation (magazine out and in, cylinder swing, bolt, shells one by
  one), but the gun and its parts move with no hands doing it → hand-animated reloads.
- **Equip.** The gun rises from the lower right with a twist and a small overshoot; a few skins have their own
  → each weapon has its own draw animation, and many skins have their own.
- **Knife.** A plain slash, or a lunge for the heavy attack (some knife skins have their own swings) →
  hand-animated slashes and stab.
- **Aiming down sights and scopes.** These were matched to Valorant screenshots (issue #62). Close to
  Valorant.

## Status effects on your screen

- **Flashed.** A plain white overlay: fully white for the flash's length, then fading out over up to 1 s, as the
  spec describes. Close to Valorant.
- **Concussed.** The view turns grey, blurs and shakes, with static over it. Close to Valorant, which the spec
  describes as a blurred, greyscale view with noise.
- **Nearsight.** The world fades into purple-black fog past the range → a dark tunnel closing in from the
  screen edges.
- **Deafened, detained, suppressed, hindered, Vulnerable, Decay.** A line of text at the bottom right →
  status icons next to your health, and greyed or crossed-out ability icons when suppressed.
- **Inside a smoke.** A light grey haze, with the smoke's wall around you. Close to Valorant.
- **Minimap.** It goes dark while you're concussed or nearsighted, shows only the last 3 m around you inside a
  smoke, and the ability map can't be opened while you're flashed. Close to Valorant.
- **Damage taken.** Arrows around the centre point toward the shooter, with a red vignette. Close to Valorant's
  red arcs.
- **After you die.** The view drops and turns to face your killer for 2.5 s, then you spectate a teammate.
  Once your whole team is dead, the camera circles the spike → Valorant does not turn your view toward the
  killer or circle the spike.

## The spike

- **Model.** A small dark cylinder with a red ring and a light that blinks 1, 2, 4 and then 8 times a second
  as time runs out → a larger, detailed device whose lights pulse with the beeps.
- **Planting and defusing in first person.** Your hands hold a plain red block → your hands place the spike or
  work the defuser.
- **Detonation.** No visual; the spike just disappears → a huge expanding sphere of light.

## Checked on screen

Numbers and sizes were checked in screenshots and on the HUD (November 2026, second pass):

- **Damage numbers** at 10 m for Vandal, Phantom, Sheriff, Classic, Ghost, Spectre, Guardian, Warden, Bulldog,
  Marshal, Operator and Odin (head, body, legs): all Valorant's, e.g. Vandal 160 / 40 / 34, Operator
  255 / 150 / 127.
- **Shop**: every gun, shield and ability price matches Valorant's (patch 13.10, with the Warden from 13.06).
- **Round timer**: 0:45 for the first buy phase, 0:30 after, 1:40 for the round. After the plant, Valorant shows
  only the spike icon, no countdown; Tapfire now does the same, the icon pulsing faster as the spike runs down.
- **Sizes next to a person (1.8 m)**:
  - Sky smokes are domes about 7 m across.
  - Frost Wall is 2.6 m tall, enough to hide someone standing behind it.
  - Firebreak, Toxic Wall and Static Lanes stand 6.75 m.
  - The Gridlock cage is a 3.45 m cylinder.
  - Fire and acid cover 4.5 m.
  - Sky Hammer and Chill cover 9 m.

  What is drawn is exactly what blocks or hurts.
- **Flash timing on screen**: a full 1.5 s flash stays fully white for 1.5 s, then fades out over 1 s.

## Abilities: what they all share

- **Holding an ability.** One generic blocky hand in the agent's colour holding:
  - a glowing ball in the agent's colour (every smoke, flash, heal and orb looks the same apart from colour);
  - a dark ball with a glowing band (grenades);
  - a dark box with a light (gadgets).

  Hawke holds a plain curved bow and Blitz a cluster bomb → every ability has its own model and hand animation.
- **Ability bar.** Each slot shows its key and the ability's name → each slot shows the ability's icon art.
- **Thrown abilities.** Most fly as a glowing ball in the ability's colour; only rockets, paint shells,
  bomblets and arrows have models → every projectile has its own model and trail.
- **Smokes.** One smooth sphere per smoke, tinted by agent and lit like a solid object, with no texture or
  movement → wispy, textured, slowly moving clouds with each agent's own style. Both grow in when the smoke
  goes up (0.75 s) and shrink away as it ends (1 s).
- **Walls** (Firebreak, Toxic Wall, Static Lanes, Riptide, Frost Wall, Push Wall, Rift Line). Flat
  translucent slabs in one colour, some with a brighter inner layer or bright edges; deployable walls rise out
  of the floor in 0.3 s → animated fire, gas, electricity, water, ice or energy.
- **Ground effects** (fire, acid, slow fields, Rally, Hive). A flat disc with a bright rim; fire adds a few
  flickering cones → animated pools and particles.
  They are drawn only as far as they reach: a molly against a wall stops at the wall, as it does in play
  and in Valorant.
- **Flash bursts.** One white glow sprite for every flash → each flash has its own look.
- **Gadgets** (turrets, alarm bots, cameras, trip wires, drones, Boom Bot, tiger, hawk, seekers, prowlers,
  stars, anchors). Built from spheres, boxes and cylinders with a blinking light → detailed, animated models.
  Hidden ones only show up close, as in Valorant: a trip wire within 3 m, a Hive within 5.25 m, an alarm bot
  within 7 m, a camera within 8 m (12 m while someone is looking through it).
- **Pulses** (sonar, stuns, reveals). A translucent sphere that grows and fades. Close in idea, plainer in look.
- **Ultimates.** No full-screen moment and no voice line → each ultimate has its own effects, and its voice
  line is heard across the map.

## Abilities, agent by agent

Only what differs beyond the shared points above.

| Tapfire agent (Valorant) | How Tapfire draws it | Valorant |
|---|---|---|
| Zephyr (Jett) | Veil: glowing ball with a line trail, then a white sphere. Edgestorm: plain blocky blades. | Cloudburst is a swirling cloud; Blade Storm's kunai glow and float in her hand. |
| Cinder (Phoenix) | Firebreak: orange slab. Ember: disc with flame cones. Sunflare: white glow. Rekindle: orange screen tint. | Real flames on the wall and pool; Curveball is a bright orb that pops; Run It Back shows a fiery marker. |
| Umbra (Omen) | Rift: purple glows at both ends. Shade: purple sphere; aiming it turns the map into violet outlines. Nightwalk: a dark capsule figure. | Shadowy smokes with wisps; teleports leave a shadow cloud; From the Shadows shows a shade of Omen. |
| Hawke (Sova) | Plain bow. Sonar Bolt: a small glowing tip and halo. Kestrel: sphere with flat wings. Talon Strike: straight beams. | Detailed bow with a nocked arrow; Recon Bolt sends visible scan waves; Owl Drone is a modelled drone. |
| Bastion (Killjoy) | Sentry: grey cylinder with a green box head. Watchdog: grey ball with a red light. Hive: small disc. Clampdown: a large translucent dome. | Killjoy's yellow-and-black robots; Nanoswarm bursts into a swarm of bots; Lockdown has a large device and an expanding field. |
| Blitz (Raze) | Boomer: orange ball on two wheels. Kicker: pink box. Splatter: coloured cluster bomb. Finale: rocket model and a glow sphere. | Boom Bot is a modelled robot; Blast Pack and Paint Shells burst in colourful paint. |
| Granite (Brimstone) | Overcast: grey spheres. Sky Hammer: red column of light with a red disc. Napalm: disc with flame cones. | Sky Smokes drop from the sky; Orbital Strike is a laser with a burning ring; his wrist device shows in first person. |
| Venom (Viper) | Plain green spheres and slabs. Acid Vial: green disc. Nest: a very large green sphere. | Swirling green gas with emitters on the ground; acid bubbles in the pool. |
| Vex (Reyna) | Glare: purple sphere with a white centre. Soul orbs: purple balls. | A purple eye; floating soul orbs with trails; Empress shows on her eyes. |
| Quake (Breach) | Fissure and Aftershock Wave: flat orange strips and wedges on the floor. Glimmer: white glow. | The ground cracks and heaves; the flash comes through the wall in a bright burst. |
| Volt (Neon) | Static Lanes: blue slabs. Overload: a glowing rod from the fingertip. | Electric walls with lightning; Overdrive is a crackling beam. |
| Mirage (Yoru) | Double: a translucent blue box figure. Phase Out: dark screen tint. | Fakeout is a copy of Yoru; Dimensional Drift shows a mask and another-dimension view. |
| Fawn (Skye) | Stalker: green box animal. Lantern Hawk: glowing body with flat wings. Hunters: green glowing ovals. Bloom: teammates glow green. | Trailblazer is a Tasmanian tiger, Guiding Light a hawk, Seekers spirit creatures, all modelled. |
| Lattice (Cypher) | Tripline: thin line between two small boxes. Watcher: dark ball with a light. Gridlock: small hexagon disc; the cage is a grey cylinder. | Modelled wire anchors and camera; cages are thin grey cylinders. |
| Nyx (Fade) | Hound: box animal. Omen Eye: dark sphere with a pink core. Terror: a translucent strip. | Prowlers and the Haunt eye are creature models; Nightfall is a dark wave. |
| Solace (Sage) | Frost Wall: translucent light-blue segments with bright edges. Chill: cyan disc and ring. | Crystalline ice wall; Slow Orb leaves an icy field. |
| Stella (Astra) | Stars: a gold octahedron with a halo. Nebulas: spheres. Rift Line: a purple slab across the map. | Stars are glowing points; Astral Form is a cosmic map view; Cosmic Divide is a shimmering wall. |
| Regent (Chamber) | Snare: small dark puck with a gold light. Anchor: gold ring and post. | Modelled gold devices; the guns have their own gold models. |
| Marina (Harbor) | Riptide and Squall: teal slabs and rings. Lagoon: teal dome. Undertow: teal columns. | Moving water with ripples and spray; Cove is a bubble of water. |
| Vanta (Iso) | Push Wall: purple translucent rectangle. Duel: a dark purple box room. | Purple hexagon-pattern energy; Kill Contract pulls both into an arena. |
| Ballast (Tejo) | Scout Drone: sphere with four rotor discs. Missile Call and Barrage: flat discs and glows. | Modelled drone and missiles; visible missile trails. |
| Override (KAY/O) | Zero Point: blue box blade. Fragment and Flashpoint: glowing balls. | A modelled knife and grenades; suppression shows on screen. |
| Thistle (Clove) | Ruse: pink spheres. | Smokes in Clove's style; butterflies show on their abilities. |
| Lumen (Waylay) | Saturate and Refract: glowing balls and discs. Convergent Paths: straight beam. | Prismatic light effects. |
