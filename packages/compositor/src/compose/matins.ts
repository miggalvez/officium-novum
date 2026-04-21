import { ensureTxtSuffix, type TextContent, type TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  HourDirective,
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
import { isWholeAntiphonSlot, markAntiphonFirstText } from '../emit/antiphon-marker.js';
import { emitSection } from '../emit/sections.js';
import { flattenConditionals } from '../flatten/evaluate-conditionals.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import {
  materializeInvitatoryContent,
  resolveInvitatoryAntiphonContent,
  resolveReference
} from '../resolve/reference-resolver.js';
import type {
  ComposeOptions,
  ComposeWarning,
  HeadingDescriptor,
  Section
} from '../types/composed-hour.js';

const MAX_DEFERRED_DEPTH = 8;

/**
 * Canonical path to the Te Deum hymn in the DO corpus. Used only when the
 * Matins plan says `teDeum: 'say'`.
 */
const TE_DEUM_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Te Deum'
};
const PATER_SECRETO_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Rubricae',
  section: 'Pater secreto'
};
const PATER_NOSTER_ET_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Pater noster Et'
};
const JUBE_DOMNE_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Jube domne'
};
const AMEN_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Amen'
};
const ABSOLUTIONES_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Benedictions.txt',
  section: 'Absolutiones'
};
const GLORIA_PATRI_MACRO: Extract<TextContent, { type: 'macroRef' }> = {
  type: 'macroRef',
  name: 'Gloria'
};
const INVITATORIUM_SKELETON_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Invitatorium',
  section: '__preamble'
};

