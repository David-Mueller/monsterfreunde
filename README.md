# Monsterfreunde

Eine kleine Webapp für Android im Hochformat: Momo und Pip auswählen, kitzeln, hüpfen und tanzen lassen.

## Aktueller Stand

- Zwei eigene Monster mit jeweils acht gezeichneten Posen.
- Berechnete Zwischenbilder mit WebGL: Hände, Füße, Augen und Mund dienen als Griffpunkte, um die herum die Zeichnung möglichst starr gedreht und verschoben wird. Es ist immer nur eine vollständige Zeichnung sichtbar, nie ein Mischbild. Ohne WebGL wechseln die Posen als Schnitte.
- Blinzeln, Atmen, Begrüßung, Kitzeln, Hüpfen und Tanzen.
- Federnde Körperbewegung und zum Sprung passender Schatten.
- Auswahl per Touch, Wischen oder Tastatur.
- Berücksichtigung reduzierter Bewegung und Pause bei ausgeblendetem Tab.

Die App benötigt weder einen Build-Schritt noch einen eigenen Backend-Server. Neue Spielaktionen und Sounds sind noch nicht implementiert; die Ideen stehen in [IDEEN.md](IDEEN.md).

## Lokal starten

```sh
python3 -m http.server 8000 --directory dist
```

Danach `http://localhost:8000` öffnen. Ein HTTP-Server ist nötig, weil die App ihre Animationsdaten nachlädt; `index.html` nicht direkt als lokale Datei öffnen.

## Dateien

| Pfad | Inhalt |
| --- | --- |
| `dist/index.html` | Oberfläche und Bedienelemente |
| `dist/styles.css` | Gestaltung und responsive Größen |
| `dist/app.js` | Auswahl, Aktionen und Animationssteuerung |
| `dist/monster-motion.js` | Zwischenbild-Berechnung, WebGL und Bewegungsmodelle |
| `dist/assets/` | Monsterzeichnungen und Animations-Landmarken |
| `dist/rig.html`, `dist/rig.js`, `dist/rig-app.js` | Prototyp des Baukasten-Rigs aus ANIMATION.md, erreichbar unter `/rig.html` |
| `dist/assets/parts/`, `dist/assets/rig.json` | Provisorische Teile und Rig-Daten, aus den Posen geschnitten |
| `scripts/extract-parts.py` | Schneidet Körper, Augen, Münder und Arme aus den vorhandenen Posen |
| `scripts/prepare-motion.py` | Leitet Griffpunkte und Zentrierung aus den vorhandenen Zeichnungen ab |
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

## Rig-Prototyp

Unter `/rig.html` läuft dieselbe Spielfläche mit dem Baukasten-Rig aus [ANIMATION.md](ANIMATION.md): Körper, Augen, Münder und Arme sind einzelne Teile, die per CSS-Transform bewegt werden. Pupillen und Lider werden im Code gezeichnet. Die Teile stammen vorerst aus den vorhandenen Posen und werden durch eigens erzeugte Teile-Sheets ersetzt.

## GitHub Pages

Einmalig im Repository unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** auswählen. Danach veröffentlicht der Workflow jeden Push auf `master`. Er lässt sich auch über **Actions → Deploy GitHub Pages → Run workflow** starten.

Der Workflow stempelt vor dem Hochladen Commit-Kürzel und Datum in `index.html`. Der Stempel steht unten rechts in der App und hängt als Cache-Parameter an Skripten und Bewegungsdaten, sodass ein Telefon nie alte und neue Dateien mischt. Lokal steht dort „lokal“.

Der Workflow lädt ausschließlich `dist/` als Website hoch. Die App verwendet relative Dateipfade und kann dadurch unter dem Repository-Unterpfad laufen.

Erwartete Adresse nach erfolgreicher Veröffentlichung: <https://david-mueller.github.io/monsterfreunde/>. Diese Adresse ist erst nach einem erfolgreichen Pages-Deployment verfügbar.

Die einmalige Aktivierung von Pages erfolgt in den Repository-Einstellungen. Der Workflow benötigt dafür keinen persönlichen Token und versucht nicht, Pages selbst einzuschalten.

Referenz: [GitHub-Dokumentation zu eigenen Pages-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Bisherige Prüfung

JavaScript-Syntax, lokale Dateiverweise und die Bewegungslogik wurden geprüft, einschließlich schneller Aktionswechsel, Pause im Hintergrund und reduzierter Bewegung. Die tatsächliche Darstellung und Leistung auf einem echten Android-Telefon müssen noch geprüft werden.
