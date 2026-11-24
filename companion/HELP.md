# Second Wave Robo Lift – MoPed Controller

Steuert das **Second Wave Motorized Pedestal** über die **VISCA over IP Data Box**. / Controls the Second Wave motorised pedestal via the VISCA over IP Data Box. / Controla el pedestal motorizado Second Wave mediante la VISCA over IP Data Box.

**Sprache / Language / Idioma:** in der Verbindung wählbar (Deutsch, English, Español).

## Einrichtung / Setup / Configuración

| Feld / Field                          | Standard / Default                                                          |
| ------------------------------------- | --------------------------------------------------------------------------- |
| IP Data Box                           | 192.168.1.8 (Werkseinstellung; tatsächliche IP laut microSD `TRConfig.TXT`) |
| Zielport / Target port                | 52381 (UDP)                                                                 |
| Lokaler Quellport / Local source port | 52381                                                                       |
| Übertragung / Transport               | VISCA over IP (8-byte header)                                               |
| Geräteadresse / Device address        | 1                                                                           |
| Robolift-Modell / Model               | Model 30 (16 s Fahrzeit, 19 s Referenzfahrt) – oder „Benutzerdefiniert“     |
| Mitte / Middle                        | 8 s ab unten                                                                |

Computer und Data Box müssen im selben Netz liegen. / Computer and Data Box must be in the same network.

## Reihenfolge Hoch-/Herunterfahren / Start-up & shut-down order / Orden de encendido y apagado

|     | Hochfahren / Start-up / Encendido                    | Herunterfahren / Shut-down / Apagado                 |
| --- | ---------------------------------------------------- | ---------------------------------------------------- |
| 1   | VISCA Data Box                                       | Licht / light / luz, Kamera / camera / cámara        |
| 2   | Pedestal (Steuerbox / control box / caja de control) | Pedestal (Steuerbox / control box / caja de control) |
| 3   | Kamera / camera / cámara, Licht / light / luz        | VISCA Data Box                                       |

Vor dem Abschalten Stopp drücken. Falsche Abschaltreihenfolge → Anzeige „RST“, Säule fährt nur abwärts bis zum Reset. / Press Stop before switching off. Wrong shut-down order → “RST”, column only moves down until reset. / Pulsar Parar antes de apagar. Orden incorrecto → “RST”, la columna solo baja hasta el reset.

## Start / Start-up / Inicio

Nach jedem Start führt das Modul durch drei Schritte; bis dahin sind die Fahrtasten gesperrt (grau):

1. **Datencheck**: Ist die Data Box im Netz erreichbar?
2. **Bewegungscheck**: „Check starten“ – die Säule fährt kurz auf und ab. Danach **„Bewegt“** oder **„Keine Bewegung“** melden.
3. **Position unten**: Säule ganz nach unten fahren und **„Position bestätigt“** drücken.

Danach sind ▲ / ▼ und die Positionstasten frei. Fällt die Data Box zweimal hintereinander aus, beginnt der Ablauf von vorn.
/ After every start the module guides through three steps (drive keys are locked until then): 1. data check, 2. movement check – “Start check”, then report “Moved” or “No movement”, 3. drive to the bottom and press “Position confirmed”. If the Data Box is lost twice in a row, the flow starts again.
/ Tras cada inicio el módulo guía en tres pasos (las teclas de marcha están bloqueadas hasta entonces): 1. comprobación de datos, 2. comprobación de movimiento, 3. bajar del todo y confirmar “abajo”.

## Modell & Kalibrierung / Model & calibration / Modelo y calibración

Bei bekanntem Modell setzt das Modul die Fahrzeiten automatisch. Andere Robolifte: **„Benutzerdefiniert“** wählen und die Zeiten eintragen – oder messen lassen (Presets **„5 – Kalibrierung“**):

1. Systemcheck durchlaufen und „unten“ bestätigen (Säule steht unten).
2. **„Kalibrierung starten“** – die Säule fährt hoch, die Taste blinkt.
3. Am oberen Anschlag **„Oben erreicht“** drücken. Die gemessene Fahrzeit wird gespeichert (Modell → Benutzerdefiniert, Referenzfahrt = Fahrzeit + Reserve).
4. Optional: auf gewünschte Höhe fahren und **„Mitte hier speichern“**.