export interface MatinsComposeContext {
  readonly corpus: TextIndex;
  readonly summary: DayOfficeSummary;
  readonly options: ComposeOptions;
  readonly directives: readonly HourDirective[];
  readonly context: ConditionEvalContext;
  /**
   * Optional compose-time warning sink — see Phase 3 §3f and
   * {@link ComposeWarning}. The generic `composeSlot` in `compose.ts`
   * passes this in; Matins reuses it for its plan-driven path.
   */
  readonly onWarning?: (warning: ComposeWarning) => void;
}

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
    const section = composeReferenceSlot('hymn', hymn.ref, args);
    if (section) sections.push(section);
  }

  const psalmody = hour.slots.psalmody;
  if (psalmody && psalmody.kind === 'matins-nocturns') {
    const totalNocturns = psalmody.nocturns.length;
    for (const nocturn of psalmody.nocturns) {
      sections.push(...composeNocturn(nocturn, totalNocturns, args));
    }
  }

  const teDeum = hour.slots['te-deum'];
  if (teDeum && teDeum.kind === 'te-deum') {
    if (teDeum.decision === 'say') {
      const section = composeReferenceSlot('te-deum', TE_DEUM_REF, args);
      if (section) sections.push(section);
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
      seen: new Set(),
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives('invitatory', flattened, {
      hour: 'matins',
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
): 'Invit2' | 'Invit3' | undefined {
  if (
    source.kind === 'season' &&
    source.reference.selector === 'Passio' &&
    args.context.season === 'passiontide' &&
    args.summary.celebration.source === 'temporal'
  ) {
    return 'Invit3';
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
  args: MatinsComposeContext
): readonly Section[] {
  const out: Section[] = [];
  out.push(headingSection({ kind: 'nocturn', ordinal: nocturn.index }));

  out.push(...composePsalmody(nocturn, args));

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
        : composeReferenceSlot('responsory', responsory.reference, args)
      : undefined;
    const benediction = nocturn.benedictions.find((b) => b.index === lesson.index);
    const benedictioSection = benediction
      ? composeReferenceSlot('benedictio', benediction.reference, args)
      : undefined;
    const jubeSection = benedictioSection ? composeOtherReferenceSection(JUBE_DOMNE_REF, args) : undefined;
    const amenSection = benedictioSection ? composeOtherReferenceSection(AMEN_REF, args) : undefined;

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
    if (responsorySection) out.push(responsorySection);
  }

  return out;
}

function composePsalmody(
  nocturn: NocturnPlan,
  args: MatinsComposeContext
): readonly Section[] {
  const out: Section[] = [];
  const refs: MatinsSlotRef[] = [];
  for (const [index, assignment] of nocturn.psalmody.entries()) {
    if (assignment.antiphonRef) {
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
      psalmIndex: index + 1,
      hasExplicitAntiphon: Boolean(assignment.antiphonRef)
    });
    if (assignment.antiphonRef) {
      refs.push({
        ref: assignment.antiphonRef,
        isAntiphon: true,
        repeatAntiphon: true,
        pairedPsalmRef: assignment.psalmRef
      });
    }
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

function composeLesson(lesson: LessonPlan, args: MatinsComposeContext): Section | undefined {
  const ref = lessonReference(lesson.source);
  if (!ref) return undefined;
  return composeReferenceSlot('lectio-brevis', ref, args);
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

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

interface MatinsSlotRef {
  readonly ref: TextReference;
  readonly isAntiphon: boolean;
  readonly openingAntiphon?: boolean;
  readonly repeatAntiphon?: boolean;
  readonly hasExplicitAntiphon?: boolean;
  readonly pairedAntiphonRef?: TextReference;
  readonly pairedPsalmRef?: TextReference;
  readonly psalmIndex?: number;
}

type OpeningAntiphonMode =
  | { readonly kind: 'full' }
  | { readonly kind: 'short'; readonly prefix: string }
  | { readonly kind: 'short-with-continuation'; readonly prefix: string };

function composeReferenceSlot(
  slot: Parameters<typeof emitSection>[0],
  ref: TextReference,
  args: MatinsComposeContext
): Section | undefined {
  return composeMergedSlot(
    slot,
    [{ ref, isAntiphon: isWholeAntiphonSlot(slot) }],
    args
  );
}

function composeMergedSlot(
  slot: Parameters<typeof emitSection>[0],
  refs: readonly MatinsSlotRef[],
  args: MatinsComposeContext
): Section | undefined {
  if (refs.length === 0) return undefined;
  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }

  for (const { ref, isAntiphon, openingAntiphon, psalmIndex, hasExplicitAntiphon, repeatAntiphon, pairedAntiphonRef, pairedPsalmRef } of refs) {
    const resolved = resolveReference(args.corpus, ref, {
      languages: args.options.languages,
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek,
      date: args.context.date,
      season: args.context.season,
      version: args.context.version,
      modernStyleMonthday: args.context.version.handle.includes('1960'),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    for (const lang of args.options.languages) {
      const bucket = perLanguage.get(lang);
      if (!bucket) continue;
      const section = resolved[lang];
      if (!section) continue;
      if (section.selectorMissing) {
        bucket.push({
          type: 'rubric',
          value: `(Section missing: ${ref.section})`
        });
        continue;
      }
      const sourceContent =
        slot === 'versicle'
          ? extendPsalterMatinsVersicleContent(section.content, ref, lang, args)
          : section.content;
      if (slot === 'psalmody' && isAntiphon && containsInlinePsalmRefs(sourceContent)) {
        const antiphonOnly = extractInlinePsalmAntiphons(sourceContent);
        const flattened = flattenConditionals(antiphonOnly, args.context);
        const transformed = applyDirectives(slot, flattened, {
          hour: 'matins',
          directives: args.directives
        });
        const normalized = repeatAntiphon
          ? normalizeRepeatedAntiphonContent(transformed)
          : openingAntiphon
            ? normalizeOpeningAntiphonContent(transformed, ref, pairedPsalmRef, lang, args)
            : transformed;
        appendContentWithBoundary(
          bucket,
          markAntiphonFirstText(normalized)
        );
        continue;
      }
      if (
        slot === 'psalmody' &&
        !isAntiphon &&
        psalmIndex !== undefined &&
        containsInlinePsalmRefs(sourceContent)
      ) {
        appendExpandedPsalmWrapper(bucket, sourceContent, {
          directives: args.directives,
          context: args.context,
          index: args.corpus,
          language: lang,
          langfb: args.options.langfb,
          maxDepth: MAX_DEFERRED_DEPTH,
          psalmIndex,
          suppressFirstInlineAntiphon: hasExplicitAntiphon === true,
          ...(args.onWarning ? { onWarning: args.onWarning } : {})
        });
        continue;
      }
      const expanded = expandDeferredNodes(
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? withPsalmGloriaPatri(sourceContent)
          : sourceContent,
        {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        season: args.context.season,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH,
        ...(args.onWarning ? { onWarning: args.onWarning } : {})
        }
      );
      const flattened = flattenConditionals(expanded, args.context);
      const transformed = applyDirectives(slot, flattened, {
        hour: 'matins',
        directives: args.directives
      });
      const lineSeparated =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? separatePsalmVerseLines(transformed)
          : transformed;
      const rangedPsalmBody =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? slicePsalmContentByVerseRange(
              lineSeparated,
              resolvePairedAntiphonRangeValue(pairedAntiphonRef, lang, args)
            )
          : lineSeparated;
      const normalizedPsalmBody =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? normalizeOpeningPsalmBodyContent(rangedPsalmBody, pairedAntiphonRef, ref, lang, args)
          : rangedPsalmBody;
      // Same `Ant.` marker synthesis as the generic composeSlot; see
      // `emit/antiphon-marker.ts`. For Matins this covers the invitatory,
      // the nocturn antiphons inside `psalmody`, and any unpaired
      // antiphons surfaced as standalone sections.
      const markered = isAntiphon
        ? markAntiphonFirstText(
            repeatAntiphon
              ? normalizeRepeatedAntiphonContent(lineSeparated)
              : openingAntiphon
                ? normalizeOpeningAntiphonContent(lineSeparated, ref, pairedPsalmRef, lang, args)
                : lineSeparated
          )
        : normalizedPsalmBody;
      if (slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined) {
        const heading = buildPsalmHeading(
          ref,
          normalizedPsalmBody,
          psalmIndex,
          pairedAntiphonRef,
          lang,
          args
        );
        if (heading) {
          appendContentWithBoundary(bucket, [
            { type: 'text', value: heading },
            { type: 'separator' }
          ]);
        }
      }
      appendContentWithBoundary(bucket, markered);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) frozen.set(lang, Object.freeze(nodes));
  }
  if (frozen.size === 0) return undefined;

  const primary = refs[0]!.ref;
  return emitSection(slot, frozen, referenceIdentity(primary));
}

function headingSection(heading: HeadingDescriptor): Section {
  return Object.freeze({
    type: 'heading' as const,
    slot: 'heading',
    reference: undefined,
    lines: Object.freeze([]),
    languages: Object.freeze([]),
    heading: Object.freeze(heading)
  });
}

function referenceIdentity(reference: TextReference): string {
  return `${reference.path}#${reference.section}${reference.selector ? `:${reference.selector}` : ''}`;
}

function buildPsalmHeading(
  ref: TextReference,
  expandedContent: readonly TextContent[],
  psalmIndex: number,
  pairedAntiphonRef: TextReference | undefined,
  language: string,
  args: MatinsComposeContext
): string | undefined {
  const selector = ref.selector?.trim();

  const pathMatch = ref.path.match(/\/Psalm(\d+)(?:\.txt)?$/u);
  const directPsalm = pathMatch?.[1];

  const contentPsalm = directPsalm ? undefined : extractPsalmNumberFromContent(expandedContent);
  const psalmNumber = directPsalm ?? contentPsalm;
  if (!psalmNumber) return undefined;

  const rangeSuffix =
    directPsalm && selector && /^\d+-\d+$/u.test(selector)
      ? `(${selector})`
      : resolvePairedAntiphonRange(pairedAntiphonRef, language, args);
  return `Psalmus ${psalmNumber}${rangeSuffix} [${psalmIndex}]`;
}

function containsInlinePsalmRefs(content: readonly TextContent[]): boolean {
  return content.some((node) => node.type === 'psalmRef');
}

function extractInlinePsalmAntiphons(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type === 'psalmRef') {
      const antiphon = sanitizeAntiphonText(node.antiphon);
      if (antiphon) {
        out.push({ type: 'text', value: antiphon });
      }
      continue;
    }
    out.push(node);
  }
  return out;
}

interface ExpandPsalmWrapperArgs {
  readonly directives: readonly HourDirective[];
  readonly context: ConditionEvalContext;
  readonly index: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly maxDepth: number;
  readonly psalmIndex: number;
  readonly suppressFirstInlineAntiphon: boolean;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

function appendExpandedPsalmWrapper(
  target: TextContent[],
  content: readonly TextContent[],
  args: ExpandPsalmWrapperArgs
): void {
  let localPsalmOffset = 0;
  const suppressFirstInlineAntiphon =
    args.suppressFirstInlineAntiphon || endsWithStandaloneAntiphon(target);
  for (const node of content) {
    if (node.type !== 'psalmRef') {
      continue;
    }
    const psalmNode =
      suppressFirstInlineAntiphon && localPsalmOffset === 0 && node.antiphon
        ? { ...node, antiphon: undefined }
        : node;
    const expanded = expandDeferredNodes(withPsalmGloriaPatri([psalmNode]), {
      index: args.index,
      language: args.language,
      langfb: args.langfb,
      season: args.context.season,
      seen: new Set(),
      maxDepth: args.maxDepth,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives('psalmody', flattened, {
      hour: 'matins',
      directives: args.directives
    });
    const [leadingAntiphon, psalmBody] = splitLeadingPsalmAntiphon(transformed);
    if (leadingAntiphon.length > 0) {
      appendContentWithBoundary(target, leadingAntiphon);
    }
    const heading = buildInlinePsalmHeading(node, transformed, args.psalmIndex + localPsalmOffset);
    if (heading) {
      appendContentWithBoundary(target, [
        { type: 'text', value: heading },
        { type: 'separator' }
      ]);
    }
    appendContentWithBoundary(target, psalmBody);
    const trailingAntiphon = sanitizeAntiphonText(node.antiphon);
    if (trailingAntiphon) {
      appendContentWithBoundary(target, [
        {
          type: 'verseMarker',
          marker: 'Ant.',
          text: normalizeRepeatedAntiphonText(trailingAntiphon)
        }
      ]);
    }
    localPsalmOffset += 1;
  }
}

function buildInlinePsalmHeading(
  node: Extract<TextContent, { type: 'psalmRef' }>,
  expandedContent: readonly TextContent[],
  psalmIndex: number
): string | undefined {
  const inlinePsalmNumber =
    Number.isFinite(node.psalmNumber) && node.psalmNumber > 0 ? String(node.psalmNumber) : undefined;
  const psalmNumber = inlinePsalmNumber ?? extractPsalmNumberFromContent(expandedContent);
  if (!psalmNumber) {
    return undefined;
  }
  const rangeSuffix = extractInlinePsalmRange(node.antiphon);
  return `Psalmus ${psalmNumber}${rangeSuffix ? `(${rangeSuffix})` : ''} [${psalmIndex}]`;
}

function splitLeadingPsalmAntiphon(
  content: readonly TextContent[]
): readonly [readonly TextContent[], readonly TextContent[]] {
  const first = content[0];
  if (first?.type === 'verseMarker' && first.marker === 'Ant.') {
    return [content.slice(0, 1), content.slice(1)];
  }
  return [[], content];
}

function endsWithStandaloneAntiphon(content: readonly TextContent[]): boolean {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const node = content[index];
    if (!node || node.type === 'separator') {
      continue;
    }
    return node.type === 'verseMarker' && node.marker === 'Ant.';
  }
  return false;
}

function extractPsalmNumberFromContent(
  content: readonly TextContent[]
): string | undefined {
  for (const node of content) {
    if (node.type !== 'text') continue;
    const match = node.value.match(/^\s*(\d+):\d+/u);
    if (match) return match[1];
  }
  return undefined;
}

function withPsalmGloriaPatri(content: readonly TextContent[]): readonly TextContent[] {
  return Object.freeze([...content, GLORIA_PATRI_MACRO]);
}

function normalizeRepeatedAntiphonContent(
  content: readonly TextContent[]
): readonly TextContent[] {
  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node) continue;
    if (node.type === 'text') {
      out[index] = {
        type: 'text',
        value: normalizeRepeatedAntiphonText(node.value)
      };
      break;
    }
    if (node.type === 'verseMarker') {
      out[index] = {
        type: 'verseMarker',
        marker: node.marker,
        text: normalizeRepeatedAntiphonText(node.text)
      };
      break;
    }
  }
  return out;
}

function normalizeRepeatedAntiphonText(text: string): string {
  return sanitizeAntiphonText(text)
    ?.replace(/\s*[*‡†]\s*/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim() ?? '';
}

function normalizeOpeningAntiphonContent(
  content: readonly TextContent[],
  antiphonRef: TextReference,
  pairedPsalmRef: TextReference | undefined,
  language: string,
  args: MatinsComposeContext
): readonly TextContent[] {
  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node || (node.type !== 'text' && node.type !== 'verseMarker')) {
      continue;
    }
    const sanitized = sanitizeAntiphonText(node.type === 'text' ? node.value : node.text);
    if (!sanitized) {
      break;
    }
    const normalized = normalizeOpeningAntiphonText(sanitized, antiphonRef, pairedPsalmRef, language, args);
    out[index] =
      node.type === 'text'
        ? { type: 'text', value: normalized }
        : { type: 'verseMarker', marker: node.marker, text: normalized };
    break;
  }
  return out;
}

function normalizeOpeningAntiphonText(
  text: string,
  antiphonRef: TextReference,
  pairedPsalmRef: TextReference | undefined,
  language: string,
  args: MatinsComposeContext
): string {
  const mode = determineOpeningAntiphonMode(text, antiphonRef, pairedPsalmRef, language, args);
  switch (mode.kind) {
    case 'full':
      return text;
    case 'short':
      return `${mode.prefix}.`;
    case 'short-with-continuation':
      return `${mode.prefix}. ‡`;
  }
}

function normalizeOpeningPsalmBodyContent(
  content: readonly TextContent[],
  pairedAntiphonRef: TextReference | undefined,
  psalmRef: TextReference,
  language: string,
  args: MatinsComposeContext
): readonly TextContent[] {
  if (!pairedAntiphonRef) {
    return content;
  }

  const openingText = resolveOpeningAntiphonSourceText(pairedAntiphonRef, language, args);
  if (!openingText) {
    return content;
  }

  const mode = determineOpeningAntiphonMode(openingText, pairedAntiphonRef, psalmRef, language, args);
  if (mode.kind !== 'short-with-continuation') {
    return content;
  }

  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node || node.type !== 'text' || !/^\s*\d+:\d+/u.test(node.value)) {
      continue;
    }
    out[index] = {
      type: 'text',
      value: insertFirstVerseContinuationMarker(node.value, mode.prefix)
    };
    break;
  }
  return out;
}

function determineOpeningAntiphonMode(
  text: string,
  antiphonRef: TextReference,
  pairedPsalmRef: TextReference | undefined,
  language: string,
  args: MatinsComposeContext
): OpeningAntiphonMode {
  if (args.context.version.handle.includes('1960') || !isPsalterMatinsAntiphonRef(antiphonRef)) {
    return { kind: 'full' };
  }

  const match = text.match(/^(.*?)(?:\s*[*‡†]\s*)(.+)$/u);
  if (!match) {
    return { kind: 'full' };
  }

  const prefix = match[1]?.replace(/[.,;:]+\s*$/u, '').trim();
  if (!prefix) {
    return { kind: 'full' };
  }

  const firstVerse = pairedPsalmRef
    ? resolveFirstPsalmVerseText(pairedPsalmRef, language, args)
    : undefined;
  const needsContinuationMarker =
    firstVerse !== undefined &&
    canonicalizePsalmComparisonText(firstVerse).startsWith(canonicalizePsalmComparisonText(prefix));

  return needsContinuationMarker
    ? { kind: 'short-with-continuation', prefix }
    : { kind: 'short', prefix };
}

function isPsalterMatinsAntiphonRef(ref: TextReference): boolean {
  return /\/Psalterium\/Psalmi\//u.test(ensureTxtSuffix(ref.path));
}

function resolveOpeningAntiphonSourceText(
  ref: TextReference,
  language: string,
  args: MatinsComposeContext
): string | undefined {
  const section = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!section || section.selectorMissing) {
    return undefined;
  }

  for (const node of section.content) {
    if (node.type === 'psalmRef') {
      return sanitizeAntiphonText(node.antiphon);
    }
    if (node.type === 'text') {
      return sanitizeAntiphonText(node.value);
    }
    if (node.type === 'verseMarker') {
      return sanitizeAntiphonText(node.text);
    }
  }

  return undefined;
}

