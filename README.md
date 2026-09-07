# Monsterfreunde

Eine kleine Webapp für Android im Hochformat: Momo, Pip, Lumi oder Zing auswählen, füttern, kitzeln und bewegen lassen.

## Aktueller Stand

- Vier eigene Monster mit deutlich unterschiedlichen Silhouetten: Momo, Pip, das kosmische Sternchen Lumi und der langbeinige Gummiwurm Zing.
- Baukasten-Rig statt Posenwechsel: Körper, Haare beziehungsweise Hörner, drei Münder, beide Arme und beide Beine sind einzelne Teile, die per CSS-Transform bewegt werden. Lange Beine haben ein Knie und ziehen beim Sprung an, kurze Füße kippen mit. Pupillen und Lider werden im Code gezeichnet. Alle Bewegungen laufen über Federn, sodass jede Aktion aus der aktuellen Haltung heraus beginnt und weich in die Ruhehaltung zurückkehrt. Kein Morphen, kein Schnitt.
- Blinzeln, Atmen, Begrüßung, Hüpfen und Tanzen. Kitzeln in fünf Zonen: Kopf, Bauch, Füße und beide Seiten reagieren verschieden.
- Augen, Pupillen, Lider und Brauen im Code, mit Ausdrücken von lachend bis angewidert.
- Ein besonderer Move pro Monster: Momos Wirbel, Pips Salto, Lumis Sternenfunkeln und Zings Superschlängler.
- Leben im Leerlauf: Wer eine Weile nichts antippt, sieht das Monster umherschauen, hüpfen oder winken. Landungen vibrieren kurz auf Geräten, die das können.
- Füttern mit Keks, Apfel und Saft: Der Snack fliegt zum Mund, das Monster jubelt, kaut und schluckt. Jedes Monster hat einen Lieblingssnack und einen, den es verweigert.
- Federnde Körperbewegung und zum Sprung passender Schatten.
- Auswahl per Touch, Wischen oder Tastatur.
- Berücksichtigung reduzierter Bewegung und Pause bei ausgeblendetem Tab.
- Installierbar als App und offline nutzbar: Manifest, Icon und ein Service Worker, der alle Dateien beim ersten Besuch speichert und bei jedem Deploy erneuert.
- Synthetische Sounds ohne Audiodateien: Kichern, Boing, Plumps, Tanzschläge und Begrüßung, mit eigener Stimmlage pro Monster und Ton-Schalter.

Die App benötigt weder einen Build-Schritt noch einen eigenen Backend-Server. Weitere Ideen stehen in [IDEEN.md](IDEEN.md).

## Lokal starten

```sh
python3 -m http.server 8000 --directory dist
```

Danach `http://localhost:8000` öffnen. Ein HTTP-Server ist nötig, weil die App ihre Animationsdaten nachlädt; `index.html` nicht direkt als lokale Datei öffnen.

## Sprachsteuerung (Agentic Speech)

Optionales Zusatzfeature: Ein Tipp auf den großen Mikrofon-Knopf startet ein Gespräch mit dem gewählten Monster (Momo, Pip, Lumi oder Zing), ein weiterer Tipp beendet es. Während des Gesprächs reden die Kinder einfach drauflos — die Realtime API erkennt selbst, wann gesprochen wird (semantic VAD), und die Kinder dürfen das Monster jederzeit unterbrechen (Barge-in, Vollduplex). Das Monster antwortet mit Stimme und führt Aktionen aus — hüpfen, tanzen, kitzeln, füttern, sein Kunststück, ein Gefühl zeigen, winken. Die App bleibt ohne dieses Feature vollständig nutzbar; `speech.js` lädt defensiv und blendet den Knopf aus, wenn Browser-Support, Mikrofon oder Server fehlen (dann zeigt der Knopf ein Schlaf-Emoji).

### Architektur

- **Kein API-Key im Browser.** `scripts/speech-proxy.mjs` ist ein winziger Node-Server (nur Builtins, Node ≥ 22), der den echten OpenAI-API-Key nur im Serverprozess hält. Der Browser bekommt über `POST /api/session` ausschließlich einen kurzlebigen Ephemeral Token.
- **Persona server-seitig gepinnt.** Modell (`gpt-realtime-2.1-mini`), kindgerechte deutsche Monster-Persona, passende Stimme und die Werkzeug-Whitelist werden beim Erzeugen des Tokens fest in die Session geschrieben. Der Client kann daran nichts ändern.
- **Direkte WebRTC-Verbindung.** Mit dem Ephemeral Token verbindet sich der Browser per WebRTC direkt zur OpenAI Realtime API. Während einer laufenden Session ist das Mikrofon offen; die Turn-Detection der API (`semantic_vad` mit `interrupt_response`) übernimmt Sprech-Erkennung und Barge-in. Ausserhalb einer Session ist das Mikrofon vollständig gestoppt (keine Hintergrundaufnahme). Der Ring pulsiert, wenn das Monster zuhört (gelb) bzw. spricht (türkis).
- **Witzige Stimmen pro Monster.** Jedes Monster hat eine eigene Realtime-Voice und eine Persona, die die Sprechweise vorgibt: Momo tief-brummig (`cedar`), Pip quirlig mit Kicheranfällen (`verse`), Lumi verträumt-flüsterig (`shimmer`), Zing hibbelig-gummiartig mit Quietsch-Lauten (`ash`).
- **Werkzeuge statt Freitext.** Das Modell darf ausschließlich die definierten Funktionen aufrufen (`huepfen`, `tanzen`, `besonderer_move`, `kitzeln`, `fuettern`, `ausdruck`, `begruessen`). `speech.js` mappt sie auf die App-Aktionen über `window.MonsterApp`. Kein `eval`, keine dynamische Ausführung von Modell-Text.
- **Tageslimit.** Pro Tag stehen 30 Minuten zur Verfügung (Zähler in `~/.claude/state/monster-speech-usage.json`, je Session 5 Minuten reserviert). Bei Überschreitung liefert der Proxy `429`, der Client zeigt „Die Monster schlafen schon".

