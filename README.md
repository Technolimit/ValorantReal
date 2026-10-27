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
`node tools/check-world.mjs` checks that the collision grid answers exactly like testing every box.
`node tools/profile.mjs [seconds] [--shadows on] [--scale 1] [--cpu] [--spikes]` plays a 5v5 on Divide headless and reports
the cost of a tick and a frame, draw calls and garbage. `node tools/check-net-smooth.mjs` measures how smoothly another player moves
on your screen online, with a jittery connection simulated.
`node tools/check-spectate-sound.mjs` checks that a dead player spectating in 5v5 hears from the spectated
teammate's position. `node tools/render-guns.mjs [out-dir]` renders every gun's firing sound to WAV (through the game's own synth) so
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

16 preset finishes plus a **custom skin editor** (Skins → New custom skin): colours, roughness and
metallic for each part, 13 procedural patterns with their own colours, and glow. Custom skins are saved in
localStorage and can be shared as a `TFSKIN1.…` code or exported/imported as JSON. Bots wear random
presets, and other online players see your skins.

**Model skins** replace the gun itself, not just its paint: a skin's `models` maps a weapon to its own design in
`js/models.js`, which brings its own inspect (`MODEL_INSPECTS` in `js/melee.js`) and reload (keyed by the design in
`js/reloadanim.js`), and the skin menu only offers it on those weapons. The first is **Orbital** (Vandal): a
purple and gold receiver built around a reactor ring holding a glowing orb. Inspect floats the orb out of the
ring while the gun is turned side-on in front of you; reload pops the spent orb out and seats a fresh one.

**Melee types** (Skins → Melee): Tactical Knife, Hatchet, Katana, Karambit, Balisong, Kunai and Arc Blade.
Picking one equips it in your knife slot (they all hit like the knife; it's cosmetic), and each takes any
finish. Each has three inspects (`js/melee.js`): press **Y** to inspect, press it again mid-inspect to chain
into the next one, and hold it to examine the weapon with the mouse. The skin menu's *Play inspect* button
previews them. Bots carry random melee types, and other online players see yours.
