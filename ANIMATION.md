# Monsterfreunde – Konzept für ein eigenes Animationsframework

Stand: 7. September 2026. Dieses Dokument beschreibt, warum das heutige Morphen zwischen ganzen Zeichnungen an seine Grenze kommt und wie ein Baukasten aus Körperteilen die Grundlage für alle weiteren Ideen wird.

## Ausgangslage

Heute gibt es pro Monster acht vollständige Zeichnungen. Die Hauptseite schneidet zwischen ihnen hart um; ein Versuch, Zwischenbilder durch Verformung zu berechnen, wurde nach Tests auf dem Telefon wieder entfernt, weil Gesichter und Hände Artefakte zeigten. Drei Probleme lassen sich mit ganzen Zeichnungen nicht lösen:

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
| Hörner | Kopfoberkante | – | Nur Pip |
| Haare vorn | Kopfmitte | – | Vor dem Gesicht, für Momos Haarwirbel |
| Augenweiß links / rechts | Augenmitte | – | Pupillen und Lider werden im Code gezeichnet |
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

Als Zwischenlösung lassen sich Teile aus den vorhandenen Posen gewinnen: Körper aus Pose 0 mit weggerechneten Armstummeln, erhobene Arme aus Pose 5, Augen und Mund per Farberkennung, lachender Mund aus Pose 7. Das ist gröber, braucht aber keine neue Grafik und reicht, um Rig, Editor und Timelines zu bauen und auf dem Telefon zu prüfen. Die sauberen Teile aus Weg A ersetzen sie später eins zu eins.

## Rig-Editor

Eine versteckte Seite `rig.html` zeigt das zusammengesetzte Monster. Teile lassen sich per Finger verschieben, Drehpunkte setzen, Ebenen tauschen und Varianten durchschalten. Ein Knopf kopiert die Rig-Datei als JSON. So werden Positionen einmal eingestellt, ohne Zahlen von Hand zu tippen.

## Vorgeschlagene Reihenfolge

1. Rig-Laufzeit und Timelines mit den Teilen aus Weg B bauen, versteckt unter `rig.html`. Blinzeln, Atmen, Winken, Hüpfen, Tanzen, Kitzeln nachbauen.
2. Rig-Editor ergänzen, Drehpunkte für Momo und Pip sauber setzen.
3. Teile-Sheets mit dem Bildwerkzeug erzeugen und einwechseln.
4. Hauptseite auf das Rig umstellen, Morph-Renderer entfernen.
5. Danach die Ideen in der Reihenfolge aus IDEEN.md: besonderer Move, Sounds, Essen, Sprechen.

## Entscheidungen, die offen sind

- Sollen Augen und Mund komplett im Code gezeichnet werden, oder nur Pupillen und Lider? Vollständig im Code gibt maximale Kontrolle und Konsistenz, sieht aber weniger nach Illustration aus.
- Arme mit einem oder zwei Segmenten? Zwei Segmente erlauben schöneres Winken und Essen, kosten aber eine zweite Zelle und einen zweiten Drehpunkt pro Arm.
- Bleiben die acht Posen als Referenz für den Stil und für die Portraits in der Auswahl? Vorschlag: ja.
