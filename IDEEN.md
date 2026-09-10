# Monsterfreunde – Ideen für die nächsten Iterationen

Stand: 7. September 2026. Diese Datei sammelt Ideen; sie bedeutet nicht, dass alle Funktionen bereits umgesetzt oder für die nächste Iteration eingeplant sind. Wir erweitern die App nacheinander in kleinen, spielbaren Schritten.

## Schon vorhanden

- [x] Fünf Monster auswählen: Momo, Pip, Lumi, den langbeinigen Gummiwurm Zing und das Riesenmaul Mampf.
- [x] Bewegte Monster mit Blinzeln und Begrüßung.
- [x] Kitzeln mit visueller Reaktion und Sprechblase, in fünf Zonen: Kopf, Bauch, Füße, linke und rechte Seite reagieren unterschiedlich.
- [x] Hüpfen und Tanzen.
- [x] Baukasten-Rig mit federnden Bewegungen: Arme, Augen, Mund, Haare und Hörner bewegen sich einzeln, ohne Morphen und ohne Schnitte.
- [x] Touch-Bedienung und Hochformat für das Telefon.

## Vorgeschlagene nächste Schritte

### 1. Essen und Trinken geben

- [x] Keks, Apfel und Saft unter den Aktionen.
- [x] Per Antippen füttern; der Snack fliegt zum Mund. Ziehen mit dem Finger kann später dazukommen.
- [x] Jubeln, Kauen mit Knuspern, Schlucken und zufriedenes Reagieren, alles mit den vorhandenen Posen und Körperbewegung.
- [x] Momo liebt Kekse und mag keinen Apfel, Pip liebt Äpfel und mag keine Kekse. Bei „Bäh!“ zieht das Monster die Brauen zusammen, schaut weg, schmollt, und der Snack fällt zu Boden.
- [x] Eine neue Aktion räumt einen fliegenden Snack sofort weg; nichts bleibt hängen.

Die erste Version bleibt ein unkompliziertes Spiel ohne Hungeranzeige oder Pflegepflichten. Offen: Snack per Finger zum Mund ziehen, Trinken mit eigener Animation.

### 2. Ein besonderer Move pro Monster

- [x] Jedes Monster hat einen eigenen Knopf neben den Snacks, beschriftet mit seinem Move.
- [x] **Momo: Wirbel.** Ausholen, zwei ganze Drehungen um die Mitte mit erhobenen Armen, schwindelige Landung mit Händen an den Wangen. Ein Haarschütteln folgt, sobald die Haare ein eigenes Teil im Rig sind.
- [x] **Pip: Salto.** Tiefes Ducken, hoher Sprung mit einem Überschlag, federnde Landung und stolzes Hüpfen mit erhobenen Armen.
- [x] **Lumi: Sternenfunkeln.** Schwebende Bewegung mit erhobenen Armen und magischen Lichtpartikeln.
- [x] **Zing: Superschlängler.** Der lange Wurmkörper windet sich in einer übertriebenen S-Kurve.
- [x] **Mampf: Riesenhapps.** Der Mund klappt fast über den ganzen Körper auf und schnappt zweimal mit einem eigenen Geräusch zu.
- [x] Ausholen, Hauptbewegung und Ausklang mit eigenen Sounds: Wusch, Plumps, Kichern beziehungsweise Tadaa.
- [ ] Die Moves sind Vorschläge und lassen sich in `monster-motion.js` leicht austauschen.

### 3. Lustige Töne und Sounds

- [x] Kichern beim Kitzeln, ein lustiges „Boing“ beim Hüpfen und ein Plumps bei der Landung; Kau- und Schluckgeräusche folgen mit dem Essen.
- [x] Einen passenden Sound zu jedem besonderen Move ergänzen.
- [x] Alle fünf Monster unterschiedlich klingen lassen: eigene Stimmlage und eigenes Tempo pro Monster.
- [x] Sounds genau mit den passenden Bewegungsmomenten auslösen: Absprung, Landung, Tanzschläge, Kicherer.
- [x] Kleine Zufallsabweichungen pro Wiedergabe, damit Wiederholungen lebendiger wirken.
- [x] Ton-Schalter oben rechts, Einstellung bleibt auf dem Gerät gespeichert, zurückhaltende Lautstärke.
- [x] Audio startet erst mit der ersten Aktion; jede Klangart ist zeitlich begrenzt, sodass schnelle Wiederholungen nicht überlagern.
- [ ] Die Klänge werden im Browser synthetisiert, es gibt keine Audiodateien. Prüfen, ob echte Aufnahmen später hübscher sind.

Das visuelle Kitzeln ist bereits vorhanden und hat jetzt hörbares Lachen.

### 4. Später: Witze erzählen mit ElevenLabs

- [ ] Einen Button zum Erzählen eines kurzen, kindgerechten Witzes ergänzen.
- [ ] Eine eigene Stimme und Sprechweise pro Monster wählen.
- [ ] Mundbewegung, Blick, Pausen und Gesten auf die Sprache abstimmen, sodass das Monster wie ein sprechender Avatar wirkt.
- [ ] Zuerst eine kleine, redaktionell ausgewählte Sammlung von Witzen verwenden.
- [ ] Als einfache erste Umsetzung Sprachclips vorab mit ElevenLabs erzeugen und zusammen mit der App ausliefern.
- [ ] Erst später prüfen, ob dynamische Spracherzeugung nötig ist; dafür eine serverseitige Anbindung mit geschütztem API-Schlüssel vorsehen.
- [ ] Wiederholte Clips wiederverwenden und beim Wechsel des Monsters die laufende Wiedergabe kontrolliert beenden.

### Grundlage für alles Weitere: Baukasten-Rig

- [x] Monster in einzelne Teile zerlegen und per Rig animieren statt ganze Zeichnungen zu morphen. Konzept, Teileliste und Reihenfolge stehen in [ANIMATION.md](ANIMATION.md).
- [x] Zuerst mit Teilen aus den vorhandenen Zeichnungen.
- [ ] Danach mit eigens erzeugten Teile-Sheets; Prompts liegen in `asset-prompts.json`.

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
- Ohne Verbindung zu externen Diensten soll das vorhandene Spiel weiterhin funktionieren. Seit dem Service Worker läuft die App auch ganz ohne Netz.
- Den aktuellen Fokus vor jeder Iteration festlegen; diese Liste ist ein Vorrat an Ideen.
