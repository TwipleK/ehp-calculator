/* Shared by the shop (index.html) and the analysis page (analysis.html):
   data loading, item filtering, shared state in localStorage, and the EHP model. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const pct = (n, d = 0) => (n * 100).toFixed(d) + '%';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem('ehp:' + k)); } catch(e){ return null; } },
  set(k, v){ try { localStorage.setItem('ehp:' + k, JSON.stringify(v)); } catch(e){} }
};

let D = null;
const S = {
  inv: [null,null,null,null,null,null], undo: [],
  champ: 'Sion', minute: 25, autoLevel: true, level: 14,
  cspm: 7, autoTd: true, takedowns: 6, sionOn: true,
  hsAuto: true, hsHp: 0,
  shardFlex: 'hpscale', shardDef: 'hp',
  keystone: 'grasp', graspAuto: true, grasp: 30, aftershock: false,
  conditioning: true, overgrowth: true, unflinching: false,
  jaksho: true, fon: false,
  enemies: ['Darius','LeeSin','Ahri','Jinx','Leona'], exampleTeam: true,
};
const SAVED = ['inv','champ','minute','autoLevel','level','cspm','autoTd','takedowns','sionOn','hsAuto','hsHp','shardFlex','shardDef','keystone','graspAuto','grasp','aftershock','conditioning','overgrowth','unflinching','jaksho','fon','enemies','exampleTeam'];

/* ---------------------------------------------------------------- item filtering
   Summoner's Rift shop only: no consumables, no trinkets, no ARAM-only Guardian items,
   and no support-quest upgrades (they can't be bought, World Atlas turns into them). */
const HIDDEN = new Set([
  '2051', '3177', '3184', '3112',               // Guardian's Horn / Blade / Hammer / Orb (ARAM)
  '3869', '3870', '3871', '3876', '3877',       // World Atlas upgrades
]);
const BOOTS_FIX = new Set(['3172']);            // Gunmetal Greaves: tier 3 boots without the Boots tag

function filterItems(){
  for (const [id, it] of Object.entries(D.items)){
    if (it.cat === 'consumable' || it.cat === 'trinket' || HIDDEN.has(id) || Number(id) >= 220000) delete D.items[id];
    else if (BOOTS_FIX.has(id)) it.cat = 'boots';
  }
  for (const it of Object.values(D.items)){
    it.into = it.into.filter(i => D.items[i]);
    it.from = it.from.filter(i => D.items[i]);
  }
  for (const c of Object.values(D.champs)) c.build = (c.build || []).filter(i => D.items[i]);
}

/* ---------------------------------------------------------------- item model */
let GOLD_HP = 400 / 150, GOLD_AR = 300 / 15, GOLD_MR = 400 / 20;

// Riot's item data has no class field; the in-game Support tab is curated, so it is here too.
const SUPPORT = new Set(['3865', '4642', '3114', '3504', '6620', '3190', '6617', '2065', '3050', '6616', '2524', '3109', '3222', '3107', '4005', '6621']);
function classesOf(it){
  const t = new Set(it.tags), st = it.st, out = new Set();
  const dmg = t.has('Damage'), ap = t.has('SpellDamage');
  const def = t.has('Health') || t.has('Armor') || t.has('SpellBlock');
  const ms = t.has('NonbootsMovement');
  const supp = SUPPORT.has(it.id);
  if (supp) out.add('support');
  if (ap && !supp) out.add('mage');
  if (!supp && (t.has('CriticalStrike') || (t.has('AttackSpeed') && !ap) || t.has('OnHit') && !ap)) out.add('marksman');
  if (st.lethality > 0 || (dmg && ms && !t.has('Health')) || (dmg && t.has('ArmorPenetration') && !t.has('Health'))) out.add('assassin');
  if (dmg && (t.has('Health') || t.has('Armor') || t.has('SpellBlock') || t.has('LifeSteal') && !t.has('CriticalStrike'))) out.add('fighter');
  if (def && !dmg && !ap && !t.has('CriticalStrike') && !t.has('AttackSpeed')) out.add('tank');
  if (it.cat === 'boots' || it.cat === 'basic') ['fighter','marksman','assassin','mage','tank','support'].forEach(c => out.add(c));
  return out;
}

