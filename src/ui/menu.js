import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { sfx, duck } from '../audio.js';

// Меню паузы. Работают «Продолжить» и «Выйти» (с подтверждением) — остальное пока только щёлкает.
export function setupMenu({ onPause, onResume }) {
  const btn = document.getElementById('menuBtn');
  const pause = document.getElementById('pause');
  const confirm = document.getElementById('confirm');
  const state = { open: false };

  function open() {
    if (state.open) return;
    state.open = true; pause.hidden = false; btn.style.visibility = 'hidden';
    sfx.menuOpen(); duck(true); onPause?.();
  }
  function close() {
    if (!state.open) return;
    state.open = false; pause.hidden = true; confirm.hidden = true; btn.style.visibility = '';
    sfx.menuClose(); duck(false); onResume?.();
  }
  async function exit() {
    sfx.confirm();
    confirm.hidden = true;
    document.getElementById('bye').hidden = false;
    setTimeout(async () => {
      if (Capacitor.isNativePlatform()) { try { await App.exitApp(); } catch { /* уже закрыто */ } }
      else window.close();
    }, 900);
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  document.getElementById('pmContinue').addEventListener('click', close);
  pause.querySelectorAll('[data-dummy]').forEach((b) => b.addEventListener('click', () => sfx.click()));
  document.getElementById('pmExit').addEventListener('click', () => { sfx.click(); confirm.hidden = false; });
  document.getElementById('cfNo').addEventListener('click', () => { sfx.back(); confirm.hidden = true; });
  document.getElementById('cfYes').addEventListener('click', exit);
  addEventListener('keydown', (e) => {
    if (btn.hidden || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' && state.open) { e.stopImmediatePropagation(); if (!confirm.hidden) { confirm.hidden = true; sfx.back(); } else close(); }
    else if (e.key === 'p' || e.key === 'з') { state.open ? close() : open(); }
  }, true);
  // системная кнопка «назад» на Android открывает/закрывает меню
  if (Capacitor.isNativePlatform()) App.addListener('backButton', () => (state.open ? close() : open()));

  return { state, show() { btn.hidden = false; }, open, close };
}
