// Правила боя рейдерских отрядов: пешки, отряды, стороны, погода, модификаторы БЕ, исход боя.
// БЕ — боеспособность. Все модификаторы считаются на каждую пешку отдельно, с причиной.

// range — дальность атаки пешки в клетках (1 — впритык)
export const SIZE = {
  L: { mark: 'Л', name: 'РАЗВЕДЧИК', be: 5, range: 5 },
  M: { mark: 'С', name: 'ШТУРМОВИК', be: 7.5, range: 3 },
  H: { mark: 'Б', name: 'ДЖАГГЕРНАУТ', be: 10, range: 2 },
  // фауна
  T: { mark: 'Н', name: 'НЕМАТОДА', be: 3, range: 1, fauna: true },
  S: { mark: 'Ш', name: 'ШИПУН', be: 6, range: 2, fauna: true },
  F: { mark: 'Ф', name: 'ФИЛЬТРАТОР', be: 14, range: 1, fauna: true },
};
export const WEAPON = {
  sniper: 'СНАЙПЕРСКАЯ ВИНТОВКА', knife: 'НОЖ',
  smg: 'ПИСТОЛЕТ-ПУЛЕМЁТ', shotgun: 'ДРОБОВИК', burner: 'ГОРЕЛКА',
  mg: 'ПУЛЕМЁТ', hammer: 'КУВАЛДА',
  claw: 'КЛЕШНИ', mandible: 'ЖВАЛА', spit: 'КИСЛОТНЫЙ ПЛЕВОК',
};
// основное оружие и оружие ближнего боя по размеру
export function arms(size) {
  if (size === 'L') return { main: 'sniper', close: 'knife' };
  if (size === 'H') return { main: 'mg', close: 'hammer' };
  if (size === 'T') return { main: 'mandible', close: 'mandible' };
  if (size === 'S') return { main: 'spit', close: 'claw' };
  if (size === 'F') return { main: 'claw', close: 'claw' };
  const w = ['smg', 'shotgun', 'burner'][Math.floor(Math.random() * 3)];
  return { main: w, close: w };
}
// range — дальность, на которой в бой вступает весь отряд; sight — обзор при передвижении
export const SQUAD = {
  assault: { name: 'ШТУРМОВОЙ', tag: 'ШТ', comp: ['H', 'M', 'M', 'M', 'M', 'M', 'L'], text: '7 пешек: 1 большая, 5 средних, 1 маленькая', range: 3, sight: 1 },
  hold: { name: 'ЗАКРЕПЛЯЮЩИЙ', tag: 'ЗК', comp: ['H', 'H', 'H', 'M', 'M'], text: '5 пешек: 3 большие, 2 средние', range: 1, sight: 1 },
  recon: { name: 'РАЗВЕДКА', tag: 'РЗ', comp: ['L', 'L', 'L'], text: '3 маленькие пешки', range: 5, sight: 3 },
  // стаи фауны
  swarm: { name: 'КЛУБОК НЕМАТОД', tag: 'НЕМ', comp: ['T', 'T', 'T', 'T', 'T', 'T'], text: '6 нематод', range: 1, sight: 2 },
  spitters: { name: 'ШИПУНЫ', tag: 'ШИП', comp: ['S', 'S', 'T', 'T'], text: '2 шипуна, 2 нематоды', range: 2, sight: 2 },
  brood: { name: 'ФИЛЬТРАТОР', tag: 'ФИЛ', comp: ['F', 'T', 'T', 'T'], text: 'фильтратор и 3 нематоды', range: 1, sight: 2 },
};
export const FAUNA_TYPES = ['swarm', 'spitters', 'brood'];
// техника
export const VEHICLE = {
  truck: { name: 'ТРУПОВОЗКА', tag: 'ТР', move: 4, cap: 12, text: 'промышленный фургон-вездеход: собирает трупы, возит 1 отряд' },
  shuttle: { name: 'ШАТТЛ', tag: 'ШЛ', move: 6, text: 'занимает воздух над клеткой, возит и высаживает 1 отряд' },
};
export const CLONE_TIME = 180; // 2 трупа → 1 пешка через 3 минуты
// ctrl — радиус контроля территории, если строение занято
export const BUILDING = {
  tower: { name: 'ВЫШКА', fort: 1, value: 1, ctrl: 3 },
  post: { name: 'БЛОК-ПОСТ', fort: 3, value: 1, ctrl: 2 },
  mine: { name: 'ШАХТА', fort: 5, value: 2, ctrl: 1 },
};
export const ACTION = {
  scout: 'РАЗВЕДКА', attack: 'АТАКА', fortify: 'ЗАКРЕПИТЬСЯ',
  retreat: 'ОТСТУПИТЬ', move: 'ПЕРЕМЕСТИТЬСЯ', wait: 'ОЖИДАТЬ',
};
export const ACTION_TEXT = {
  scout: 'Не меняя позиции: 1 любая клетка (у разведки — 3). Снайпер выходит, проверяет и возвращается.',
  attack: 'В пределах дальности отряда. Бьют только пешки, до которых достаёт оружие. Впритык — захват клетки. Неразведанная: −4.',
  fortify: 'Встают в оборону: +1 каждой; вышка +1, пост +3, шахта +5.',
  retreat: 'Уходят на соседнюю клетку. −1 каждой, пока отходят.',
  move: 'Переход в указанную клетку (до 2 шагов) без боя. Открывает клетки вокруг.',
  wait: 'Просто стоят, оборону не разворачивают.',
};
export const SIDE = {
  nt: { name: 'НТ', full: 'ЗА НТ', text: 'бьют СНК и неизвестных, защищают НТ, НТ не трогают' },
  snk: { name: 'СНК', full: 'ЗА СНК', text: 'бьют НТ и неизвестных, защищают СНК, СНК не трогают' },
  neutral: { name: 'НЕЙТР.', full: 'НЕЙТРАЛИТЕТ', text: 'НТ и СНК игнорируют, бьют только неизвестных' },
};
export const FACTION = { nt: 'НТ', snk: 'СНК', unk: 'НЕИЗВЕСТНЫЕ', us: 'АКТИВ', fauna: 'ФАУНА' };