function prepItems(){
  for (const it of Object.values(D.items)){
    const st = { hp:0, armor:0, mr:0, armorpen:0, lethality:0, magicpenPct:0, magicpen:0, crit:0, critdmg:0, as:0 };
    for (const s of it.stats){
      if (s.key === 'hp' && !s.pct) st.hp += s.v;
      else if (s.key === 'armor') st.armor += s.v;
      else if (s.key === 'mr') st.mr += s.v;
      else if (s.key === 'armorpen') st.armorpen = s.v / 100;
      else if (s.key === 'lethality') st.lethality += s.v;
      else if (s.key === 'magicpen') { if (s.pct) st.magicpenPct = s.v / 100; else st.magicpen += s.v; }
      else if (s.key === 'crit') st.crit += s.v / 100;
      else if (s.key === 'critdmg') st.critdmg += s.v / 100;
      else if (s.key === 'as') st.as += s.v / 100;
    }
    const txt = it.desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const fx = {};
    let m;
    if ((m = txt.match(/damage from Attacks by (\d+)%/))) fx.aaRed = +m[1] / 100;
    if ((m = txt.match(/(\d+)% less damage from Critical Strikes/))) fx.critRed = +m[1] / 100;
    if ((m = txt.match(/Health equal to (\d+)% of your Item Health/))) fx.warmog = +m[1] / 100;
    if ((m = txt.match(/increase your bonus Armor and Magic Resist by (\d+)%/))) fx.jaksho = +m[1] / 100;
    if ((m = txt.match(/Gain (\d+) Magic Resist .{0,60}after taking magic damage/))) fx.fon = +m[1];
    if ((m = txt.match(/Armor by (\d+)% .{0,40}stacks (\d+) times/))) fx.shred = (+m[1] / 100) * (+m[2]);
    if ((m = txt.match(/Dark Attacks grant (\d+)% Armor Penetration and Magic Penetration/))) fx.terminus = +m[1] / 200;
    if (/Colossal Consumption/.test(txt)) fx.heartsteel = true;
    if (/Giant Slayer|max(imum)? Health as bonus|current Health as bonus|enemy's current Health|of their maximum Health|max Health magic damage/i.test(txt)) fx.pctHp = true;
    if (/Wounds/.test(txt)) fx.gw = true;
    it.st = st; it.fx = fx;
    it.unique = it.cat === 'legendary' || it.cat === 'boots' && it.depth >= 3;
    it.defensive = st.hp > 0 || st.armor > 0 || st.mr > 0 || fx.aaRed || fx.critRed;
    it.classes = classesOf(it);
  }
  const ruby = D.items['1028'], cloth = D.items['1029'], mantle = D.items['1033'];
  if (ruby && ruby.st.hp) GOLD_HP = ruby.gold / ruby.st.hp;
  if (cloth && cloth.st.armor) GOLD_AR = cloth.gold / cloth.st.armor;
  if (mantle && mantle.st.mr) GOLD_MR = mantle.gold / mantle.st.mr;
}

/* ---------------------------------------------------------------- shop rules (mirror the in-game ones) */
function consume(id, inv){ // gold credited by components found in the inventory
  let credit = 0;
  for (const c of D.items[id].from){
    const idx = inv.indexOf(c);
    if (idx >= 0){ inv[idx] = null; credit += D.items[c].gold; }
    else credit += consume(c, inv);
  }
  return credit;
}
function buyCheck(id){
  const it = D.items[id];
  const inv = S.inv.slice();
  const credit = consume(id, inv);
  const cost = it.gold - credit;
  const rest = inv.filter(Boolean).map(i => D.items[i]);
  if (it.unique && rest.some(r => r.id === id)) return { cost, err: 'You already own this item.' };
  if (it.cat === 'boots' && rest.some(r => r.cat === 'boots')) return { cost, err: 'You can only carry one pair of boots.' };
  if (it.cat === 'starter' && rest.some(r => r.cat === 'starter')) return { cost, err: 'Only one starter item at a time.' };
  if (!inv.includes(null)) return { cost, err: 'Inventory full. Sell something first.' };
  return { cost };
}
function snapshot(){ S.undo.push(JSON.stringify(S.inv)); if (S.undo.length > 50) S.undo.shift(); }
function buy(id){
  if (buyCheck(id).err) return false;
  snapshot();
  consume(id, S.inv);
  S.inv[S.inv.indexOf(null)] = id;
  save();
  return true;
}
function sell(slot){ if (!S.inv[slot]) return; snapshot(); S.inv[slot] = null; save(); }
function undo(){ if (!S.undo.length) return; S.inv = JSON.parse(S.undo.pop()); save(); }
const buildCost = () => S.inv.filter(Boolean).reduce((a, id) => a + D.items[id].gold, 0);

/* ---------------------------------------------------------------- champion / enemy model */
const growth = (base, per, lvl) => base + per * (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));
const LEVEL_BY_MIN = [1,1,2,3,4,5,5,6,7,7,8,9,9,10,10,11,11,12,12,13,13,13,14,14,15,15,16,16,16,17,17,17,18];
const levelFor = min => LEVEL_BY_MIN[clamp(Math.floor(min), 0, LEVEL_BY_MIN.length - 1)];
const DOUBLE_CRIT = new Set(['Yasuo','Yone']);

