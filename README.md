# companion-module-secondwave-robolift

Bitfocus Companion module for the **Second Wave Motorized Pedestal** ("Robo Lift – MoPed Controller"), controlled through the **Second Wave VISCA over IP Data Box**.

User documentation (Deutsch / English / Español): [companion/HELP.md](./companion/HELP.md) · Changes: [CHANGELOG.md](./CHANGELOG.md) · License: [MIT](./LICENSE)

## What the module does

- Drive up / down / stop (hold-to-run buttons with safety stop)
- Timed positions: top, middle, bottom, custom (seconds from the bottom) with countdown on the buttons
- Guided start-up flow for safe operation: data check → movement check → confirm "bottom" → controls enabled
- Model selection with predefined travel times, or "Custom" with a calibration run that measures the travel time
- Reachability monitoring of the Data Box, texts in German, English and Spanish, ready-made presets

## How it works

The Data Box accepts VISCA pan/tilt drive commands over UDP (VISCA over IP, port 52381) and offers neither position feedback nor presets. The module therefore works time based: the lower end stop is the reference, and a position is "seconds of travel from the bottom". Details are explained in the header of [`src/main.js`](./src/main.js).

| File               | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `src/main.js`      | Module instance: configuration, guided flow, drive and position logic |
| `src/visca.js`     | VISCA over IP transport (UDP) and reachability probe                  |
| `src/actions.js`   | Actions                                                               |
| `src/feedbacks.js` | Feedbacks                                                             |
| `src/presets.js`   | Presets                                                               |
| `src/i18n.js`      | Texts (de / en / es)                                                  |
| `src/upgrades.js`  | Upgrade scripts                                                       |

## Hardware used for testing

Second Wave Motorized Pedestal Model 30 with VISCA over IP Data Box, Companion 5.0.x on Raspberry Pi and Windows, Elgato Stream Deck Mini.

## Development

```
yarn install
yarn package      # builds secondwave-robolift-x.y.z.tgz for "Import module package"
yarn format
```

## Maintainer

Schnittpunkt UG (brand Second Wave) – created by Recht schnell! GmbH with Schnittpunkt UG. Contact: see `companion/manifest.json`.