// погода: модификаторы по условиям (size — размер пешки, squad — тип отряда, act — действие)
export const WEATHER = {
  clear: { name: 'ЯСНО', close: false, mods: [{ size: 'L', v: 1, why: 'снайперам видно цель' }, { act: 'scout', v: 1, why: 'обзор дальше' }] },
  blizzard: { name: 'МЕТЕЛЬ', close: true, vis: 2, mods: [{ act: 'scout', v: -2, why: 'ничего не видно' }, { act: 'attack', v: -1, why: 'наступать против ветра' }] },
  fog: { name: 'ЛЕДЯНОЙ ТУМАН', close: true, vis: 3, mods: [{ act: 'scout', v: -1, why: 'туман' }, { squad: 'recon', act: 'attack', v: 2, why: 'туман скрывает внезапную атаку' }] },
  sleet: { name: 'ЛЕДЯНОЙ ДОЖДЬ', close: false, mods: [{ size: 'H', v: -1, why: 'тяжёлые скользят по насту' }, { act: 'defend', v: 1, why: 'атакующих сносит на насте' }] },
  magnet: { name: 'МАГНИТНАЯ БУРЯ', close: false, mods: [{ size: 'L', v: -1, why: 'оптика и дальномеры сбоят' }, { act: 'scout', v: -1, why: 'сканеры глохнут' }] },
  frost: { name: 'МОРОЗ −110°', close: false, mods: [{ v: -0.5, why: 'оружие клинит на морозе' }, { act: 'defend', fort: true, v: 1, why: 'укрытия держат тепло' }] },
};
export const WEATHER_KEYS = Object.keys(WEATHER);

let pid = 0, sid = 0;
// пешка: у каждой — своё смещение в клетке (стоят вразнобой)
export const newPawn = (size) => ({ id: ++pid, size, ...arms(size), ox: Math.random() * 2 - 1, oz: Math.random() * 2 - 1, wall: Math.random() < 0.5 });
// новый отряд: side — 'us' | 'nt' | 'snk' | 'unk'; ally — за кого воюет наш отряд
export function newSquad(type, side, ally = 'neutral') {
  const n = ++sid;
  return {
    id: n, type, side, ally, stance: 'wait', cd: 0, retreatT: 0,
    tag: `${SQUAD[type].tag}-${n}`,
    pawns: SQUAD[type].comp.map(newPawn),
  };
}

// враждебность двух отрядов
export function hostile(a, b) {
  if (a.side === b.side) return false;
  if (a.side === 'unk' || b.side === 'unk' || a.side === 'fauna' || b.side === 'fauna') return true;
  if (a.side === 'us') return a.ally !== 'neutral' && a.ally !== b.side;
  if (b.side === 'us') return b.ally !== 'neutral' && b.ally !== a.side;
  return true;
}
// враждебна ли сторона-владелец клетки отряду
export const hostileOwner = (sq, owner) => !!owner && owner !== 'us' && hostile(sq, { side: owner, ally: owner });