function enemyProfile(cid, minute){
  const c = D.champs[cid];
  const d = c.dmg || { p: 1, m: 1, t: 0 };
  const total = d.p + d.m + d.t || 1;
  const sp = d.p / total, sm = d.m / total, st = d.t / total;
  const build = c.build.map(id => D.items[id]).filter(Boolean);
  const boots = build.find(i => i.cat === 'boots');
  const legs = build.filter(i => i.cat !== 'boots');
  const nLeg = minute < 13 ? 0 : Math.min(5, 1 + Math.floor((minute - 13) / 6.5));
  const owned = legs.slice(0, nLeg);
  if (boots && minute >= 9) owned.push(boots);
  const core = legs.slice(0, 4);
  let armorPenKeep = 1, shred = 0, leth = 0, mpKeep = 1, mpFlat = 0, crit = 0, critdmg = 0;
  for (const it of owned){
    armorPenKeep *= 1 - it.st.armorpen - (it.fx.terminus || 0);
    mpKeep *= 1 - it.st.magicpenPct - (it.fx.terminus || 0);
    shred = Math.max(shred, it.fx.shred || 0);
    leth += it.st.lethality; mpFlat += it.st.magicpen;
    crit += it.st.crit; critdmg += it.st.critdmg;
  }
  if (DOUBLE_CRIT.has(cid)) crit *= 2;
  crit = Math.min(1, crit);
  const aaItems = core.filter(i => i.tags.some(t => t === 'CriticalStrike' || t === 'AttackSpeed' || t === 'OnHit')).length;
  const marks = c.tags.includes('Marksman') || c.roles.includes('MARKSMAN');
  let aa = 0.04 + 0.12 * sp + 0.1 * aaItems + (marks ? 0.25 : 0) + (c.ranged && !marks && sm < 0.5 ? 0.04 : 0);
  aa = Math.min(aa, 0.82, sp + st * 0.6);
  const pctHp = c.pctHp.length > 0 || core.some(i => i.fx.pctHp);
  return { cid, c, total, sp, sm, st, owned, core, build, nLeg,
    armorPen: 1 - armorPenKeep, shred, leth, magicPen: 1 - mpKeep, mpFlat,
    crit, critMult: 1.75 + critdmg, aa, pctHp, gw: core.some(i => i.fx.gw) };
}

function resMult(r){ return r >= 0 ? 100 / (100 + r) : 2 - 100 / (100 - r); }

