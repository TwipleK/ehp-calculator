#!/usr/bin/env python3
"""Builds data.json for the EHP calculator.

Sources:
  - Riot Data Dragon: items, champion base stats, icons
  - Meraki Analytics: champion roles / attack type
  - Lolalytics: average physical / magic / true damage per game and the common build

Usage:  python3 build.py            (uses cached files in raw/ when present)
        python3 build.py --refresh  (re-downloads everything)
"""
import base64, io, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, 'raw')
REFRESH = '--refresh' in sys.argv
os.makedirs(os.path.join(RAW, 'lola'), exist_ok=True)
os.makedirs(os.path.join(RAW, 'img'), exist_ok=True)


def get(url, path, binary=False):
    if os.path.exists(path) and not REFRESH:
        return open(path, 'rb').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (ehp-calculator build script)'})
    data = urllib.request.urlopen(req, timeout=60).read()
    open(path, 'wb').write(data)
    return data


versions = json.loads(get('https://ddragon.leagueoflegends.com/api/versions.json', os.path.join(RAW, 'versions.json')))
V = versions[0]
DD = f'https://ddragon.leagueoflegends.com/cdn/{V}'
items_raw = json.loads(get(f'{DD}/data/en_US/item.json', os.path.join(RAW, 'item.json')))['data']
champs_raw = json.loads(get(f'{DD}/data/en_US/champion.json', os.path.join(RAW, 'champion.json')))['data']
meraki = json.loads(get('https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json',
                        os.path.join(RAW, 'meraki_champs.json')))

# ---------------------------------------------------------------- items
STAT_NAMES = {
    'Health': 'hp', 'Armor': 'armor', 'Magic Resist': 'mr', 'Attack Damage': 'ad', 'Ability Power': 'ap',
    'Attack Speed': 'as', 'Critical Strike Chance': 'crit', 'Critical Strike Damage': 'critdmg',
    'Armor Penetration': 'armorpen', 'Lethality': 'lethality', 'Magic Penetration': 'magicpen',
    'Ability Haste': 'ah', 'Move Speed': 'ms', 'Life Steal': 'ls', 'Omnivamp': 'omni', 'Mana': 'mana',
    'Tenacity': 'tenacity', 'Base Health Regen': 'hpregen', 'Base Mana Regen': 'manaregen',
    'Heal and Shield Power': 'hsp', 'Mana Regen': 'manaregen',
}


def parse_stats(desc):
    m = re.search(r'<stats>(.*?)</stats>', desc)
    out = []
    if not m:
        return out
    for part in re.split(r'<br\s*/?>', m.group(1)):
        txt = re.sub(r'<[^>]+>', ' ', part).strip()
        mm = re.match(r'([\d.]+)(%?)\s+(.+)$', re.sub(r'\s+', ' ', txt))
        if not mm:
            continue
        val, pct, name = float(mm.group(1)), mm.group(2) == '%', mm.group(3).strip()
        out.append({'name': name, 'key': STAT_NAMES.get(name), 'v': val, 'pct': pct})
    return out


def keep_item(k, v):
    if int(k) >= 10000:
        return False
    if not v.get('maps', {}).get('11'):
        return False
    if not v['gold']['purchasable'] or v.get('inStore') is False or v.get('hideFromAll'):
        return False
    if v.get('requiredChampion') or v.get('requiredAlly'):
        return False
    return True


items = {}
seen_names = {}
for k, v in sorted(items_raw.items(), key=lambda kv: int(kv[0])):
    if not keep_item(k, v):
        continue
    if v['name'] in seen_names:  # duplicate ids (jungle pets etc.)
        continue
    seen_names[v['name']] = k
    tags = v.get('tags', [])
    depth = v.get('depth') or 1
    if 'Trinket' in tags:
        cat = 'trinket'
    elif 'Consumable' in tags:
        cat = 'consumable'
    elif 'Boots' in tags:
        cat = 'boots'
    elif ('Lane' in tags or 'Jungle' in tags) and v['gold']['total'] <= 500 and not v.get('into'):
        cat = 'starter'
    elif not v.get('from'):
        cat = 'basic'
    elif v.get('into'):
        cat = 'epic'
    else:
        cat = 'legendary'
    items[k] = {
        'id': k, 'name': v['name'], 'cat': cat, 'tags': tags, 'gold': v['gold']['total'],
        'base': v['gold']['base'], 'sell': v['gold']['sell'], 'from': v.get('from', []),
        'into': [i for i in v.get('into', []) if i in items_raw and keep_item(i, items_raw[i])],
        'desc': v['description'], 'plain': v.get('plaintext', ''), 'stats': parse_stats(v['description']),
        'depth': depth,
    }
