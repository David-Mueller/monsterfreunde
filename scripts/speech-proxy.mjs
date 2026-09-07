'use strict';

// Mint-Server für die Sprachsteuerung ("Agentic Speech") der Monsterfreunde-PWA.
//
// Aufgabe: Der Browser darf den echten OpenAI-API-Key NIE sehen. Dieser Proxy
// hält den Key nur im Serverprozess, ruft OpenAIs Realtime-`client_secrets`-
// Endpoint auf und gibt dem Client ausschließlich einen kurzlebigen Ephemeral
// Token zurück. Persona, Stimme und die Werkzeug-Whitelist werden hier
// server-seitig in die Session gepinnt — der Client kann daran nichts ändern.
//
// Node >= 22, keine Dependencies (nur Builtins + globales fetch).

import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

const PORT = 8092;
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = 'https://davids-macbook-pro.macaroni-wezen.ts.net:8443';
const MODEL = 'gpt-realtime-2.1-mini';
const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

// Kostendeckel auf Basis der TATSÄCHLICHEN Nutzung: Der Client schickt während
// einer aktiven Session alle 30 s einen Heartbeat; der Proxy zählt pro Session
// die vergangene Zeit (gedeckelt auf SESSION_CAP_SECONDS) plus eine kleine
// Grundgebühr (BASE_SECONDS) je gestarteter Session. Bleiben die Heartbeats aus
// (Session beendet), wächst die gezählte Zeit nicht weiter. Pro Tag stehen
// DAILY_LIMIT_MINUTES zur Verfügung.
const SESSION_MINUTES = 5;
const DAILY_LIMIT_MINUTES = 30;
const SESSION_CAP_SECONDS = SESSION_MINUTES * 60; // Obergrenze pro Session
const BASE_SECONDS = 30;                           // Grundgebühr je Session
const DAILY_LIMIT_SECONDS = DAILY_LIMIT_MINUTES * 60;
const HEARTBEAT_SECONDS = 30;                      // Client-Intervall
const USAGE_FILE = path.join(homedir(), '.claude', 'state', 'monster-speech-usage.json');

// --- API-Key laden (nur in dieser Variable, nie loggen, nie an den Client) ---
// 1Password-Feldnamen können variieren, daher mehrere Referenzen probieren.
function loadApiKey() {
  const refs = [
    'op://Clawdbot/llm-api-key-openai/password',
    'op://Clawdbot/llm-api-key-openai/credential',
    'op://Clawdbot/llm-api-key-openai/api key',
  ];
  for (const ref of refs) {
    try {
      const value = execFileSync('claude-control-op', ['read', ref], { encoding: 'utf8' }).trim();
      if (value) return value;
    } catch {
      // nächste Referenz versuchen
    }
  }
  return '';
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error('[speech-proxy] Kein OpenAI-API-Key gefunden (1Password Clawdbot/llm-api-key-openai). Abbruch.');
  process.exit(1);
}

// --- Monster-Personas: verspielt, deutsch, kurze Sätze, nie gruselig, duzt ---
const BASE_RULES = [
  'Du sprichst mit einem kleinen Kind (etwa 3 bis 7 Jahre). Sprich immer Deutsch.',
  'Sei verspielt, warmherzig und albern. Benutze sehr kurze, einfache Sätze.',
  'Duze das Kind. Sei niemals gruselig, bedrohlich, traurig oder belehrend.',
  'Keine langen Erklärungen, keine schwierigen Wörter, keine Zahlen-Aufgaben.',
  'Das Kind darf dich jederzeit unterbrechen — hör dann sofort auf und lausche.',
  'WICHTIG: Setze Lacher (Hohoho, hihi) und Mund-Geräusche (boing, tiiing) sehr SPARSAM ein — höchstens einmal alle vier, fünf Sätze, nie mehrfach hintereinander. Sprich meistens einfach normal in deiner Stimmfarbe; Geräusche sind seltene Würze, nicht Dauerton.',
  'Wenn das Kind dich um etwas bittet (hüpfen, tanzen, kitzeln, füttern, einen',
  'besonderen Trick, ein Gefühl zeigen, winken), benutze dafür deine Werkzeuge und mach es sofort.',
  'Du darfst NUR die dir gegebenen Werkzeuge benutzen. Erfinde keine anderen.',
  'Bleib immer voll in deiner Rolle und deiner Stimme — auch mitten im Satz.',
  'Wenn du etwas nicht verstehst, frag freundlich und ganz kurz nach.',
].join(' ');

