'use strict';

// Part-based monster rig (see ANIMATION.md). The rig turns a small set of
// numeric channels into DOM transforms on separately drawn parts. Nothing is
// ever blended or warped at pixel level, so every frame is a clean drawing.
//
// Channels: armLeft/armRight as absolute directions in degrees (0 = right,
// 90 = down), armLeftLift/armRightLift as a small raise in percent, eyes
// {open 0..1, happy 0..1, gazeX, gazeY}, mouth variant and mouth scale, and
// hair {r, sx, sy} for hair or horns that swing behind the body.

const PUPIL = { momo: '#171449', pip: '#4a0f2e', lumi: '#35106f', zing: '#11145a' };

class MonsterRig {
  constructor(root, data, key) {
    this.root = root;
    this.data = data[key];
    this.key = key;
    this.cell = this.data.cell;
    this.parts = {};
    root.replaceChildren();
    root.style.setProperty('--skin', `rgb(${this.data.skin.join(',')})`);
    root.classList.add('rendered');
    const parts = this.data.parts;
    for (const [name, part] of Object.entries(parts)) {
      const element = document.createElement(name.startsWith('eye') ? 'div' : 'img');
      element.className = `part part-${name}`;
      element.dataset.part = name;
      // Arms are placed so that their pivot sits on the shoulder.
      const shift = part.shoulder && part.pivot ? [part.shoulder[0] - part.pivot[0], part.shoulder[1] - part.pivot[1]] : [0, 0];
      this.place(element, part.box.map((v, i) => v + shift[i % 2]), part.pivot && [part.pivot[0] + shift[0], part.pivot[1] + shift[1]]);
      element.style.zIndex = part.z;
      if (element.tagName === 'IMG') {
        element.src = `assets/parts/${key}-${name}.png`;
        element.alt = '';
        element.draggable = false;
      } else {
        // Eye white, pupil, lids and brow are plain shapes: clean edges, no
        // leftovers from the drawing, and every expression is a number.
        const white = document.createElement('span'); white.className = 'eye-white';
        const pupil = document.createElement('span'); pupil.className = 'pupil'; pupil.style.background = PUPIL[key] || '#222';
        const lid = document.createElement('span'); lid.className = 'lid';
        const lower = document.createElement('span'); lower.className = 'lid lower';
        const brow = document.createElement('span'); brow.className = 'brow';
        brow.style.background = `rgb(${(this.data.brow || [30, 20, 60]).join(',')})`;
        element.append(white, pupil, lower, lid, brow);
        element.pupil = pupil; element.lid = lid; element.lower = lower; element.brow = brow;
      }
      root.append(element);
      this.parts[name] = element;
      if (part.pivot && part.tip) part.drawn = Math.atan2(part.tip[1] - part.pivot[1], part.tip[0] - part.pivot[0]) * 180 / Math.PI;
    }
  }

  place(element, box, pivot) {
    const [x0, y0, x1, y1] = box, n = this.cell;
    element.style.left = `${x0 / n * 100}%`;
    element.style.top = `${y0 / n * 100}%`;
    element.style.width = `${(x1 - x0) / n * 100}%`;
    element.style.height = `${(y1 - y0) / n * 100}%`;
    if (pivot) element.style.transformOrigin = `${(pivot[0] - x0) / (x1 - x0) * 100}% ${(pivot[1] - y0) / (y1 - y0) * 100}%`;
  }

