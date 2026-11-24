# EHP Calculator

Live: https://twiplek.github.io/ehp-calculator/

A League of Legends effective-health calculator built around a copy of the in-game item shop.

Two pages:

- **Shop** (`index.html`): the Summoner's Rift item shop laid out like the in-game one. Search, class tabs, stat filters, recipe tree, right-click or double-click to buy, right-click a slot to sell. No consumables, trinkets or ARAM / Arena items.
- **Effective health** (`analysis.html`): EHP against full physical, full magic, mixed and a drafted enemy team (Lolalytics damage split, penetration from their usual build), a health vs armor / MR break-even chart, the best defensive buys per 1000 gold, runes and Sion Soul Furnace stacks.

Both pages share the build through localStorage. Shared code lives in `core.js` and `base.css`.

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
