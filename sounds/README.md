# Game sound files

Sound files in this folder replace the built-in (synthesized) gun sounds **for every player**. Any slot not listed
here keeps its built-in sound.

1. Put the file in this folder (mp3, wav or ogg; keep it short and under a few MB, it downloads for everyone).
2. Add it to `index.json` under the gun's id and the slot (`fire`, `reload`, `equip` or `inspect`):

```json
{
  "vandal": { "fire": "vandal-fire.mp3", "reload": "vandal-reload.mp3" },
  "sheriff": { "fire": "sheriff-fire.mp3" }
}
```

Gun ids: classic, shorty, frenzy, ghost, sheriff, stinger, spectre, bucky, judge, bulldog, guardian, phantom,
vandal, warden, marshal, outlaw, operator, ares, odin.

- `fire` plays whenever anyone shoots that gun, and fades with distance like the built-in sound.
- `reload`, `equip` and `inspect` play for your own gun. A reload sound is fitted to the reload time; inspect plays when you press inspect.

A player's own upload (Settings, Gun sounds) still overrides these, in their browser only. Only use sounds you
have the rights to.
