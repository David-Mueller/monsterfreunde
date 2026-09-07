'use strict';

const monsters = {
  momo: { name: 'Momo', personality: 'Der Wuschel', description: 'Momo, ein freundliches blaues Wuschelmonster', sheet: 'assets/momo.png', tickle: ['Hihihi!', 'Nicht am Bauch!', 'Du bist kitzelig … ich auch!'], jump: ['Boing!', 'Bis zu den Wolken!'], dance: ['Wackel, wackel!', 'So geht mein Monstertanz!'] },
  pip: { name: 'Pip', personality: 'Der Wirbelwind', description: 'Pip, ein fröhliches orangefarbenes Monster mit kleinen Hörnern', sheet: 'assets/pip.png', tickle: ['Hahaha! Nochmal!', 'Hihi, erwischt!', 'Das kitzelt!'], jump: ['Huuui!', 'Einmal bis zum Mond!'], dance: ['Wackel mit!', 'Tanzparty!'] }
};
const keys = Object.keys(monsters);
const $ = (selector) => document.querySelector(selector);
const choices = [...document.querySelectorAll('[data-choice]')];
const actions = [...document.querySelectorAll('[data-action]')];
const sprite = $('.main-sprite');
const character = $('.character');
const touch = $('.monster-touch');
const speech = $('#speech');
const playground = $('.playground');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let selected = 'momo';
let active = null;
let frameRequest = 0;
let idleTimer = 0;
let blinkTimer = 0;
let speechTimer = 0;
let entranceAnimation = null;
let pointerStart = null;
let ignoreClickUntil = 0;
let ready = false;

function setFrame(index) {
  sprite.style.backgroundPosition = `${(index % 4) * (100 / 3)}% ${Math.floor(index / 4) * 100}%`;
}

function clearAction() {
  cancelAnimationFrame(frameRequest);
  clearTimeout(idleTimer);
  clearTimeout(blinkTimer);
  clearTimeout(speechTimer);
  character.className = 'character';
  playground.classList.remove('jumping');
  actions.forEach(button => button.classList.remove('active'));
  active = null;
  setFrame(0);
}

function idle() {
  clearTimeout(idleTimer);
  clearTimeout(blinkTimer);
  setFrame(0);
  if (reduced.matches || document.hidden || !ready) return;
  idleTimer = window.setTimeout(() => {
    if (active) return;
    setFrame(1);
    blinkTimer = window.setTimeout(() => { setFrame(0); idle(); }, 150);
  }, selected === 'momo' ? 3200 + Math.random() * 1800 : 2200 + Math.random() * 1500);
}

function say(message, duration = 1800) {
  clearTimeout(speechTimer);
  speech.textContent = message;
  speech.classList.add('visible');
  speechTimer = window.setTimeout(() => speech.classList.remove('visible'), duration);
}

