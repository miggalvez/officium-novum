import type {
  ConditionEvalContext,
  HourName,
  HourStructure,
  SlotContent,
  TextReference
} from '@officium-novum/rubrical-engine';

const COMMON_PRAYERS_PATH = 'horas/Latin/Psalterium/Common/Prayers';

export interface DirectiveSlotContentArgs {
  readonly slot: string;
  readonly content: SlotContent;
  readonly hour: HourName;
  readonly directives: HourStructure['directives'];
  readonly structure: HourStructure;
  readonly context: ConditionEvalContext;
}

export function directiveDrivenSlotContent(args: DirectiveSlotContentArgs): SlotContent | undefined {
  const majorHourPrelude = majorHourOrationPreludeContent(args);
  if (majorHourPrelude) {
    return majorHourPrelude;
  }

  const majorHourConclusion = majorHourConclusionContent(args);
  if (majorHourConclusion) {
    return majorHourConclusion;
  }

  const oneAloneWrapper = oneAloneMinorHourWrapperContent(args);
  if (oneAloneWrapper) {
    return oneAloneWrapper;
  }

  const minorHourWrapper = minorHourOrationWrapperContent(args);
  if (minorHourWrapper) {
    return minorHourWrapper;
  }

  if (args.slot === 'preces') {
    const content = precesDirectiveContent(args.hour, args.directives);
    if (!content) {
      return undefined;
    }

    return content;
  }

  if (args.slot !== 'suffragium') {
    return undefined;
  }

  const ref = suffragiumDirectiveReference(args);
  if (!ref) {
    return undefined;
  }

  return {
    kind: 'single-ref',
    ref
  };
}

function majorHourOrationPreludeContent(args: DirectiveSlotContentArgs): SlotContent | undefined {
  if (args.slot !== 'oration' || (args.hour !== 'lauds' && args.hour !== 'vespers')) {
    return undefined;
  }

  const innerRefs = refsForWrappedOration(args.content);
  if (!innerRefs) {
    return undefined;
  }
  if (args.structure.slots.conclusion?.kind === 'empty') {
    return undefined;
  }

  return {
    kind: 'ordered-refs',
    refs: [
      ...majorHourOrationOpeningRefs(args),
      commonPrayerRef('Oremus'),
      ...innerRefs
    ]
  };
}

function majorHourOrationOpeningRefs(args: DirectiveSlotContentArgs): readonly TextReference[] {
  if (args.directives.includes('preces-feriales')) {
    return [
      commonPrayerRef('Domine exaudi'),
      {
        path: COMMON_PRAYERS_PATH,
        section: 'Dominus',
        selector: '5'
      }
    ];
  }

  return [commonPrayerRef('Domine exaudi')];
}

function majorHourConclusionContent(args: DirectiveSlotContentArgs): SlotContent | undefined {
  if (!usesWrappedMajorHourConclusion(args)) {
    return undefined;
  }

  return {
    kind: 'ordered-refs',
    refs: [
      commonPrayerRef('Domine exaudi'),
      {
        path: COMMON_PRAYERS_PATH,
        section: args.directives.includes('add-versicle-alleluia')
          ? 'Benedicamus Domino1'
          : 'Benedicamus Domino'
      },
      commonPrayerRef('Fidelium animae')
    ]
  };
}

function usesWrappedMajorHourConclusion(args: DirectiveSlotContentArgs): boolean {
  if (args.slot !== 'conclusion' || (args.hour !== 'lauds' && args.hour !== 'vespers')) {
    return false;
  }

  if (!args.context.version.handle.includes('1955') && !args.context.version.handle.includes('1960')) {
    return false;
  }

  return (
    args.content.kind === 'single-ref' &&
    args.content.ref.section === 'Conclusio' &&
    (
      (args.hour === 'lauds' && args.content.ref.path === 'horas/Ordinarium/Laudes') ||
      (args.hour === 'vespers' && args.content.ref.path === 'horas/Ordinarium/Vespera')
    )
  );
}

function precesDirectiveContent(
  hour: HourName,
  directives: HourStructure['directives']
): SlotContent | undefined {
  const flags = new Set(directives);
  if (flags.has('preces-dominicales')) {
    if (hour === 'compline') {
      return {
        kind: 'single-ref',
        ref: {
          path: 'horas/Latin/Psalterium/Special/Preces',
          section: 'Preces dominicales Completorium'
        }
      };
    }
    return undefined;
  }

  if (!flags.has('preces-feriales')) {
    return undefined;
  }

  let section: string | undefined;
  switch (hour) {
    case 'lauds':
      section = 'Preces feriales Laudes';
      break;
    case 'vespers':
      section = 'Preces feriales Vespera';
      break;
    case 'prime':
      section = 'Preces feriales Prima';
      break;
    case 'terce':
    case 'sext':
    case 'none':
      section = 'Preces feriales minora';
      break;
    default:
      section = undefined;
      break;
  }

  if (!section) {
    return undefined;
  }

  return {
    kind: 'ordered-refs',
    refs: [
      commonPrayerRef('mLitany'),
      {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section
      }
    ]
  };
}

