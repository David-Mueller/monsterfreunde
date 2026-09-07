# Monsterfreunde – Konzept für ein eigenes Animationsframework

Stand: 7. September 2026. Dieses Dokument beschreibt, warum das heutige Morphen zwischen ganzen Zeichnungen an seine Grenze kommt und wie ein Baukasten aus Körperteilen die Grundlage für alle weiteren Ideen wird.

## Ausgangslage

Als Ausgangsmaterial gibt es pro Monster mehrere vollständige Zeichnungen. Die App verwendet daraus extrahierte Einzelteile und animiert sie als Rig; ein früherer Versuch, vollständige Posen zu überblenden, wurde entfernt, weil dabei unscharfe Doppelbilder entstanden. Drei Probleme lassen sich mit ganzen Zeichnungen nicht lösen:

- Die Zeichnungen sind untereinander nicht konsistent. Momos hängender Arm ist ein kurzer Stummel, der erhobene Arm ist dreimal so lang. Kein Verfahren kann das ohne Stauchen oder Strecken überbrücken.
- Jeder Schnitt zwischen zwei Zeichnungen ist sichtbar, weil Haare, Hände und Körperkontur anders gezeichnet sind.
- Neue Aktionen brauchen neue vollständige Zeichnungen samt Griffpunkten. Füttern, Sprechen, ein Designer oder eine begehbare Welt skalieren so nicht.

## Vorschlag: Baukasten-Rig aus einzelnen Teilen

Jedes Monster wird einmal in Neutralstellung gezeichnet, aber in einzelnen Teilen mit transparentem Hintergrund. Die App setzt die Teile in Ebenen zusammen und bewegt sie einzeln. Das ist die klassische Cut-out-Animation, wie sie Kinderserien und Apps seit Jahrzehnten nutzen. Jedes Teil hat einen Drehpunkt, eine Ebene und optional mehrere Varianten.

### Teileliste pro Monster

| Teil | Drehpunkt | Varianten | Anmerkung |
| --- | --- | --- | --- |
| Haare hinten | Kopfmitte | – | Hinter dem Körper, damit sie wackeln können |
| Körper mit Kopf | Fußmitte | – | Ein Stück, ohne Arme, Beine und Gesicht |
| Bauchfleck / Brusttuft | Körpermitte | – | Nur zur Sicherheit separat, falls es mitwackeln soll |
| Hörner / Antennen | Kopfoberkante | – | Je nach Figur, zum Beispiel Pip und Lumi |
| Haare vorn | Kopfmitte | – | Vor dem Gesicht, für Momos Haarwirbel |
| Augen | – | – | Entfallen: Augenweiß, Pupillen, Lider und Brauen werden im Code gezeichnet |
| Mund | Mundmitte | zu, lächelnd, offen, lachend, O | Für Sprechen, Kauen und Lachen |
| Arm links / rechts | Schulter | offen, Faust | Ein Stück inklusive Hand, hinter dem Körper |
| Bein links / rechts | Hüfte | – | Ein Stück inklusive Fuß, hinter dem Körper |

Arme und Beine liegen hinter dem Körper. Dadurch darf ihr Ansatz unsauber sein, weil er vom Körper verdeckt wird, und das Drehen um Schulter und Hüfte sieht immer richtig aus.

Pupillen, Lider und Augenbrauen werden im Code gezeichnet. Das sind einfache Formen in Monsterfarben, und so lassen sich Blinzeln, Blickrichtung und Ausdruck stufenlos steuern, ohne dafür Grafik zu brauchen.

### Bewegung

- **Rig-Daten** je Monster in einer JSON-Datei: für jedes Teil Bild, Position, Drehpunkt, Ebene und Varianten.
- **Timelines** je Aktion: Schlüsselbilder für Drehung, Verschiebung und Skalierung einzelner Teile, mit Easing. Dazu benannte Momente wie Absprung und Landung für Sounds und Partikel; das existiert heute schon.
- **Prozedurale Schichten** obendrauf: Atmung, leichtes Schwanken, Blinzeln, die vorhandene Feder für Körperbewegung. Sie laufen unabhängig von den Timelines und verhindern, dass ein Monster je still steht.
- **Blend statt Schnitt**: Zwei Aktionen überblenden auf Transformationsebene. Ein Sprung, der mitten im Tanz startet, geht ohne Sprung in der Bewegung weiter, weil nur Winkel und Positionen gemischt werden, nie Bilder.

