// Мини-игры по главам: { name, run(root, done) }. Главы без записи — временное испытание «5 касаний».
import landing from './landing.js';
import probe from './probe.js';

export const GAMES = {
  0: probe,     // Ол-12-П — разрез коры и раздел влияния
  1: landing,   // Вторжение — посадка в бурю
};
