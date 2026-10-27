# Making and editing maps

Every map in Tapfire is one text file in the `maps/` folder, written in JSON. You can change anything in it with a
plain text editor: the walls, their colours and textures, the sky and the sunlight, where players spawn, the spike
sites, the buy-phase barriers, round timers and money, even gravity. Nothing else needs changing; there is no code to
touch and nothing to rebuild.

The quickest way to start:

1. In the game, open **Maps** and press **Download** next to the map you want to start from.
2. Open the file in a text editor (VS Code is a good free one: it checks the file as you type and suggests the
   names below).
3. Change the `id` and `name` at the top so it becomes your own map, then change whatever you like.
4. Back in **Maps**, press **Import file** and pick your file. If something is wrong, the game tells you what and where.

To ship a map with the game instead, put the file in `maps/` and add a line for it to `maps/index.json`.

## A few JSON basics

- Text goes in double quotes: `"name": "My Map"`. Numbers and `true` / `false` don't.
- Lists use square brackets `[ ]`, groups use curly brackets `{ }`, and items are separated by commas. A comma after
  the **last** item breaks the file, which is the most common mistake.
- Colours are written like on the web: `"#ff4655"`.
- Distances are in metres (see Scale below).

## Where things are: x, y and z

Positions are three numbers `[x, y, z]`:

- **x** goes east (right on the minimap),
- **y** goes up (height),
- **z** goes south (down on the minimap).

So `[10, 0, -20]` is 10 m east and 20 m north of the middle, on the ground. Things that only need a spot on the floor
use two numbers, `[x, z]`.

To find a spot, stand there in the game and look at the minimap, or open the map file and look at the numbers of a
wall you know.

## Scale

Build to real Valorant proportions and the game feels right:

| Thing | Size |
| --- | --- |
| Player | 1.96 m tall standing (eyes at 1.82 m), 1.40 m crouched, 0.69 m wide |
| Head | about 0.25 m |
| Highest step you walk up | 0.45 m (higher needs a jump: about 1.1 m) |
| Doorway | at least 2.5 m tall, 2 m or more wide |
| Low ceiling (tunnels, vents) | at least 2.05 m, or bots won't walk under it |
| Crate cover | 1 m (crouch cover) or 2 m (full cover) |
| A full 5v5 map like Divide | about 120 × 120 m of floor; about 100 m from spawn to spawn |

A grid square is 2 m, so a 60 × 60 grid is a full-size 5v5 map. To make a box-built map bigger or smaller,
`node tools/scale-map.mjs maps/my-map.json 0.9` multiplies every position and size (0.9 = 10% smaller).

## Two ways to build: a character grid, or boxes

### The grid (easiest)

Draw the map with characters, one character per 2 m square, top row = north. The `legend` says what each character
is. This is how **Range** (`arena.json`) and **Foundry** (`foundry.json`) are made.

```json
"grid": {
  "layout": [
    "##########",
    "#d.d.d.d.#",
    "#..AA..c.#",
    "#........#",
    "#===##===#",
    "#........#",
    "#a.a.a.a.#",
    "##########"
  ],
  "legend": {
    "#": { "mat": "wall", "h": 5 },
    "c": { "mat": "crate", "h": 1, "pen": true },
    ".": {},
    "a": { "spawn": "atk" },
    "d": { "spawn": "def" },
    "A": { "site": "A" },
    "=": { "barrier": "atk" }
  }
}
```

Every row must be the same length, and every character you use must be in the legend. A legend entry can have:

| Key | What it does |
| --- | --- |
| `"mat": "brick"` | Makes the square a solid block of that material (see Materials). |
| `"h": 3` | How tall the block is, in metres. |
| `"base": 2` | The block starts 2 m up (a floating platform, a beam over a doorway). |
| `"pen": true` | Bullets go through it (crates, thin wood). |
| `"thin": 0.3` | Makes it a thin panel instead of a full square. |
| `"passable": true` | Players walk through it, but it blocks bullets and sight. |
| `"collide": false` | You see it, but you can walk and shoot through it. |
| `"visible": false` | An invisible wall. |
| `"paint": "grass"` | Paints the floor of that square with a material. |
| `"spawn": true` | A deathmatch spawn point. |
| `"spawn": "atk"` / `"def"` | An attacker / defender spawn point for 5v5. |
| `"site": "A"` | Part of spike site A (the site covers all its squares). |
| `"barrier": "atk"` / `"def"` | A buy-phase barrier for that team. |
| `"orb": true` | An ultimate orb (5v5). |
| `{}` | Plain open floor. |

Stairs are just blocks that get a little taller each square: `0.4`, `0.8`, `1.2`, `1.6`, then a `2` m platform. Steps
of 0.45 m or less can be walked up.

Normally the grid is centred on the middle of the world. `"origin": [x, z]` puts its top-left corner somewhere else.

