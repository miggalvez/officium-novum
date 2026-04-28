import { describe, expect, it } from 'vitest';

import { validateLegacyCitationText } from '../src/audit-citations.js';

describe('citation audit', () => {
  it('accepts corpus citations with line locators', () => {
    expect(
      validateLegacyCitationText(
        'upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:50-65 — source-backed rubric.',
        { requireCitation: true, context: 'row' }
      )
    ).toEqual([]);
  });

  it('rejects corpus citations without line locators', () => {
    expect(
      validateLegacyCitationText(
        'upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt — source-backed rubric.',
        { requireCitation: true, context: 'row' }
      )
    ).toEqual(['row: corpus citation requires path and line locator']);
  });

  it('allows explicitly backlogged legacy migration exceptions', () => {
    expect(
      validateLegacyCitationText(
        'See the related row for the same key-hash family.',
        {
          requireCitation: true,
          context: 'legacy-row',
          allowMigrationException: true
        }
      )
    ).toEqual([]);
  });

  it('still enforces corpus line locators for migration exceptions', () => {
    expect(
      validateLegacyCitationText(
        'upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt — source-backed rubric.',
        {
          requireCitation: true,
          context: 'legacy-row',
          allowMigrationException: true
        }
      )
    ).toEqual(['legacy-row: corpus citation requires path and line locator']);
  });

  it('accepts rubrical-book paragraph locators', () => {
    expect(
      validateLegacyCitationText(
        'Source-backed engine result. General Rubrics §37 gives I class feasts full solemnity.',
        { requireCitation: true, context: 'row' }
      )
    ).toEqual([]);
  });
});
