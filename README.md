# Monsterfreunde

Eine kleine Webapp für Android im Hochformat: Momo, Pip, Lumi oder Zing auswählen, füttern, kitzeln und bewegen lassen.

## Aktueller Stand

- Vier eigene Monster mit deutlich unterschiedlichen Silhouetten: Momo, Pip, das kosmische Sternchen Lumi und der langbeinige Gummiwurm Zing.
- Baukasten-Rig statt Posenwechsel: Körper, Haare beziehungsweise Hörner, Augenweiß, drei Münder und beide Arme sind einzelne Teile, die per CSS-Transform bewegt werden. Pupillen und Lider werden im Code gezeichnet. Alle Bewegungen laufen über Federn, sodass jede Aktion aus der aktuellen Haltung heraus beginnt und weich in die Ruhehaltung zurückkehrt. Kein Morphen, kein Schnitt.
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

## Dateien

| Pfad | Inhalt |
| --- | --- |
| `dist/index.html` | Oberfläche und Bedienelemente |
| `dist/styles.css` | Gestaltung und responsive Größen |
| `dist/app.js` | Auswahl, Aktionen und Animationssteuerung |
| `dist/sounds.js` | Synthetische Sounds und Ton-Schalter |
| `dist/sw.js`, `dist/manifest.webmanifest` | Offline-Kopie und App-Installation |
| `dist/monster-motion.js` | Clips, Körperbewegung und Feder |
| `dist/rig.js` | Rig-Laufzeit und Kanalwerte pro Aktion |
| `dist/assets/` | Posen-Sheets für Portraits und Teile-Extraktion, Icons |
| `dist/assets/parts/`, `dist/assets/rig.json` | Rig-Teile und Rig-Daten, vorerst aus den Posen geschnitten |
| `scripts/extract-parts.py` | Schneidet Körper, Augen, Münder und Arme aus den vorhandenen Posen |
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