### Proxy starten

```sh
bash scripts/start-speech-proxy.sh
```

Der Proxy lädt den Key selbst via `claude-control-op` aus 1Password (Vault Clawdbot) und bindet nur an `127.0.0.1:8092`. Für den öffentlichen Zugang wird `/api/*` per tailscale-Proxy auf diesen Port geleitet; nur die Origin `https://davids-macbook-pro.macaroni-wezen.ts.net:8443` ist per CORS erlaubt.

### Grenzen

- Das Mikrofon ist nur während einer aktiven Session offen; ausserhalb wird der Track gestoppt (keine Hintergrundaufnahme).
- Die Stimme/Persona einer Session gehört zum Monster, das beim Start gewählt war. Wer mitten im Gespräch das Monster wechselt, beendet die Session und startet für das neue Monster neu.
- Der Proxy ist lokal und wird nicht mit `dist/` deployt; er läuft auf David's Mac (z. B. in einer tmux-Session).

## Dateien

| Pfad | Inhalt |
| --- | --- |
| `dist/index.html` | Oberfläche und Bedienelemente |
| `dist/styles.css` | Gestaltung und responsive Größen |
| `dist/app.js` | Auswahl, Aktionen und Animationssteuerung; stellt `window.MonsterApp` bereit |
| `dist/speech.js` | Optionale Sprachsteuerung (Start/Stop-Toggle, VAD, WebRTC zur OpenAI Realtime API) |
| `scripts/speech-proxy.mjs` | Mint-Server: erzeugt Ephemeral Tokens, pinnt Persona/Werkzeuge, Tageslimit |
| `scripts/start-speech-proxy.sh` | Startet den Sprach-Proxy (Key via 1Password), für tmux |
| `dist/sounds.js` | Synthetische Sounds und Ton-Schalter |
| `dist/sw.js`, `dist/manifest.webmanifest` | Offline-Kopie und App-Installation |
| `dist/monster-motion.js` | Clips, Körperbewegung und Feder |
| `dist/rig.js` | Rig-Laufzeit und Kanalwerte pro Aktion |
| `dist/assets/` | Posen-Sheets für Portraits und Teile-Extraktion, Icons |
| `dist/assets/parts/`, `dist/assets/rig.json` | Rig-Teile und Rig-Daten, vorerst aus den Posen geschnitten |
| `scripts/extract-parts.py` | Schneidet Körper, Haare, Münder, Arme und Beine aus den vorhandenen Posen und berechnet Schultern, Hüften und Knie |
| `scripts/prepare-motion.py` | Leitet Landmarken aus den Posen ab, die `extract-parts.py` zum Finden der Hände nutzt |
| `scripts/strip-fake-alpha.py` | Entfernt den künstlichen Schachbretthintergrund der Zing-Grafik reproduzierbar |
| `scripts/preview-server.py`, `package.json` | Lokaler Vorschau-Server, auch für die Sites-Vorschau |
| `asset-prompts.json` | Entstehungsbeschreibungen der Grafiken |
| `IDEEN.md` | Ideen und vorgeschlagene nächste Ausbauschritte |
| `ANIMATION.md` | Konzept für ein Baukasten-Rig als nächste Animationsgrundlage |
| `.github/workflows/pages.yml` | Veröffentlichung von `dist/` über GitHub Pages |

Die vorbereiteten Animationsdaten und Rig-Teile sind eingecheckt. Nur wenn sie neu erzeugt werden sollen:

```sh
python3 -m pip install numpy scipy pillow
python3 scripts/prepare-motion.py
python3 scripts/extract-parts.py
```

## Rig

Die Monster werden aus Teilen zusammengesetzt, siehe [ANIMATION.md](ANIMATION.md). Die Teile stammen vorerst aus den vorhandenen Posen und werden durch eigens erzeugte Teile-Sheets ersetzt; die Prompts dafür stehen in `asset-prompts.json`.

## GitHub Pages

Einmalig im Repository unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** auswählen. Danach veröffentlicht der Workflow jeden Push auf `master`. Er lässt sich auch über **Actions → Deploy GitHub Pages → Run workflow** starten.

Der Workflow stempelt vor dem Hochladen Commit-Kürzel und Datum in `index.html`, `rig.html` und `sw.js`. Der Stempel steht unten rechts in der App und hängt als Cache-Parameter an Skripten und Bewegungsdaten, sodass ein Telefon nie alte und neue Dateien mischt. Lokal steht dort „lokal“.

Der Workflow lädt ausschließlich `dist/` als Website hoch. Die App verwendet relative Dateipfade und kann dadurch unter dem Repository-Unterpfad laufen.

Erwartete Adresse nach erfolgreicher Veröffentlichung: <https://david-mueller.github.io/monsterfreunde/>. Diese Adresse ist erst nach einem erfolgreichen Pages-Deployment verfügbar.

Die einmalige Aktivierung von Pages erfolgt in den Repository-Einstellungen. Der Workflow benötigt dafür keinen persönlichen Token und versucht nicht, Pages selbst einzuschalten.

Referenz: [GitHub-Dokumentation zu eigenen Pages-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Bisherige Prüfung

JavaScript-Syntax, lokale Dateiverweise und die Bewegungslogik wurden geprüft, einschließlich schneller Aktionswechsel, Pause im Hintergrund und reduzierter Bewegung. Die tatsächliche Darstellung und Leistung auf einem echten Android-Telefon müssen noch geprüft werden.
