# Tapfire

A tactical-shooter gunplay sandbox that runs entirely in the browser: no game server, no build step.

## Running it

Serve this folder over HTTP and open `index.html`:

```sh
npx serve .            # or: python3 -m http.server 8000
```

Opening `index.html` straight from disk (`file://`) won't work: browsers block ES modules and `fetch` there.
It also works as-is on any static host (GitHub Pages, Netlify, an S3 bucket).

`node tools/check-abilities.mjs` runs headless checks of ability interactions in Chromium (it needs
`playwright`). Pass `--offline` to skip the two-tab online checks, or `--only <text>` to run just the checks whose
name contains it. `node tools/check-agent-select.mjs` checks the
agent select: the pick rules, offline 5v5, and an online room with a player joining mid-match. `node tools/check-spike.mjs`
checks that bots carry the spike out of spawn and plant it on Divide. `node tools/check-bot-wallbang.mjs` checks that bots
stop shooting when their target ducks behind a wall, and still shoot when they can see it.
`node tools/check-buy-drop.mjs` checks that buying over a carried-over gun drops it and buying over one bought this round sells it back.
`node tools/check-economy.mjs [--offline] [--shots <dir>]` checks the 5v5 buy menu (credits, next-round minimum, loss bonus,
team credits), weapon requests offline and online, and ultimate orbs; `--shots` saves pictures of the shop and an orb.
`node tools/check-pullout.mjs [out-dir]` checks that a gun shows as soon as it's pulled out, with the weapon glow on, for default and skinned guns.
`node tools/check-world.mjs` checks that the collision grid answers exactly like testing every box.
`node tools/profile.mjs [seconds] [--shadows on] [--scale 1] [--cpu] [--spikes] [--gpu]` plays a 5v5 on Divide headless and reports
the cost of a tick and a frame, draw calls and garbage (`--gpu` waits for each frame to finish drawing, so the render time includes the pixels). `node tools/check-net-smooth.mjs` measures how smoothly another player moves
on your screen online, with a jittery connection simulated.
`node tools/check-spike-sound.mjs [--offline]` checks the plant and defuse sounds (start, progress, halfway, finished and cancel),
for bots, for you, and for a client hearing a bot on the host. `node tools/check-spectate-sound.mjs` checks that a dead player spectating in 5v5 hears from the spectated
teammate's position. `node tools/shoot-skins.mjs <out-dir> [--only <text>]` saves first-person pictures of the model skins and knives (at rest, mid-inspect and mid-sheen) for comparing how they look. `node tools/render-guns.mjs [out-dir]` renders every gun's firing sound to WAV (through the game's own synth) so
you can listen to and compare them outside the game.

Offline 5v5 uses the same pick screen: you lock in, then the nine bots pick.

## Online play (no server)

Main menu → **Online** opens the server screen.

- **Create server:** name it, pick the mode, map and max players (2 to 10), and who can join (anyone with
  the code over the internet, or tabs of this browser). Your browser hosts it; the room code shows on the pick screen.
- **Join a server:** lists internet servers and servers open in other tabs of this browser (`js/servers.js`).
  Same-browser hosts announce themselves on a BroadcastChannel. For the internet there's still no server: one
  player's browser holds the list under a well-known PeerJS id (`tapfire-directory-v1`), hosts send it their
  room every 2 s, and it sends the list to everyone with the server screen open. When that player leaves,
  another browser takes the id over and the list fills back in within about 10 s. If nobody else has the game
  open, or the broker is unreachable, join with the host's room code (shown on the pick screen).

Abilities work in both modes.

- **Agent select:** the room opens on a Valorant-style pick screen. People who join show up in the team strip
  and can lock in right away; when the host presses Start, a 60 s timer runs (it ends early once everyone has
  locked in). An agent can only be locked once per team in 5v5, and once per match in deathmatch. Teammates see
  what you're hovering; the other team only sees how many have locked in. When the people are done, bots pick
  from the agents that are left (filling the roles their team lacks), and the match starts.
- **Joining a match that's already running:** you pick on the deathmatch-style screen, with taken agents greyed
  out (in 5v5, the agents of the people on the team you'll join; you take over a bot, preferably the one
  already playing your pick).

- **5v5 rounds** (Divide): the match always has ten players. Each joiner takes a bot's place on the team
  with fewer humans, so people are split evenly and bots fill the rest. When someone leaves, a bot takes
  over their body. Buying, the spike, the economy and halftime run on the host.
- **Buy menu (B, 5v5):** laid out like Valorant's: your credits, the least you'll have next round and the loss
  bonus ladder along the top; guns in four columns with shields and abilities underneath; the team on the right
  with each teammate's credits, gun, shield and weapon request. Click a gun you can't afford to request it, and
  click a teammate's request to buy it for them: it drops at their feet with your skin. Bots ask for rifles when
  the team is buying and they're short, and fill requests (yours too) from what they have left.
- **Ultimate orbs:** hold F on one for 3 s for an ultimate point. A ring on the floor fills while you take it.
- **Deathmatch:** free for all with bots, on any map.

- **This browser (BroadcastChannel):** tabs and windows of the same browser on the same site. Nothing leaves
  the machine. Handy for testing; keep the windows side by side, since browsers slow down hidden tabs.
- **Internet (PeerJS / WebRTC):** different computers. `vendor/peerjs.min.js` (PeerJS 1.5.4, MIT) is
  loaded on demand. Its free public broker (`0.peerjs.com`) only introduces the browsers; game traffic then
  goes peer to peer. Strict NATs/firewalls can block WebRTC without a TURN server.

How it syncs (`js/net.js`): the host's browser runs the real match (bots, damage, kills, respawns, score) and
sends snapshots of every player and bot 20 times a second. Each joiner simulates its own movement and aim,
sends its position 30 times a second, and reports its own hits to the host (favour-the-shooter, lightly
sanity-checked). Abilities are synced by sending each player's ability inputs, which every browser replays
on its own copy of that agent; only the host applies ability damage. Shots, tracers, kills, dropped guns
and skins (including custom designs) are relayed to everyone.
Imported maps are sent to joiners too.

## Agents

**[ABILITIES.md](ABILITIES.md)** lists every agent's abilities with their charges, prices, cooldowns, durations and
ultimate costs, and how they recharge in 5v5 and in deathmatch.

## Maps (JSON, loaded with fetch)

Every map is one editable JSON file in `maps/`, listed in `maps/index.json` and fetched when first needed. A map
file holds everything about the map: walls and floors (as boxes, a character grid, or both), materials, sky, fog,
sun and lamps, deathmatch and 5v5 spawns, spike sites, buy-phase barriers, ropes, signs, trees, decoration, labels,
bot positions, and per-map rules (round timers, economy, respawn time, gravity). Bot navigation is worked out from
the geometry when the map loads, so editing walls never needs a rebuild step.

**[MAPS.md](MAPS.md)** explains the format in plain language; `maps/map.schema.json` describes every field for
editors that check JSON. `maps/materials.json` is the shared material library.

- **Range** (`arena.json`) and **Foundry** (`foundry.json`) are character-grid maps; Foundry also plays 5v5.
- **Divide** (`divide.json`) is the full 5v5 map, made of boxes, each tagged with the area it belongs to.

To add a map, drop the JSON in `maps/` and list it in `index.json`, or use **Maps → Import file / Load from URL** in
the game (stored in the browser's localStorage). **Maps → Download** saves any map as a file to start from. Older
`"grid"` / `"baked"` map files still load; `node tools/upgrade-map.mjs old.json new.json` converts them.

## Skins (all client-side)

**Skins** opens a Valorant-style **collection**: every weapon drawn in the skin it wears, grouped by type, with
one card for your melee. Pick a weapon to open its screen: a big preview you can drag to turn, its skins down the
side, the skin's **colour variants** as swatches bottom-left, and **Equip** bottom-right (clicking around only
previews; nothing changes until you equip). Esc or Back returns to the collection.

The gun skins are **Standard Issue**, **Ember Circuit** and **Glacier**, plus two model skins with four colour
variants each, plus a **custom skin editor** (New custom skin): colours, roughness and metallic for each part, 13
procedural patterns with their own colours, and glow. Custom skins are saved in localStorage and can be shared as a
`TFSKIN1.…` code or exported/imported as JSON. Bots wear random presets, and other online players see your skins.

**Model skins** replace the gun itself, not just its paint: a skin's `models` maps a weapon to its own design in
`js/models.js`, which brings its own inspect (`MODEL_INSPECTS` in `js/melee.js`) and reload (keyed by the design in
`js/reloadanim.js`), and the skin screen only offers it on those weapons. A skin's `variants` are recolours of it
(registered as `<skin>~1`, `~2`, …).

- **Orbital** (Vandal; Violet, Solar, Glacial, Eclipse): a receiver with a reactor ring on top holding a glowing
  orb. Inspect floats the orb out of the ring; reload pops the spent orb out and seats a fresh one.
- **Starspur** (Sheriff, Marshal, Judge, and the Bowie melee; Frontier, Dusk Rider, Silver Dollar, Red Mesa): an
  original space-western set in bone enamel, copper and star-fire glow, every gun with a spur rowel that spins.
  Sheriff: long octagonal barrel, six lit chambers; inspects *Gunslinger* (twirled twice on the trigger finger)
  and *Cylinder roll* (drum swung out and spun up). Marshal: lit under-tube and a rowel bolt knob; *Long look*
  and *Spur cock*. Judge: twin barrels and a five-chamber drum; *Drum roll* and *Barrels up*. The Sheriff and
  Marshal pull out with a twirl round the trigger guard (`EQUIP_ANIMS` in `js/melee.js`).
- **Oathblade** (Vandal, Sheriff, and the Tanto melee; Ink, Crimson Oath, Jade Court, First Snow): an original
  samurai set in black lacquer, gold leaf, folded steel and cord-wrapped grips, every gun carrying a blade whose
  edge lights up. Each draws like a blade, with a ring of steel: the Vandal comes up out of a low hip draw and cuts
  into place, the Sheriff comes down in a cut with a roll about its barrel, the Tanto is flipped from a reverse
  grip; the edge lights from the guard to the tip as it comes out. Reloads are quick and crisp, then the off-hand
  runs along the blade and the edge relights behind it with a flash. Vandal: a curved blade over the barrel and a
  guard ring; inspects *Edge light* and *Two cuts*. Sheriff: a blade on the barrel, crimson chambers; *Barrel roll*
  and *Edge light*. Tanto: *Edge light*, *Reverse grip* and *Cord spin*.

**Finishers**: Orbital's *Collapse* (the body is drawn into an orb that implodes in a shockwave) and Starspur's
*Last Light* (a star rises spinning out of the body and flares out), and Oathblade's *Last Stroke* (a beat of
stillness, one stroke of light cuts across the body, and it comes apart into petals that drift up and fade). All
of them leave nothing behind. As in Valorant, a
finisher plays on the final kill of the round in 5v5, when the round ends, however it ends (the last enemy down,
the spike, a defuse or the clock; in deathmatch, the kill that wins the match, with the scoreboard held back until
it's done), and only if that kill was made with the skin, in the colours of the variant
that got the kill. Everyone in the match sees them.

**Melee types** (the Melee card): Tactical Knife, Hatchet, Katana, Karambit, Balisong, Kunai, Arc Blade and the
Starspur Bowie and the Oathblade Tanto. Each comes in one theme of its own (Standard Issue, Heirloom, Damascus,
Nightglass, Tiger Stripe, Hexcore, Nebula, Starspur, Oathblade); equipping one puts it in your knife slot (they all hit like the knife). Each has its
own inspect (`js/melee.js`), its moves flowing into one another as one smooth animation: press **Y** to inspect,
and press it again to start it over (sound too). Model skins' guns likewise have one inspect each. The skin screen's *Play inspect* button previews them. Bots carry
random melee types, and other online players see yours.

Each melee type also swings its own way (`SWINGS` in `js/melee.js`), leaving a trail of light across the screen in
its theme's colours (`js/swingfx.js`); light swings alternate sides, and each has its own whoosh:

- **Oathblade Tanto:** one drawn cut clean across the screen that leaves a long trail of light with a thread of red
  lacquer under it, motes drifting off; the heavy cuts an X that breaks into light where the strokes cross.
- **Starspur Bowie:** a rising backhand with the rowel spinning, a teal arc throwing copper stars; the heavy hacks
  down overhead and bursts stars at the middle of the screen.
- **Nebula Arc Blade:** a wide saber sweep, a cyan core in a violet haze shedding stars; the heavy sweeps most of a circle.
- **Damascus Katana:** a flat silver crescent across the whole screen; the heavy rises corner to corner and lingers.
- **Nightglass Karambit:** a hooking violet cut with a spin on the ring; the heavy spins a full circle, then rips.
- **Tiger Stripe Balisong:** a flick that rolls the knife and rakes three amber claw marks.
- **Hexcore Kunai:** a fast red jab; the heavy helicopters once, stabs and throws out a hexagon.
- **Heirloom Hatchet:** forehand chops shedding embers; the heavy is an overhead chop with a shower of sparks.
- **Tactical Knife:** a quick slash with a thin cyan streak; the heavy is a straight stab.

`node tools/check-skins.mjs [shots-dir]` checks the skin list, the collection and weapon screens, variants, the
Starspur and Oathblade models with their inspects, pullouts and reloads, finishers, and the melee swings and their trails.
