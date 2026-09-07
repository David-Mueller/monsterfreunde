'use strict';

// Procedural monster sounds with the Web Audio API. Nothing is downloaded:
// giggles, boings, thuds and dance ticks are synthesised on the fly, with a
// different base pitch per monster and a little randomness per play so that
// repeats stay lively. Audio starts only from a user gesture (the first
// action button), and each kind is rate limited so taps can not pile up.
const Sounds = (() => {
  const STORAGE = 'monsterfreunde-sound';
  let context = null;
  let master = null;
  let enabled = true;
  try { enabled = localStorage.getItem(STORAGE) !== 'off'; } catch (error) { enabled = true; }
  const lastPlayed = {};
  const MIN_GAP = { giggle: .09, beat: .12, takeoff: .15, land: .12, wave: .3, hello: .3, pop: .08, chew: .12, gulp: .3, yuck: .4, whirl: .5, tada: .5 };
  const listeners = new Set();

  function ensure() {
    if (context) return context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = .5;
    master.connect(context.destination);
    return context;
  }

  function vary(value, amount = .05) { return value * (1 + (Math.random() * 2 - 1) * amount); }

  // Every voice is a small graph that fades to silence on its own.
  function tone(ctx, out, { type = 'triangle', from, to = from, start, duration, gain = .4, attack = .01, filter = 0 }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(.001, start + duration);
    let node = osc;
    if (filter) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.value = filter; low.Q.value = 1.2;
      osc.connect(low); node = low;
    }
    node.connect(env); env.connect(out);
    osc.start(start); osc.stop(start + duration + .02);
  }

  function noise(ctx, out, { start, duration, gain = .3, filter = 300 }) {
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass'; low.frequency.value = filter;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(.001, start + duration);
    source.connect(low); low.connect(env); env.connect(out);
    source.start(start); source.stop(start + duration + .02);
  }

  // Builds the sound `kind` into any BaseAudioContext at time `when`.
  // Returns its length in seconds. `base` is the monster's voice pitch.
  function render(ctx, out, kind, base, when) {
    switch (kind) {
      case 'giggle': {
        const count = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const at = when + i * vary(.085, .15);
          const pitch = vary(base * (1.9 + i * .12), .06);
          tone(ctx, out, { type: 'triangle', from: pitch, to: pitch * 1.45, start: at, duration: .075, gain: .35, attack: .008 });
        }
        return count * .09;
      }
      case 'takeoff': {
        const from = vary(base * .55), to = base * 2.6;
        tone(ctx, out, { type: 'sawtooth', from, to, start: when, duration: .28, gain: .22, attack: .01, filter: 1400 });
        tone(ctx, out, { type: 'triangle', from: from * 2, to: to * 2, start: when, duration: .2, gain: .12, attack: .01 });
        return .3;
      }
      case 'land': {
        noise(ctx, out, { start: when, duration: .12, gain: .35, filter: 260 });
        tone(ctx, out, { type: 'sine', from: vary(130), to: 55, start: when, duration: .14, gain: .5, attack: .004 });
        return .15;
      }
      case 'beat': {
        const high = (lastPlayed.beatIndex = ((lastPlayed.beatIndex || 0) + 1) % 2) === 0;
        tone(ctx, out, { type: 'sine', from: vary(high ? 880 : 660, .02), to: high ? 700 : 520, start: when, duration: .06, gain: .3, attack: .003 });
        tone(ctx, out, { type: 'triangle', from: vary(base * (high ? 1 : .75)), start: when, duration: .18, gain: .16, attack: .01, filter: 900 });
        return .2;
      }
      case 'wave':
      case 'hello': {
        tone(ctx, out, { type: 'triangle', from: vary(base * 1.25), to: base * 1.35, start: when, duration: .13, gain: .3, attack: .015 });
        tone(ctx, out, { type: 'triangle', from: vary(base * 1.6), to: base * 1.5, start: when + .15, duration: .18, gain: .3, attack: .015 });
        return .35;
      }
      case 'chew': {
        noise(ctx, out, { start: when, duration: .07, gain: .45, filter: 1600 });
        tone(ctx, out, { type: 'triangle', from: vary(base * .8), to: base * .5, start: when, duration: .08, gain: .2, attack: .004 });
        return .1;
      }
      case 'gulp': {
        tone(ctx, out, { type: 'sine', from: vary(base * 1.3), to: base * .45, start: when, duration: .18, gain: .35, attack: .01 });
        tone(ctx, out, { type: 'sine', from: base * .9, to: base * 1.6, start: when + .2, duration: .1, gain: .22, attack: .01 });
        return .32;
      }
      case 'yuck': {
        tone(ctx, out, { type: 'sawtooth', from: vary(base * 1.5), to: base * .6, start: when, duration: .42, gain: .18, attack: .02, filter: 900 });
        tone(ctx, out, { type: 'triangle', from: vary(base * 1.55), to: base * .62, start: when + .03, duration: .4, gain: .18, attack: .02 });
        return .45;
      }
      case 'whirl': {
        // Rising whoosh with a wobble, for spins and somersaults.
        tone(ctx, out, { type: 'sawtooth', from: vary(base * .5), to: base * 3.2, start: when, duration: .55, gain: .16, attack: .04, filter: 1200 });
        noise(ctx, out, { start: when, duration: .5, gain: .18, filter: 1800 });
        return .6;
      }
      case 'tada': {
        tone(ctx, out, { type: 'triangle', from: vary(base * 2, .02), start: when, duration: .14, gain: .3, attack: .01 });
        tone(ctx, out, { type: 'triangle', from: vary(base * 2.5, .02), start: when + .12, duration: .14, gain: .3, attack: .01 });
        tone(ctx, out, { type: 'triangle', from: vary(base * 3, .02), start: when + .24, duration: .3, gain: .32, attack: .01 });
        return .55;
      }
      case 'pop': {
        tone(ctx, out, { type: 'sine', from: vary(base * 2.2), to: base * 1.1, start: when, duration: .09, gain: .3, attack: .004 });
        return .1;
      }
      default:
        return 0;
    }
  }

  function play(kind, base = 300) {
    if (!enabled) return;
    const ctx = ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    if (lastPlayed[kind] && now - lastPlayed[kind] < (MIN_GAP[kind] || .1)) return;
    lastPlayed[kind] = now;
    render(ctx, master, kind, base, now + .005);
  }

  function setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem(STORAGE, enabled ? 'on' : 'off'); } catch (error) { /* storage unavailable */ }
    if (!enabled && context && context.state === 'running') context.suspend();
    if (enabled && context && context.state === 'suspended') context.resume();
    listeners.forEach(listener => listener(enabled));
  }

  // Wires a toggle button: keeps aria-pressed and the icon in sync.
  function bindToggle(button) {
    const update = () => {
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? 'Ton ausschalten' : 'Ton einschalten');
      button.classList.toggle('muted', !enabled);
    };
    button.addEventListener('click', () => setEnabled(!enabled));
    listeners.add(update);
    update();
  }

  return { play, render, setEnabled, bindToggle, get enabled() { return enabled; } };
})();