**Stopp** bricht die Kalibrierung ab; nach 40 s stoppt sie automatisch (Sicherheitsstopp).
/ Known model → times set automatically. Other lifts: choose “Custom” and enter times, or measure them: column at bottom → “Start calibration” → “Top reached” at the upper end stop → optionally “Save middle here”. Stop cancels; automatic safety stop after 40 s.
/ Modelo conocido → tiempos automáticos. Otros: “Personalizado” y medir: columna abajo → “Iniciar calibración” → “Arriba alcanzado” → opcional “Guardar centro aquí”.

## Bedienseite einrichten / Button page / Página de botones

Das Modul bringt fertige Tasten (Presets) mit. So entsteht eine Bedienseite – auf einem Stream Deck oder im Browser:

1. **Oberfläche**: Stream Deck anschließen – oder in Companion unter **Surfaces → „Add Emulator“** einen Emulator anlegen (Bildschirm-Stream-Deck im Browser, z. B. auf Tablet oder Laptop).
2. **Presets**: unter **Buttons → Reiter „Presets“ → Second Wave Robo Lift** die Gruppen **„1 – Datencheck“** bis **„5 – Kalibrierung“** auf freie Tasten einer Seite ziehen (Reihenfolge = Bedienablauf).
3. **Öffnen**: den Emulator im Browser aufrufen: `http://<IP des Companion-Rechners>:8000/emulator/<Emulator-ID>` (Link auch unter Surfaces).

/ The module ships ready-made buttons (presets). Connect a Stream Deck or add an emulator under **Surfaces → “Add Emulator”** (on-screen Stream Deck in the browser), drag the preset groups **“1 – …” to “5 – Calibration”** onto a page, then open the emulator at `http://<Companion IP>:8000/emulator/<emulator id>`.
/ El módulo incluye botones listos (presets). Conectar un Stream Deck o crear un emulador en **Surfaces → “Add Emulator”**, arrastrar los grupos **“1 – …” a “5 – Calibración”** a una página y abrir el emulador en `http://<IP de Companion>:8000/emulator/<id>`.

## Aktionen / Actions / Acciones

- **Auf / Ab** (▲ ▼): fahren, bis Stopp kommt – Presets senden Stopp beim Loslassen. Sicherheitsstopp nach einstellbarer Dauer.
- **Stopp**: hält sofort an und bricht laufende Positionsfahrten ab.
- **Position Oben / Mitte / Unten**, **freie Position** (Sekunden ab unten): zeitgesteuert. Die Säule fährt zuerst ganz nach unten (Endanschlag = Referenz) und dann die eingestellte Zeit hoch. Die Presets der Data Box werden nicht verwendet (vom Gerät nicht unterstützt). Ist die Position bekannt (nach Unten/Mitte/Frei/Oben), entfällt das Herunterfahren: Steht die Säule unten, fahren Mitte/Frei direkt hoch; Unten bzw. Oben auf derselben Position tun nichts. Nach ▲/▼ wird die Position anhand der Fahrzeit weitergeschätzt. / If the position is known, the homing run is skipped; after ▲/▼ the position is estimated from the drive time.
- **Systemcheck**: 1. Data Box im Netz erreichbar? 2. kurze Testfahrt (auf/ab). 3. Bewegung mit **„Bewegt ✔“** oder **„Keine Bewegung“** melden. Ergebnis und Abhilfe-Hinweis stehen in den Variablen.
- **Experte**: eigener VISCA-Hex-Befehl.

## Variablen / Variables

`drive_status`, `position`, `power_order`, `check_databox`, `check_controlbox`, `check_pedestal`, `check_time`, `check_hint`, `module_version`, `credit`, `calib_status`

## Sicherheit / Safety / Seguridad

Vor der ersten Fahrt Freiraum um die Säule schaffen; Stopp griffbereit. / Clear the area around the column before the first move; keep Stop at hand. / Despejar el entorno de la columna antes del primer movimiento; tener Parar a mano.

## Versionen / Versions

Siehe `CHANGELOG.md` im Repository.

---

<small>Created by Recht schnell! GmbH with Schnittpunkt UG · MIT License</small>
