import * as THREE from 'three';
import { ROOM } from './room.js';
import { RPK_TOTAL } from './props/jar.js';

// Виды комнаты: где стоит камера и куда смотрит + кнопки навигации для каждого вида.
const { x0, z0, z1 } = ROOM;
const SEAT = new THREE.Vector3(0, 1.22, -1.3);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const FAR_EDGE = v(1, 0, 0); // «верх» кадра при взгляде сверху на стол — дальний край стола

// pos/look — в мире. anchor — вид на предмет: камера ставится относительно самого предмета
// (offset в мировых осях или local — в осях предмета). fit — ширина/высота, которые должны влезть в кадр.
export const VIEWS = {
  outside:   { pos: SEAT, look: v(0, 1.15, z0) },
  terminal:  { pos: v(0, 1.05, z0 + 0.92), look: v(0, 1.04, z0 + 0.66), fit: [0.6, 0.46] },
  wall:      { pos: SEAT, look: v(x0, 1.6, -1.2) },
  wallClose: { pos: v(x0 + 1.5, 1.75, -1.2), look: v(x0, 1.75, -1.2) },
  desk:      { pos: v(0, 1.22, -1.95), look: v(3.5, 0.9, -1.4) },
  deskClose: { pos: v(2.35, 1.75, -1.35), look: v(3.75, 0.8, -1.35) },
  notebook:  { anchor: 'notebook', offset: [0, 0.4, 0], up: FAR_EDGE, fit: [0.46, 0.32] },
  note:      { anchor: 'note', offset: [0, 0.2, 0], up: FAR_EDGE, fit: [0.1, 0.1] },
  photo:     { anchor: 'photo', offset: [0, 0, 0.35], local: true, fit: [0.36, 0.44] },
  radio:     { anchor: 'radio', offset: [0, 0.03, 0.3], lookOffset: [0, 0.03, 0], local: true, fit: [0.12, 0.28] },
  headset:   { anchor: 'headset', offset: [0, 0.35, 0], up: FAR_EDGE, fit: [0.34, 0.3] },
  jar:       { pos: v(2.45, 1.38, -1.8), look: v(3.3, 1.22, -1.8), hold: 0.3 },
  turn:      { pos: SEAT, look: v(0, 1.35, z1) },
  door:      { pos: v(0, 1.5, z1 - 3.0), look: v(0, 1.42, z1), fit: [2.3, 3.0] },
};

// Кнопки: ряды снизу вверх не важны — ряды идут сверху вниз, каждый растянут на всю ширину.
// [подпись (или функция от состояния), куда или @действие, звук]
const doorLabel = (s) => (s.door.open ? 'ЗАКРЫТЬ ШЛЮЗ' : 'ОТКРЫТЬ ШЛЮЗ');
export const BARS = {
  outside: [
    [['◀ К СТЕНЕ', 'wall', 'turn'], ['ОБЕРНУТЬСЯ', 'turn', 'turn'], ['К СТОЛУ ▶', 'desk', 'turn']],
    [['ВОЙТИ В ТЕРМИНАЛ', 'terminal', 'enter']],
  ],
  terminal: [[['ВЫЙТИ', 'outside', 'back']]],
  wall: [[['ПОДОЙТИ', 'wallClose', 'step'], ['К ТЕРМИНАЛУ ▶', 'outside', 'turn']]],
  wallClose: [[['ОТОЙТИ', 'wall', 'step']]],
  desk: [[['◀ К ТЕРМИНАЛУ', 'outside', 'turn'], ['ПОДОЙТИ К СТОЛУ', 'deskClose', 'step']]],
  deskClose: [[['ОТОЙТИ', 'desk', 'step'], ['ОТКРЫТЬ БЛОКНОТ', 'notebook', 'paper']]],
  notebook: [],
  note: [[['НАЗАД', 'deskClose', 'back']]],
  photo: [[['НАЗАД', 'deskClose', 'back']]],
  headset: [[['НАЗАД', 'deskClose', 'back']]],
  radio: [[['НАЗАД', 'deskClose', 'back']]],
  jar: [[
    ['ПОЛОЖИТЬ', 'deskClose', 'back'],
    [(s) => (s.jar.isOpen ? 'ЗАКРЫТЬ' : 'ОТКРЫТЬ'), '@lid', null],
    [(s) => (s.jar.eaten >= RPK_TOTAL ? 'ПУСТО' : 'СЪЕСТЬ'), '@eat', null],
  ]],
  turn: [[['К ТЕРМИНАЛУ', 'outside', 'turn'], ['ПОДОЙТИ К ШЛЮЗУ', 'door', 'step']]],
  door: [[['ОТОЙТИ', 'turn', 'step'], [doorLabel, '@door', null]]],
};

