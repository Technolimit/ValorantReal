# Tapfire

A tactical-shooter gunplay sandbox that runs entirely in the browser: no game server, no build step.

## Running it

Serve this folder over HTTP and open `index.html`:

```sh
npx serve .            # or: python3 -m http.server 8000
```

Opening `index.html` straight from disk (`file://`) won't work: browsers block ES modules and `fetch` there.
It also works as-is on any static host (GitHub Pages, Netlify, an S3 bucket).

## Online play (no server)

Main menu → **Online**. One player hosts, the others join with the room code. Pick a mode and an agent;
abilities work in both modes.

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

15 preset finishes plus a **custom skin editor** (Skins → New custom skin): colours, roughness and
metallic for each part, 13 procedural patterns with their own colours, and glow. Custom skins are saved in
localStorage and can be shared as a `TFSKIN1.…` code or exported/imported as JSON. Bots wear random
presets, and other online players see your skins.