function insertFirstVerseContinuationMarker(text: string, prefix: string): string {
  if (text.includes('‡')) {
    return text;
  }

  const match = text.match(
    new RegExp(`^(\\s*\\d+:\\d+\\s*)(${escapeRegExp(prefix)})([.,;:]?)(\\s+)(.+)$`, 'u')
  );
  if (!match) {
    return text;
  }

  const [, lead = '', matchedPrefix = '', punctuation = '', spacing = ' ', remainder = ''] = match;
  return `${lead}${matchedPrefix}${punctuation} ‡${spacing}${remainder}`;
}

function sanitizeAntiphonText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/\s*;;.*$/u, '').trim();
}

function extractInlinePsalmRange(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(/;;\s*\d+\(([^)]+)\)\s*$/u);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/['"]/gu, '').replace(/\s*-\s*/gu, '-').trim();
}

function extendPsalterMatinsVersicleContent(
  content: readonly TextContent[],
  ref: TextReference,
  language: string,
  args: MatinsComposeContext
): readonly TextContent[] {
  if (
    ref.path !== 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum' ||
    ref.section !== 'Day0' ||
    !ref.selector ||
    !/^\d+$/u.test(ref.selector)
  ) {
    return content;
  }

  const hasResponse = content.some(
    (node) => node.type === 'verseMarker' && (node.marker === 'R.' || node.marker === 'r.')
  );
  if (hasResponse) {
    return content;
  }

  const nextSelector = String(Number.parseInt(ref.selector, 10) + 1);
  const nextSection = resolveReference(args.corpus, { ...ref, selector: nextSelector }, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!nextSection || nextSection.selectorMissing) {
    return content;
  }

  const responseNodes = nextSection.content.filter(
    (node) => node.type === 'verseMarker' && (node.marker === 'R.' || node.marker === 'r.')
  );
  return responseNodes.length > 0 ? Object.freeze([...content, ...responseNodes]) : content;
}

