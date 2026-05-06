import { ensureTxtSuffix, type TextContent } from '@officium-novum/parser';
import type {
  HourStructure,
  InvitatoriumSource,
  LessonPlan,
  LessonSource,
  NocturnPlan,
  PsalmAssignment,
  TextReference
} from '@officium-novum/rubrical-engine';
import { conditionMatches } from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../directives/apply-directives.js';
import { resolveHymnDoxologyByLanguage } from './major-hour-hymn.js';
import { emitSection } from '../emit/sections.js';
import { flattenConditionals } from '../flatten/evaluate-conditionals.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import {
  materializeInvitatoryContent,
  type InvitatoryMaterializationMode,
  resolveInvitatoryAntiphonContent,
  resolveReference
} from '../resolve/reference-resolver.js';
import type { Section } from '../types/composed-hour.js';
import {
  composeMergedSlot,
  composeReferenceSlot,
  type MatinsSlotRef
} from './matins-merged-slot.js';
import {
  headingSection,
  markSectionFirstLine,
  prependSeparatorLine,
  prependTeDeumHeading
} from './matins-section-helpers.js';
import { referenceIdentity, type MatinsComposeContext } from './matins-shared.js';
import {
  normalizeOpeningAntiphonContent,
  normalizeRepeatedAntiphonContent
} from './matins-psalmody.js';
import { MAX_DEFERRED_DEPTH } from './shared.js';

/**
 * Canonical path to the Te Deum hymn in the DO corpus. Used only when the
 * Matins plan says `teDeum: 'say'`.
 */
const TE_DEUM_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Te Deum'
};
const MATINS_LAUDS_SEPARATION_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Rubricae',
  section: 'Matutinum'
};
const PATER_SECRETO_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Rubricae',
  section: 'Pater secreto'
};
const PATER_TOTUM_SECRETO_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Pater totum secreto'
};
const PATER_NOSTER_ET_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Pater noster Et'
};
const JUBE_DOMNE_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Jube domne'
};
const TU_AUTEM_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Tu autem'
};
const AMEN_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Amen'
};
const ABSOLUTIONES_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Benedictions.txt',
  section: 'Absolutiones'
};
const INVITATORIUM_SKELETON_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Invitatorium',
  section: '__preamble'
};

/**
 * Compose the Matins-specific slots — invitatorium, nocturns, Te Deum —
 * that Phase 2 emits as plan-shaped {@link SlotContent} variants rather
 * than plain {@link TextReference} lists. The non-Matins slots continue
 * to flow through the generic `composeSlot` pipeline.
 *
 * The returned sections are in liturgical order:
 *   Invitatory → (per Nocturn: heading, antiphons/psalmody, versicle,
 *                 per Lesson: Benedictio, Lectio, Responsory) → Te Deum.
 *
 * Commemorations, final oration, and conclusion wrappers remain the
 * responsibility of the caller.
 */
