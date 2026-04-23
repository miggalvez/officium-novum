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

  if (args.slot === 'preces') {
    const ref = precesDirectiveReference(args.hour, args.directives);
    if (!ref) {
      return undefined;
    }

    return {
      kind: 'single-ref',
      ref
    };
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

  return {
    kind: 'ordered-refs',
    refs: [
      commonPrayerRef('Domine exaudi'),
      commonPrayerRef('Oremus'),
      ...innerRefs
    ]
  };
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

function precesDirectiveReference(
  hour: HourName,
  directives: HourStructure['directives']
): TextReference | undefined {
  const flags = new Set(directives);
  if (flags.has('preces-dominicales')) {
    if (hour === 'compline') {
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces dominicales Completorium'
      };
    }
    return undefined;
  }

  if (!flags.has('preces-feriales')) {
    return undefined;
  }

  switch (hour) {
    case 'lauds':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales Laudes'
      };
    case 'vespers':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales Vespera'
      };
    case 'prime':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales Prima'
      };
    case 'terce':
    case 'sext':
    case 'none':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales minora'
      };
    default:
      return undefined;
  }
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
