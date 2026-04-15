import { asVersionHandle, type VersionHandle } from '../types/version.js';
import type { PolicyName, RubricalPolicy } from '../types/policy.js';

/**
 * Placeholder policy records: identity-only (`name`) objects used in Phase 2a.
 *
 * Each is a `RubricalPolicy` because that is the interface Phase 2a
 * exposes (see `types/policy.ts`). Phases 2c–2g will replace these with
 * concrete modules under `policy/<name>/index.ts` that implement rank
 * resolution, concurrence, rule-set building, and so on.
 */
const POLICIES: Readonly<Record<PolicyName, RubricalPolicy>> = {
  'tridentine-1570': { name: 'tridentine-1570' },
  'divino-afflatu': { name: 'divino-afflatu' },
  'reduced-1955': { name: 'reduced-1955' },
  'rubrics-1960': { name: 'rubrics-1960' },
  'monastic-tridentine': { name: 'monastic-tridentine' },
  'monastic-divino': { name: 'monastic-divino' },
  'monastic-1963': { name: 'monastic-1963' },
  'cistercian-1951': { name: 'cistercian-1951' },
  'cistercian-altovadense': { name: 'cistercian-altovadense' },
  'dominican-1962': { name: 'dominican-1962' }
};

/**
 * Bindings from {@link VersionHandle} to {@link RubricalPolicy}, covering
 * every Breviary row in `Tabulae/data.txt`.
 *
 * Missa-only handles (rows below the `# - missa still uses old names`
 * comment in `data.txt`) are intentionally absent: the rubrical engine
 * operates on the Roman Breviary pipeline, so a caller passing a
 * missa-only handle receives a fatal error from the resolver. When a
 * shortform missa handle has a canonical Breviary equivalent (e.g.
 * `"Rubrics 1960"` → `"Rubrics 1960 - 1960"`), the error message quotes
 * the equivalent via {@link MISSA_ALIAS_HINTS}.
 */
export const VERSION_POLICY: ReadonlyMap<VersionHandle, RubricalPolicy> = new Map<
  VersionHandle,
  RubricalPolicy
>([
  [asVersionHandle('Tridentine - 1570'), POLICIES['tridentine-1570']],
  [asVersionHandle('Tridentine - 1888'), POLICIES['tridentine-1570']],
  [asVersionHandle('Tridentine - 1906'), POLICIES['tridentine-1570']],
  [asVersionHandle('Divino Afflatu - 1939'), POLICIES['divino-afflatu']],
  [asVersionHandle('Divino Afflatu - 1954'), POLICIES['divino-afflatu']],
  [asVersionHandle('Reduced - 1955'), POLICIES['reduced-1955']],
  [asVersionHandle('Rubrics 1960 - 1960'), POLICIES['rubrics-1960']],
  [asVersionHandle('Rubrics 1960 - 2020 USA'), POLICIES['rubrics-1960']],
  [asVersionHandle('Monastic Tridentinum 1617'), POLICIES['monastic-tridentine']],
  [asVersionHandle('Monastic Divino 1930'), POLICIES['monastic-divino']],
  [asVersionHandle('Monastic - 1963'), POLICIES['monastic-1963']],
  [asVersionHandle('Monastic - 1963 - Barroux'), POLICIES['monastic-1963']],
  [asVersionHandle('Monastic Tridentinum Cisterciensis 1951'), POLICIES['cistercian-1951']],
  [
    asVersionHandle('Monastic Tridentinum Cisterciensis Altovadensis'),
    POLICIES['cistercian-altovadense']
  ],
  [asVersionHandle('Ordo Praedicatorum - 1962'), POLICIES['dominican-1962']]
]);

/**
 * Mapping from missa-only identifiers in `data.txt` to the canonical
 * Breviary handle they correspond to.
 *
 * `data.txt` contains several rows below the `# - missa still uses old
 * names` and `# - interim missa names` comments whose column values
 * duplicate a Breviary row's tables. Those rows are semantically distinct
 * identities in DO's architecture — the Perl code uses them to index Mass
 * lookups, not Breviary lookups — but they are a known source of user
 * confusion. When the resolver encounters one, it rejects it *with a
 * hint* pointing at the Breviary-side handle the caller likely wanted.
 *
 * This table is used only for error messages. Registry construction does
 * *not* canonicalize the handles; that would blur the missa/Breviary
 * distinction that upstream maintains deliberately.
 *
 * Rows without an obvious Breviary counterpart are tracked separately in
 * {@link MISSA_ONLY_HANDLES}; they get a generic "Mass-only" rejection
 * instead of a hint.
 */
export const MISSA_ALIAS_HINTS: ReadonlyMap<VersionHandle, VersionHandle> = new Map<
  VersionHandle,
  VersionHandle
>([
  [asVersionHandle('Tridentine 1570'), asVersionHandle('Tridentine - 1570')],
  [asVersionHandle('Tridentine 1910'), asVersionHandle('Tridentine - 1906')],
  [asVersionHandle('Tridentine - 1910'), asVersionHandle('Tridentine - 1906')],
  [asVersionHandle('Divino Afflatu'), asVersionHandle('Divino Afflatu - 1954')],
  [asVersionHandle('Reduced 1955'), asVersionHandle('Reduced - 1955')],
  [asVersionHandle('Rubrics 1960'), asVersionHandle('Rubrics 1960 - 1960')],
  [asVersionHandle('1960 Newcalendar'), asVersionHandle('Rubrics 1960 - 2020 USA')],
  [asVersionHandle('Rubrics 1960 Newcalendar'), asVersionHandle('Rubrics 1960 - 2020 USA')],
  [
    asVersionHandle('Ordo Praedicatorum Dominican 1962'),
    asVersionHandle('Ordo Praedicatorum - 1962')
  ]
]);

/**
 * Missa-only handles in `data.txt` that have no Breviary-side alias hint.
 *
 * These rows remain valid upstream identities, but they are outside the
 * Roman Breviary engine's supported input surface and should therefore
 * produce the generic "not supported" message instead of "No policy binding".
 */
export const MISSA_ONLY_HANDLES: ReadonlySet<VersionHandle> = new Set<VersionHandle>([
  asVersionHandle('1965-1967'),
  asVersionHandle('Mozarabic'),
  asVersionHandle('Sarum'),
  asVersionHandle('Ambrosian'),
  asVersionHandle('Dominican'),
  asVersionHandle('Rubrics 1967'),
  asVersionHandle('New Mass')
]);
