import { conditionMatches } from '../internal/conditions.js';
import { normalizeDateInput } from '../internal/date.js';
import type { ParsedFile } from '@officium-nova/parser';

import { UnsupportedPolicyError } from '../types/policy.js';
import type { RubricalWarning } from '../types/directorium.js';
import type {
  LessonIndex,
  LessonSource,
  PericopeRef,
  ScriptureCourse
} from '../types/matins.js';
import type { Celebration, Commemoration } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type { CelebrationRuleSet, AlternateLocation } from '../types/rule-set.js';
import type { TextReference } from '../types/hour-structure.js';
import type { TemporalContext } from '../types/model.js';
import type { ResolvedVersion } from '../types/version.js';

export interface RouteLessonContext {
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly commemorations: readonly Commemoration[];
  readonly temporal: TemporalContext;
  readonly policy: RubricalPolicy;
  readonly defaultCourse: ScriptureCourse;
  readonly nocturnIndex: 1 | 2 | 3;
  readonly shape: {
    readonly nocturns: 1 | 3;
    readonly totalLessons: 3 | 9 | 12;
    readonly lessonsPerNocturn: readonly number[];
  };
  readonly selectedAlternate?: AlternateLocation;
  readonly feastFile?: ParsedFile;
  readonly version?: ResolvedVersion;
  readonly warnings: RubricalWarning[];
}

export function routeLesson(
  lessonIndex: LessonIndex,
  context: RouteLessonContext
): LessonSource {
  const explicit = context.celebrationRules.lessonSources.find(
    (override) => override.lesson === lessonIndex
  );
  if (explicit) {
    const routed = routeExplicitSource(explicit.source, lessonIndex, context);
    if (routed) {
      return routed;
    }
  }

  const selectedAlternate = context.selectedAlternate;
  if (selectedAlternate && selectedAlternate.location !== 1) {
    context.warnings.push({
      code: 'matins-alternate-location-selected',
      message: 'Applied Matins lesson-set alternate location for this nocturn.',
      severity: 'info',
      context: {
        lesson: String(lessonIndex),
        nocturn: String(context.nocturnIndex),
        location: String(selectedAlternate.location)
      }
    });

    return {
      kind: 'patristic',
      reference: lessonReference(
        context.celebration.feastRef.path,
        `Lectio${lessonIndex} in ${selectedAlternate.location} loco`
      )
    };
  }

  if (context.shape.totalLessons === 12) {
    throw new UnsupportedPolicyError(
      context.policy.name,
      'routeLesson (12-lesson monastic Matins)'
    );
  }

  const positional = routePositionalDefault(lessonIndex, context);
  if (positional) {
    return positional;
  }

  const feastReference = findSectionReference(
    context,
    `Lectio${lessonIndex}`,
    lessonIndex
  );
  if (feastReference) {
    return {
      kind: 'patristic',
      reference: feastReference
    };
  }

  context.warnings.push({
    code: 'matins-lesson-unresolved',
    message: 'Matins lesson source could not be resolved; emitted placeholder reference.',
    severity: 'warn',
    context: {
      lesson: String(lessonIndex),
      feast: context.celebration.feastRef.path
    }
  });

  return {
    kind: 'patristic',
    reference: placeholderReference(context.celebration.feastRef.path, lessonIndex)
  };
}

function routeExplicitSource(
  source: string,
  lessonIndex: LessonIndex,
  context: RouteLessonContext
): LessonSource | undefined {
  const normalized = source.trim().toLowerCase();

  if (normalized === 'commemorated-principal') {
    const principal = context.commemorations[0];
    if (!principal) {
      return undefined;
    }

    context.warnings.push({
      code: 'matins-commemorated-lesson-routed',
      message: 'Matins lesson was routed to the principal commemoration.',
      severity: 'info',
      context: {
        lesson: String(lessonIndex),
        feast: principal.feastRef.path
      }
    });

    return {
      kind: 'commemorated',
      feast: principal.feastRef,
      lessonIndex
    };
  }

  const explicitCourse = mapOverrideSourceToCourse(normalized, context.defaultCourse);
  if (explicitCourse) {
    return {
      kind: 'scripture',
      course: explicitCourse,
      pericope: scripturePericope(explicitCourse, lessonIndex, context)
    };
  }

  const sourceReference = parseSourceReference(source, lessonIndex);
  if (sourceReference) {
    return {
      kind: 'patristic',
      reference: sourceReference
    };
  }

  return undefined;
}