Das Rig rechnet nur Zahlen aus. Die Darstellung ist getrennt: zuerst per DOM und CSS-Transforms, das ist am einfachsten, überall verfügbar und ohne WebGL. Für die begehbare Welt kann später ein Canvas-Renderer dieselben Daten zeichnen.

### Was die Ideen aus IDEEN.md damit kosten

| Idee | Mit Rig |
| --- | --- |
| Besonderer Move | Nur eine Timeline. Momos Haarwirbel: Haare vorn und hinten wackeln. Pips Drehsprung: Körper dreht sich, Beine ziehen an. |
| Essen und Trinken | Snack-Sprite fliegt zum Mund, Mundvariante „O“, Kauen als Mund-Skalierung, Schlucken als Körperstauchung. Keine neue Monstergrafik. |
| Sounds | Hängen an den benannten Momenten, unverändert. |
| Witze erzählen | Mundvarianten nach Lautstärke des Clips, Blick und Brauen im Code. |
| Monster-Designer | Teile werden aus einer Bibliothek getauscht, Farben per Filter oder Farbvarianten. Das Rig ist genau das Baukastensystem, das dafür fehlt. |
| Begehbare Welt | Laufzyklus aus Beindrehung und Körperwippen. Canvas-Renderer zeichnet dasselbe Rig. |

## Wie die Teile entstehen

### Weg A: Neue Teile mit dem Bildwerkzeug erzeugen

Ein Teile-Sheet pro Monster im gleichen Stil wie die vorhandenen Zeichnungen, 4×4 Zellen, jedes Teil einzeln und vollständig in seiner Zelle. Fertige Prompts stehen in `asset-prompts.json` unter `momo-parts` und `pip-parts`. Danach schneidet `scripts/prepare-parts.py` die Zellen aus, entfernt Ränder und erzeugt die Rig-Datei mit Startwerten. Drehpunkte und Feinpositionen werden einmalig im Rig-Editor gesetzt.

Risiko: Das Bildwerkzeug hält Raster und Stil nicht immer exakt ein. Erfahrungsgemäß braucht es zwei bis drei Anläufe. Der Körper muss ohne Arme und Beine gezeichnet sein; das ist die kritischste Zelle.

### Weg B: Teile aus den vorhandenen Zeichnungen schneiden

Als Zwischenlösung lassen sich Teile aus den vorhandenen Posen gewinnen: Körper mit weggerechneten Armstummeln, Arme, Haare beziehungsweise Hörner sowie verschiedene Münder. Das Extraktionsskript enthält Sonderfälle für ungewöhnliche Formen – etwa Zings überlappende Augen und sehr dünne Arme. Das ist gröber als eigens gezeichnete Teile-Sheets, reicht aber für spielbare Timelines und Tests auf dem Telefon.

## Rig-Editor

Eine versteckte Seite `rig.html` zeigt das zusammengesetzte Monster. Teile lassen sich per Finger verschieben, Drehpunkte setzen, Ebenen tauschen und Varianten durchschalten. Ein Knopf kopiert die Rig-Datei als JSON. So werden Positionen einmal eingestellt, ohne Zahlen von Hand zu tippen.

## Vorgeschlagene Reihenfolge

1. ~~Rig-Laufzeit und Timelines mit den Teilen aus Weg B bauen.~~ Erledigt, inklusive Haare und Hörner als eigene Teile.
2. ~~Hauptseite auf das Rig umstellen, Morph-Renderer entfernen.~~ Erledigt; Essen, Moves, Leerlauf und Sounds laufen über das Rig.
3. Teile-Sheets mit dem Bildwerkzeug erzeugen und einwechseln. Wichtig dabei: Arme und Hände brauchen eine Kontur oder eine leicht andere Farbe als das Gesicht, sonst verschwinden sie, wenn sie vor dem Körper liegen.
4. Rig-Editor ergänzen, Drehpunkte sauber setzen.
5. Beine als Teile, damit Sprünge die Füße anziehen und ein Laufzyklus möglich wird.
6. Danach die Ideen aus IDEEN.md: Sprechen, Designer, Welt.

## Entscheidungen, die offen sind

- Die Augen sind inzwischen komplett im Code: weißes Oval, Pupille, Lider, Brauen. Offen bleibt, ob der Mund ebenfalls im Code gezeichnet werden soll, etwa für Sprechen.
- Arme mit einem oder zwei Segmenten? Zwei Segmente erlauben schöneres Winken und Essen, kosten aber eine zweite Zelle und einen zweiten Drehpunkt pro Arm.
- Bleiben die acht Posen als Referenz für den Stil und für die Portraits in der Auswahl? Vorschlag: ja.