function slicePsalmContentByVerseRange(
  content: readonly TextContent[],
  range: string
): readonly TextContent[] {
  const match = /^(\d+)-(\d+)$/u.exec(range);
  if (!match?.[1] || !match[2]) {
    return content;
  }

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return content;
  }

  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type !== 'text') {
      out.push(node);
      continue;
    }

    const verseMatch = /^\s*\d+:(\d+)/u.exec(node.value);
    if (!verseMatch?.[1]) {
      out.push(node);
      continue;
    }

    const verse = Number.parseInt(verseMatch[1], 10);
    if (verse >= start && verse <= end) {
      out.push(node);
    }
  }

  return out;
}

function resolvePairedAntiphonRange(
  ref: TextReference | undefined,
  language: string,
  args: MatinsComposeContext
): string {
  const range = resolvePairedAntiphonRangeValue(ref, language, args);
  return range ? `(${range})` : '';
}

function resolvePairedAntiphonRangeValue(
  ref: TextReference | undefined,
  language: string,
  args: MatinsComposeContext
): string {
  if (!ref) {
    return '';
  }

  const section = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!section || section.selectorMissing) {
    return '';
  }

  for (const node of section.content) {
    if (node.type === 'psalmRef') {
      const range = extractInlinePsalmRange(node.antiphon);
      if (range) {
        return range;
      }
    }
    if (node.type === 'text') {
      const range = extractInlinePsalmRange(node.value);
      if (range) {
        return range;
      }
    }
  }

  return '';
}