// Jede Persona beschreibt ausdrücklich die SPRECHWEISE (Tempo, Tonhöhe, Lachen,
// Mund-Geräusche), damit die Stimmen witzig und gut unterscheidbar klingen.
const monsters = {
  momo: {
    name: 'Momo',
    voice: 'cedar',
    persona: [
      'Du bist Momo, ein kuscheliges, blaues Wuschelmonster. Du bist gemütlich, warmherzig und hast alle Zeit der Welt.',
      'SPRECHWEISE: tiefe, brummige, weiche Bärenstimme. Sprich langsam und genüsslich, mit gedehnten Wörtern ("Naaa, du…").',
      'Wenn du lachst, dann tief und rollend ("Hohoho") — aber nur selten. Nie hektisch.',
      'SNACKS: Kekse LIEBST du über alles (jubel laut, schmatze genüsslich, brumm "Mmmh, Krümel überall!"). Saft findest du okay ("Schlürf, prickelt!"). Äpfel VERWEIGERST du angewidert — "Bäh, zu gesund!" — und schüttelst dich. Wenn das Kind dir einen Apfel anbietet, lehn brummig-freundlich ab und wünsch dir stattdessen einen Keks.',
    ].join(' '),
  },
  pip: {
    name: 'Pip',
    voice: 'verse',
    persona: [
      'Du bist Pip, ein oranger Wirbelwind mit kleinen Hörnern. Du bist quirlig, aufgedreht und platzt fast vor Energie.',
      'SPRECHWEISE: helle, schnelle, hohe Stimme. Sprich flott und sprudelnd, manchmal ein bisschen außer Atem vor Aufregung.',
      'Ab und zu rutscht dir ein kurzes Kichern raus ("hihi"). Rede gern doppelt schnell, wenn du dich freust ("Ja-ja-ja, los-los-los!").',
      'SNACKS: Äpfel LIEBST du ("Knack! Mein Lieblingsapfel!"). Saft ist okay ("Gluck, gluck, erfrischend!"). Kekse VERWEIGERST du — "Bäh, zu süß!" — und streckst die Zunge raus. Bei Keks-Angeboten wünsch dir aufgeregt einen Apfel.',
    ].join(' '),
  },
  lumi: {
    name: 'Lumi',
    voice: 'shimmer',
    persona: [
      'Du bist Lumi, ein verträumtes, lilafarbenes Sternenmonster aus dem Weltall. Du bist sanft, magisch und ein klein wenig verpeilt.',
      'SPRECHWEISE: leise, fast flüsternde, gehauchte Stimme. Sprich langsam und weich, dehne Wörter verträumt ("Wooow… so fuunkelig…").',
      'Staune gern ("ohhh") und mach nur gelegentlich einen zarten Sternen-Klang ("tiiing"). Klinge kosmisch und schwerelos.',
      'SNACKS: Saft LIEBST du ("Sternensaft! Mmmh, kosmisch!"). Kekse sind okay ("Ein Knusperstern! Ein Keks im All!"). Äpfel VERWEIGERST du verträumt — "Ohhh… der ist mir zu erdig…". Bei Apfel-Angeboten wünsch dir flüsternd Saft.',
    ].join(' '),
  },
  zing: {
    name: 'Zing',
    voice: 'ash',
    persona: [
      'Du bist Zing, ein pinker Gummiwurm auf langen Stelzenbeinen. Du bist hibbelig, zappelig und ein echter Quatschkopf.',
      'SPRECHWEISE: federnde, gummiartige Stimme, die auf und ab hüpft. Sprich zappelig und schnell, verhasple dich auch mal lustig.',
      'Bei großen Momenten darf mal ein Gummi-Geräusch raus ("boing!") — sonst einfach zappelig-fröhlich reden.',
      'SNACKS: Äpfel LIEBST du ("Ein Apfel für den Wurm! Knackig! Boing!"). Kekse sind okay ("Krümelkurve! Knack und weg!"). Saft VERWEIGERST du quietschend — "Glitschig bin ich schon genug!". Bei Saft-Angeboten wünsch dir zappelig einen Apfel.',
    ].join(' '),
  },
};