// дистанция боя: впритык — ближний; дальность отряда и пешки; погода режет дальность
export const isClose = (d) => d <= 1;
export const pawnRange = (p) => SIZE[p.size].range;
export const squadRange = (u, weather) => Math.min(SQUAD[u.type].range, WEATHER[weather].vis || 9);
export const inRange = (p, d, weather) => Math.min(SIZE[p.size].range, WEATHER[weather].vis || 9) >= d;
// сторона контроля отряда: наш нейтральный отряд держит территорию сам
export const ctrlSide = (u) => (u.side === 'us' ? (u.ally === 'neutral' ? 'us' : u.ally) : u.side);

// БЕ одной пешки. c: { act: 'attack'|'defend'|'scout', scouted, close, building, fortified, retreating, weather, ctrl, foe }
export function pawnBE(p, type, c) {
  const mods = [], add = (v, why) => mods.push({ v, why });
  if (c.act === 'attack') {
    if (type === 'assault') add(1, 'штурмовой отряд в атаке');
    if (type === 'hold') add(-3, 'закрепляющие плохо наступают');
    if (type === 'recon' && !c.scouted) add(5, 'внезапная атака сразу с разведкой');
    if (!c.scouted && type !== 'recon') add(-4, 'клетка не разведана');
  } else if (c.act === 'defend') {
    if (type === 'assault') add(-2, 'штурмовики в обороне');
    if (type === 'hold') add(c.building ? 3 : 2, c.building ? 'закрепляющие держат строение' : 'закрепляющие в обороне');
    if (c.fortified) {
      add(1, 'закрепились');
      if (c.building) add(BUILDING[c.building].fort, `${BUILDING[c.building].name.toLowerCase()} — укрытие`);
    }
    if (c.retreating) add(-1, 'отступают');
  } else if (c.act === 'scout') {
    if (type === 'assault') add(-3, 'штурмовики шумят в разведке');
    if (type === 'hold') add(-5, 'закрепляющие не годятся в разведку');
  }
  if (c.close && p.size === 'L' && c.act !== 'scout') add(-0.25, 'вблизи — нож вместо винтовки');
  if (c.ctrl && c.act !== 'scout') add(1, 'контроль территории');
  // фауна
  if (c.foe === 'fauna' && p.main === 'burner') add(3, 'огонь — фауна его боится');
  if (SIZE[p.size].fauna && (c.weather === 'blizzard' || c.weather === 'fog')) add(2, 'фауна охотится в непогоду');
  if (SIZE[p.size].fauna && c.act === 'attack' && c.foeFort) add(-2, 'стенки и окопы');
  const W = WEATHER[c.weather];
  for (const r of W.mods) {
    if (r.size && r.size !== p.size) continue;
    if (r.squad && r.squad !== type) continue;
    if (r.act && r.act !== c.act) continue;
    if (r.fort && !c.fortified) continue;
    add(r.v, `${W.name.toLowerCase()}: ${r.why}`);
  }
  const base = SIZE[p.size].be;
  return { p, base, mods, total: Math.max(0, base + mods.reduce((s, m) => s + m.v, 0)) };
}
// БЕ отряда: строки по пешкам и сумма
export function squadBE(sq, c) {
  const rows = sq.pawns.map((p) => pawnBE(p, sq.type, { ...c, fortified: c.fortified ?? sq.stance === 'fortify', retreating: c.retreating ?? sq.retreatT > 0 }));
  return { rows, total: rows.reduce((s, r) => s + r.total, 0) };
}
export const fmtBE = (v) => (Math.round(v * 100) / 100).toString().replace('.', ',');
export const fmtMod = (v) => `${v > 0 ? '+' : '−'}${fmtBE(Math.abs(v))}`;

// исход боя: сравнение сумм со случайным разбросом ±15%
export function resolve(A, D) {
  if (D <= 0) return { win: true, a: A, d: 0, loserLoss: 1, winnerLoss: 0 };
  const a = A * (0.85 + Math.random() * 0.3), d = D * (0.85 + Math.random() * 0.3);
  const win = a > d, ratio = win ? a / Math.max(0.1, d) : d / Math.max(0.1, a);
  return { win, a, d, loserLoss: Math.min(1, 0.45 + (ratio - 1) * 0.5), winnerLoss: Math.min(0.5, 0.3 / ratio) };
}
// убрать часть пешек (сначала случайные), вернуть погибших
export function casualties(squads, frac, atLeastOne) {
  const all = squads.flatMap((s) => s.pawns.map((p) => [s, p]));
  let n = Math.round(all.length * frac); if (atLeastOne && all.length) n = Math.max(1, n);
  const dead = [];
  for (let i = 0; i < n && all.length; i++) {
    const [s, p] = all.splice(Math.floor(Math.random() * all.length), 1)[0];
    s.pawns = s.pawns.filter((x) => x !== p); dead.push(p);
  }
  return dead;
}