### Boxes (any shape, any size)

`boxes` is a list of solid blocks. Each one is either two opposite corners:

```json
{ "min": [10, 0, -4], "max": [12, 3, 4], "mat": "brick" }
```

or a bottom-centre point plus a size `[width, height, depth]`:

```json
{ "at": [11, 0, 0], "size": [2, 3, 8], "mat": "brick" }
```

Both of those are the same 2 m thick, 3 m tall, 8 m long brick wall. Boxes take the same `pen`, `passable`,
`collide` and `visible` options as the legend. A box with `"min"` y above 0 floats, so you can make bridges,
ceilings and upper floors. **Divide** (`divide.json`) is made entirely of boxes: each one has an `"area"` note (the
game ignores it) so you can search the file for, say, `"A MAIN"`.

You can use a grid and boxes in the same map, for example a grid for the layout and a few boxes for a bridge.

Two more lists use the same shapes but have no collision:

- `floorSkins`: material surfaces, used for painted floors and road markings.
- `decor`: plain coloured shapes, `{ "min": …, "max": …, "color": "#4f7a3a" }`, for posters, vines, pipes and
  lamps. Add `"glow": true` to make one glow.

## Look and feel: `environment`

```json
"environment": {
  "sky": "#8ea3b6",
  "fog": { "near": 140, "far": 300 },
  "sun": { "color": "#fff3e0", "intensity": 2.2, "from": [-30, 60, 20], "shadows": true },
  "ambient": { "sky": "#dbe7f3", "ground": "#5a554c", "intensity": 1.3 },
  "ground": { "mat": "tile" },
  "lights": [
    { "at": [0, 3, 0], "color": "#ffb060", "intensity": 6, "range": 14 }
  ]
}
```

- `sky`: background colour. `fog`: where fog starts and where it's complete (`"fog": false` turns it off; add
  `"color"` to tint it).
- `sun`: its colour, brightness, and the direction it shines from (a far-away point; a smaller y gives a low,
  evening sun and long shadows).
- `ambient`: the soft light that fills shadows, one colour from above and one from below. Lower `intensity` for a
  darker, moodier map.
- `ground`: the material of the floor under the whole map (`false` for none).
- `lights`: up to 16 lamps.

## Materials

A material is a colour plus a pattern. `maps/materials.json` has all the built-in ones (`wall`, `floor`, `crate`,
`wood`, `brick`, `plaster`, `tile`, `concrete`, `grass`, `glass`, `neon`, `water`, `metal`, `sand` and many more).
Use any of them by name with `"mat"`.

Add your own, or change a built-in one for this map only, in the map's `materials` section:

```json
"materials": {
  "redbrick": { "colors": ["#a5463a", "#7d3229", "#933d33"], "pattern": "brick" },
  "glowblue": { "color": "#2e8fe8", "pattern": "panel", "glow": 0.8 },
  "wall": { "color": "#cbd5df" }
}
```

| Key | What it does |
| --- | --- |
| `colors` | `[base, main lines, fine lines]`. Or give one `color` and the line colours are made for you. |
| `pattern` | `grid`, `brick`, `plank`, `panel`, `tile`, `diamond`, `grate` or `none`. |
| `tileSize` | How many metres before the pattern repeats (2). |
| `crossed` | `true` draws a big X, like the crates. |
| `glow` | `0` lit normally up to `1` fully glowing. |
| `opacity` | `1` solid; lower is see-through (glass, water). It still blocks you unless `collide` is false. |
| `noise` | Amount of grain (1 normal, 0 smooth). |
| `castShadows` | `false` for flat floors. |

## Spawns

```json
"spawns": [ { "x": -1, "z": -51, "yawDeg": 180 } ],
"teamSpawns": {
  "atk": [ { "x": -9, "z": 49, "yawDeg": 0 } ],
  "def": [ { "x": -5, "z": -55, "lookAt": [0, 0] } ]
}
```

- `spawns` are for deathmatch, `teamSpawns` for 5v5 (`atk` = attackers, `def` = defenders; give each team at least
  five).
- Leave out `y` and the player stands on whatever floor is there.
- Facing: `"yawDeg"` in degrees (0 north, 90 west, 180 south, -90 east), or `"lookAt": [x, z]` to face a point. With
  neither, deathmatch spawns face the middle of the map and team spawns face the other team.
- A map with only team spawns uses them for deathmatch too.

## 5v5: sites, barriers and bots

A map plays 5v5 when it has spike sites **A** and **B** and spawns for both teams. The game works that out by itself,
so you don't need to list the modes.

```json
"sites": {
  "A": { "min": [49, -34], "max": [63, -10] },
  "B": { "min": [-49, -27], "max": [-34, -16], "color": "#ffd54a" }
},
"barriers": [
  { "team": "atk", "min": [46, -0.5, 10], "max": [54, 7, 12] }
]
```