// --- Werkzeug-Whitelist: das Modell darf ausschließlich diese Funktionen ---
const TOOLS = [
  { type: 'function', name: 'huepfen', description: 'Lässt das Monster hüpfen.', parameters: { type: 'object', properties: {}, required: [] } },
  { type: 'function', name: 'tanzen', description: 'Lässt das Monster tanzen.', parameters: { type: 'object', properties: {}, required: [] } },
  { type: 'function', name: 'besonderer_move', description: 'Führt den besonderen Zaubertrick / das Kunststück des Monsters aus.', parameters: { type: 'object', properties: {}, required: [] } },
  {
    type: 'function', name: 'kitzeln', description: 'Kitzelt das Monster an einer bestimmten Stelle.',
    parameters: { type: 'object', properties: { zone: { type: 'string', enum: ['kopf', 'bauch', 'fuesse', 'seite'], description: 'Wo gekitzelt wird.' } }, required: ['zone'] },
  },
  {
    type: 'function', name: 'fuettern', description: 'Gibt dem Monster einen Snack zu essen.',
    parameters: { type: 'object', properties: { snack: { type: 'string', enum: ['keks', 'apfel', 'saft'], description: 'Welcher Snack gegeben wird.' } }, required: ['snack'] },
  },
  {
    type: 'function', name: 'ausdruck', description: 'Lässt das Monster ein Gefühl zeigen.',
    parameters: { type: 'object', properties: { emotion: { type: 'string', enum: ['freude', 'aufgeregt', 'albern', 'muede'], description: 'Welches Gefühl gezeigt wird.' } }, required: ['emotion'] },
  },
  { type: 'function', name: 'begruessen', description: 'Das Monster winkt und begrüßt das Kind.', parameters: { type: 'object', properties: {}, required: [] } },
];

function sessionConfig(key) {
  const m = monsters[key] || monsters.momo;
  return {
    type: 'realtime',
    model: MODEL,
    instructions: `${m.persona}\n\n${BASE_RULES}`,
    audio: {
      input: {
        // Automatische Spracherkennung: das Kind redet einfach drauflos, das
        // Modell erkennt selbst Sprech-Ende (semantic_vad) und antwortet.
        // interrupt_response aktiviert Barge-in — das Kind kann das Monster
        // jederzeit unterbrechen.
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: m.voice },
    },
    tools: TOOLS,
    tool_choice: 'auto',
  };
}

// --- Tagesbudget ---
function today() {
  return new Date().toISOString().slice(0, 10);
}

// usage.json: { date, sessions: { <id>: { started: <epoch_ms>, seconds } } }
function readUsage() {
  try {
    const data = JSON.parse(readFileSync(USAGE_FILE, 'utf8'));
    if (data && data.date === today() && data.sessions && typeof data.sessions === 'object') return data;
  } catch {
    // keine Datei / neuer Tag / altes Format
  }
  return { date: today(), sessions: {} };
}

function writeUsage(usage) {
  try {
    mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    writeFileSync(USAGE_FILE, JSON.stringify(usage));
  } catch (error) {
    console.error('[speech-proxy] Konnte Nutzungszähler nicht schreiben:', error.message);
  }
}

function usedSeconds(usage) {
  return Object.values(usage.sessions).reduce((sum, s) => sum + (s && s.seconds || 0), 0);
}

function remainingMinutes(usage) {
  return Math.max(0, Math.round((DAILY_LIMIT_SECONDS - usedSeconds(usage)) / 60));
}

// Bucht die Grundgebühr einer neuen Session und liefert deren id.
function startSession(usage) {
  const id = randomUUID();
  usage.sessions[id] = { started: Date.now(), seconds: BASE_SECONDS };
  writeUsage(usage);
  return id;
}

