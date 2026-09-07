'use strict';

// Sprachsteuerung ("Agentic Speech") für Monsterfreunde.
//
// Push-to-Talk: Der große Mikrofon-Knopf wird gedrückt gehalten, solange das
// Kind spricht. Es gibt KEINE Daueraufnahme — das Mikrofon ist nur aktiv,
// während der Knopf gedrückt ist (Track enable/disable).
//
// Ablauf: Knopf gedrückt -> einmalig POST /api/session (gleiche Origin, liefert
// nur einen kurzlebigen Ephemeral Token) -> WebRTC-Verbindung direkt zur
// OpenAI Realtime API -> Antwort-Audio abspielen. Function-Calls des Modells
// werden auf die Monster-Aktionen der App gemappt (strikte Whitelist).
//
// Alles ist defensiv: Fehlt der Browser-Support, das Mikrofon oder der Server,
// bleibt die App voll nutzbar; der Knopf zeigt dann ein Schlaf-Emoji.

(function () {
  const button = document.getElementById('mic');
  if (!button) return;

  const glyph = button.querySelector('.mic-glyph');
  const app = window.MonsterApp;

  // Ohne diese Bausteine gibt es keine Sprachsteuerung — Knopf ausblenden.
  const supported = !!(app && window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia && window.fetch);
  if (!supported) { button.hidden = true; return; }
  button.hidden = false;

  const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
  const IDLE_TEARDOWN_MS = 45000; // Verbindung nach Ruhe schließen (spart Kosten)

  // Function-Call-Whitelist: das Modell darf ausschließlich diese Aktionen
  // auslösen. Unbekannte Namen werden ignoriert. Kein eval, keine dynamische
  // Ausführung von Modell-Text.
  const TOOLS = {
    huepfen: () => { app.jump(); return 'ok'; },
    tanzen: () => { app.dance(); return 'ok'; },
    besonderer_move: () => { app.trick(); return 'ok'; },
    kitzeln: (a) => { app.tickle(a && a.zone); return 'hihi'; },
    fuettern: (a) => { app.feed(a && a.snack); return 'mmh'; },
    ausdruck: (a) => { app.express(a && a.emotion); return 'ok'; },
    begruessen: () => { app.greet(); return 'hallo' },
  };

  let pc = null;
  let dc = null;
  let micStream = null;
  let micTrack = null;
  let audioEl = null;
  let setup = null;            // Promise während des Verbindungsaufbaus
  let sessionMonster = null;   // Monster, für das die aktive Session gilt
  let holding = false;
  let idleTimer = 0;
  let maxTimer = 0;
  const handledCalls = new Set();

  function setState(state) {
    button.classList.toggle('busy', state === 'connecting');
    button.classList.toggle('on', state === 'listening');
    button.classList.toggle('asleep', state === 'asleep');
  }

  function sleep(message) {
    setState('asleep');
    if (glyph) glyph.textContent = '😴';
    if (message) app.say(message);
  }

  function wake() {
    if (glyph) glyph.textContent = '🎤';
    button.classList.remove('asleep');
  }

  function armIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => { if (!holding) teardown(); }, IDLE_TEARDOWN_MS);
  }

  function teardown() {
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
    handledCalls.clear();
    try { micTrack && (micTrack.enabled = false); } catch { /* egal */ }
    try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch { /* egal */ }
    try { dc && dc.close(); } catch { /* egal */ }
    try { pc && pc.close(); } catch { /* egal */ }
    if (audioEl) { try { audioEl.srcObject = null; } catch { /* egal */ } }
    pc = dc = micStream = micTrack = null;
    setup = null;
    sessionMonster = null;
    setState('idle');
    wake();
  }

  function sendEvent(obj) {
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(obj));
  }

  function handleFunctionCall(item) {
    if (!item || item.type !== 'function_call' || !item.call_id) return;
    if (handledCalls.has(item.call_id)) return;
    handledCalls.add(item.call_id);
    let args = {};
    try { args = item.arguments ? JSON.parse(item.arguments) : {}; } catch { args = {}; }
    const tool = Object.prototype.hasOwnProperty.call(TOOLS, item.name) ? TOOLS[item.name] : null;
    let output = 'unbekannt';
    if (tool) { try { output = tool(args) || 'ok'; } catch { output = 'ups'; } }
    // Ergebnis zurückmelden und Modell weitersprechen lassen.
    sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: String(output) } });
    sendEvent({ type: 'response.create' });
  }

  function onMessage(event) {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'response.output_item.done' && msg.item && msg.item.type === 'function_call') {
      handleFunctionCall(msg.item);
    } else if (msg.type === 'response.done' && msg.response && Array.isArray(msg.response.output)) {
      for (const item of msg.response.output) if (item.type === 'function_call') handleFunctionCall(item);
    }
  }

  async function connect() {
    const monster = app.monster;
    setState('connecting');

    // 1) Ephemeral Token vom eigenen Proxy holen (gleiche Origin).
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monster }),
    });
    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch { /* ignore */ }
      const err = new Error('session_failed');
      err.friendly = payload && payload.message;
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    sessionMonster = data.monster || monster;

    // 2) WebRTC aufsetzen.
    pc = new RTCPeerConnection();

    audioEl = audioEl || Object.assign(new Audio(), { autoplay: true });
    pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

    dc = pc.createDataChannel('oai-events');
    dc.addEventListener('message', onMessage);

    // Mikrofon — Track startet deaktiviert (nur aktiv, wenn Knopf gedrückt).
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micTrack = micStream.getAudioTracks()[0];
    micTrack.enabled = false;
    pc.addTrack(micTrack, micStream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(`${CALLS_URL}?model=${encodeURIComponent(data.model)}`, {
      method: 'POST',
      body: offer.sdp,
      headers: { Authorization: `Bearer ${data.client_secret}`, 'Content-Type': 'application/sdp' },
    });
    if (!sdpRes.ok) throw new Error('webrtc_failed');
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });

    // Session hart begrenzen (Tagesbudget-Reservierung des Servers einhalten).
    if (data.session_seconds) {
      maxTimer = window.setTimeout(() => teardown(), data.session_seconds * 1000);
    }
  }

  // Baut die Verbindung auf (memoisiert) und passt sie an, falls das Kind
  // inzwischen ein anderes Monster gewählt hat (andere Persona/Stimme).
  function ensureConnection() {
    if (pc && sessionMonster && sessionMonster !== app.monster) teardown();
    if (!setup) {
      setup = connect().catch((error) => {
        teardown();
        const name = app.monsters && app.monster ? capitalize(app.monster) : 'Das Monster';
        sleep(error && error.friendly ? error.friendly : `${name} hört gerade nichts.`);
        throw error;
      });
    }
    return setup;
  }

  function capitalize(key) { return key.charAt(0).toUpperCase() + key.slice(1); }

  async function press() {
    if (holding) return;
    holding = true;
    wake();
    clearTimeout(idleTimer);
    try {
      await ensureConnection();
      // Nur senden, wenn der Knopf noch gehalten wird.
      if (holding && micTrack) { micTrack.enabled = true; setState('listening'); }
    } catch { /* sleep() hat bereits Feedback gegeben */ }
  }

  function release() {
    if (!holding) return;
    holding = false;
    if (micTrack) micTrack.enabled = false;
    if (pc) { setState('idle'); armIdleTimer(); }
  }

  // Push-to-Talk-Events. Pointer deckt Touch, Maus und Stift ab.
  button.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    try { button.setPointerCapture(e.pointerId); } catch { /* egal */ }
    press();
  });
  const end = (e) => { if (e && e.pointerId != null) { try { button.releasePointerCapture(e.pointerId); } catch { /* egal */ } } release(); };
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('pointerleave', () => { if (holding) release(); });
  // Kontextmenü bei langem Drücken auf Touch unterdrücken.
  button.addEventListener('contextmenu', (e) => e.preventDefault());

  // Beim Verlassen/Ausblenden der Seite alles sauber schließen.
  window.addEventListener('pagehide', teardown);
  document.addEventListener('visibilitychange', () => { if (document.hidden) teardown(); });
})();
