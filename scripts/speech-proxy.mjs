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
import { homedir } from 'node:os';
import path from 'node:path';

const PORT = 8092;
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = 'https://davids-macbook-pro.macaroni-wezen.ts.net:8443';
const MODEL = 'gpt-realtime-2.1-mini';
const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

// Kostendeckel: jede erteilte Session reserviert ein festes Zeitbudget; pro Tag
// stehen 30 Minuten zur Verfügung. Der Client trennt die Verbindung nach
// SESSION_MINUTES automatisch, sodass die Reservierung dem echten Verbrauch
// nahekommt.
const SESSION_MINUTES = 5;
const DAILY_LIMIT_MINUTES = 30;
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
  'Duze das Kind. Sei niemals gruselig, gruselig, traurig oder belehrend.',
  'Keine langen Erklärungen, keine schwierigen Wörter, keine Zahlen-Aufgaben.',
  'Wenn das Kind dich um etwas bittet (hüpfen, tanzen, kitzeln, füttern, einen',
  'besonderen Trick, ein Kunststück), benutze dafür deine Werkzeuge und mach es sofort.',
  'Du darfst NUR die dir gegebenen Werkzeuge benutzen. Erfinde keine anderen.',
  'Sprich kurz begleitend dazu ("Boing! Ich hüpfe!"), aber halte dich knapp.',
  'Wenn du etwas nicht verstehst, frag freundlich und kurz nach.',
].join(' ');

const monsters = {
  momo: {
    name: 'Momo',
    voice: 'coral',
    persona: 'Du bist Momo, ein freundliches, blaues Wuschelmonster. Du bist kuschelig, gemütlich und lachst viel. Dein Lieblingssnack ist ein Keks.',
  },
  pip: {
    name: 'Pip',
    voice: 'verse',
    persona: 'Du bist Pip, ein fröhlicher, orangefarbener Wirbelwind mit kleinen Hörnern. Du bist quirlig, schnell und voller Energie. Dein Lieblingssnack ist ein Apfel.',
  },
  lumi: {
    name: 'Lumi',
    voice: 'shimmer',
    persona: 'Du bist Lumi, ein verträumtes, lilafarbenes Sternenmonster. Du bist sanft, funkelig und magst den Weltraum. Dein Lieblingssnack ist Saft.',
  },
  zing: {
    name: 'Zing',
    voice: 'ballad',
    persona: 'Du bist Zing, ein pinker Gummiwurm auf langen Stelzenbeinen. Du bist zappelig, schlängelig und ein kleiner Quatschkopf. Dein Lieblingssnack ist ein Apfel.',
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

function readUsage() {
  try {
    const data = JSON.parse(readFileSync(USAGE_FILE, 'utf8'));
    if (data && data.date === today() && typeof data.minutesUsed === 'number') return data;
  } catch {
    // keine Datei / neuer Tag
  }
  return { date: today(), minutesUsed: 0 };
}

function reserveMinutes() {
  const usage = readUsage();
  if (usage.minutesUsed + SESSION_MINUTES > DAILY_LIMIT_MINUTES) {
    return { ok: false, remaining: Math.max(0, DAILY_LIMIT_MINUTES - usage.minutesUsed) };
  }
  usage.minutesUsed += SESSION_MINUTES;
  try {
    mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    writeFileSync(USAGE_FILE, JSON.stringify(usage));
  } catch (error) {
    console.error('[speech-proxy] Konnte Nutzungszähler nicht schreiben:', error.message);
  }
  return { ok: true, remaining: DAILY_LIMIT_MINUTES - usage.minutesUsed };
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

  const budget = reserveMinutes();
  if (!budget.ok) {
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
    return sendJson(res, 200, {
      client_secret: data.value,
      expires_at: data.expires_at ?? null,
      model: MODEL,
      monster: key,
      session_seconds: SESSION_MINUTES * 60,
      remaining_minutes: budget.remaining,
    }, origin);
  } catch (error) {
    console.error('[speech-proxy] Netzwerkfehler bei client_secrets:', error.message);
    return sendJson(res, 502, { error: 'upstream', message: 'Das Monster ist gerade nicht erreichbar.' }, origin);
  }
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

  if (req.method === 'POST' && req.url === '/api/session') {
    return handleSession(req, res, origin);
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    return sendJson(res, 200, { ok: true }, origin);
  }

  sendJson(res, 404, { error: 'not_found' }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`[speech-proxy] läuft auf http://${HOST}:${PORT} (Modell ${MODEL}, Tageslimit ${DAILY_LIMIT_MINUTES} min)`);
});
