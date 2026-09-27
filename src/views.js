import * as THREE from 'three';
import { ROOM } from './room.js';

// Виды комнаты: где стоит камера и куда смотрит + кнопки навигации для каждого вида.
const { x0, z0, z1 } = ROOM;
const SEAT = new THREE.Vector3(0, 1.22, -1.95);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const NB_UP = v(Math.cos(0.28), 0, -Math.sin(0.28)); // «верх» страницы блокнота на столе

// fit — ширина/высота объекта, который должен целиком влезть в кадр (камера отъедет сама)
export const VIEWS = {
  outside:   { pos: SEAT, look: v(0, 1.15, z0) },
  terminal:  { pos: v(0, 1.05, z0 + 0.92), look: v(0, 1.04, z0 + 0.66), fit: [0.6, 0.46] },
  wall:      { pos: SEAT, look: v(x0, 1.6, -1.2) },
  wallClose: { pos: v(x0 + 1.5, 1.75, -1.2), look: v(x0, 1.75, -1.2) },
  desk:      { pos: SEAT, look: v(3.5, 0.9, -1.4) },
  deskClose: { pos: v(2.35, 1.75, -1.35), look: v(3.75, 0.8, -1.35) },
  notebook:  { pos: v(3.73, 1.3, -2.15), look: v(3.73, 0.88, -2.15), up: NB_UP, fit: [0.52, 0.7] },
  photo:     { pos: v(3.4, 1.05, -1.05), look: v(4.1, 0.99, -1.0), fit: [0.42, 0.5] },
  headset:   { pos: v(3.6, 1.2, -1.55), look: v(3.65, 0.81, -1.55), up: v(1, 0, 0), fit: [0.4, 0.34] },
  turn:      { pos: SEAT, look: v(0, 1.35, z1) },
  door:      { pos: v(0, 1.5, z1 - 3.0), look: v(0, 1.4, z1) },
};

// Кнопки: [подпись (или функция), куда или @действие, звук, «главная»?]
const doorLabel = (s) => (s.door.open ? 'ЗАКРЫТЬ ШЛЮЗ' : 'ОТКРЫТЬ ШЛЮЗ');
export const BARS = {
  outside: [
    [['◀ К СТЕНЕ', 'wall', 'turn'], ['ОБЕРНУТЬСЯ', 'turn', 'turn'], ['К СТОЛУ ▶', 'desk', 'turn']],
    [['ВОЙТИ В ТЕРМИНАЛ', 'terminal', 'enter', true]],
  ],
  terminal: [[['ВЫЙТИ', 'outside', 'back']]],
  wall: [[['ПОДОЙТИ', 'wallClose', 'approach', true], ['К ТЕРМИНАЛУ ▶', 'outside', 'turn']]],
  wallClose: [[['ОТОЙТИ', 'wall', 'retreat']]],
  desk: [[['◀ К ТЕРМИНАЛУ', 'outside', 'turn'], ['ПОДОЙТИ К СТОЛУ', 'deskClose', 'approach', true]]],
  deskClose: [
    [['БЛОКНОТ', 'notebook', 'paper'], ['ФОТО', 'photo', 'paper'], ['ГАРНИТУРА', 'headset', 'click']],
    [['ОТОЙТИ', 'desk', 'retreat']],
  ],
  notebook: [[['ЗАКРЫТЬ', 'deskClose', 'paper']]],
  photo: [[['ПОЛОЖИТЬ', 'deskClose', 'paper']]],
  headset: [[['ПОЛОЖИТЬ', 'deskClose', 'click']]],
  turn: [[['ПОДОЙТИ К ШЛЮЗУ', 'door', 'approach', true], ['К ТЕРМИНАЛУ', 'outside', 'turn']]],
  door: [[[doorLabel, '@door', null, true]], [['ОТОЙТИ', 'turn', 'retreat']]],
};

// Подсказки над кнопками
export const HINTS = {
  outside: 'ЗАЖМИ И ВЕДИ — ОСМОТРЕТЬСЯ',
  terminal: 'КАСАЙСЯ ЭКРАНА · СВАЙП — ЛИСТАТЬ',
  wallClose: 'ЛИЦА. ВСЕ — С МОИМ НОМЕРОМ',
  deskClose: 'ВЫБЕРИ ПРЕДМЕТ',
  photo: 'ФОТО ЕЩЁ НЕ ПРОЯВИЛОСЬ',
  headset: 'ТИШИНА. ТОЛЬКО ШИПЕНИЕ',
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
  notebook: { ArrowDown: 'deskClose', Escape: 'deskClose' },
  photo: { ArrowDown: 'deskClose', Escape: 'deskClose' },
  headset: { ArrowDown: 'deskClose', Escape: 'deskClose' },
  turn: { ArrowUp: 'door', ArrowDown: 'outside', Escape: 'outside' },
  door: { ArrowDown: 'turn', Escape: 'turn', Enter: '@door', ' ': '@door' },
};

// Где разрешён свободный осмотр пальцем (взгляд остаётся там, куда повернули)
export const FREE_LOOK = { outside: 1, wall: 1, desk: 1, turn: 1, door: 0.6, wallClose: 0.6, deskClose: 0.6 };

// Что можно нажать в каждом виде: имя объекта → вид или @действие
export const TAPS = {
  outside: { screen: 'terminal' },
  terminal: { screen: '@terminal' },
  desk: { notebook: 'deskClose', photo: 'deskClose', headset: 'deskClose' },
  deskClose: { notebook: 'notebook', photo: 'photo', headset: 'headset' },
  turn: { door: '@door' },
  door: { door: '@door' },
};
