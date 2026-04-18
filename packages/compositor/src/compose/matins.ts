import type { TextContent, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
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
import { emitSection } from '../emit/sections.js';
import { flattenConditionals } from '../flatten/evaluate-conditionals.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import { resolveReference } from '../resolve/reference-resolver.js';
import type { ComposeOptions, HeadingDescriptor, Section } from '../types/composed-hour.js';

const MAX_DEFERRED_DEPTH = 8;

/**
 * Canonical path to the Te Deum hymn in the DO corpus. Used only when the
 * Matins plan says `teDeum: 'say'`.
 */
const TE_DEUM_REF: TextReference = {
  path: 'horas/Latin/Psalterium/Common/Prayers',
  section: 'Te Deum'
};

export interface MatinsComposeContext {
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly directives: readonly HourDirective[];
  readonly context: ConditionEvalContext;
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
    for (const nocturn of psalmody.nocturns) {
      sections.push(...composeNocturn(nocturn, args));
    }
  }

  const teDeum = hour.slots['te-deum'];
  if (teDeum && teDeum.kind === 'te-deum' && teDeum.decision === 'say') {
    const section = composeReferenceSlot('te-deum', TE_DEUM_REF, args);
    if (section) sections.push(section);
  }

  return sections;
}

function composeInvitatorium(
  source: InvitatoriumSource,
  args: MatinsComposeContext
): Section | undefined {
  if (source.kind === 'suppressed') return undefined;
  return composeReferenceSlot('invitatory', source.reference, args);
}

function composeNocturn(
  nocturn: NocturnPlan,
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

  for (const lesson of nocturn.lessons) {
    if (lesson.gateCondition && !conditionMatches(lesson.gateCondition, args.context)) {
      continue;
    }
    const lessonSection = composeLesson(lesson, args);
    const responsory = nocturn.responsories.find((r) => r.index === lesson.index);
    const responsorySection = responsory
      ? composeReferenceSlot('responsory', responsory.reference, args)
      : undefined;

    // Only emit a heading when at least one downstream section resolves;
    // otherwise the client would see an orphan "Lectio N" label with no text.
    if (lessonSection || responsorySection) {
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
  const refs: TextReference[] = [];
  for (const assignment of nocturn.psalmody) {
    if (assignment.antiphonRef) refs.push(assignment.antiphonRef);
    refs.push(assignment.psalmRef);
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

function composeReferenceSlot(
  slot: Parameters<typeof emitSection>[0],
  ref: TextReference,
  args: MatinsComposeContext
): Section | undefined {
  return composeMergedSlot(slot, [ref], args);
}

function composeMergedSlot(
  slot: Parameters<typeof emitSection>[0],
  refs: readonly TextReference[],
  args: MatinsComposeContext
): Section | undefined {
  if (refs.length === 0) return undefined;
  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }

  for (const ref of refs) {
    const resolved = resolveReference(args.corpus, ref, {
      languages: args.options.languages,
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek
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
      const expanded = expandDeferredNodes(section.content, {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH
      });
      const flattened = flattenConditionals(expanded, args.context);
      const transformed = applyDirectives(slot, flattened, {
        hour: 'matins',
        directives: args.directives
      });
      bucket.push(...transformed);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) frozen.set(lang, Object.freeze(nodes));
  }
  if (frozen.size === 0) return undefined;

  const primary = refs[0]!;
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