// Подсказки над кнопками (строка или функция от состояния)
export const HINTS = {
  outside: 'ЗАЖМИ И ВЕДИ — ОСМОТРЕТЬСЯ',
  terminal: 'КАСАЙСЯ ЭКРАНА · СВАЙП — ЛИСТАТЬ',
  wallClose: 'ЛИЦА. ВСЕ — С МОИМ НОМЕРОМ',
  deskClose: 'НАЖМИ НА ПРЕДМЕТ',
  note: 'ЧЕЙ-ТО ПОЧЕРК. ПОХОЖ НА МОЙ',
  photo: 'ФОТО ЕЩЁ НЕ ПРОЯВИЛОСЬ',
  headset: 'ТИШИНА. ТОЛЬКО ШИПЕНИЕ',
  radio: 'НАЖМИ НА РАЦИЮ — ТАНГЕНТА',
  jar: (s) => `ВЕДИ — ПОКРУТИТЬ · ГРАНУЛ: ${RPK_TOTAL - s.jar.eaten} / ${RPK_TOTAL}`,
  turn: 'ШЛЮЗ. НАЖМИ НА НЕГО',
  door: 'НАЖМИ НА ШЛЮЗ',
};

// Клавиатура: стрелки как в референсе
export const KEYS = {
  outside: { ArrowLeft: 'wall', ArrowRight: 'desk', ArrowDown: 'turn', ArrowUp: 'terminal', Enter: 'terminal' },
  terminal: { Escape: 'outside', ArrowDown: 'outside' },
  wall: { ArrowUp: 'wallClose', ArrowRight: 'outside', ArrowDown: 'outside' },
  wallClose: { ArrowDown: 'wall', Escape: 'wall' },
  desk: { ArrowUp: 'deskClose', ArrowLeft: 'outside', ArrowDown: 'outside' },
  deskClose: { ArrowDown: 'desk', Escape: 'desk', n: 'notebook' },
  note: { ArrowDown: 'deskClose', Escape: 'deskClose' },
  photo: { ArrowDown: 'deskClose', Escape: 'deskClose' },
  headset: { ArrowDown: 'deskClose', Escape: 'deskClose' },
  radio: { ArrowDown: 'deskClose', Escape: 'deskClose', ' ': '@ptt' },
  jar: { ArrowDown: 'deskClose', Escape: 'deskClose', o: '@lid', e: '@eat' },
  turn: { ArrowUp: 'door', ArrowDown: 'outside', Escape: 'outside' },
  door: { ArrowDown: 'turn', Escape: 'turn', Enter: '@door', ' ': '@door' },
};

// Где разрешён свободный осмотр пальцем (взгляд остаётся там, куда повернули)
export const FREE_LOOK = { outside: 1, wall: 1, desk: 1, turn: 1, door: 0.6, wallClose: 0.6, deskClose: 0.6 };

// Что можно нажать в каждом виде: имя объекта → вид или @действие
const DESK_ITEMS = { notebook: 'notebook', note: 'note', photo: 'photo', headset: 'headset', radio: 'radio', jar: 'jar' };
export const TAPS = {
  outside: { screen: 'terminal' },
  terminal: { screen: '@terminal' },
  desk: DESK_ITEMS,
  deskClose: DESK_ITEMS,
  radio: { radio: '@ptt' },
  jar: { jar: '@lid' },
  turn: { door: '@door' },
  door: { door: '@door' },
};

// Звук перехода по нажатию на предмет
export const TAP_SOUND = { terminal: 'enter', notebook: 'paper', note: 'paper', photo: 'paper', headset: 'click', radio: 'click', jar: 'jar' };
