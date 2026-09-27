import * as THREE from 'three';
import { ROOM } from './room.js';

// Виды комнаты: где стоит камера и куда смотрит + кнопки навигации для каждого вида.
const front = -ROOM.d / 2, back = ROOM.d / 2;
const SEAT = new THREE.Vector3(0, 1.22, 0.35);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const VIEWS = {
  outside:   { pos: SEAT, look: v(0, 1.12, front + 0.4) },
  // fit — ширина/высота объекта, который должен целиком влезть в кадр (камера отъедет сама)
  terminal:  { pos: v(0, 1.05, front + 0.92), look: v(0, 1.04, front + 0.66), fit: [0.6, 0.46] },
  wall:      { pos: SEAT, look: v(-ROOM.w / 2, 1.35, 0.1) },
  wallClose: { pos: v(-1.05, 1.42, 0.05), look: v(-ROOM.w / 2, 1.42, 0.05) },
  desk:      { pos: SEAT, look: v(1.45, 0.85, -0.1) },
  deskClose: { pos: v(0.95, 1.38, 0.15), look: v(1.4, 0.76, -0.1) },
  notebook:  { pos: v(1.33, 1.2, -0.05), look: v(1.33, 0.78, -0.05), up: v(-Math.sin(0.25), 0, -Math.cos(0.25)), fit: [0.3, 0.38] },
  turn:      { pos: SEAT, look: v(0.35, 1.2, back + 5) },
};

// Кнопки: [подпись, куда, звук, «главная» кнопка?]
export const BARS = {
  outside: [
    [['◀ К СТЕНЕ', 'wall', 'turn'], ['ОБЕРНУТЬСЯ', 'turn', 'turn'], ['К СТОЛУ ▶', 'desk', 'turn']],
    [['ВОЙТИ В ТЕРМИНАЛ', 'terminal', 'enter', true]],
  ],
  terminal: [[['ВЫЙТИ', 'outside', 'back']]],
  wall: [[['ПОДОЙТИ', 'wallClose', 'approach', true], ['К ТЕРМИНАЛУ ▶', 'outside', 'turn']]],
  wallClose: [[['ОТОЙТИ', 'wall', 'retreat']]],
  desk: [[['◀ К ТЕРМИНАЛУ', 'outside', 'turn'], ['ПОДОЙТИ К СТОЛУ', 'deskClose', 'approach', true]]],
  deskClose: [[['БЛОКНОТ', 'notebook', 'paper', true]], [['ОТОЙТИ', 'desk', 'retreat']]],
  notebook: [[['ЗАКРЫТЬ', 'deskClose', 'paper']]],
  turn: [[['К ТЕРМИНАЛУ', 'outside', 'turn']]],
};

// Подсказки над кнопками
export const HINTS = {
  outside: 'ЗАЖМИ И ВЕДИ — ОСМОТРЕТЬСЯ',
  terminal: 'КАСАЙСЯ ЭКРАНА · СВАЙП — ЛИСТАТЬ',
  wallClose: 'ЛЁД. СКВОЗЬ НЕГО ЧТО-ТО ВИДНО',
  deskClose: 'ВЫБЕРИ ПРЕДМЕТ',
  turn: 'ТАМ ТЕМНО',
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
  turn: { ArrowUp: 'outside', ArrowDown: 'outside', Escape: 'outside' },
};

// Где разрешён свободный осмотр пальцем (небольшой, пружинит назад)
export const FREE_LOOK = { outside: 1, wall: 1, desk: 1, turn: 1, wallClose: 0.5, deskClose: 0.5 };
