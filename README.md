# Monsterfreunde

Eine kleine Webapp für Android im Hochformat: Momo und Pip auswählen, kitzeln, hüpfen und tanzen lassen.

## Aktueller Stand

- Zwei eigene Monster mit jeweils acht gezeichneten Posen.
- Kein Morphen: Es ist immer genau eine der gezeichneten Posen zu sehen, jede exakt zentriert. Posen wechseln als Schnitte, jede Aktion beginnt bei der gerade sichtbaren Pose und endet in der Neutralpose. Ein kleiner Federstoß bei jedem Wechsel lässt den Schnitt wie einen Schritt wirken.
- Blinzeln, Atmen, Begrüßung, Kitzeln, Hüpfen und Tanzen.
- Ein besonderer Move pro Monster: Momos Wirbel und Pips Salto.
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
| `dist/monster-motion.js` | Posenwechsel per Canvas, Clips und Bewegungsmodelle |
| `dist/assets/` | Monsterzeichnungen und Animations-Landmarken |
| `dist/rig.html`, `dist/rig.js`, `dist/rig-app.js` | Prototyp des Baukasten-Rigs aus ANIMATION.md, erreichbar unter `/rig.html` |
| `dist/assets/parts/`, `dist/assets/rig.json` | Provisorische Teile und Rig-Daten, aus den Posen geschnitten |
| `scripts/extract-parts.py` | Schneidet Körper, Augen, Münder und Arme aus den vorhandenen Posen |
| `scripts/prepare-motion.py` | Leitet Zentrierung und Landmarken aus den vorhandenen Zeichnungen ab; die Hauptseite nutzt nur die Zentrierung |
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

Der Workflow stempelt vor dem Hochladen Commit-Kürzel und Datum in `index.html`, `rig.html` und `sw.js`. Der Stempel steht unten rechts in der App und hängt als Cache-Parameter an Skripten und Bewegungsdaten, sodass ein Telefon nie alte und neue Dateien mischt. Lokal steht dort „lokal“.

Der Workflow lädt ausschließlich `dist/` als Website hoch. Die App verwendet relative Dateipfade und kann dadurch unter dem Repository-Unterpfad laufen.

Erwartete Adresse nach erfolgreicher Veröffentlichung: <https://david-mueller.github.io/monsterfreunde/>. Diese Adresse ist erst nach einem erfolgreichen Pages-Deployment verfügbar.

Die einmalige Aktivierung von Pages erfolgt in den Repository-Einstellungen. Der Workflow benötigt dafür keinen persönlichen Token und versucht nicht, Pages selbst einzuschalten.

Referenz: [GitHub-Dokumentation zu eigenen Pages-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Bisherige Prüfung

JavaScript-Syntax, lokale Dateiverweise und die Bewegungslogik wurden geprüft, einschließlich schneller Aktionswechsel, Pause im Hintergrund und reduzierter Bewegung. Die tatsächliche Darstellung und Leistung auf einem echten Android-Telefon müssen noch geprüft werden.