  // Applies one frame. Missing channels keep their neutral value.
  set(state) {
    const parts = this.data.parts;
    for (const side of ['left', 'right']) {
      const name = `arm-${side}`, part = parts[name], element = this.parts[name];
      if (!part || !element) continue;
      const wanted = state[side === 'left' ? 'armLeft' : 'armRight'];
      const lift = state[side === 'left' ? 'armLeftLift' : 'armRightLift'] || 0;
      element.style.transform = `translateY(${-lift}%) rotate(${wanted - part.drawn}deg)`;
    }
    const eyes = state.eyes || {};
    const open = eyes.open ?? 1, happy = eyes.happy ?? 0;
    // Brows: `frown` tilts the inner ends down (angry) or up (sad), `browLift` raises both.
    const frown = eyes.frown ?? 0, browLift = eyes.browLift ?? 0;
    for (const side of ['left', 'right']) {
      const eye = this.parts[`eye-${side}`];
      if (!eye) continue;
      eye.lid.style.transform = `scaleY(${1 - open})`;
      eye.lower.style.transform = `scaleY(${happy * .62})`;
      eye.pupil.style.transform = `translate(${(eyes.gazeX || 0) * 18}%,${(eyes.gazeY || 0) * 18}%)`;
      eye.pupil.style.opacity = open < .25 ? '0' : '1';
      const tilt = (side === 'left' ? 1 : -1) * (-8 + 26 * frown);
      eye.brow.style.transform = `translateY(${-browLift * 40 - frown * 18}%) rotate(${tilt}deg)`;
    }
    // `frown` as a mouth variant flips the closed smile upside down.
    const mouth = state.mouth === 'frown' ? 'mouth' : (state.mouth || 'mouth');
    for (const name of ['mouth', 'mouth-open', 'mouth-laugh']) {
      const element = this.parts[name];
      if (!element) continue;
      const shown = name === mouth || (!this.parts[mouth] && name === 'mouth');
      element.style.visibility = shown ? 'visible' : 'hidden';
      if (shown) element.style.transform = `scale(${state.mouthScaleX ?? 1},${(state.mouthScaleY ?? 1) * (state.mouth === 'frown' ? -1 : 1)})`;
    }
    const hair = state.hair || {};
    for (const name of ['hair', 'horn-left', 'horn-right']) {
      const element = this.parts[name];
      if (!element) continue;
      const sway = name === 'horn-right' ? -(hair.r || 0) : (hair.r || 0);
      element.style.transform = `rotate(${sway}deg) scale(${hair.sx ?? 1},${hair.sy ?? 1})`;
    }
  }
}