function resolveFirstPsalmVerseText(
  ref: TextReference,
  language: string,
  args: MatinsComposeContext
): string | undefined {
  const section = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!section || section.selectorMissing) {
    return undefined;
  }

  const expanded = expandDeferredNodes(withPsalmGloriaPatri(section.content), {
    index: args.corpus,
    language,
    langfb: args.options.langfb,
    season: args.context.season,
    seen: new Set(),
    maxDepth: MAX_DEFERRED_DEPTH,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const flattened = flattenConditionals(expanded, args.context);
  const transformed = applyDirectives('psalmody', flattened, {
    hour: 'matins',
    directives: args.directives
  });

  for (const node of transformed) {
    if (node.type === 'text' && /^\s*\d+:\d+/u.test(node.value)) {
      return node.value;
    }
  }

  return undefined;
}

function canonicalizePsalmComparisonText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^\s*\d+:\d+\s*/u, '')
    .replace(/[.,;:!?*‡†]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function composePreLessonTransition(
  nocturn: NocturnPlan,
  totalNocturns: number,
  args: MatinsComposeContext
): readonly Section[] {
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

function separatePsalmVerseLines(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (startsPsalmVerse(node) && out.length > 0 && out[out.length - 1]?.type !== 'separator') {
      out.push({ type: 'separator' });
    }
    out.push(node);
  }
  return out;
}

function startsPsalmVerse(node: TextContent): boolean {
  if (node.type === 'text') {
    return /^\s*\d+:\d+/u.test(node.value);
  }
  if (node.type === 'verseMarker') {
    return true;
  }
  return false;
}

function appendContentWithBoundary(
  target: TextContent[],
  next: readonly TextContent[]
): void {
  if (next.length === 0) {
    return;
  }

  const last = target.at(-1);
  const first = next[0];
  if (last && first && isInlineBoundaryNode(last) && isInlineBoundaryNode(first)) {
    target.push({ type: 'separator' });
  }

  target.push(...next);
}

function isInlineBoundaryNode(node: TextContent): boolean {
  switch (node.type) {
    case 'text':
    case 'citation':
    case 'psalmRef':
    case 'macroRef':
    case 'formulaRef':
    case 'psalmInclude':
    case 'reference':
      return true;
    case 'verseMarker':
    case 'rubric':
    case 'separator':
    case 'heading':
    case 'conditional':
    case 'gabcNotation':
      return false;
  }
}