function routePositionalDefault(
  lessonIndex: LessonIndex,
  context: RouteLessonContext
): LessonSource | undefined {
  if (context.shape.nocturns === 1 || context.shape.totalLessons === 3) {
    return {
      kind: 'scripture',
      course: effectiveScriptureCourse(context),
      pericope: scripturePericope(
        effectiveScriptureCourse(context),
        lessonIndex,
        context
      )
    };
  }

  if (context.shape.nocturns === 3 && context.shape.totalLessons === 9) {
    if (context.nocturnIndex === 1) {
      return {
        kind: 'scripture',
        course: effectiveScriptureCourse(context),
        pericope: scripturePericope(
          effectiveScriptureCourse(context),
          lessonIndex,
          context
        )
      };
    }

    if (context.nocturnIndex === 2) {
      const reference = findSectionReference(
        context,
        `Lectio${lessonIndex}`,
        lessonIndex,
        { warnOnMissing: false }
      );
      if (reference) {
        return {
          kind: 'hagiographic',
          reference
        };
      }
      return undefined;
    }

    const gospel = homilyGospelPericope(context);
    return {
      kind: 'homily-on-gospel',
      gospel
    };
  }

  return undefined;
}

function effectiveScriptureCourse(context: RouteLessonContext): ScriptureCourse {
  const classSymbol = context.celebration.rank.classSymbol;
  if (classSymbol === 'I' || classSymbol === 'II') {
    // RI §220: I/II-class feasts continue the occurring course.
    return 'occurring-1960';
  }
  return context.defaultCourse;
}

function scripturePericope(
  course: ScriptureCourse,
  lessonIndex: LessonIndex,
  context: RouteLessonContext
): PericopeRef {
  const scripturePath =
    context.celebration.source === 'temporal'
      ? context.celebration.feastRef.path
      : context.temporal.feastRef.path;

  return {
    book: course,
    reference: lessonReference(scripturePath, `Lectio${lessonIndex}`)
  };
}

function homilyGospelPericope(context: RouteLessonContext): PericopeRef {
  const reference = findSectionReference(context, 'Lectio7', 7) ??
    lessonReference(context.celebration.feastRef.path, 'Lectio7');

  return {
    book: 'evangelium',
    reference
  };
}

function parseSourceReference(
  raw: string,
  lessonIndex: LessonIndex
): TextReference | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const split = trimmed.split(':');
  const maybePath = split[0]?.trim();
  if (!maybePath) {
    return undefined;
  }

  if (!/[A-Za-z]+\/.+/u.test(maybePath)) {
    return undefined;
  }

  const section = split[1]?.trim() || `Lectio${lessonIndex}`;
  return lessonReference(maybePath, section);
}

function mapOverrideSourceToCourse(
  normalizedSource: string,
  defaultCourse: ScriptureCourse
): ScriptureCourse | undefined {
  switch (normalizedSource) {
    case 'octnat':
      return 'octava-nativitatis';
    case 'tempnat':
      return 'tempora-nativitatis';
    case 'quad':
      return 'lent';
    case 'tempora':
    case 'scriptura1960':
      return defaultCourse;
    default:
      return undefined;
  }
}

function findSectionReference(
  context: RouteLessonContext,
  sectionName: string,
  lessonIndex: LessonIndex,
  options: { readonly warnOnMissing?: boolean } = {}
): TextReference | undefined {
  const warnOnMissing = options.warnOnMissing ?? true;
  const feastFile = context.feastFile;
  if (!feastFile) {
    if (warnOnMissing) {
      context.warnings.push({
        code: 'matins-skeleton-missing-section',
        message: 'Matins lesson section missing because the celebration file was unavailable.',
        severity: 'warn',
        context: {
          feast: context.celebration.feastRef.path,
          section: sectionName,
          lesson: String(lessonIndex)
        }
      });
    }
    return undefined;
  }

  const date = normalizeDateInput(context.temporal.date);
  for (const section of feastFile.sections) {
    if (section.header !== sectionName) {
      continue;
    }

    if (!section.condition) {
      return lessonReference(context.celebration.feastRef.path, sectionName);
    }

    if (!context.version) {
      continue;
    }

    const matches = conditionMatches(section.condition, {
      date,
      dayOfWeek: context.temporal.dayOfWeek,
      season: context.temporal.season,
      version: context.version
    });
    if (matches) {
      return lessonReference(context.celebration.feastRef.path, sectionName);
    }
  }

  if (warnOnMissing) {
    context.warnings.push({
      code: 'matins-skeleton-missing-section',
      message: 'Matins lesson/responsory section was not found in the celebration file.',
      severity: 'warn',
      context: {
        feast: context.celebration.feastRef.path,
        section: sectionName,
        lesson: String(lessonIndex)
      }
    });
  }

  return undefined;
}

function placeholderReference(feastPath: string, lessonIndex: LessonIndex): TextReference {
  return {
    path: `horas/Latin/${feastPath}`,
    section: `Lectio${lessonIndex}`,
    selector: 'missing'
  };
}

function lessonReference(path: string, section: string): TextReference {
  const normalizedPath = path.startsWith('horas/') ? path : `horas/Latin/${path}`;
  return {
    path: normalizedPath,
    section
  };
}
