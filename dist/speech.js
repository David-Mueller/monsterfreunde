'use strict';

// Sprachsteuerung ("Agentic Speech") für Monsterfreunde.
//
// Start/Stop-Toggle: Ein Tipp auf den Mikrofon-Knopf startet ein Gespräch, ein
// weiterer beendet es. Während des Gesprächs bleibt das Mikrofon offen und die
// Realtime API erkennt selbst, wann das Kind spricht (semantic_vad). Die Kinder
// reden einfach drauflos und dürfen das Monster jederzeit unterbrechen
// (Barge-in) — Vollduplex. Es gibt keine Aufnahme über die Session hinaus:
// beim Beenden wird der Mikrofon-Track sauber gestoppt.
//
// Zwei Engines (server-seitig umschaltbar, Auswahl kommt in der Mint-Antwort):
//   - realtime: OpenAI Realtime API. Der Proxy liefert einen Ephemeral Token,
//     der Browser tauscht das SDP direkt mit OpenAI.
//   - live: OpenAI Live API (GPT-Live-1, echtes Full-Duplex). Der Browser
//     schickt sein SDP-Offer an den Proxy, der es gegen v1/live/sessions
//     relayed und nur die SDP-Antwort zurückgibt — KEIN Token im Browser.
// Function-Calls des Modells werden auf die Monster-Aktionen der App gemappt
// (strikte Whitelist, kein eval); bei Live laufen sie über Delegation und sind
// in response.event verpackt.
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

  // Knopf nur zeigen, wenn der Speech-Proxy wirklich erreichbar ist (Health-Check).
  // Ohne Proxy (nicht im Tailnet / Server aus) bleibt die App komplett ohne Mikro-UI.
  button.hidden = true;
  let healthTimer = null;
  async function checkProxy() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      button.hidden = !res.ok;
    } catch { button.hidden = true; }
    // Solange versteckt: alle 60 s erneut prüfen, damit der Knopf auftaucht,
    // sobald der Proxy läuft. Sichtbar -> kein weiteres Polling nötig.
    if (button.hidden && !healthTimer) healthTimer = setInterval(checkProxy, 60000);
    else if (!button.hidden && healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  }
  checkProxy();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkProxy(); });

  const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

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
  let audioEl = null;
  let starting = null;         // Promise während des Verbindungsaufbaus
  let active = false;          // läuft gerade eine Session?
  let engine = 'realtime';     // aktive Engine der Session ('realtime' | 'live')
  let sessionMonster = null;   // Monster, für das die Session gilt
  let sessionId = null;        // Server-Session-ID für die Heartbeats
  let heartbeatTimer = 0;
  let maxTimer = 0;
  let speakingTimer = 0;       // Watchdog, der "Monster spricht" wieder abschaltet
  let childSpeaking = false;
  let monsterSpeaking = false;
  let toolExecuting = false;   // während einer Modell-Aktion kein UI-Echo einspeisen
  let lastInject = 0;          // Rate-Limit für eingespeiste UI-Aktionen
  const handledCalls = new Set();

  // --- Anzeige ---
  function paint() {
    const connecting = !!starting && !active;
    button.classList.toggle('busy', connecting);
    button.classList.toggle('active', active);
    button.classList.toggle('on', active && childSpeaking);
    button.classList.toggle('speaking', active && monsterSpeaking);
    if (active) { setGlyph('⏹️'); button.setAttribute('aria-label', 'Gespräch beenden'); button.classList.remove('asleep'); }
    else if (connecting) { setGlyph('📞'); button.setAttribute('aria-label', 'Klingelt beim Monster…'); }
  }

  function setGlyph(g) { if (glyph) glyph.textContent = g; }

  function idleLook() {
    delete button.dataset.engine;
    button.classList.remove('busy', 'active', 'on', 'speaking', 'asleep');
    setGlyph('🎤');
    button.setAttribute('aria-label', 'Gespräch starten');
  }

  function sleepLook(message) {
    button.classList.remove('busy', 'active', 'on', 'speaking');
    button.classList.add('asleep');
    setGlyph('😴');
    button.setAttribute('aria-label', 'Nochmal versuchen');
    if (message) app.say(message);
  }

  // --- Verbindung abbauen ---
  function teardown() {
    clearTimeout(maxTimer);
    clearTimeout(speakingTimer);
    clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
    handledCalls.clear();
    childSpeaking = monsterSpeaking = false;
    try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch { /* egal */ }
    try { dc && dc.close(); } catch { /* egal */ }
    try { pc && pc.close(); } catch { /* egal */ }
    if (audioEl) { try { audioEl.srcObject = null; } catch { /* egal */ } }
    pc = dc = micStream = null;
    starting = null;
    active = false;
    sessionMonster = null;
    sessionId = null;
  }

  // --- Heartbeat: meldet dem Proxy die tatsächliche Sprechzeit ---
  function startHeartbeat(seconds) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(sendHeartbeat, Math.max(5, seconds) * 1000);
  }

  async function sendHeartbeat() {
    if (!active || !sessionId) return;
    try {
      const res = await fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // Server signalisiert Session-Cap oder Tagesbudget erschöpft.
      if (data && data.stop) { teardown(); idleLook(); app.say('Kleines Päuschen! Tipp wieder auf 🎤.'); }
    } catch { /* Netzwerk kurz weg — der nächste Heartbeat versucht es erneut */ }
  }

  function stop() {
    const wasActive = active || !!starting;
    teardown();
    idleLook();
    return wasActive;
  }

  // --- Datenkanal ---
  function sendEvent(obj) {
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(obj));
  }

  // Event-Namen unterscheiden sich je Engine: die Live API nutzt
  // response.item.create statt conversation.item.create.
  function itemCreate(item) {
    sendEvent({ type: engine === 'live' ? 'response.item.create' : 'conversation.item.create', item });
  }

  // Watchdog: "Monster spricht" wieder abschalten, falls kein sauberes
  // Ende-Event kommt (bei Live sind die Stop-Events nicht dokumentiert).
  function markMonsterSpeaking() {
    monsterSpeaking = true; paint();
    clearTimeout(speakingTimer);
    speakingTimer = window.setTimeout(() => { monsterSpeaking = false; paint(); }, 900);
  }

  function handleFunctionCall(item) {
    if (!item || item.type !== 'function_call' || !item.call_id) return;
    if (handledCalls.has(item.call_id)) return;
    handledCalls.add(item.call_id);
    let args = {};
    try { args = item.arguments ? JSON.parse(item.arguments) : {}; } catch { args = {}; }
    const tool = Object.prototype.hasOwnProperty.call(TOOLS, item.name) ? TOOLS[item.name] : null;
    let output = 'unbekannt';
    // Flag verhindert, dass die vom Modell ausgelöste App-Aktion als UI-Echo
    // zurück ins Gespräch gespeist wird (Doppel-Reaktion).
    if (tool) { toolExecuting = true; try { output = tool(args) || 'ok'; } catch { output = 'ups'; } finally { toolExecuting = false; } }
    // Ergebnis zurückmelden und Modell weitersprechen lassen.
    itemCreate({ type: 'function_call_output', call_id: item.call_id, output: String(output) });
    sendEvent({ type: 'response.create' });
  }

  function onMessage(event) {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    // Live wrappt Delegations-Events in response.event -> inneres Event auspacken.
    const m = (engine === 'live' && msg.type === 'response.event' && msg.event) ? msg.event : msg;
    switch (m.type) {
      // Kind spricht (Realtime-VAD).
      case 'input_audio_buffer.speech_started':
        childSpeaking = true; monsterSpeaking = false; paint(); break;
      case 'input_audio_buffer.speech_stopped':
        childSpeaking = false; paint(); break;
      // Monster spricht (Realtime-Audio bzw. Live-Output-Transkript).
      case 'response.created':
      case 'response.output_audio.delta':
      case 'session.output_transcript.delta':
        markMonsterSpeaking(); break;
      case 'output_audio_buffer.stopped':
      case 'response.done':
        monsterSpeaking = false; clearTimeout(speakingTimer); paint();
        if (m.type === 'response.done' && m.response && Array.isArray(m.response.output)) {
          for (const item of m.response.output) if (item.type === 'function_call') handleFunctionCall(item);
        }
        break;
      case 'response.output_item.done':
        if (m.item && m.item.type === 'function_call') handleFunctionCall(m.item);
        break;
      default:
        break;
    }
  }

  // --- Verbindung aufbauen ---
  async function connect() {
    const monster = app.monster;

    // 1) WebRTC vorbereiten. Das SDP-Offer wird für BEIDE Engines gebraucht:
    //    Realtime tauscht es direkt mit OpenAI, die Live API lässt es über
    //    unseren Proxy relayen (der Browser bekommt dort keinen Token).
    pc = new RTCPeerConnection();
    audioEl = audioEl || Object.assign(new Audio(), { autoplay: true });
    pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && active) {
        sleepAfterDrop();
      }
    });

    dc = pc.createDataChannel('oai-events');
    dc.addEventListener('message', onMessage);

    // Mikrofon offen für die ganze Session.
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(micStream.getAudioTracks()[0], micStream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 2) Session beim eigenen Proxy anfragen (Offer mitschicken — nur Live nutzt es).
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monster, sdp: offer.sdp }),
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
    engine = data.engine === 'live' ? 'live' : 'realtime';
    sessionMonster = data.monster || monster;
    // Sichtbarer Engine-Hinweis: ⚡-Badge am Knopf, solange die Live-Engine läuft.
    button.dataset.engine = data.engine || 'realtime';
    sessionId = data.session_id || null;

    // 3) SDP-Antwort setzen — je Engine unterschiedlich.
    if (engine === 'live') {
      // Live API: der Proxy hat die Antwort schon mitgeliefert.
      if (!data.sdp) throw new Error('live_no_answer');
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    } else {
      // Realtime API: Browser tauscht das SDP direkt mit OpenAI (Ephemeral Token).
      const sdpRes = await fetch(`${CALLS_URL}?model=${encodeURIComponent(data.model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${data.client_secret}`, 'Content-Type': 'application/sdp' },
      });
      if (!sdpRes.ok) throw new Error('webrtc_failed');
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
    }

    // Erst "abgenommen", wenn der Datenkanal offen ist — vorher gehen die
    // ersten Worte der Kinder ins Leere. Danach begrüßt das Monster hörbar.
    await new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('dc_timeout')), 10000);
      dc.addEventListener('open', () => { window.clearTimeout(t); resolve(); }, { once: true });
      dc.addEventListener('error', () => { window.clearTimeout(t); reject(new Error('dc_error')); }, { once: true });
    });
    sendEvent({ type: 'response.create', response: { instructions: 'Begrüße das Kind mit EINEM kurzen fröhlichen Satz und frag, was ihr zusammen machen wollt.' } });

    // Heartbeats melden die echte Sprechzeit (zählt das Tagesbudget genau ab).
    if (sessionId) startHeartbeat(data.heartbeat_seconds || 30);

    // Zusätzliche harte Obergrenze pro Session, falls Heartbeats ausfallen.
    if (data.session_seconds) {
      maxTimer = window.setTimeout(() => { teardown(); idleLook(); app.say('Kleines Päuschen! Tipp wieder auf 🎤.'); }, data.session_seconds * 1000);
    }
  }

  function sleepAfterDrop() {
    const name = capitalize(app.monster || '');
    teardown();
    sleepLook(`${name || 'Das Monster'} muss kurz weg. Nochmal tippen!`);
  }

  function capitalize(key) { return key ? key.charAt(0).toUpperCase() + key.slice(1) : ''; }

  async function start() {
    if (active || starting) return;
    button.classList.remove('asleep');
    starting = connect().then(() => {
      active = true;
      starting = null;
      paint();
    }).catch((error) => {
      teardown();
      const name = capitalize(app.monster || '');
      sleepLook(error && error.friendly ? error.friendly : `${name || 'Das Monster'} hört gerade nichts.`);
    });
    paint();
    return starting;
  }

  // --- Toggle: ein Tipp startet, der nächste beendet ---
  button.addEventListener('click', () => {
    if (active || starting) stop();
    else start();
  });

  // --- Monsterwechsel während einer laufenden Session: Gespräch mit dem ---
  // neuen Monster nahtlos neu starten (Persona/Stimme gelten pro Session).
  window.addEventListener('monster:selected', (e) => {
    const next = e.detail && e.detail.monster;
    if (!next) return;
    if ((active || starting) && next !== sessionMonster) {
      stop();
      start();
    }
  });

  // --- UI-Aktionen ins Gespräch einspeisen ---
  // Wenn das Kind während einer laufenden Session in der App selbst kitzelt,
  // füttert usw., erfährt das Monster davon und reagiert spontan mündlich.
  function describeAction(d) {
    if (!d || !d.action) return '';
    switch (d.action) {
      case 'kitzeln': {
        const wo = { kopf: 'am Kopf', bauch: 'am Bauch', fuesse: 'an den Füßen', seite: 'an der Seite' }[d.zone] || '';
        return `(Das Kind kitzelt dich gerade selbst ${wo}.)`;
      }
      case 'fuettern': {
        const was = { keks: 'einem Keks', apfel: 'einem Apfel', saft: 'einem Schluck Saft' }[d.snack] || 'einem Snack';
        return `(Das Kind füttert dich gerade mit ${was}.)`;
      }
      case 'huepfen': return '(Das Kind hat dich gerade selbst zum Hüpfen gebracht.)';
      case 'tanzen': return '(Das Kind lässt dich gerade tanzen.)';
      case 'besonderer_move': return '(Das Kind hat gerade deinen besonderen Trick ausgelöst.)';
      default: return '';
    }
  }

  window.addEventListener('monster:action', (e) => {
    if (!active || !dc || dc.readyState !== 'open') return;
    if (toolExecuting) return;                 // vom Modell selbst ausgelöst -> kein Echo
    const now = Date.now();
    if (now - lastInject < 3000) return;       // Kinder hämmern auf Knöpfe
    const text = describeAction(e.detail);
    if (!text) return;
    lastInject = now;
    itemCreate({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
    sendEvent({ type: 'response.create' });
  });

  // Beim Verlassen/Ausblenden der Seite alles sauber schließen.
  window.addEventListener('pagehide', () => { teardown(); idleLook(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { teardown(); idleLook(); } });

  idleLook();
})();