export function composeMatinsSections(
  hour: HourStructure,
  args: MatinsComposeContext
): readonly Section[] {
  const sections: Section[] = [];

  const invitatory = hour.slots.invitatory;
  if (invitatory && invitatory.kind === 'matins-invitatorium') {
    const section = composeInvitatorium(invitatory.source, args);
    if (section) sections.push(section);
  }

  const hymn = hour.slots.hymn;
  if (hymn && hymn.kind === 'single-ref') {
    const hymnDoxology = resolveHymnDoxologyByLanguage({
      slot: 'hymn',
      hour: 'matins',
      summary: args.summary,
      directives: args.directives,
      structure: hour,
      corpus: args.corpus,
      options: args.options,
      context: args.context,
      ...(hour.slots['doxology-variant'] ? { hymnDoxology: hour.slots['doxology-variant'] } : {}),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const section = composeReferenceSlot('hymn', hymn.ref, args, hymnDoxology);
    if (section) sections.push(section);
  }

  const psalmody = hour.slots.psalmody;
  if (psalmody && psalmody.kind === 'matins-nocturns') {
    const totalNocturns = psalmody.nocturns.length;
    let psalmOffset = 0;
    for (const nocturn of psalmody.nocturns) {
      sections.push(...composeNocturn(nocturn, totalNocturns, psalmOffset, args));
      psalmOffset += nocturn.psalmody.length;
    }
  }

  const teDeum = hour.slots['te-deum'];
  if (teDeum && teDeum.kind === 'te-deum') {
    if (teDeum.decision === 'say') {
      const section = prependTeDeumHeading(composeReferenceSlot('te-deum', TE_DEUM_REF, args), args.options.languages);
      if (section) sections.push(section);
      const matinsRubric = composeReferenceSlot('de-officio-capituli', MATINS_LAUDS_SEPARATION_REF, args);
      if (matinsRubric) sections.push(matinsRubric);
    } else if (teDeum.decision === 'replace-with-responsory' && psalmody && psalmody.kind === 'matins-nocturns') {
      // Per Phase 3 plan §3d and Perl `specmatins.pl`: when the policy
      // resolves `teDeum: 'replace-with-responsory'` the 9th / last
      // responsory (flagged with `replacesTeDeum: true` in matins-plan.ts)
      // is emitted in lieu of the Te Deum hymn under a `'te-deum'` slot so
      // downstream renderers know it is the wrap-up.
      const replacementRef = findTeDeumReplacement(psalmody.nocturns);
      if (replacementRef) {
        const section = composeReferenceSlot('te-deum', replacementRef, args);
        if (section) sections.push(section);
        const matinsRubric = composeReferenceSlot('de-officio-capituli', MATINS_LAUDS_SEPARATION_REF, args);
        if (matinsRubric) sections.push(matinsRubric);
      }
    }
    // `decision === 'omit'` emits nothing, per RI §196 (Sacred Triduum) and
    // other suppressing contexts; the `if` arms above are the only ones
    // that emit.
  }

  return sections;
}

function findTeDeumReplacement(
  nocturns: readonly NocturnPlan[]
): TextReference | undefined {
  for (const nocturn of nocturns) {
    for (const responsory of nocturn.responsories) {
      if (responsory.replacesTeDeum) {
        return responsory.reference;
      }
    }
  }
  return undefined;
}

function composeInvitatorium(
  source: InvitatoriumSource,
  args: MatinsComposeContext
): Section | undefined {
  if (source.kind === 'suppressed') return undefined;

  const perLanguage = new Map<string, readonly TextContent[]>();
  for (const language of args.options.languages) {
    const content = resolveInvitatoriumContent(source, args, language);
    if (!content) {
      continue;
    }
    const expanded = expandDeferredNodes(content, {
      index: args.corpus,
      language,
      langfb: args.options.langfb,
      season: args.context.season,
      conditionContext: args.context,
      seen: new Set(),
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives('invitatory', flattened, {
      hour: 'matins',
      language,
      directives: args.directives
    });
    if (transformed.length > 0) {
      perLanguage.set(language, Object.freeze([...transformed]));
    }
  }

  if (perLanguage.size === 0) {
    return undefined;
  }

  return emitSection('invitatory', perLanguage, referenceIdentity(source.reference));
}

function resolveInvitatoriumContent(
  source: Exclude<InvitatoriumSource, { readonly kind: 'suppressed' }>,
  args: MatinsComposeContext,
  language: string
): readonly TextContent[] | undefined {
  const skeleton = resolveReference(args.corpus, INVITATORIUM_SKELETON_REF, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!skeleton) {
    return undefined;
  }

  const antiphon = resolveInvitatoriumAntiphon(source, args, language);
  if (!antiphon) {
    return undefined;
  }

  return materializeInvitatoryContent(
    skeleton.content,
    antiphon,
    detectInvitatoryMaterializationMode(args, source)
  );
}

function resolveInvitatoriumAntiphon(
  source: Exclude<InvitatoriumSource, { readonly kind: 'suppressed' }>,
  args: MatinsComposeContext,
  language: string
): readonly TextContent[] | undefined {
  if (source.kind === 'season' && source.reference.selector) {
    return resolveInvitatoryAntiphonContent(
      args.corpus,
      language,
      args.options.langfb,
      source.reference.selector,
      args.context.dayOfWeek ?? 0,
      {
        date: args.context.date,
        modernStyleMonthday: args.context.version.handle.includes('1960')
      }
    );
  }

  const resolved = resolveReference(args.corpus, source.reference, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!resolved) {
    return undefined;
  }
  if (resolved.selectorMissing) {
    return [
      {
        type: 'rubric',
        value: `(Section missing: ${source.reference.section})`
      }
    ];
  }
  return resolved.content;
}

function detectInvitatoryMaterializationMode(
  args: MatinsComposeContext,
  source: Exclude<InvitatoriumSource, { readonly kind: 'suppressed' }>
): InvitatoryMaterializationMode | undefined {
  if (
    source.kind === 'season' &&
    source.reference.selector === 'Passio' &&
    args.context.season === 'passiontide' &&
    args.summary.celebration.source === 'temporal'
  ) {
    return 'Invit3';
  }

  if (
    source.kind === 'season' &&
    args.context.dayOfWeek === 1 &&
    source.reference.selector &&
    ['Epiphania', 'Septuagesima', 'PostPentecosten'].includes(source.reference.selector)
  ) {
    return 'Invit4';
  }

  if (source.kind !== 'feast') {
    return undefined;
  }

  const ruleSection = args.corpus.getSection(ensureTxtSuffix(source.reference.path), 'Rule');
  if (!ruleSection?.rules) {
    return undefined;
  }

  return ruleSection.rules.some((rule) => /^Invit2$/iu.test(rule.raw)) ? 'Invit2' : undefined;
}

function composeNocturn(
  nocturn: NocturnPlan,
  totalNocturns: number,
  psalmOffset: number,
  args: MatinsComposeContext
): readonly Section[] {
  const out: Section[] = [];
  out.push(headingSection({ kind: 'nocturn', ordinal: nocturn.index }));

  out.push(...composePsalmody(nocturn, psalmOffset, args));

  const versicleSection = composeReferenceSlot(
    'versicle',
    nocturn.versicle.reference,
    args
  );
  if (versicleSection) out.push(versicleSection);

  if (nocturn.lessons.length > 0) {
    out.push(...composePreLessonTransition(nocturn, totalNocturns, args));
  }

  for (const lesson of nocturn.lessons) {
    if (lesson.gateCondition && !conditionMatches(lesson.gateCondition, args.context)) {
      continue;
    }
    const lessonSection = composeLesson(lesson, args);
    const responsory = nocturn.responsories.find((r) => r.index === lesson.index);
    const responsorySection = responsory
      ? responsory.replacesTeDeum
        ? undefined
        : prependSeparatorLine(
            composeReferenceSlot('responsory', responsory.reference, args, undefined, {
              appendGloria: responsory.appendGloria === true,
              suppressEmbeddedGloria: responsory.suppressEmbeddedGloria === true
            }),
            args.options.languages
          )
      : undefined;
    const benediction = nocturn.benedictions.find((b) => b.index === lesson.index);
    const benedictioSection = benediction
      ? markSectionFirstLine(
          composeReferenceSlot('benedictio', benediction.reference, args),
          'Benedictio.',
          args.options.languages
        )
      : undefined;
    const jubeSection = benedictioSection ? composeOtherReferenceSection(JUBE_DOMNE_REF, args) : undefined;
    const amenSection = benedictioSection ? composeOtherReferenceSection(AMEN_REF, args) : undefined;
    const tuAutemSection = lessonSection ? composeOtherReferenceSection(TU_AUTEM_REF, args) : undefined;

    // Only emit a heading when at least one downstream section resolves;
    // otherwise the client would see an orphan "Lectio N" label with no text.
    const hasLessonBlock =
      lessonSection || responsorySection || benedictioSection || jubeSection || amenSection;
    // Per Phase 3 plan §3d and ADR-011: Benedictio is emitted before the
    // Lectio it governs, mirroring Perl's `specmatins.pl:lectiones` sequence
    // (`Jube domne` → `Benedictio. <line>` → `Lectio N`). The benediction
    // entry is picked by `policy.selectBenedictions` during plan build.
    // A responsory flagged with `replacesTeDeum` is intentionally omitted
    // here and emitted once under the dedicated `te-deum` slot by
    // `composeMatinsSections`.
    if (jubeSection) out.push(jubeSection);
    if (benedictioSection) out.push(benedictioSection);
    if (amenSection) out.push(amenSection);
    if (hasLessonBlock) {
      out.push(headingSection({ kind: 'lesson', ordinal: lesson.index }));
    }
    if (lessonSection) out.push(lessonSection);
    if (tuAutemSection) out.push(tuAutemSection);
    if (responsorySection) out.push(responsorySection);
  }

  return out;
}

function composePsalmody(
  nocturn: NocturnPlan,
  psalmOffset: number,
  args: MatinsComposeContext
): readonly Section[] {
  const out: Section[] = [];
  const refs: MatinsSlotRef[] = [];
  let groupedAntiphonRef: TextReference | undefined;
  let activeNonGroupedAntiphonRef: TextReference | undefined;
  for (const [index, assignment] of nocturn.psalmody.entries()) {
    const startsGroupedAntiphon =
      assignment.antiphonRef && usesGroupedMatinsAntiphon(assignment.antiphonRef);
    if (assignment.antiphonRef) {
      if (startsGroupedAntiphon) {
        groupedAntiphonRef ??= assignment.antiphonRef;
      } else {
        activeNonGroupedAntiphonRef = assignment.antiphonRef;
      }
      refs.push({
        ref: assignment.antiphonRef,
        isAntiphon: true,
        openingAntiphon: true,
        pairedPsalmRef: assignment.psalmRef
      });
    }
    refs.push({
      ref: assignment.psalmRef,
      isAntiphon: false,
      pairedAntiphonRef: assignment.antiphonRef,
      psalmIndex: psalmOffset + index + 1,
      hasExplicitAntiphon: Boolean(assignment.antiphonRef)
    });
    const nextAssignment = nocturn.psalmody[index + 1];
    if (
      activeNonGroupedAntiphonRef &&
      (!nextAssignment || Boolean(nextAssignment.antiphonRef))
    ) {
      refs.push({
        ref: activeNonGroupedAntiphonRef,
        isAntiphon: true,
        repeatAntiphon: true,
        pairedPsalmRef: assignment.psalmRef
      });
      activeNonGroupedAntiphonRef = undefined;
    }
  }
  const closingPsalmRef = nocturn.psalmody.at(-1)?.psalmRef;
  if (groupedAntiphonRef && closingPsalmRef) {
    refs.push({
      ref: groupedAntiphonRef,
      isAntiphon: true,
      repeatAntiphon: true,
      pairedPsalmRef: closingPsalmRef
    });
  }
  const psalmodySection = composeMergedSlot('psalmody', refs, args);
  if (psalmodySection) out.push(psalmodySection);
  // Antiphons that are not paired with a psalm via PsalmAssignment still get
  // surfaced so the client can render them as standalone section blocks.
  const unpaired = nocturn.antiphons.filter(
    (ant) =>
      !nocturn.psalmody.some(
        (p: PsalmAssignment) =>
          p.antiphonRef && referenceIdentity(p.antiphonRef) === referenceIdentity(ant.reference)
      )
  );
  for (const ant of unpaired) {
    const section = composeReferenceSlot('antiphon-ad-benedictus', ant.reference, args);
    if (section) out.push(section);
  }
  return out;
}

function usesGroupedMatinsAntiphon(ref: TextReference): boolean {
  return (
    ref.section === 'Pasch0' ||
    (ref.path.endsWith('/Psalterium/Psalmi/Psalmi matutinum') &&
      ref.section === 'Paschm0' &&
      ref.selector === '17')
  );
}

function composeLesson(lesson: LessonPlan, args: MatinsComposeContext): Section | undefined {
  const ref = lessonReference(lesson.source);
  if (!ref) return undefined;
  if (shouldCombineSecondAndThirdScriptureLessons(lesson, args)) {
    return composeMergedSlot(
      'lectio-brevis',
      [
        { ref, isAntiphon: false },
        { ref: { ...ref, section: 'Lectio3' }, isAntiphon: false }
      ],
      args
    );
  }
  return composeReferenceSlot('lectio-brevis', ref, args);
}

function shouldCombineSecondAndThirdScriptureLessons(
  lesson: LessonPlan,
  args: MatinsComposeContext
): boolean {
  return (
    lesson.index === 2 &&
    (lesson.source.kind === 'scripture' || lesson.source.kind === 'scripture-transferred') &&
    args.directives.includes('matins-merge-second-third-scripture-lessons')
  );
}

function lessonReference(source: LessonSource): TextReference | undefined {
  switch (source.kind) {
    case 'scripture':
    case 'scripture-transferred':
      return source.pericope.reference;
    case 'patristic':
    case 'hagiographic':
      return source.reference;
    case 'homily-on-gospel':
      return source.gospel.reference;
    case 'commemorated':
      // Commemorated lessons (e.g., the 9th lectio on a commemorated feast
      // day) are read from the commemorated feast's own `[LectioN]` section.
      // `FeastReference.path` is corpus-relative without the `horas/Latin/`
      // root, matching the shape used elsewhere in the engine
      // (see `matins-plan.ts` line 316).
      return {
        path: `horas/Latin/${source.feast.path}`,
        section: `Lectio${source.lessonIndex}`
      };
  }
}

function composePreLessonTransition(
  nocturn: NocturnPlan,
  totalNocturns: number,
  args: MatinsComposeContext
): readonly Section[] {
  if (nocturn.lessonIntroduction === 'pater-totum-secreto') {
    const section = composeOtherReferenceSection(PATER_TOTUM_SECRETO_REF, args);
    return section ? [section] : [];
  }

  const out: Section[] = [];

  const secretoSection = composeOtherReferenceSection(PATER_SECRETO_REF, args);
  if (secretoSection) out.push(secretoSection);

  const paterSection = composeOtherReferenceSection(PATER_NOSTER_ET_REF, args);
  if (paterSection) out.push(paterSection);

  const absolutioSection = composeAbsolutioSection(nocturn, totalNocturns, args);
  if (absolutioSection) out.push(absolutioSection);

  const amenSection = composeOtherReferenceSection(AMEN_REF, args);
  if (amenSection) out.push(amenSection);

  return out;
}

function composeAbsolutioSection(
  nocturn: NocturnPlan,
  totalNocturns: number,
  args: MatinsComposeContext
): Section | undefined {
  const selector = String(totalNocturns === 1 ? dayOfWeekToNocturnIndex(args.context.dayOfWeek) : nocturn.index);
  const section = composeMergedSlot(
    'incipit',
    [{ ref: { ...ABSOLUTIONES_REF, selector }, isAntiphon: false }],
    args
  );
  if (!section || section.lines.length === 0) {
    return undefined;
  }

  const [first, ...rest] = section.lines;
  return asOtherSection(
    Object.freeze({
      ...section,
      lines: Object.freeze([
        Object.freeze({
          marker: 'Absolutio.',
          markers: Object.freeze({
            Latin: 'Absolutio.',
            English: 'Absolution.'
          }),
          texts: first!.texts
        }),
        ...rest
      ])
    }),
    'matins-absolutio'
  );
}

function composeOtherReferenceSection(
  ref: TextReference,
  args: MatinsComposeContext,
  reference = referenceIdentity(ref)
): Section | undefined {
  const section = composeMergedSlot(
    'incipit',
    [{ ref, isAntiphon: false }],
    args
  );
  return section ? asOtherSection(section, reference) : undefined;
}

function asOtherSection(section: Section, reference: string): Section {
  return Object.freeze({
    ...section,
    type: 'other' as const,
    slot: 'other',
    reference
  });
}

function dayOfWeekToNocturnIndex(dayOfWeek: number): 1 | 2 | 3 {
  if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 4) {
    return 1;
  }
  if (dayOfWeek === 2 || dayOfWeek === 5) {
    return 2;
  }
  return 3;
}