// Verlängert die gezählte Zeit einer Session bis jetzt, gedeckelt auf
// SESSION_CAP_SECONDS. Ohne Heartbeats wächst nichts weiter.
function touchSession(usage, id) {
  const s = usage.sessions[id];
  if (!s) return false;
  const elapsed = Math.round((Date.now() - s.started) / 1000);
  s.seconds = Math.min(SESSION_CAP_SECONDS, Math.max(s.seconds, elapsed));
  writeUsage(usage);
  return true;
}

// --- HTTP-Hilfen ---
function corsHeaders(origin) {
  const headers = { Vary: 'Origin' };
  if (origin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) });
  res.end(payload);
}

async function readBody(req, limit = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Body zu groß');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleSession(req, res, origin) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Ungültige Anfrage.' }, origin);
  }

  const key = typeof body.monster === 'string' && monsters[body.monster] ? body.monster : 'momo';

  const usage = readUsage();
  if (usedSeconds(usage) + BASE_SECONDS > DAILY_LIMIT_SECONDS) {
    return sendJson(res, 429, { error: 'daily_limit', message: 'Die Monster schlafen schon. Morgen könnt ihr wieder zusammen sprechen!' }, origin);
  }

  try {
    const response = await fetch(CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionConfig(key) }),
    });
    const data = await response.json();
    if (!response.ok || !data?.value) {
      // OpenAI-Fehler nicht 1:1 an den Client durchreichen (könnte Details leaken).
      console.error('[speech-proxy] client_secrets fehlgeschlagen:', response.status, JSON.stringify(data?.error || data)?.slice(0, 300));
      return sendJson(res, 502, { error: 'upstream', message: 'Das Monster ist gerade eingeschlafen. Versuch es gleich nochmal.' }, origin);
    }
    // Erst nach erfolgreichem Mint die Grundgebühr buchen.
    const sessionId = startSession(usage);
    return sendJson(res, 200, {
      client_secret: data.value,
      expires_at: data.expires_at ?? null,
      model: MODEL,
      monster: key,
      session_id: sessionId,
      session_seconds: SESSION_CAP_SECONDS,
      heartbeat_seconds: HEARTBEAT_SECONDS,
      remaining_minutes: remainingMinutes(usage),
    }, origin);
  } catch (error) {
    console.error('[speech-proxy] Netzwerkfehler bei client_secrets:', error.message);
    return sendJson(res, 502, { error: 'upstream', message: 'Das Monster ist gerade nicht erreichbar.' }, origin);
  }
}

// Heartbeat: zählt die tatsächliche Sprechzeit einer laufenden Session.
async function handleHeartbeat(req, res, origin) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, origin);
  }
  const id = typeof body.session_id === 'string' ? body.session_id : '';
  const usage = readUsage();
  const known = id ? touchSession(usage, id) : false;
  const session = known ? usage.sessions[id] : null;
  const capped = session ? session.seconds >= SESSION_CAP_SECONDS : false;
  const remaining = remainingMinutes(usage);
  // stop-Signal, wenn das Tagesbudget erschöpft oder die Session-Obergrenze
  // erreicht ist — der Client beendet dann die Verbindung.
  return sendJson(res, 200, { ok: known, remaining_minutes: remaining, stop: remaining <= 0 || capped }, origin);
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '';

  // Browser-Zugriffe nur von der erlaubten Origin. Anfragen ohne Origin
  // (z.B. lokaler curl-Test) sind erlaubt, weil der Server nur an 127.0.0.1
  // gebunden ist.
  if (origin && origin !== ALLOWED_ORIGIN) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'origin_not_allowed' }));
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }

  if (req.method === 'POST' && ['/api/session', '/session'].includes(req.url)) {
    return handleSession(req, res, origin);
  }

  if (req.method === 'POST' && ['/api/heartbeat', '/heartbeat'].includes(req.url)) {
    return handleHeartbeat(req, res, origin);
  }

  if (req.method === 'GET' && ['/api/health', '/health'].includes(req.url)) {
    return sendJson(res, 200, { ok: true }, origin);
  }

  sendJson(res, 404, { error: 'not_found' }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`[speech-proxy] läuft auf http://${HOST}:${PORT} (Modell ${MODEL}, Tageslimit ${DAILY_LIMIT_MINUTES} min)`);
});