function damageMult(p, me){
  const ar = Math.max(0, me.armor * (1 - p.shred) * (1 - p.armorPen) - p.leth);
  const arEff = me.armor < 0 ? me.armor : ar;
  const mrEff = me.mr < 0 ? me.mr : Math.max(0, me.mr * (1 - p.magicPen) - p.mpFlat);
  const a = Math.min(p.aa, p.sp);
  const f = p.crit > 0 ? (p.crit * p.critMult) / (1 - p.crit + p.crit * p.critMult) : 0;
  const critAdj = (1 - f) + f * (1 - me.critRed);
  const physTerm = resMult(arEff) * ((p.sp - a) + a * (1 - me.aaRed) * critAdj);
  return { mult: physTerm + p.sm * resMult(mrEff) + p.st, arEff, mrEff };
}

function cannonShare(minute){
  let minions = 0, cannons = 0, i = 0;
  for (let t = 0.5; t <= Math.max(0.5, minute - 0.5); t += 0.5){
    i++; minions += 6;
    if ((t < 15 && i % 3 === 0) || (t >= 15 && t < 25 && i % 2 === 0) || t >= 25) cannons++;
  }
  return cannons / Math.max(1, minions + cannons);
}
function sionStacks(){
  const cs = S.cspm * S.minute;
  const large = cs * cannonShare(S.minute);
  const small = cs - large;
  const td = S.autoTd ? Math.round(S.minute * 0.25) : S.takedowns;
  return { cs, small, large, td, hp: 4 * small + 15 * (large + td) };
}

function myStats(opts = {}){
  const inv = opts.inv || S.inv;
  const c = D.champs[S.champ].s;
  const lvl = S.autoLevel ? levelFor(S.minute) : S.level;
  const baseHp = growth(c.hp, c.hpperlevel, lvl);
  const baseAr = growth(c.armor, c.armorperlevel, lvl);
  const baseMr = growth(c.spellblock, c.spellblockperlevel, lvl);
  let itemHp = 0, bAr = 0, bMr = 0, aaRed = 0, critRed = 0, warmog = 0, jak = 0, fon = 0, hasHs = false;
  const items = inv.filter(Boolean).map(id => D.items[id]);
  for (const it of items){
    itemHp += it.st.hp; bAr += it.st.armor; bMr += it.st.mr;
    aaRed = Math.max(aaRed, it.fx.aaRed || 0);
    critRed = Math.max(critRed, it.fx.critRed || 0);
    warmog = Math.max(warmog, it.fx.warmog || 0);
    jak = Math.max(jak, it.fx.jaksho || 0);
    fon = Math.max(fon, it.fx.fon || 0);
    if (it.fx.heartsteel) hasHs = true;
  }
  let bonusHp = itemHp * (1 + warmog);
  const shardHpScale = 10 + 10 * (lvl - 1);
  if (S.shardFlex === 'hpscale') bonusHp += shardHpScale;
  if (S.shardDef === 'hp') bonusHp += 65; else if (S.shardDef === 'hpscale') bonusHp += shardHpScale;
  let sion = null;
  if (S.champ === 'Sion' && S.sionOn) { sion = sionStacks(); bonusHp += sion.hp; }
  let grasp = 0;
  if (S.keystone === 'grasp') { const procs = S.graspAuto ? Math.round(S.minute * 1.2) : S.grasp; grasp = procs * (D.champs[S.champ].ranged ? 2 : 5); bonusHp += grasp; }
  let og = 0, ogPct = 0;
  if (S.overgrowth) { const absorbed = Math.max(0, (S.minute - 1.5) * 13 * 0.85); og = 3 * Math.floor(absorbed / 8); bonusHp += og; ogPct = absorbed >= 120 ? 0.035 : 0; }
  let hs = 0;
  if (hasHs) {
    if (S.hsAuto) {
      const procs = Math.max(0, (S.minute - 11) * 1.1);
      let hp = baseHp + bonusHp;
      for (let i = 0; i < procs; i++){ const g = 0.08 * (70 + 0.06 * hp); hs += g; hp += g; }
    } else hs = S.hsHp;
    bonusHp += hs;
  }
  let hp = (baseHp + bonusHp) * (1 + ogPct);
  if (S.conditioning && S.minute >= 12) { bAr += 8; bMr += 8; }
  if (S.unflinching) { bAr += 10; bMr += 10; }
  if (fon && S.fon) bMr += fon;
  if (jak && S.jaksho) { bAr *= 1 + jak; bMr *= 1 + jak; }
  if (S.keystone === 'aftershock' && S.aftershock) {
    const cap = 80 + (70 / 17) * (lvl - 1);
    bAr += Math.min(cap, 45 + 0.75 * bAr); bMr += Math.min(cap, 45 + 0.75 * bMr);
  }
  let armor = baseAr + bAr, mr = baseMr + bMr;
  if (S.conditioning && S.minute >= 12) { armor *= 1.03; mr *= 1.03; }
  return { lvl, hp, armor, mr, baseHp, baseAr, baseMr, bonusHp: hp - baseHp, aaRed, critRed, sion, grasp, og, ogPct, hs, hasHs, jak, fon, items };
}

