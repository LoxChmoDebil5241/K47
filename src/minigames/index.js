// Мини-игры по главам: { name, run(root, done) }. Большие — свои модули, остальные — типовые из arcade.js
// (параметры и тексты в story/minigames.json, потом будем менять на полноценные).
import landing from './landing.js';
import shield from './shield.js';
import probe from './probe.js';
import island from './island.js';
import { makeGame } from './arcade.js';
import CFG from '../story/minigames.json';

export const GAMES = {
  ...Object.fromEntries(Object.entries(CFG).map(([ch, c]) => [ch, makeGame(c)])),
  0: probe,     // Ол-12-П — разрез коры и раздел влияния
  1: landing,   // Вторжение — посадка в бурю
  5: island,     // Остров — заряды и взрыв
  10: shield,   // Щит — оборона коридора от первого лица
};
