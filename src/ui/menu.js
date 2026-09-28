import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { sfx, duck, setMuted } from '../audio.js';
import { save } from '../state.js';

// Меню паузы: продолжить, сохранения (сохранить / загрузить / удалить), настройки,
// закончить цикл (всё заново) и выйти. Каждое опасное действие — с подтверждением.
export function setupMenu({ onPause, onResume, describe }) {
  const $ = (id) => document.getElementById(id);
  const btn = $('menuBtn'), pause = $('pause'), saves = $('saves'), settings = $('settings'), confirm = $('confirm');
  const state = { open: false };
  let onYes = null;

  function open() {
    if (state.open) return;
    state.open = true; pause.hidden = false; btn.style.visibility = 'hidden';
    sfx.menuOpen(); duck(true); onPause?.();
  }
  function close() {
    if (!state.open) return;
    state.open = false; for (const m of [pause, saves, settings, confirm]) m.hidden = true; btn.style.visibility = '';
    sfx.menuClose(); duck(false); onResume?.();
  }
  function ask(title, sub, yes) {
    $('cfTitle').textContent = title; $('cfSub').textContent = sub; onYes = yes; confirm.hidden = false; sfx.click();
  }
  const sub = (m) => { sfx.click(); pause.hidden = true; m.hidden = false; };
  const back = () => { sfx.back(); saves.hidden = settings.hidden = true; pause.hidden = false; };

  // ---------- сохранения ----------
  const slots = () => save.get('slots', []);
  function renderSlots() {
    const list = $('svList'); list.innerHTML = '';
    const all = slots();
    if (!all.length) { const p = document.createElement('p'); p.className = 'sub'; p.textContent = 'ПУСТО'; list.appendChild(p); }
    all.forEach((s, i) => {
      const row = document.createElement('div'); row.className = 'slot';
      const info = document.createElement('p'); info.innerHTML = `<b></b><span></span>`;
      info.querySelector('b').textContent = s.label;
      info.querySelector('span').textContent = new Date(s.time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const load = document.createElement('button'); load.className = 'px'; load.textContent = 'ЗАГРУЗИТЬ';
      load.onclick = () => ask('ЗАГРУЗИТЬ?', 'ТЕКУЩИЙ ПРОГРЕСС ЗАМЕНИТСЯ', () => { save.restore(s.data); location.reload(); });
      const del = document.createElement('button'); del.className = 'px danger'; del.textContent = 'X';
      del.onclick = () => ask('УДАЛИТЬ?', s.label, () => { const a = slots(); a.splice(i, 1); save.set('slots', a); renderSlots(); });
      row.append(info, load, del); list.appendChild(row);
    });
  }
  $('svNew').onclick = () => {
    const a = slots(); a.unshift({ time: Date.now(), label: describe(), data: save.snapshot() });
    save.set('slots', a.slice(0, 12)); sfx.confirm(); renderSlots();
  };

  // ---------- настройки ----------
  const renderSettings = () => {
    $('stSound').textContent = `ЗВУК: ${save.get('mute', false) ? 'ВЫКЛ' : 'ВКЛ'}`;
    $('stFx').textContent = `ЭФФЕКТЫ ЭКРАНА: ${save.get('noFx', false) ? 'ВЫКЛ' : 'ВКЛ'}`;
    $('stRead').textContent = `РЕЖИМ: ${save.get('readMode', false) ? 'ЧТЕНИЕ' : 'ИГРА'}`;
    $('stDev').textContent = `РЕЖИМ РАЗРАБОТЧИКА: ${save.get('dev', false) ? 'ВКЛ' : 'ВЫКЛ'}`;
    document.body.classList.toggle('no-fx', save.get('noFx', false));
  };
  $('stSound').onclick = () => { save.set('mute', !save.get('mute', false)); setMuted(save.get('mute')); sfx.click(); renderSettings(); };
  $('stFx').onclick = () => { save.set('noFx', !save.get('noFx', false)); sfx.click(); renderSettings(); };
  $('stRead').onclick = () => { save.set('readMode', !save.get('readMode', false)); sfx.click(); renderSettings(); };
  // режим разработчика: включается кодом, выключается сразу
  $('stDev').onclick = () => {
    sfx.click();
    if (save.get('dev', false)) { save.set('dev', false); renderSettings(); return; }
    $('devBox').hidden = !$('devBox').hidden; $('devCode').value = ''; if (!$('devBox').hidden) $('devCode').focus();
  };
  $('devOk').onclick = () => {
    if ($('devCode').value === '474747') { save.set('dev', true); sfx.confirm(); $('devBox').hidden = true; renderSettings(); }
    else { sfx.denied(); $('devCode').value = ''; }
  };
  $('devCode').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('devOk').onclick(); });
  renderSettings(); setMuted(save.get('mute', false));

  // ---------- кнопки ----------
  btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  $('pmContinue').onclick = close;
  $('pmSaves').onclick = () => { renderSlots(); sub(saves); };
  $('pmSettings').onclick = () => { renderSettings(); sub(settings); };
  document.querySelectorAll('.sub-modal [data-back]').forEach((b) => (b.onclick = back));
  $('pmEnd').onclick = () => ask('ЗАКОНЧИТЬ ЦИКЛ?', 'ВЕСЬ ПРОГРЕСС БУДЕТ СТЁРТ', () => { save.wipe(); location.reload(); });
  $('pmExit').onclick = () => ask('ВЫЙТИ ИЗ ИГРЫ?', 'НЕСОХРАНЁННЫЙ ЦИКЛ БУДЕТ ПОТЕРЯН', exit);
  $('cfNo').onclick = () => { sfx.back(); confirm.hidden = true; };
  $('cfYes').onclick = () => { sfx.confirm(); confirm.hidden = true; onYes?.(); };

  function exit() {
    $('bye').hidden = false;
    setTimeout(async () => {
      if (Capacitor.isNativePlatform()) { try { await App.exitApp(); } catch { /* уже закрыто */ } }
      else window.close();
    }, 900);
  }

  addEventListener('keydown', (e) => {
    if (btn.hidden || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' && state.open) {
      e.stopImmediatePropagation();
      if (!confirm.hidden) { confirm.hidden = true; sfx.back(); } else if (!saves.hidden || !settings.hidden) back(); else close();
    } else if (e.key === 'p' || e.key === 'з') { state.open ? close() : open(); }
  }, true);
  if (Capacitor.isNativePlatform()) App.addListener('backButton', () => (state.open ? close() : open()));

  return { state, show() { btn.hidden = false; }, open, close };
}
