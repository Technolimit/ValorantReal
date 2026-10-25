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

Main menu → **Online**. One player hosts, the others join with the room code. Online matches are
deathmatch with abilities off.

- **This browser (BroadcastChannel):** tabs and windows of the same browser on the same site. Nothing leaves
  the machine. Handy for testing; keep the windows side by side, since browsers slow down hidden tabs.
- **Internet (PeerJS / WebRTC):** different computers. `vendor/peerjs.min.js` (PeerJS 1.5.4, MIT) is
  loaded on demand. Its free public broker (`0.peerjs.com`) only introduces the browsers; game traffic then
  goes peer to peer. Strict NATs/firewalls can block WebRTC without a TURN server.

How it syncs (`js/net.js`): the host's browser runs the real match (bots, damage, kills, respawns, score) and
sends snapshots of every player and bot 20 times a second. Each joiner simulates its own movement and aim,
sends its position 30 times a second, and reports its own hits to the host (favour-the-shooter, lightly
sanity-checked). Shots, tracers, kills and skins (including custom designs) are relayed to everyone.
Imported maps are sent to joiners too.

## Maps (JSON, loaded with fetch)

`maps/index.json` lists the maps; each is fetched when first needed. Two formats:

- **grid** — hand-written: a character layout plus a legend. See `maps/arena.json` and `maps/foundry.json`.
  Legend entries: `{ "mat": "wall", "h": 5, "pen": false, "thin": 0.3 }` for a solid box (`pen` = bullets go
  through, `thin` = a thin panel), `{ "walk": 0 }` for a floor height, `{ "spawn": true }` for spawns.
  Optional: `floor`, `sky`, `fog`, `labels`.
- **baked** — finished geometry and 5v5 data generated from code. `maps/divide.json` comes from
  `tools/divide.js`; after editing that, run `node tools/bake-maps.mjs`.

To add a map, drop the JSON in `maps/` and list it in `index.json`, or use **Maps → Import file / Load from
URL** in the game (stored in the browser's localStorage).

Materials: `wall floor crate wood half stone plaster terra tile planter brick` and the rest of `MAT_COLORS`
in `js/render.js`.

## Skins (all client-side)

15 preset finishes plus a **custom skin editor** (Skins → New custom skin): colours, roughness and
metallic for each part, 13 procedural patterns with their own colours, and glow. Custom skins are saved in
localStorage and can be shared as a `TFSKIN1.…` code or exported/imported as JSON. Bots wear random
presets, and other online players see your skins.
