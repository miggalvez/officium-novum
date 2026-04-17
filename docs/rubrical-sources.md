# Rubrical Sources

This document is the project's canonical index of the external rubrical source families referenced by Officium Novum.

Use it together with [Phase 2 Rubrical Engine Design](./phase-2-rubrical-engine-design.md) §19.1:

1. Ordo Recitandi
2. Governing rubrical books
3. Legacy Divinum Officium Perl output

The main Divinum Officium source hub for these materials is [Rubrics of the Roman Breviary](https://www.divinumofficium.com/www/horas/Help/rubrics.html).

## Coverage On The Divinum Officium Rubrics Page

The Divinum Officium rubrics index currently exposes these families directly:

- `1960` — under the `Rubrics 1960` section on the rubrics index
- `1911 / Divino Afflatu` — under `Tridentine & Divino Afflatu`, specifically `Additiones ad normam Divino Afflatu (St. Pius X)`
- `1955` — as the standalone [Reductions to Simpler Form 1955 (Cum Nostra Hac Aetate)](https://www.divinumofficium.com/www/horas/Help/Rubrics/1955.txt)
- `Tridentine` — under `Rubrics after the Council of Trent`
- `Monastic 1963` — under `Monastic Breviary 1963`

The rubrics index does not currently provide separate dedicated sections for the Cistercian or Dominican families used in `Tabulae/data.txt`.

## Project Mapping

| Policy / Ordo Family | Repo Version Handles | Primary Rubrical References | Current Status |
|---|---|---|---|
| `divino-afflatu` | `Divino Afflatu - 1939`, `Divino Afflatu - 1954` | [Rubrics index](https://www.divinumofficium.com/www/horas/Help/rubrics.html) → `Tridentine & Divino Afflatu`; `Additiones ad normam Divino Afflatu (St. Pius X)`; `English Divino Afflatu Rubrics` on the same page | Implemented |
| `reduced-1955` | `Reduced - 1955` | [Reductions to Simpler Form 1955](https://www.divinumofficium.com/www/horas/Help/Rubrics/1955.txt) and the [rubrics index](https://www.divinumofficium.com/www/horas/Help/rubrics.html) | Implemented |
| `rubrics-1960` | `Rubrics 1960 - 1960`, `Rubrics 1960 - 2020 USA` | [Rubrics index](https://www.divinumofficium.com/www/horas/Help/rubrics.html) → `Rubrics 1960`, including `Rubricarum Instructum`, `General Rubrics`, `Rubrics of Breviarium Romanum`, `Tables of Feasts`, and `1960 Roman Calendar` | Implemented |
| `tridentine-1570` | `Tridentine - 1570`, `Tridentine - 1888`, `Tridentine - 1906` | [Rubrics index](https://www.divinumofficium.com/www/horas/Help/rubrics.html) → `Rubrics after the Council of Trent` | Deferred by scope |
| `monastic-tridentine` / `monastic-divino` / `monastic-1963` | `Monastic Tridentinum 1617`, `Monastic Divino 1930`, `Monastic - 1963`, `Monastic - 1963 - Barroux` | [Rubrics index](https://www.divinumofficium.com/www/horas/Help/rubrics.html) → `Monastic Breviary 1963`; earlier monastic families remain repo-tracked but not yet implemented | Deferred by scope |
| `cistercian-1951` / `cistercian-altovadense` | `Monastic Tridentinum Cisterciensis 1951`, `Monastic Tridentinum Cisterciensis Altovadensis` | No dedicated section on the Divinum Officium rubrics index; source collection must be handled separately when implementation begins | Deferred by scope |
| `dominican-1962` | `Ordo Praedicatorum - 1962` | No dedicated section on the Divinum Officium rubrics index; source collection must be handled separately when implementation begins | Deferred by scope |

## Maintenance Notes

- When policy support changes, update this file, [README.md](../README.md), and [AGENTS.md](../AGENTS.md) together.
- The authoritative repo mapping from `VersionHandle` to policy family is [`packages/rubrical-engine/src/version/policy-map.ts`](../packages/rubrical-engine/src/version/policy-map.ts).
- This file is a source index, not an adjudication shortcut. Divergence resolution still requires citations from the governing rubrical text or an Ordo source, not just a link to the index page.
