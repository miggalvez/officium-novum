import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadCorpus,
  parseKalendarium,
  parseScriptureTransfer,
  parseTransfer,
  parseVersionRegistry
} from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine,
  type LessonSource,
  type SlotContent
} from '../../src/index.js';

interface MatinsFixtureShape {
  readonly nocturns: number;
  readonly totalLessons: number;
  readonly teDeum: 'say' | 'replace-with-responsory' | 'omit';
  readonly hymnKind: 'feast' | 'ordinary' | 'suppressed';
  readonly invitatoriumKind: 'feast' | 'season' | 'suppressed';
  readonly nocturnLessonSourceKinds: readonly (readonly string[])[];
  readonly structuralSignature?: {
    readonly invitatoryRef: string;
    readonly hymnRef: string | null;
    readonly nocturnVersicleRefs: readonly string[];
    readonly nocturnResponsoryCounts: readonly number[];
    readonly teDeumReplacementResponsory: readonly boolean[];
  };
}

interface FixtureDate {
  readonly date: string;
  readonly matins: MatinsFixtureShape;
  readonly firstLessonPath?: string;
  readonly firstAntiphonPath?: string;
  readonly expectTransferOp?: 'R' | 'B' | 'A';
  readonly expectMatinsRuleLessonCount?: 3 | 9 | 12;
  readonly assertNoCommemorationSlots?: boolean;
}

interface FixturePayload {
  readonly version: string;
  readonly dates: readonly FixtureDate[];
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const FIXTURE_PATH = resolve(TEST_DIR, '../fixtures/matins-1960-2024.json');
const HAS_FIXTURE = existsSync(FIXTURE_PATH);
const describeIfReady = HAS_UPSTREAM && HAS_FIXTURE ? describe : describe.skip;

describeIfReady('Phase 2g-β Matins structuring against upstream 1960 corpus', () => {
  it('matches Matins shape fixture and scripture-transfer behavior', async () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixturePayload;
    const corpus = await loadCorpus(UPSTREAM_ROOT, {
      resolveReferences: false
    });
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: corpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle(fixture.version),
      policyMap: VERSION_POLICY
    });

    for (const row of fixture.dates) {
      const summary = engine.resolveDayOfficeSummary(row.date);
      const matins = summary.hours.matins;
      expect(matins?.hour).toBe('matins');

      const invitatory = matins?.slots.invitatory;
      expect(invitatory?.kind).toBe('matins-invitatorium');

      const psalmody = matins?.slots.psalmody;
      expect(psalmody?.kind).toBe('matins-nocturns');

      const teDeum = matins?.slots['te-deum'];
      expect(teDeum?.kind).toBe('te-deum');

      if (
        !matins ||
        invitatory?.kind !== 'matins-invitatorium' ||
        psalmody?.kind !== 'matins-nocturns' ||
        teDeum?.kind !== 'te-deum'
      ) {
        continue;
      }

      const derivedShape: MatinsFixtureShape = {
        nocturns: psalmody.nocturns.length,
        totalLessons: psalmody.nocturns.reduce(
          (count, nocturn) => count + nocturn.lessons.length,
          0
        ),
        teDeum: teDeum.decision,
        hymnKind: deriveHymnKind(matins.slots.hymn),
        invitatoriumKind: invitatory.source.kind,
        nocturnLessonSourceKinds: psalmody.nocturns.map((nocturn) =>
          nocturn.lessons.map((lesson) => lesson.source.kind)
        ),
        ...(row.matins.structuralSignature
          ? { structuralSignature: deriveStructuralSignature(invitatory.source, matins.slots.hymn, psalmody.nocturns) }
          : {})
      };

      expect(derivedShape, row.date).toEqual(row.matins);
      for (const nocturn of psalmody.nocturns) {
        expect(nocturn.antiphons.length).toBe(nocturn.psalmody.length);
        if (psalmody.nocturns.length > 1) {
          expect(nocturn.antiphons.length).toBe(nocturn.lessons.length);
        } else {
          expect(nocturn.antiphons.length).toBeGreaterThanOrEqual(
            nocturn.lessons.length
          );
        }
        expect(nocturn.psalmody.length).toBeGreaterThan(0);
      }

      if (row.firstLessonPath) {
        const firstSource = psalmody.nocturns[0]?.lessons[0]?.source;
        expect(firstSource).toBeDefined();
        if (firstSource) {
          expect(sourcePrimaryPath(firstSource)).toBe(row.firstLessonPath);
        }
      }

      if (row.firstAntiphonPath) {
        const firstAntiphon = psalmody.nocturns[0]?.antiphons[0];
        expect(firstAntiphon?.reference.path).toBe(row.firstAntiphonPath);
      }

      if (row.expectTransferOp) {
        const firstSource = psalmody.nocturns[0]?.lessons[0]?.source;
        expect(firstSource?.kind).toBe('scripture-transferred');
        if (firstSource?.kind === 'scripture-transferred') {
          expect(firstSource.op).toBe(row.expectTransferOp);
        }
      }

      if (row.expectMatinsRuleLessonCount !== undefined) {
        expect(summary.celebrationRules.matins.lessonCount).toBe(
          row.expectMatinsRuleLessonCount
        );
      }

      if (row.assertNoCommemorationSlots) {
        expect(matins.slots['commemoration-antiphons']).toBeUndefined();
        expect(matins.slots['commemoration-versicles']).toBeUndefined();
        expect(matins.slots['commemoration-orations']).toBeUndefined();
      }
    }
  }, 240_000);
});