# drop 'into' pointers to filtered/duplicate items
for it in items.values():
    it['into'] = [i for i in it['into'] if i in items]
    it['from'] = [i for i in it['from'] if i in items]

# ---------------------------------------------------------------- champions
champs = {}
for cid, c in champs_raw.items():
    mk = meraki.get(cid, {})
    pct_abilities = []
    for slot, abil_list in mk.get('abilities', {}).items():
        for ab in abil_list:
            blob = json.dumps(ab.get('effects', [])).lower()
            if re.search(r"(target's|their|enemy's) (maximum|current) health", blob):
                pct_abilities.append(slot)
                break
    champs[cid] = {
        'pctHp': pct_abilities,
        'id': cid, 'name': c['name'], 'key': c['key'], 'tags': c['tags'],
        'roles': mk.get('roles', []), 'ranged': c['stats']['attackrange'] > 300,
        's': {k: c['stats'][k] for k in ('hp', 'hpperlevel', 'armor', 'armorperlevel', 'spellblock',
                                          'spellblockperlevel', 'attackrange', 'attackspeed')},
    }


# ---------------------------------------------------------------- lolalytics
def slug(cid):
    return 'wukong' if cid == 'MonkeyKing' else cid.lower()


def fetch_lola(cid):
    path = os.path.join(RAW, 'lola', slug(cid) + '.html')
    try:
        return cid, get(f'https://lolalytics.com/lol/{slug(cid)}/build/', path).decode('utf8', 'ignore')
    except Exception as e:  # noqa
        print('lolalytics failed', cid, e)
        return cid, ''


with ThreadPoolExecutor(6) as ex:
    pages = dict(ex.map(fetch_lola, champs))

STARTER_LIKE = {'starter', 'consumable', 'trinket'}
for cid, s in pages.items():
    def dmg(label):
        m = re.search(label + r' Damage:</div>.*?>([\d,]+)</div>', s)
        return int(m.group(1).replace(',', '')) if m else None
    p, mg, t = dmg('Physical'), dmg('Magic'), dmg('True')
    build = []
    for iid in re.findall(r'item64/(\d{4})', s):
        it = items.get(iid)
        if not it or it['cat'] in STARTER_LIKE or iid in build:
            continue
        if it['cat'] in ('basic', 'epic') and iid not in ('3089', '3031'):
            continue
        build.append(iid)
    champs[cid]['dmg'] = {'p': p, 'm': mg, 't': t} if p is not None else None
    champs[cid]['build'] = build[:10]
missing = [c for c in champs if not champs[c].get('dmg')]
print('champions without lolalytics damage:', missing)

# ---------------------------------------------------------------- icons


def icon(url, path, size):
    try:
        raw = get(url, path, binary=True)
        im = Image.open(io.BytesIO(raw)).convert('RGB').resize((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=82)
        return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:  # noqa
        print('icon failed', url, e)
        return ''


jobs = [('i', k, f'{DD}/img/item/{k}.png', os.path.join(RAW, 'img', f'item_{k}.png'), 64) for k in items]
jobs += [('c', k, f'{DD}/img/champion/{k}.png', os.path.join(RAW, 'img', f'champ_{k}.png'), 64) for k in champs]
with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(lambda j: (j[0], j[1], icon(j[2], j[3], j[4])), jobs))
for kind, k, uri in res:
    (items if kind == 'i' else champs)[k]['icon'] = uri

runes_raw = json.loads(get(f'{DD}/data/en_US/runesReforged.json', os.path.join(RAW, 'runes.json')))
runes = {}
for tree in runes_raw:
    for slot in tree['slots']:
        for r in slot['runes']:
            if r['key'] in ('GraspOfTheUndying', 'Aftershock', 'Conditioning', 'Overgrowth', 'Unflinching'):
                runes[r['key']] = {'name': r['name'], 'desc': re.sub(r'<[^>]+>', ' ', r['longDesc']),
                                   'icon': icon('https://ddragon.leagueoflegends.com/cdn/img/' + r['icon'],
                                                os.path.join(RAW, 'img', 'rune_' + r['key'] + '.png'), 48)}
out = {'version': V, 'items': items, 'champs': champs, 'runes': runes}
with open(os.path.join(ROOT, 'data.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('patch', V, len(items), 'items', len(champs), 'champions',
      round(os.path.getsize(os.path.join(ROOT, 'data.json')) / 1e6, 2), 'MB')