- A site is a rectangle on the floor: two corners `[x, z]`. That's where the spike can be planted.
- Barriers hold a team in their spawn during the buy phase. Make them cover the whole doorway and go a little below
  the floor.
- In a grid map you can draw both instead, with `"site": "A"` and `"barrier": "atk"` squares.

**Ultimate orbs** come back at the start of every round. Holding F on one for 3 seconds gives 1 ultimate point.
List them with `"ultOrbs": [{ "x": 41.7, "z": 3.8 }]` (the height is found from the floor), or draw them in a grid
map with an `"orb": true` square. Put them somewhere both teams can reach in about the same time.

**Bots** need to know where to wait and what to watch. If the map has no `bots` section, the game works out
sensible spots from the sites, spawns and paths between them, so a new map is playable straight away. To place them
yourself (Divide does):

```json
"bots": {
  "holds": { "A": [ { "pos": [57.8, 0, -21], "look": [40.8, 0, -9] } ], "B": [ … ], "mid": [ … ] },
  "stage": { "A": { "main": [[43.8, 0, 4]], "mid": [[28.8, 0, 23.4]] }, "B": { … } },
  "buyStage": { "A": { "main": [[47.2, 0, 15.6]], "mid": [[14.8, 0, 19.2]] }, "B": { … } }
}
```

- `holds`: defender positions for each site and for mid: stand at `pos`, aim at `look`.
- `stage`: where attackers gather before hitting each site, from the main lane and from mid.
- `buyStage`: where attackers wait behind their barriers during the buy phase.

### How bots find their way

You don't have to do anything: when the map loads, the game works out where people can walk from the walls and
floors (steps up to 0.45 m, enough head room, drops off ledges), starting from the spawns. Move a wall and the bots
follow the new layout. A few settings, if you need them:

```json
"nav": { "dropCost": 1.5, "blocked": [[-4, -4, 4, 4]] }
```

`dropCost` is how much bots avoid jumping down ledges, and `blocked` lists rectangles `[x1, z1, x2, z2]` bots should
never walk into.

## Rules and physics

Each map can change the match rules. Leave out anything you don't want to change.

```json
"physics": { "gravity": 22, "jumpSpeed": 6.95 },
"rules": {
  "rounds": { "buyTime": 30, "firstBuyTime": 45, "roundTime": 100, "spikeTime": 45, "plantTime": 4, "defuseTime": 7, "roundsToWin": 13, "halftimeAfter": 12 },
  "economy": { "startCredits": 800, "maxCredits": 9000, "winReward": 3000, "lossRewards": [1900, 2400, 2900], "killReward": 200, "plantReward": 300 },
  "deathmatch": { "respawnTime": 3, "healOnKill": true }
}
```

Try `"gravity": 11` for a moon map, or `"roundsToWin": 5` for short matches. Times are in seconds. `lossRewards`
are the credits after 1, 2 and 3+ lost rounds in a row; `firstBuyTime` is the longer buy phase of the first round of
each half and of overtime rounds; `defuseHalfway` is when defuse progress is saved, `orbTime` is how long taking an ultimate orb takes, `saveReward`
is what attackers get for surviving a round lost on time, and `overtimeCredits` is everyone's money in overtime.

## Everything else

```json
"labels": [ { "text": "A MAIN", "x": 43.8, "z": 4, "size": 0.7 } ],
"ropes": [ { "x": 13.5, "z": -17, "bottom": 0, "top": 3.2, "toward": [1, 0] } ],
"signs": [ { "pos": [-12.5, 3, 50], "n": [1, 0], "w": 1.2, "h": 1.4, "color": "#ff4655" } ],
"trees": [ { "x": -33, "z": -47, "y": 8.5, "r": 2.5, "color": "#e58fb5" } ],
"display": { "siteColor": "#ffd54a", "groundLabels": false }
```

- `labels`: area names on the minimap (in grid maps `"cell": [column, row]` works instead of x and z). `"groundLabels": true` also
  paints them on the floor.
- `ropes`: climbable ropes from `bottom` to `top` height; `toward` is the way you step off at the top.
- `signs`: glowing shop signs; `n` is the way the sign faces.
- `trees`: trunk height `y`, canopy size `r`, leaf `color` (and `trunk` colour).
- `display.siteColor`: the colour of the site outlines.
- `bounds`: `{ "x": [-72, 72], "z": [-66, 66] }` sets the playable area for maps made of boxes (normally worked out).

`maps/map.schema.json` lists every option with a short explanation; editors like VS Code use it to check your file
and suggest names as you type.

## Older map files

Map files from before this format (`"format": "grid"` or `"baked"`) still load. **Download** in the Maps screen saves
any map in the new format, and `node tools/upgrade-map.mjs old.json new.json` does the same from the command line.
