# Monsterfreunde – Ideen für die nächsten Iterationen

Stand: 7. September 2026. Diese Datei sammelt Ideen; sie bedeutet nicht, dass alle Funktionen bereits umgesetzt oder für die nächste Iteration eingeplant sind. Wir erweitern die App nacheinander in kleinen, spielbaren Schritten.

## Schon vorhanden

- [x] Momo und Pip auswählen.
- [x] Bewegte Monster mit Blinzeln und Begrüßung.
- [x] Kitzeln mit visueller Reaktion und Sprechblase.
- [x] Hüpfen und Tanzen.
- [x] Berechnete Zwischenbilder, federnde Bewegungen und Sprungschatten.
- [x] Touch-Bedienung und Hochformat für das Telefon.

## Vorgeschlagene nächste Schritte

### 1. Essen und Trinken geben

- [ ] Eine kleine Auswahl an Snacks und ein Getränk anbieten.
- [ ] Zunächst per Antippen füttern; später Essen und Becher zum Mund ziehen können.
- [ ] Greifen, Kauen, Schlucken und zufriedenes Reagieren animieren.
- [ ] Momo und Pip unterschiedliche Vorlieben und Reaktionen geben.
- [ ] Die Aktionen sauber mit bereits laufenden Bewegungen verbinden.

Die erste Version bleibt ein unkompliziertes Spiel. Hungeranzeigen oder zeitabhängige Pflegepflichten sind dafür nicht nötig.

### 2. Ein besonderer Move pro Monster

- [ ] Jedes Monster bekommt eine eigene Aktion, die nur dieses Monster vorführen kann.
- [ ] **Idee für Momo:** Der Wuschel wirbelt seine Haare durcheinander und schüttelt sie wieder zurecht.
- [ ] **Idee für Pip:** Ein übermütiger Sprung mit einer kleinen Drehung und besonders federnder Landung.
- [ ] Ausholen, Hauptbewegung und Ausklang als vollständige kleine Darbietung animieren.
- [ ] Die endgültigen Moves gemeinsam auswählen; die Vorschläge sind noch offen.

### 3. Lustige Töne und Sounds

- [ ] Kichern beim Kitzeln, ein lustiges „Boing“ beim Hüpfen, Kau- und Schluckgeräusche beim Essen und Trinken.
- [ ] Einen passenden Sound zu jedem besonderen Move ergänzen.
- [ ] Momo und Pip unterschiedlich klingen lassen.
- [ ] Sounds genau mit den passenden Bewegungsmomenten auslösen.
- [ ] Mehrere kurze Varianten pro Aktion, damit Wiederholungen lebendiger wirken.
- [ ] Gut erreichbarer Ton-an/aus-Schalter und zurückhaltende Lautstärke.
- [ ] Audio erst nach einer bewussten Berührung starten; schnelle Wiederholungen dürfen keine unkontrollierten Sound-Überlagerungen erzeugen.

Das visuelle Kitzeln ist bereits vorhanden. In diesem Schritt bekommt es zusätzliche Reaktionen und hörbares Lachen.

### 4. Später: Witze erzählen mit ElevenLabs

- [ ] Einen Button zum Erzählen eines kurzen, kindgerechten Witzes ergänzen.
- [ ] Eine eigene Stimme und Sprechweise pro Monster wählen.
- [ ] Mundbewegung, Blick, Pausen und Gesten auf die Sprache abstimmen, sodass das Monster wie ein sprechender Avatar wirkt.
- [ ] Zuerst eine kleine, redaktionell ausgewählte Sammlung von Witzen verwenden.
- [ ] Als einfache erste Umsetzung Sprachclips vorab mit ElevenLabs erzeugen und zusammen mit der App ausliefern.
- [ ] Erst später prüfen, ob dynamische Spracherzeugung nötig ist; dafür eine serverseitige Anbindung mit geschütztem API-Schlüssel vorsehen.
- [ ] Wiederholte Clips wiederverwenden und beim Wechsel des Monsters die laufende Wiedergabe kontrolliert beenden.

### 5. Monster-Designer

- [ ] Ein eigenes Monster aus Körperform, Augen, Mund, Armen, Beinen, Haaren, Hörnern und Farben zusammenbauen.
- [ ] Zusammengestellte Monster sollen die grundlegenden Animationen mitmachen können.
- [ ] Einen Namen vergeben und das eigene Monster auf dem Gerät speichern.
- [ ] Vor der Umsetzung festlegen, wie austauschbare Teile mit der Animation verbunden werden. Die aktuellen vollständigen Pose-Zeichnungen sind noch kein Baukastensystem.

### 6. Kleine begehbare Welt

- [ ] Mit dem ausgewählten Monster durch eine überschaubare 2D-Welt laufen.
- [ ] Auf eine Stelle tippen, um dorthin zu laufen.
- [ ] Essen finden, einen Ball anstupsen oder andere Monster begrüßen.
- [ ] Mit einer kleinen, interaktiven Umgebung beginnen und sie später erweitern.

## Leitlinien für die Umsetzung

- Eine Funktion nach der anderen bis zu einem spielbaren Ergebnis bringen.
- Gute Reaktionen, verständliche Touch-Bedienung und flüssige Animationen stehen im Vordergrund.
- Nach jeder größeren Änderung auf einem echten Android-Telefon ausprobieren.
- Neue Grafik- und Audiodateien mit dem Projekt versionieren.
- Ohne Verbindung zu externen Diensten soll das vorhandene Spiel weiterhin funktionieren.
- Den aktuellen Fokus vor jeder Iteration festlegen; diese Liste ist ein Vorrat an Ideen.