const ehpPhys = me => me.hp / resMult(me.armor);
const ehpMag = me => me.hp / resMult(me.mr);
const ehpMix = me => me.hp / (0.5 * resMult(me.armor) + 0.5 * resMult(me.mr));
function teamProfiles(){ return S.enemies.filter(Boolean).map(cid => enemyProfile(cid, S.minute)); }
function teamMult(me, profs){
  if (!profs.length) return 0.5 * resMult(me.armor) + 0.5 * resMult(me.mr);
  let w = 0, m = 0;
  for (const p of profs){ m += p.total * damageMult(p, me).mult; w += p.total; }
  return m / w;
}
const ehpTeam = (me, profs) => me.hp / teamMult(me, profs);
function bestResist(me, profs, G){
  let best = null;
  for (let s = 0; s <= 1.0001; s += 0.02){
    const t = { ...me, armor: me.armor + G * s / GOLD_AR, mr: me.mr + G * (1 - s) / GOLD_MR };
    const e = ehpTeam(t, profs);
    if (!best || e > best.ehp) best = { ehp: e, split: s, me: t };
  }
  return best;
}

/* ---------------------------------------------------------------- persistence + boot */
function save(){ const o = {}; SAVED.forEach(k => o[k] = S[k]); store.set('state', o); }
function restore(){
  const o = store.get('state');
  if (!o) return false;
  SAVED.forEach(k => { if (k in o) S[k] = o[k]; });
  S.inv = (S.inv || []).slice(0, 6).map(id => id && D.items[id] ? id : null); while (S.inv.length < 6) S.inv.push(null);
  if (!D.champs[S.champ]) S.champ = 'Sion';
  S.enemies = (S.enemies || []).slice(0, 5).map(c => c && D.champs[c] ? c : null); while (S.enemies.length < 5) S.enemies.push(null);
  return true;
}
function load(){
  return fetch('data.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(data => {
    D = data; window.EHP.D = D;
    filterItems(); prepItems();
    if (!restore()) S.inv = ['3084', '3047', '2502', null, null, null]; // example: Sion's common core
    return D;
  });
}
// other tab changed the build → keep in sync
window.addEventListener('storage', e => { if (e.key === 'ehp:state' && D && window.EHP.onSync){ restore(); window.EHP.onSync(); } });

function descHtml(desc){
  return desc.replace(/<(\/?)([a-zA-Z]+)[^>]*>/g, (m, close, tag) => {
    tag = tag.toLowerCase();
    if (tag === 'br') return '<br>';
    if (tag === 'li') return close ? '' : '<br>• ';
    if (tag === 'maintext') return '';
    return close ? '</span>' : `<span class="t-${tag}">`;
  });
}

window.EHP = {
  $, $$, esc, fmt, pct, clamp, S, D, load, save,
  buyCheck, buy, sell, undo, buildCost, descHtml,
  levelFor, enemyProfile, resMult, damageMult, sionStacks, myStats,
  ehpPhys, ehpMag, ehpMix, teamProfiles, teamMult, ehpTeam, bestResist,
  gold: () => ({ hp: GOLD_HP, ar: GOLD_AR, mr: GOLD_MR }),
  onSync: null,
};
})();
