import {
  enumIncludes,
  isArrayOfStrings,
  isRecord,
  isString,
  result,
  type ValidationResult
} from './common.js';
import { OWNER_PACKAGES, type OwnerPackage } from './adjudication.schema.js';

export const ROMAN_1960_SCENARIO_AREAS = [
  'transfers',
  'concurrence',
  'commemorations',
  'privileged-ferias',
  'octaves',
  'proper-common-fallback',
  'matins-lesson-plans',
  'vespers',
  'seasonal-omissions',
  'known-2026-bugs'
] as const;

export type Roman1960ScenarioArea = (typeof ROMAN_1960_SCENARIO_AREAS)[number];

export const ROMAN_1960_SCENARIO_STATUSES = [
  'exploratory',
  'candidate',
  'gated'
] as const;

export type Roman1960ScenarioStatus = (typeof ROMAN_1960_SCENARIO_STATUSES)[number];

export interface Roman1960Witness {
  readonly date: string;
  readonly hours: readonly string[];
  readonly notes?: string;
}

export interface Roman1960Scenario {
  readonly id: string;
  readonly area: Roman1960ScenarioArea;
  readonly ownerPackage: OwnerPackage;
  readonly status: Roman1960ScenarioStatus;
  readonly witnesses: readonly Roman1960Witness[];
  readonly assertions: readonly string[];
  readonly authorityRefs: readonly string[];
}

export interface Roman1960ScenarioManifest {
  readonly schemaVersion: 1;
  readonly policy: 'Rubrics 1960 - 1960';
  readonly scenarios: readonly Roman1960Scenario[];
}

export function validateRoman1960ScenarioManifest(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return result(['Roman 1960 scenario manifest must be an object']);
  }

  if (value.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (value.policy !== 'Rubrics 1960 - 1960') {
    errors.push('policy must be "Rubrics 1960 - 1960"');
  }
  if (!Array.isArray(value.scenarios)) {
    errors.push('scenarios must be an array');
  } else {
    const ids = new Set<string>();
    value.scenarios.forEach((scenario, index) => {
      errors.push(...validateScenario(scenario, `scenarios[${index}]`, ids));
    });
  }

  return result(errors);
}

function validateScenario(
  value: unknown,
  path: string,
  ids: Set<string>
): readonly string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  if (!isString(value.id) || value.id.trim() === '') {
    errors.push(`${path}.id must be a non-empty string`);
  } else if (ids.has(value.id)) {
    errors.push(`${path}.id must be unique`);
  } else {
    ids.add(value.id);
  }

  if (!enumIncludes(ROMAN_1960_SCENARIO_AREAS, value.area)) {
    errors.push(`${path}.area must be a recognized Roman 1960 scenario area`);
  }
  if (!enumIncludes(OWNER_PACKAGES, value.ownerPackage)) {
    errors.push(`${path}.ownerPackage must be a recognized owner package`);
  }
  if (!enumIncludes(ROMAN_1960_SCENARIO_STATUSES, value.status)) {
    errors.push(`${path}.status must be exploratory, candidate, or gated`);
  }
  if (!Array.isArray(value.witnesses) || value.witnesses.length === 0) {
    errors.push(`${path}.witnesses must include at least one witness`);
  } else {
    value.witnesses.forEach((witness, index) => {
      errors.push(...validateWitness(witness, `${path}.witnesses[${index}]`));
    });
  }
  if (!isArrayOfStrings(value.assertions) || value.assertions.length === 0) {
    errors.push(`${path}.assertions must include at least one assertion`);
  }
  if (!isArrayOfStrings(value.authorityRefs) || value.authorityRefs.length === 0) {
    errors.push(`${path}.authorityRefs must include at least one authority reference`);
  }

  return errors;
}

function validateWitness(value: unknown, path: string): readonly string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }
  if (!isIsoDate(value.date)) {
    errors.push(`${path}.date must be an ISO date`);
  }
  if (!isArrayOfStrings(value.hours) || value.hours.length === 0) {
    errors.push(`${path}.hours must include at least one hour`);
  }
  if (value.notes !== undefined && !isString(value.notes)) {
    errors.push(`${path}.notes must be a string when present`);
  }
  return errors;
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}
