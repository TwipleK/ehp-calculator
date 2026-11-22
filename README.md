# EHP Calculator

A League of Legends effective-health calculator built around a copy of the in-game item shop.

- Build in a shop laid out like the in-game one (right-click / double-click to buy, right-click a slot to sell).
- EHP against full physical, full magic, 50/50 mixed, and against a drafted enemy team.
- Enemy damage split (physical / magic / true) from Lolalytics, penetration from their common build at the chosen minute, estimated auto-attack and crit share.
- Health vs. resistances chart with the ideal armor / MR split against the draft, plus the best defensive items per 1000 gold.
- Sion Soul Furnace stack estimate from minute, CS/min and takedowns.

## Run

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/

## Update data for a new patch

```bash
python3 build.py --refresh
```

Needs Pillow. Downloads from Riot Data Dragon, Meraki Analytics and Lolalytics into `raw/` (git-ignored) and writes `data.json`.

Not endorsed by Riot Games.