function burst(action) {
  const box = $('.particles');
  box.replaceChildren();
  if (reduced.matches) return;
  const glyphs = action === 'dance' ? ['♪', '♫', '♪'] : ['✦', '·', '✧'];
  for (let i = 0; i < 9; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.textContent = glyphs[i % glyphs.length];
    const angle = (i / 9) * Math.PI * 2;
    const radius = 100 + (i % 3) * 19;
    particle.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * radius - 20}px`);
    particle.style.setProperty('--spin', `${i % 2 ? 28 : -28}deg`);
    particle.style.animationDelay = `${(i % 3) * 25}ms`;
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    box.append(particle);
  }
}

function perform(action) {
  if (!ready || !['tickle', 'jump', 'dance'].includes(action)) return;
  clearAction();
  active = action;
  const lines = monsters[selected][action];
  const duration = reduced.matches ? 900 : { tickle: 1500, jump: 1400, dance: 3220 }[action];
  say(lines[Math.floor(Math.random() * lines.length)], duration + 250);
  actions.find(button => button.dataset.action === action).classList.add('active');
  character.classList.add(action);
  if (action === 'jump') playground.classList.add('jumping');
  burst(action);
  const start = performance.now();
  function animate(now) {
    const elapsed = now - start;
    if (elapsed >= duration) {
      clearAction();
      speech.classList.remove('visible');
      idle();
      return;
    }
    if (reduced.matches) setFrame(action === 'tickle' ? 7 : action === 'jump' ? 5 : 3);
    else if (action === 'dance') setFrame(Math.floor(elapsed / 230) % 2 ? 3 : 2);
    else if (action === 'tickle') setFrame([7, 7, 5, 7][Math.floor(elapsed / 190) % 4]);
    else {
      const phase = elapsed % 700;
      setFrame(phase < 160 ? 5 : phase < 530 ? 6 : 0);
    }
    frameRequest = requestAnimationFrame(animate);
  }
  frameRequest = requestAnimationFrame(animate);
}

function selectMonster(key, greet = true) {
  if (!monsters[key]) return;
  if (key === selected && greet && ready) { perform('tickle'); return; }
  clearAction();
  selected = key;
  const monster = monsters[key];
  document.body.dataset.monster = key;
  document.querySelector('meta[name="theme-color"]').content = key === 'momo' ? '#73066d' : '#473178';
  $('#monster-name').textContent = monster.name;
  $('#personality').textContent = monster.personality;
  sprite.setAttribute('aria-label', monster.description);
  touch.setAttribute('aria-label', `${monster.name} kitzeln`);
  for (const choice of choices) {
    const chosen = choice.dataset.choice === key;
    choice.classList.toggle('selected', chosen);
    choice.setAttribute('aria-checked', String(chosen));
    choice.tabIndex = chosen ? 0 : -1;
  }
  const other = monsters[keys.find(otherKey => otherKey !== key)].name;
  document.querySelectorAll('.arrow').forEach(arrow => arrow.setAttribute('aria-label', `${other} auswählen`));
  entranceAnimation?.cancel();
  if (greet && ready) {
    if (!reduced.matches) entranceAnimation = $('.entrance').animate([
      { transform: 'translateY(12px) scale(.87)', opacity: .35 },
      { transform: 'translateY(-5px) scale(1.025)', opacity: 1, offset: .65 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ], { duration: 360, easing: 'ease-out' });
    setFrame(4);
    say(`Hallo! Ich bin ${monster.name}.`, 1400);
    idleTimer = window.setTimeout(idle, 1100);
  } else idle();
}

function changeMonster(focus = false) {
  const next = keys[(keys.indexOf(selected) + 1) % keys.length];
  selectMonster(next);
  if (focus) choices.find(button => button.dataset.choice === next).focus();
}

choices.forEach(button => button.addEventListener('click', () => selectMonster(button.dataset.choice)));
actions.forEach(button => button.addEventListener('click', () => perform(button.dataset.action)));
document.querySelectorAll('.arrow').forEach(button => button.addEventListener('click', () => changeMonster()));
$('.monster-choices').addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault(); changeMonster(true);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const key = event.key === 'Home' ? keys[0] : keys[keys.length - 1];
    if (key !== selected) selectMonster(key);
    choices.find(button => button.dataset.choice === key).focus();
  }
});
touch.addEventListener('click', () => { if (performance.now() > ignoreClickUntil) perform('tickle'); });
touch.addEventListener('pointerdown', event => {
  if (!event.isPrimary) return;
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  touch.setPointerCapture(event.pointerId);
});
touch.addEventListener('pointerup', event => {
  if (!pointerStart || event.pointerId !== pointerStart.id) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    ignoreClickUntil = performance.now() + 500;
    changeMonster();
  }
});
touch.addEventListener('pointercancel', () => { pointerStart = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearAction(); speech.classList.remove('visible'); }
  else idle();
});
reduced.addEventListener('change', () => { clearAction(); speech.classList.remove('visible'); idle(); });
$('#reload').addEventListener('click', () => window.location.reload());

Promise.all(keys.map(key => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = resolve;
  image.onerror = reject;
  image.src = monsters[key].sheet;
}))).then(() => {
  ready = true;
  document.body.classList.add('ready');
  touch.disabled = false;
  actions.forEach(button => { button.disabled = false; });
  selectMonster(selected, false);
}).catch(() => {
  $('.load-error').hidden = false;
  $('#touch-hint').textContent = 'Unsere Monster verstecken sich gerade.';
});