function deriveHymnKind(slot: SlotContent | undefined): MatinsFixtureShape['hymnKind'] {
  if (!slot || slot.kind === 'empty') {
    return 'suppressed';
  }

  if (slot.kind === 'single-ref') {
    return slot.ref.path.startsWith('horas/Ordinarium/') ||
      slot.ref.path === 'horas/Latin/Psalterium/Special/Matutinum Special'
      ? 'ordinary'
      : 'feast';
  }

  return 'suppressed';
}

function deriveStructuralSignature(
  invitatory: { readonly kind: string; readonly reference?: { readonly path: string; readonly section: string; readonly selector?: string } },
  hymn: SlotContent | undefined,
  nocturns: readonly {
    readonly versicle: { readonly reference: { readonly path: string; readonly section: string; readonly selector?: string } };
    readonly responsories: readonly {
      readonly reference: { readonly path: string; readonly section: string; readonly selector?: string };
      readonly replacesTeDeum?: boolean;
    }[];
  }[]
): NonNullable<MatinsFixtureShape['structuralSignature']> {
  return {
    invitatoryRef:
      invitatory.kind === 'suppressed' || !invitatory.reference
        ? 'suppressed'
        : referenceKey(invitatory.reference),
    hymnRef:
      hymn?.kind === 'single-ref'
        ? referenceKey(hymn.ref)
        : null,
    nocturnVersicleRefs: nocturns.map((nocturn) => referenceKey(nocturn.versicle.reference)),
    nocturnResponsoryCounts: nocturns.map((nocturn) => nocturn.responsories.length),
    teDeumReplacementResponsory: nocturns.map((nocturn) =>
      nocturn.responsories.some((responsory) => responsory.replacesTeDeum === true)
    )
  };
}

function referenceKey(ref: { readonly path: string; readonly section: string; readonly selector?: string }): string {
  return `${ref.path}:${ref.section}${ref.selector ? `:${ref.selector}` : ''}`;
}

function sourcePrimaryPath(source: LessonSource): string {
  switch (source.kind) {
    case 'scripture':
    case 'scripture-transferred':
      return source.pericope.reference.path;
    case 'patristic':
    case 'hagiographic':
      return source.reference.path;
    case 'commemorated':
      return source.feast.path;
    case 'homily-on-gospel':
      return source.gospel.reference.path;
  }
}

function loadKalendaria() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Kalendaria');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name: name.slice(0, -4),
      entries: parseKalendarium(readFileSync(resolve(dir, name), 'utf8'))
    }));
}

function loadTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Transfer');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      yearKey: name.slice(0, -4),
      entries: parseTransfer(readFileSync(resolve(dir, name), 'utf8'))
    }));
}

function loadScriptureTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Stransfer');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      yearKey: name.slice(0, -4),
      entries: parseScriptureTransfer(readFileSync(resolve(dir, name), 'utf8'))
    }));
}