// Channel values per action and time, on top of MonsterMotion.body which
// still supplies the whole-body squash, sway and hop.
const RigMotion = (() => {
  const { smooth, clamp, hops } = MonsterMotion;
  // Absolute arm directions in degrees: 0 points right, 90 points down.
  // Up-left is written as 235 rather than -125 so a swing from rest always
  // travels outside the body, never across it. Right-arm values mirror left.
  const REST = { armLeft: 112, armRight: 68 };
  const mirror = angle => 180 - angle;
  function both(state, left, lift = 0) { state.armLeft = left; state.armRight = mirror(left); state.armLeftLift = lift; state.armRightLift = lift; }
  function pose(action, t, duration, clock, options = {}) {
    const state = {
      armLeft: REST.armLeft + Math.sin(clock * 2.1) * 2, armRight: REST.armRight - Math.sin(clock * 2.1 + .4) * 2,
      armLeftLift: 0, armRightLift: 0,
      eyes: { open: 1, happy: 0, gazeX: .18 * Math.sin(clock * .7), gazeY: .1 * Math.sin(clock * .5 + 1), frown: 0, browLift: 0 },
      mouth: 'mouth', mouthScaleX: 1, mouthScaleY: 1, hairR: 0
    };
    if (!action || action === 'settle') return state;
    const envelope = smooth(t / .22) * smooth((duration - t) / .38);
    if (action === 'blink') {
      state.eyes.open = t < .075 ? 1 - smooth(t / .075) : t < .12 ? 0 : smooth((t - .12) / .15);
    } else if (action === 'wave') {
      const up = smooth(t / .26) * smooth((duration - t) / .36);
      state.armRight = REST.armRight + (-70 - REST.armRight) * up + Math.sin(t * 15) * 24 * up;
      state.armRightLift = up * 6;
      state.mouth = up > .5 ? 'mouth-open' : 'mouth';
      state.eyes.gazeX = .3 * up;
      state.eyes.happy = .3 * up;
    } else if (action === 'tickle') {
      const in_ = smooth(t / .2) * smooth((duration - t) / .44);
      // Arms flail out to the sides while giggling.
      state.armLeft = REST.armLeft + (160 - REST.armLeft) * in_ + Math.sin(t * 24) * 14 * in_;
      state.armRight = REST.armRight + (20 - REST.armRight) * in_ - Math.sin(t * 24 + 1) * 14 * in_;
      state.armLeftLift = in_ * 4; state.armRightLift = in_ * 4;
      state.eyes.happy = in_;
      state.mouth = in_ > .5 ? 'mouth-laugh' : 'mouth';
      state.mouthScaleY = 1 + .12 * Math.sin(t * 24) * in_;
    } else if (action === 'tickle-head') {
      // Hair flies about, eyes squeeze shut with laughter, arms reach up.
      const in_ = smooth(t / .18) * smooth((duration - t) / .35);
      state.hairR = 9 * Math.sin(t * 26) * in_;
      state.eyes.happy = in_; state.eyes.browLift = .6 * in_;
      both(state, REST.armLeft + (245 - REST.armLeft) * in_ + Math.sin(t * 24) * 10 * in_, 8 * in_);
      state.mouth = in_ > .5 ? 'mouth-laugh' : 'mouth';
      state.mouthScaleY = 1 + .1 * Math.sin(t * 26) * in_;
    } else if (action === 'tickle-feet') {
      const in_ = smooth(t / .15) * smooth((duration - t) / .35);
      both(state, REST.armLeft + (190 - REST.armLeft) * in_ + Math.sin(t * 20) * 12 * in_, 6 * in_);
      state.eyes.happy = .8 * in_; state.eyes.gazeY = .5 * in_; state.eyes.browLift = .4 * in_;
      state.mouth = in_ > .5 ? 'mouth-laugh' : 'mouth';
    } else if (action === 'tickle-side') {
      // The tickled arm clamps down, the other one flails; the eyes look at the culprit.
      const in_ = smooth(t / .18) * smooth((duration - t) / .35);
      const left = options.side === 'left';
      const clampAngle = 95, flailAngle = 205 + Math.sin(t * 24) * 12;
      state.armLeft = REST.armLeft + ((left ? clampAngle : flailAngle) - REST.armLeft) * in_;
      state.armRight = REST.armRight + ((left ? mirror(flailAngle) : mirror(clampAngle)) - REST.armRight) * in_;
      state.armLeftLift = (left ? 0 : 6) * in_; state.armRightLift = (left ? 6 : 0) * in_;
      state.eyes.gazeX = (left ? -.7 : .7) * in_; state.eyes.happy = .7 * in_;
      state.mouth = in_ > .5 ? 'mouth-laugh' : 'mouth';
      state.hairR = (left ? -1 : 1) * 4 * in_;
    } else if (action === 'dance') {
      const phase = (t - .34) * Math.PI / .56;
      const swing = Math.sin(phase) * envelope;
      // One arm up and outward while the other reaches out sideways, alternating.
      const k = .5 + .5 * swing;
      const left = 165 + (235 - 165) * k, right = 15 + (-55 - 15) * (1 - k);
      state.armLeft = REST.armLeft + (left - REST.armLeft) * envelope;
      state.armRight = REST.armRight + (right - REST.armRight) * envelope;
      state.armLeftLift = 6 * envelope; state.armRightLift = 6 * envelope;
      state.mouth = envelope > .5 ? 'mouth-open' : 'mouth';
      state.eyes.gazeX = -.35 * swing;
      state.eyes.happy = .25 * envelope;
    } else if (action === 'jump') {
      for (const { start, takeoff, landing } of hops) {
        if (t >= start && t < takeoff) {
          const crouch = smooth((t - start) / (takeoff - start));
          both(state, REST.armLeft + 30 * crouch);
        } else if (t >= takeoff && t < landing) {
          const p = (t - takeoff) / (landing - takeoff), up = Math.sin(p * Math.PI);
          both(state, REST.armLeft + 30 + (240 - REST.armLeft - 30) * smooth(p * 3), 12 * up);
          state.mouth = 'mouth-open';
          state.eyes.gazeY = -.4 * up;
        } else if (t >= landing && t < landing + .32) {
          const dt = t - landing, recoil = Math.exp(-dt * 12) * Math.sin(dt * 30);
          both(state, REST.armLeft + 24 * recoil);
          state.eyes.happy = clamp(1 - dt * 3) * .5;
        }
      }
    } else if (action === 'hop') {
      if (t < .2) both(state, REST.armLeft + 20 * smooth(t / .2));
      else if (t < .55) { const p = (t - .2) / .35; both(state, REST.armLeft + 20 + (200 - REST.armLeft - 20) * smooth(p * 2.5), 8 * Math.sin(p * Math.PI)); }
      else { const dt = t - .55; both(state, REST.armLeft + 20 * Math.exp(-dt * 12) * Math.sin(dt * 30)); }
      state.eyes.happy = .3;
    } else if (action === 'peek') {
      // Eyes lead, the body follows: look one way, then the other.
      const look = Math.sin(t * Math.PI / .8) * smooth(t / .2) * smooth((duration - t) / .3);
      state.eyes.gazeX = .8 * look;
      state.eyes.gazeY = -.15 * Math.abs(look);
      state.armLeft = REST.armLeft - 6 * look; state.armRight = REST.armRight - 6 * look;
    } else if (action === 'eat') {
      // Arms up in anticipation, then the hands come to the cheeks; the
      // channel springs carry the arms from one target to the next.
      const active = smooth(t / .22) * smooth((2.45 - t) / .3);
      const excited = t < .95;
      // Hands rise beside the head rather than onto the face: an arm over the
      // same-coloured face would vanish, beside the head it stays visible.
      const left = REST.armLeft + ((excited ? 225 : 252) - REST.armLeft) * active;
      state.armLeft = left; state.armRight = mirror(left);
      state.armLeftLift = (excited ? 8 : 14) * active; state.armRightLift = state.armLeftLift;
      state.eyes.happy = (excited ? .2 : .6) * active;
      state.eyes.gazeY = excited ? .5 * active : 0;
      if (t < .95) state.mouth = 'mouth-open';
      else if (t < 2.2) {
        state.mouth = 'mouth';
        const chew = .5 + .5 * Math.sin((t - 1.05) * Math.PI * 2 / .35 - Math.PI / 2);
        state.mouthScaleY = .75 + .5 * chew; state.mouthScaleX = 1.05 - .1 * chew;
      } else {
        state.mouth = 'mouth-open';
        state.mouthScaleY = 1 + .25 * Math.sin(clamp((t - 2.2) / .4) * Math.PI);
      }
    } else if (action === 'yuck') {
      // Disgust: brows knit, lids drop halfway, eyes turn away, mouth pouts.
      const in_ = smooth(t / .2) * smooth((duration - t) / .3);
      state.eyes.open = 1 - .5 * in_;
      state.eyes.frown = in_;
      state.eyes.gazeX = -.7 * in_; state.eyes.gazeY = .2 * in_;
      state.mouth = in_ > .35 ? 'frown' : 'mouth';
      state.mouthScaleX = 1 - .25 * in_; state.mouthScaleY = 1 - .3 * in_;
      state.armLeft = REST.armLeft + (150 - REST.armLeft) * in_ + Math.sin(t * 22) * 6 * in_;
      state.armRight = REST.armRight + (30 - REST.armRight) * in_ + Math.sin(t * 22) * 6 * in_;
    } else if (action === 'whirl') {
      if (t < .3) { const wind = smooth(t / .3); both(state, REST.armLeft + 25 * wind); }
      else if (t < 1.45) { both(state, 240, 10); state.mouth = 'mouth-open'; }
      else {
        const dt = t - 1.45, dizzy = Math.exp(-dt * 1.5);
        both(state, 252, 14 * smooth(dt / .15));
        state.eyes.happy = .7 * dizzy; state.eyes.gazeX = .7 * Math.sin(dt * 9) * dizzy; state.eyes.gazeY = .3 * Math.cos(dt * 7) * dizzy;
        state.mouth = 'mouth-laugh';
      }
    } else if (action === 'flip') {
      if (t < .3) { const crouch = smooth(t / .3); both(state, REST.armLeft + 30 * crouch); state.eyes.gazeY = -.4 * crouch; }
      else if (t < 1.3) { both(state, 240, 12); state.mouth = 'mouth-open'; }
      else if (t < 1.7) { const dt = t - 1.3, recoil = Math.exp(-dt * 11) * Math.sin(dt * 28); both(state, REST.armLeft + 24 * recoil); }
      else { const proud = smooth((t - 1.7) / .2) * smooth((duration - t) / .25); both(state, REST.armLeft + (240 - REST.armLeft) * proud, 10 * proud); state.eyes.happy = .6 * proud; state.mouth = proud > .5 ? 'mouth-open' : 'mouth'; }
    } else if (action === 'sparkle') {
      const floating = smooth(t / .3) * smooth((duration - t) / .42);
      const shimmer = Math.sin(t * 5.2);
      both(state, REST.armLeft + (230 - REST.armLeft) * floating + 6 * shimmer * floating, 11 * floating);
      state.eyes.gazeY = -.55 * floating;
      state.eyes.gazeX = .25 * Math.sin(t * 2.7) * floating;
      state.eyes.happy = .35 * floating; state.eyes.browLift = .35 * floating;
      state.mouth = floating > .45 ? 'mouth-open' : 'mouth';
      state.mouthScaleY = 1 + .12 * Math.max(0, shimmer) * floating;
      state.hairR = 7 * Math.sin(t * 5.2 + .7) * floating;
    } else if (action === 'squiggle') {
      const active = smooth(t / .22) * smooth((duration - t) / .36);
      const wave = Math.sin((t - .18) * Math.PI / .47);
      state.armLeft = REST.armLeft + ((wave > 0 ? 225 : 165) - REST.armLeft) * active;
      state.armRight = REST.armRight + ((wave > 0 ? 15 : -45) - REST.armRight) * active;
      state.armLeftLift = 8 * active; state.armRightLift = 8 * active;
      state.eyes.gazeX = -.65 * wave * active;
      state.eyes.gazeY = -.12 * active;
      state.eyes.happy = .45 * active; state.eyes.browLift = .2 * active;
      state.mouth = active > .45 ? 'mouth-laugh' : 'mouth';
      state.mouthScaleX = 1 + .12 * Math.abs(wave) * active;
      state.hairR = -10 * wave * active;
    }
    return state;
  }
  return { pose, REST };
})();