function suffragiumDirectiveReference(args: DirectiveSlotContentArgs): TextReference | undefined {
  const flags = new Set(args.directives);
  if (flags.has('omit-suffragium') || !flags.has('suffragium-of-the-saints')) {
    return undefined;
  }

  if (args.hour !== 'lauds' && args.hour !== 'vespers') {
    return undefined;
  }

  return {
    path: 'horas/Latin/Psalterium/Special/Major Special',
    section: suffragiumSection(args)
  };
}

function suffragiumSection(args: DirectiveSlotContentArgs): string {
  const handle = args.context.version.handle;
  if (args.context.season === 'eastertide') {
    return 'Suffragium Paschale';
  }

  if (handle.includes('Tridentine') || handle.includes('1570') || handle.includes('1888') || handle.includes('1906')) {
    return args.hour === 'vespers' ? 'Suffragium Vespera' : 'Suffragium Laudes';
  }

  return 'Suffragium';
}

/**
 * Easter-Octave / one-alone minor-hour shape: `Capitulum Versum 2` replaces
 * the later block, leaving responsory + versicle empty while the source-backed
 * collect still needs the shared `Domine exaudi / Oremus` wrapper. For Prime,
 * the post-collect `Domine exaudi / Benedicamus` bridge lives in the oration
 * block itself; for Terce/Sext/None, the same lane materializes as a distinct
 * conclusion block immediately after the collect.
 */
function oneAloneMinorHourWrapperContent(args: DirectiveSlotContentArgs): SlotContent | undefined {
  if (!usesOneAloneMinorHourWrapper(args)) {
    return undefined;
  }

  if (args.slot === 'oration') {
    const innerRefs = refsForOneAloneMinorHourOration(args.content);
    if (!innerRefs) {
      return undefined;
    }

    const refs: TextReference[] = [
      commonPrayerRef('Domine exaudi'),
      commonPrayerRef('Oremus'),
      ...innerRefs
    ];
    if (args.hour === 'prime') {
      refs.push(commonPrayerRef('Domine exaudi'), commonPrayerRef('Benedicamus Domino'));
    }

    return { kind: 'ordered-refs', refs };
  }

  if (args.slot === 'conclusion' && args.hour !== 'prime') {
    return {
      kind: 'ordered-refs',
      refs: [
        commonPrayerRef('Domine exaudi'),
        commonPrayerRef('Benedicamus Domino'),
        commonPrayerRef('Fidelium animae')
      ]
    };
  }

  return undefined;
}

function minorHourOrationWrapperContent(args: DirectiveSlotContentArgs): SlotContent | undefined {
  if (!usesMinorHourOrationWrapper(args)) {
    return undefined;
  }

  if (args.slot === 'oration') {
    const innerRefs = refsForWrappedOration(args.content);
    if (!innerRefs) {
      return undefined;
    }

    return {
      kind: 'ordered-refs',
      refs: [
        commonPrayerRef('Domine exaudi'),
        commonPrayerRef('Oremus'),
        ...innerRefs
      ]
    };
  }

  return {
    kind: 'ordered-refs',
    refs: [
      commonPrayerRef('Domine exaudi'),
      commonPrayerRef('Benedicamus Domino'),
      commonPrayerRef('Fidelium animae')
    ]
  };
}

function usesMinorHourOrationWrapper(args: DirectiveSlotContentArgs): boolean {
  if (
    (args.hour !== 'terce' && args.hour !== 'sext' && args.hour !== 'none') ||
    (args.slot !== 'oration' && args.slot !== 'conclusion')
  ) {
    return false;
  }

  if (!args.context.version.handle.includes('1955') && !args.context.version.handle.includes('1960')) {
    return false;
  }

  if (args.slot === 'conclusion') {
    return isMinorHourConclusionContent(args.content);
  }

  return refsForWrappedOration(args.content) !== undefined;
}

function isMinorHourConclusionContent(content: SlotContent): boolean {
  return (
    content.kind === 'single-ref' &&
    content.ref.path === 'horas/Ordinarium/Minor' &&
    content.ref.section === 'Conclusio'
  );
}

function usesOneAloneMinorHourWrapper(args: DirectiveSlotContentArgs): boolean {
  if (!isMinorHour(args.hour) || (args.slot !== 'oration' && args.slot !== 'conclusion')) {
    return false;
  }

  const chapter = args.structure.slots.chapter;
  const responsory = args.structure.slots.responsory;
  const versicle = args.structure.slots.versicle;

  return (
    chapter?.kind === 'single-ref' &&
    chapter.ref.section.trim() === 'Versum 2' &&
    responsory?.kind === 'empty' &&
    versicle?.kind === 'empty'
  );
}

function refsForOneAloneMinorHourOration(
  content: SlotContent
): readonly TextReference[] | undefined {
  return refsForWrappedOration(content);
}

function refsForWrappedOration(
  content: SlotContent
): readonly TextReference[] | undefined {
  switch (content.kind) {
    case 'single-ref':
      return [content.ref];
    case 'ordered-refs':
      return content.refs;
    default:
      return undefined;
  }
}

function commonPrayerRef(section: string): TextReference {
  return {
    path: COMMON_PRAYERS_PATH,
    section
  };
}

function isMinorHour(hour: HourName): hour is 'prime' | 'terce' | 'sext' | 'none' {
  return hour === 'prime' || hour === 'terce' || hour === 'sext' || hour === 'none';
}
