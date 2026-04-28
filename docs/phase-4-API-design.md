# Phase 4 Detailed Plan: Read-only JSON API

Phase 4 should be a thin, deterministic HTTP layer over the existing Parser → Rubrical Engine → Compositor pipeline. The API should not become another rubrical engine, another compositor, or a stealth frontend renderer. Its job is validation, version/language normalization, text orthography adaptation, DTO adaptation, caching, OpenAPI, and stable public boundaries.

Phase 3 is complete, so the API contract should target the shipped `ComposedHour` surface while keeping public v1 stability at the adapter boundary. Phase 4 owns wire-format choices such as public language tags, spelling/orthography profiles, cache keys, and response DTO shape; Phase 3 continues to own format-agnostic composition.

## Implementation Status

- **4a design record:** This design document plus [ADR-014](adr/014-http-api-version-language-contract.md) now record the API's canonical version, language, DTO, and orthography boundary.
- **4b scaffold and metadata endpoints:** Complete in `packages/api/`. Implemented Fastify app/server setup, context/config loading, OpenAPI registration, error serializer, `/api/v1/status`, `/api/v1/versions`, and `/api/v1/languages`, with package and workspace validation green.
- **4c office endpoint:** Complete in `packages/api/`. Implemented `/api/v1/office/{date}/{hour}`, live context startup resources, version/language/query validation, public `ComposedHour` DTO adaptation, strict composition-error handling, and 1960 Latin `orthography=source|version` text/rubric adaptation.
- **4d cache canonicalization and ETags:** Complete in `packages/api/`. Implemented canonical office cache keys, stable JSON hashing, deterministic ETags, `Cache-Control`, `If-None-Match` / `304` support, and canonical path metadata for the Office route.
- **4e day bundle endpoint:** Complete in `packages/api/`. Implemented `/api/v1/days/{date}`, selected-Hour composition from one `DayOfficeSummary`, `hours=all`, per-Hour composition warnings, shared public DTO adaptation, and deterministic cache headers/ETags.
- **4f calendar month endpoint:** Complete in `packages/api/`. Implemented `/api/v1/calendar/{year}/{month}`, month parameter validation, canonical version/rubrics handling, one rubrical summary per civil day, summary-only DTOs with no hour text composition, calendar cache keys, deterministic ETags, and conditional `304` handling.
- **4g contract tests and release gate:** Not implemented yet.

## 0. Core Architectural Decisions

### Decision 1: Use `version`, not `rubrics`, as the canonical API binding

Canonical request:

```http
GET /api/v1/office/2026-04-26/lauds?version=Rubrics%201960%20-%201960&lang=la,en
```

Compatibility alias:

```http
GET /api/v1/office/2026-04-26/lauds?rubrics=1960&lang=la,en
```

But `rubrics=1960` must normalize immediately to the canonical `VersionHandle`:

```ts
const RUBRICS_ALIASES = {
  '1911': 'Divino Afflatu - 1954',
  '1955': 'Reduced - 1955',
  '1960': 'Rubrics 1960 - 1960'
} as const;
```

Do not let `rubrics` become the real contract. ADR-001 makes `VersionHandle` the primary engine binding because different versions can share the same policy while using different calendars, such as `"Rubrics 1960 - 1960"` and `"Rubrics 1960 - 2020 USA"`.

### Decision 2: Public language tags must map to corpus language names

The public API should use normal tags:

```http
lang=la,en
langfb=en
```

But the compositor currently receives language names directly through `ComposeOptions.languages`, and its output carries those same strings. `ComposeOptions` is typed as `languages: readonly string[]` with optional `langfb`, and `ComposedHour.languages` is also a string array.

So Phase 4 needs a language adapter:

```ts
type PublicLanguageTag = 'la' | 'en';
type CorpusLanguageName = 'Latin' | 'English';

const LANGUAGE_MAP: Record<PublicLanguageTag, CorpusLanguageName> = {
  la: 'Latin',
  en: 'English'
};
```

Request:

```http
lang=la,en
```

Compositor input:

```ts
languages: ['Latin', 'English']
```

Public response keys:

```json
{
  "texts": {
    "la": [{ "type": "text", "value": "Deus, in adjutorium meum intende." }],
    "en": [{ "type": "text", "value": "O God, come to my assistance." }]
  }
}
```

This means the API should expose a `ComposedHour`-shaped DTO, not raw `ComposedHour` verbatim. A direct dump would leak `"Latin"` and `"English"` as wire-format keys after the user requested `la,en`.

### Decision 3: Internal `ResolvedVersion`, external `VersionDescriptor`

The compositor requires a `ResolvedVersion`, while response payloads should expose a serialization-safe descriptor. The engine exposes `version: ResolvedVersion`, and `describeVersion()` projects a `ResolvedVersion` into `VersionDescriptor` by replacing the live `policy` object with `policyName`.

Route code should therefore do this:

```ts
const summary = entry.engine.resolveDayOfficeSummary(date);

const composed = composeHour({
  corpus,
  summary,
  version: entry.engine.version,
  hour,
  options
});

const publicVersion = describeVersion(entry.engine.version);
```

Do not serialize `ResolvedVersion` directly. It carries a live policy object. That belongs inside the process, not on the wire.

### Decision 4: Explicit version status classification

`VERSION_POLICY` includes both implemented Roman policies and unsupported-policy stubs for deferred families. Existence in the map does not mean “servable by the API.” The policy map also explicitly tracks `MISSA_ALIAS_HINTS` and `MISSA_ONLY_HANDLES`, so Mass/Missa-only handling is real and should not be flattened into generic “unknown version.”

Use this public status model:

```ts
type VersionSupportStatus =
  | 'supported'
  | 'deferred'
  | 'missa-only';
```

Supported Office handles should be the Roman Breviary handles backed by implemented policies:

```ts
[
  'Divino Afflatu - 1939',
  'Divino Afflatu - 1954',
  'Reduced - 1955',
  'Rubrics 1960 - 1960',
  'Rubrics 1960 - 2020 USA'
]
```

Deferred handles include Tridentine, monastic, Cistercian, and Dominican rows currently bound to unsupported policy stubs.

### Decision 5: Do not fake liturgical data

Current `Celebration` has no `color`; current `Commemoration` does have optional `color?: LiturgicalColor`.

So the calendar DTO should omit `celebration.color` but pass through `commemoration.color` when present.

No “best guess” day color. Liturgical APIs should not play vestment roulette.

### Decision 6: Phase 4 wraps the current compositor surface

`composeHour()` is already the correct seam: it consumes a Phase-1 text index, a `DayOfficeSummary`, a `ResolvedVersion`, an `HourName`, and `ComposeOptions`; it emits a `ComposedHour`.

Phase 4 should use DTO adapter functions rather than exporting compositor types directly as the permanent public contract.

Recommended wording for the Phase 4 design doc:

```md
This Phase 4 contract targets the current Phase 3 `ComposedHour`
surface. DTO adapters own public wire-format stability, including
language tags, text orthography profiles, and cache canonicalization.
Public v1 stability begins only once Phase 4 is released.
```

### Decision 7: Text orthography is an explicit Phase 4 adapter

The corpus and `ComposedHour` preserve canonical source spelling. Public
rendering may still need a version-sensitive spelling profile for user-visible
parity with legacy Divinum Officium output, such as displaying Roman 1960
Latin `Allelúja` as `Allelúia` via the same `j` to `i` convention used by
upstream Perl's `spell_var()`.

Model this as a request/adapter option, not as parser normalization, rubrical
logic, or compositor mutation:

```ts
type TextOrthographyProfile = 'source' | 'version';
```

- `source` returns the text exactly as composed from the canonical corpus.
- `version` applies the public display profile implied by the requested
  `VersionHandle`, limited to plain text and rubric run values. It must not
  rewrite references, citations, section metadata, warning payloads, HTML-like
  diagnostic strings, or cache/content-version identifiers.

`version` should be the API default once the adapter is implemented, because
it matches the expected user-visible office for a requested version. `source`
is valuable for source audit, corpus debugging, and tests that need to prove
the canonical text has not changed.

## 1. Target Package Layout

Add a new package:

```txt
packages/
  api/
    package.json
    tsconfig.json
    src/
      app.ts
      server.ts
      config.ts
      context.ts

      routes/
        office.ts
        day.ts
        calendar.ts
        metadata.ts
        openapi.ts

      services/
        version-registry.ts
        language-map.ts
        orthography-profile.ts
        compose-office.ts
        dto.ts
        cache.ts
        errors.ts

      schemas/
        params.ts
        query.ts
        responses.ts
        errors.ts

      test/
        office-route.test.ts
        metadata-route.test.ts
        calendar-route.test.ts
        errors.test.ts
        cache.test.ts
```

Use Fastify, as the modernization spec already names Fastify as a sufficient lightweight framework for Phase 4. The same spec says the Text Index should load at startup, with no ORM needed.

Recommended dependencies:

```json
{
  "dependencies": {
    "fastify": "^5",
    "@fastify/swagger": "^9",
    "@fastify/swagger-ui": "^5",
    "@sinclair/typebox": "^0.34"
  },
  "devDependencies": {
    "vitest": "^3"
  }
}
```

TypeBox is a good fit because Fastify can use JSON schemas directly. Zod is also fine, but if the goal is OpenAPI generation from route schemas, TypeBox keeps the path straighter.

## 2. API Context

Build one immutable context at startup.

```ts
interface ApiContext {
  corpus: TextIndex;
  versions: ReadonlyMap<VersionHandle, ApiVersionEntry>;
  languages: ReadonlyMap<PublicLanguageTag, LanguageEntry>;
  contentVersion: string;
  supportedHours: readonly HourName[];
}

interface LanguageEntry {
  tag: PublicLanguageTag;
  corpusName: CorpusLanguageName;
  label: string;
  defaultFallback?: PublicLanguageTag;
}

interface ApiVersionEntry {
  handle: VersionHandle;
  status: VersionSupportStatus;
  descriptor?: VersionDescriptorDto;
  policyName?: PolicyName;
  aliases: string[];
  hint?: VersionHandle;
  engine?: RubricalEngine;
}
```

The `corpus` should be the parser `TextIndex`, because the compositor’s `ComposeInput` expects `TextIndex`; the rubrical engine only needs the smaller `OfficeTextIndex` subset, so the same object can satisfy both surfaces.

Startup flow:

```ts
async function buildApiContext(config: ApiConfig): Promise<ApiContext> {
  const corpus = await loadCorpus(config.corpusPath, {
    resolveReferences: true,
    collectWarnings: true
  });

  const versionRegistry = loadVersionRegistry(corpus);
  const kalendarium = loadKalendariumTables(corpus);
  const yearTransfers = loadYearTransfers(corpus);
  const scriptureTransfers = loadScriptureTransfers(corpus);

  const versions = buildApiVersionRegistry({
    corpus,
    versionRegistry,
    kalendarium,
    yearTransfers,
    scriptureTransfers
  });

  return {
    corpus,
    versions,
    languages: buildLanguageRegistry(),
    contentVersion: computeContentVersion(config),
    supportedHours: [
      'matins',
      'lauds',
      'prime',
      'terce',
      'sext',
      'none',
      'vespers',
      'compline'
    ]
  };
}
```

ADR-009 says the compositor expects a Phase-1-resolved corpus and should not re-resolve raw `@` references at API time, so `loadCorpus()` should use the default/eager resolved mode.

## 3. Public Endpoints

### 3.1 Status

```http
GET /api/v1/status
```

Purpose: operational readiness and content metadata.

Response:

```ts
interface StatusResponse {
  kind: 'status';
  apiVersion: 'v1';
  status: 'ok' | 'degraded';

  content: {
    contentVersion: string;
    upstreamSha?: string;
    corpusFileCount?: number;
  };

  support: {
    supportedHours: HourName[];
    supportedVersionCount: number;
    deferredVersionCount: number;
    missaOnlyVersionCount: number;
  };
}
```

No `generatedAt` on deterministic content responses. It breaks cache equality and gives clients a useless moving value.

### 3.2 Versions

```http
GET /api/v1/versions
```

Purpose: let clients discover canonical handles and support status.

Response:

```ts
interface VersionsResponse {
  kind: 'versions';
  apiVersion: 'v1';
  defaultVersion: VersionHandle;
  versions: VersionInfoDto[];
}

interface VersionInfoDto {
  handle: VersionHandle;
  status: 'supported' | 'deferred' | 'missa-only';
  policyName?: PolicyName;
  kalendar?: string;
  transfer?: string;
  stransfer?: string;
  base?: string;
  transferBase?: string;
  aliases: string[];
  hint?: VersionHandle;
}
```

Example:

```json
{
  "handle": "Rubrics 1960",
  "status": "missa-only",
  "aliases": [],
  "hint": "Rubrics 1960 - 1960"
}
```

Do not include `unknown` in `/versions`. Unknown things are not listable; they belong in error responses.

### 3.3 Languages

```http
GET /api/v1/languages
```

Response:

```ts
interface LanguagesResponse {
  kind: 'languages';
  apiVersion: 'v1';
  languages: Array<{
    tag: PublicLanguageTag;
    corpusName: CorpusLanguageName;
    label: string;
    defaultFallback?: PublicLanguageTag;
  }>;
}
```

Initial response:

```json
{
  "kind": "languages",
  "apiVersion": "v1",
  "languages": [
    {
      "tag": "la",
      "corpusName": "Latin",
      "label": "Latin"
    },
    {
      "tag": "en",
      "corpusName": "English",
      "label": "English",
      "defaultFallback": "la"
    }
  ]
}
```

### 3.4 Office Hour

```http
GET /api/v1/office/{date}/{hour}
```

Example:

```http
GET /api/v1/office/2026-04-26/lauds?version=Rubrics%201960%20-%201960&lang=la,en&langfb=en
```

Query parameters:

| Parameter | Required | Example | Meaning |
|---|---:|---|---|
| `version` | yes, unless `rubrics` is present | `Rubrics 1960 - 1960` | Canonical `VersionHandle` |
| `rubrics` | no | `1960` | Compatibility alias only |
| `lang` | no | `la,en` | Ordered public language tags; default `la` |
| `langfb` | no | `en` | Preferred fallback tag |
| `orthography` | no | `version` | Text spelling profile: `version` or `source`; default `version` |
| `joinLaudsToMatins` | no | `true` | Passed to compositor options |
| `strict` | no | `true` | Error if composition has `severity: "error"` |

Response:

```ts
interface OfficeHourResponse {
  kind: 'office-hour';
  apiVersion: 'v1';

  request: {
    date: string;
    hour: HourName;
    version: VersionHandle;
    languages: PublicLanguageTag[];
    langfb?: PublicLanguageTag;
    orthography: TextOrthographyProfile;
    joinLaudsToMatins: boolean;
    strict: boolean;
  };

  version: VersionDescriptorDto;
  summary: DaySummaryDto;
  office: PublicComposedHourDto;

  warnings: {
    rubrical: RubricalWarningDto[];
    composition: ComposeWarningDto[];
  };

  meta: {
    contentVersion: string;
    canonicalPath: string;
    quality: 'complete' | 'partial';
  };
}
```

The warning duplication is intentional. `office.warnings` preserves the compositor-native shape; top-level `warnings` gives clients one predictable place to check before rendering.

### 3.5 Day Bundle

```http
GET /api/v1/days/{date}
```

Example:

```http
GET /api/v1/days/2026-04-26?version=Rubrics%201960%20-%201960&lang=la,en&hours=lauds,vespers
```

Purpose: frontend-friendly daily payload.

Query parameters:

| Parameter | Required | Example |
|---|---:|---|
| `version` | yes | `Rubrics 1960 - 1960` |
| `lang` | no | `la,en` |
| `langfb` | no | `en` |
| `hours` | no | `matins,lauds,vespers` or `all` |
| `strict` | no | `true` |

Response:

```ts
interface OfficeDayResponse {
  kind: 'office-day';
  apiVersion: 'v1';

  request: {
    date: string;
    version: VersionHandle;
    languages: PublicLanguageTag[];
    hours: HourName[];
    strict: boolean;
  };

  version: VersionDescriptorDto;
  summary: DaySummaryDto;

  hours: Partial<Record<HourName, PublicComposedHourDto>>;

  warnings: {
    rubrical: RubricalWarningDto[];
    composition: Partial<Record<HourName, ComposeWarningDto[]>>;
  };

  meta: {
    contentVersion: string;
    canonicalPath: string;
    quality: 'complete' | 'partial';
  };
}
```

This endpoint should resolve the `DayOfficeSummary` once, then compose selected hours. That avoids needless duplicate rubrical resolution.

### 3.6 Calendar Month

```http
GET /api/v1/calendar/{year}/{month}
```

Example:

```http
GET /api/v1/calendar/2026/04?version=Rubrics%201960%20-%201960
```

Purpose: lightweight month summaries for calendar UIs.

Do not compose Office text here.

Response:

```ts
interface CalendarMonthResponse {
  kind: 'calendar-month';
  apiVersion: 'v1';
  year: number;
  month: number;
  version: VersionDescriptorDto;
  days: CalendarDayDto[];
  meta: {
    contentVersion: string;
    canonicalPath: string;
  };
}

interface CalendarDayDto {
  date: string;
  dayOfWeek: number;
  season: LiturgicalSeason;

  celebration: CelebrationDto;
  commemorations: CommemorationDto[];

  warnings: RubricalWarningDto[];
}
```

DTOs:

```ts
interface CelebrationDto {
  feast: FeastRefDto;
  rank: RankDto;
  source: 'temporal' | 'sanctoral';
  kind?: 'vigil' | 'octave';
  octaveDay?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  transferredFrom?: string;
  // no color yet
}

interface CommemorationDto {
  feast: FeastRefDto;
  rank: RankDto;
  reason: CommemorationReason;
  hours: HourName[];
  kind?: 'vigil' | 'octave';
  octaveDay?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  color?: LiturgicalColor;
}
```

### 3.7 Feast Lookup

Lower priority than office/day/calendar, but useful for study tools.

Use a query parameter rather than a path segment because feast IDs are path-like and encoded slashes cause router/proxy misery.

```http
GET /api/v1/feasts?id=Sancti/01-25&version=Rubrics%201960%20-%201960&lang=la,en
```

Response sketch:

```ts
interface FeastResponse {
  kind: 'feast';
  apiVersion: 'v1';
  id: string;
  version: VersionDescriptorDto;
  feast: FeastRefDto;
  sections: Array<{
    section: string;
    texts: Record<PublicLanguageTag, ComposedRunDto[]>;
  }>;
  meta: {
    contentVersion: string;
  };
}
```

This can be deferred until after the main endpoints. The core prayer flow needs office, day, calendar, versions, and languages first.

### 3.8 OpenAPI

```http
GET /api/v1/openapi.json
GET /api/v1/docs
```

The modernization spec calls for OpenAPI 3.1 documentation generated from route definitions.

## 4. DTO Definitions

### 4.1 Version Descriptor

```ts
interface VersionDescriptorDto {
  handle: VersionHandle;
  kalendar: string;
  transfer: string;
  stransfer: string;
  base?: string;
  transferBase?: string;
  policyName: PolicyName;
}
```

`PolicyName` should remain the actual union:

```ts
type PolicyName =
  | 'tridentine-1570'
  | 'divino-afflatu'
  | 'reduced-1955'
  | 'rubrics-1960'
  | 'monastic-tridentine'
  | 'monastic-divino'
  | 'monastic-1963'
  | 'cistercian-1951'
  | 'cistercian-altovadense'
  | 'dominican-1962';
```

### 4.2 Day Summary

Expose a safe projection of `DayOfficeSummary`, not a raw dump.

```ts
interface DaySummaryDto {
  date: string;
  version: VersionDescriptorDto;

  temporal: {
    date: string;
    dayOfWeek: number;
    dayName: string;
    weekStem: string;
    season: LiturgicalSeason;
    feast: FeastRefDto;
    rank: RankDto;
  };

  celebration: CelebrationDto;
  commemorations: CommemorationDto[];

  concurrence: {
    winner: 'today' | 'tomorrow' | 'none';
  };

  candidates: CandidateDto[];

  warnings: RubricalWarningDto[];
}
```

Reusable pieces:

```ts
interface FeastRefDto {
  id: string;
  path: string;
  title: string;
}

interface RankDto {
  name: string;
  classSymbol: string;
  weight: number;
}

interface CandidateDto {
  feast: FeastRefDto;
  rank: RankDto;
  source: 'temporal' | 'sanctoral' | 'transferred-in';
  kind?: 'vigil' | 'octave';
  octaveDay?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  transferredFrom?: string;
}
```

### 4.3 Public Composed Hour

Native compositor types use arbitrary string languages. Public API types should use public tags.

```ts
interface PublicComposedHourDto {
  date: string;
  hour: HourName;
  celebration: string;
  languages: PublicLanguageTag[];
  orthography: TextOrthographyProfile;
  sections: PublicSectionDto[];
  warnings: ComposeWarningDto[];
}

interface PublicSectionDto {
  type: SectionType;
  slot: string;
  reference?: string;
  languages: PublicLanguageTag[];
  heading?: {
    kind: 'nocturn' | 'lesson';
    ordinal: number;
  };
  lines: PublicComposedLineDto[];
}

interface PublicComposedLineDto {
  marker?: string;
  texts: Partial<Record<PublicLanguageTag, ComposedRunDto[]>>;
}
```

### 4.4 Compose Runs

```ts
type ComposedRunDto =
  | { type: 'text'; value: string }
  | { type: 'rubric'; value: string }
  | { type: 'citation'; value: string }
  | { type: 'unresolved-macro'; name: string }
  | { type: 'unresolved-formula'; name: string }
  | { type: 'unresolved-reference'; ref: CrossReferenceDto };
```

Only `text` and `rubric` run values are eligible for text orthography
adaptation. `citation`, unresolved placeholders, references, warning payloads,
and section metadata remain source-identifying diagnostics and should not be
rewritten by the public display profile.

## 5. Error Model

One JSON shape everywhere:

```ts
interface ApiError {
  kind: 'error';
  apiVersion: 'v1';

  code:
    | 'invalid-date'
    | 'invalid-hour'
    | 'missing-version'
    | 'unknown-version'
    | 'unsupported-version'
    | 'missa-only-version'
    | 'invalid-language'
    | 'invalid-query-value'
    | 'composition-error'
    | 'not-found'
    | 'internal-error';

  message: string;
  details?: Record<string, string | number | boolean | null>;
  hints?: string[];
}
```

Status mapping:

| Case | HTTP | Code |
|---|---:|---|
| Malformed date | `400` | `invalid-date` |
| Unsupported hour string | `400` | `invalid-hour` |
| Missing `version` / `rubrics` | `400` | `missing-version` |
| Unknown version handle | `400` | `unknown-version` |
| Known but deferred Breviary policy | `501` | `unsupported-version` |
| Known Mass/Missa-only handle | `422` | `missa-only-version` |
| Bad language tag | `400` | `invalid-language` |
| Bad `orthography` value | `400` | `invalid-query-value` |
| `strict=true` and composition has error warnings | `422` | `composition-error` |
| Feast not found | `404` | `not-found` |
| Actual bug / impossible state | `500` | `internal-error` |

Example missa-only error:

```json
{
  "kind": "error",
  "apiVersion": "v1",
  "code": "missa-only-version",
  "message": "This version identifier belongs to the Mass-side table, not the Breviary Office API.",
  "hints": [
    "Use \"Rubrics 1960 - 1960\" for the Breviary."
  ]
}
```

Example deferred policy error:

```json
{
  "kind": "error",
  "apiVersion": "v1",
  "code": "unsupported-version",
  "message": "This Breviary version is known but its rubrical policy is deferred in the current API."
}
```

Use `501` for deferred policy because the server knows the version but has not implemented the necessary policy. Use `422` for `strict=true` composition warnings because the request is understandable but cannot be fulfilled under the chosen strictness.

## 6. Route Flow for the Office Endpoint

```ts
async function getOfficeHour(request, reply) {
  const date = parseIsoDate(request.params.date);
  const hour = parseHourName(request.params.hour);

  const versionEntry = resolveApiVersion({
    version: request.query.version,
    rubrics: request.query.rubrics,
    context
  });

  assertVersionServable(versionEntry);

  const languageSelection = resolveLanguages({
    lang: request.query.lang ?? 'la',
    langfb: request.query.langfb,
    context
  });

  const orthography = resolveOrthographyProfile(request.query.orthography ?? 'version');

  const summary = versionEntry.engine.resolveDayOfficeSummary(date);

  const composed = composeHour({
    corpus: context.corpus,
    summary,
    version: versionEntry.engine.version,
    hour,
    options: {
      languages: languageSelection.corpusNames,
      langfb: languageSelection.corpusFallback,
      joinLaudsToMatins: request.query.joinLaudsToMatins === true
    }
  });

  if (
    request.query.strict === true &&
    composed.warnings.some((warning) => warning.severity === 'error')
  ) {
    throw compositionError(composed.warnings);
  }

  const response = toOfficeHourResponse({
    request,
    version: describeVersion(versionEntry.engine.version),
    summary,
    composed,
    languageSelection,
    orthography,
    contentVersion: context.contentVersion
  });

  setCacheHeaders(reply, response);
  return response;
}
```

## 7. Language and Orthography Adapter Details

Implement this early, before the office endpoint.

```ts
interface LanguageSelection {
  publicTags: PublicLanguageTag[];
  corpusNames: CorpusLanguageName[];
  publicFallback?: PublicLanguageTag;
  corpusFallback?: CorpusLanguageName;
  toPublic: Map<CorpusLanguageName, PublicLanguageTag>;
  toCorpus: Map<PublicLanguageTag, CorpusLanguageName>;
}
```

Parser:

```ts
function resolveLanguages(input: {
  lang?: string;
  langfb?: string;
  context: ApiContext;
}): LanguageSelection {
  const publicTags = splitCommaList(input.lang ?? 'la');

  if (publicTags.length === 0) {
    throw invalidLanguage('At least one language is required.');
  }

  for (const tag of publicTags) {
    if (!context.languages.has(tag as PublicLanguageTag)) {
      throw invalidLanguage(`Unsupported language: ${tag}`);
    }
  }

  const corpusNames = publicTags.map((tag) => {
    return context.languages.get(tag as PublicLanguageTag)!.corpusName;
  });

  const corpusFallback = input.langfb
    ? context.languages.get(input.langfb as PublicLanguageTag)?.corpusName
    : undefined;

  return {
    publicTags,
    corpusNames,
    publicFallback: input.langfb as PublicLanguageTag | undefined,
    corpusFallback,
    toPublic: invertLanguageMap(),
    toCorpus: languageMap()
  };
}
```

Orthography profile parser:

```ts
type TextOrthographyProfile = 'source' | 'version';

function resolveOrthographyProfile(value: string): TextOrthographyProfile {
  if (value === 'source' || value === 'version') return value;
  throw invalidQueryValue('orthography', 'Expected "source" or "version".');
}
```

Text adapter:

```ts
function adaptRunForPublicText(input: {
  run: ComposedRun;
  profile: TextOrthographyProfile;
  version: VersionHandle;
  language: CorpusLanguageName;
}): ComposedRunDto {
  if (input.run.type !== 'text' && input.run.type !== 'rubric') {
    return toComposedRunDto(input.run);
  }

  if (input.profile === 'source') {
    return { type: input.run.type, value: input.run.value };
  }

  return {
    type: input.run.type,
    value: applyTextOrthographyProfile({
      value: input.run.value,
      version: input.version,
      language: input.language
    })
  };
}
```

The first implementation should cover the legacy Roman Latin display profile
already proven in upstream Perl:

- for `Rubrics 1960 - ...` Latin / Latin-Bea display, apply `Jj -> Ii` to
  text outside markup-like spans, with upstream's narrow corrections
  (`H-Iesu -> H-Jesu`, `er eúmdem -> er eúndem`);
- leave `Latin-gabc` unchanged, because upstream explicitly avoids the spelling
  pass for chant notation;
- keep non-Roman / Cistercian substitutions out of v1 until those policy
  families are supported by the API.

DTO adapter:

```ts
function toPublicComposedHour(
  composed: ComposedHour,
  selection: LanguageSelection,
  orthography: TextOrthographyProfile,
  version: VersionHandle
): PublicComposedHourDto {
  return {
    date: composed.date,
    hour: composed.hour,
    celebration: composed.celebration,
    languages: selection.publicTags,
    orthography,
    warnings: composed.warnings.map(toComposeWarningDto),
    sections: composed.sections.map((section) => ({
      type: section.type,
      slot: section.slot,
      reference: section.reference,
      heading: section.heading,
      languages: section.languages.map((lang) => selection.toPublic.get(lang)!),
      lines: section.lines.map((line) => ({
        marker: line.marker,
        texts: remapAndAdaptTextKeys(line.texts, {
          toPublic: selection.toPublic,
          orthography,
          version
        })
      }))
    }))
  };
}
```

## 8. Version Registry Details

Implement explicit classification. Do not derive support from `VERSION_POLICY` alone.

```ts
const SUPPORTED_OFFICE_HANDLES = new Set<VersionHandle>([
  asVersionHandle('Divino Afflatu - 1939'),
  asVersionHandle('Divino Afflatu - 1954'),
  asVersionHandle('Reduced - 1955'),
  asVersionHandle('Rubrics 1960 - 1960'),
  asVersionHandle('Rubrics 1960 - 2020 USA')
]);

const DEFERRED_OFFICE_HANDLES = new Set<VersionHandle>([
  asVersionHandle('Tridentine - 1570'),
  asVersionHandle('Tridentine - 1888'),
  asVersionHandle('Tridentine - 1906'),
  asVersionHandle('Monastic Tridentinum 1617'),
  asVersionHandle('Monastic Divino 1930'),
  asVersionHandle('Monastic - 1963'),
  asVersionHandle('Monastic - 1963 - Barroux'),
  asVersionHandle('Monastic Tridentinum Cisterciensis 1951'),
  asVersionHandle('Monastic Tridentinum Cisterciensis Altovadensis'),
  asVersionHandle('Ordo Praedicatorum - 1962')
]);
```

For each supported handle, instantiate an engine at startup:

```ts
function buildSupportedVersionEntry(handle: VersionHandle): ApiVersionEntry {
  const engine = createRubricalEngine({
    corpus,
    kalendarium,
    yearTransfers,
    scriptureTransfers,
    versionRegistry,
    version: handle
  });

  return {
    handle,
    status: 'supported',
    policyName: engine.version.policy.name,
    descriptor: describeVersion(engine.version),
    aliases: aliasesFor(handle),
    engine
  };
}
```

For deferred handles, do not instantiate engines unless you deliberately want to verify the stub at startup. Safer: list them as deferred and return `501` when requested.

For missa-only handles and alias hints, expose them in `/versions` as `missa-only` with `hint` where available. `MISSA_ALIAS_HINTS` maps short Mass-side identifiers such as `"Rubrics 1960"` to canonical Breviary handles such as `"Rubrics 1960 - 1960"`.

## 9. Caching

The modernization spec says responses are deterministic and should use aggressive HTTP caching.

Use canonicalization so semantically equivalent requests produce the same cache key.

Canonical office key:

```ts
interface CanonicalOfficeKey {
  route: 'office';
  apiVersion: 'v1';
  date: string;
  hour: HourName;
  version: VersionHandle;
  languages: PublicLanguageTag[];
  langfb?: PublicLanguageTag;
  orthography: TextOrthographyProfile;
  joinLaudsToMatins: boolean;
  strict: boolean;
  contentVersion: string;
}
```

Headers:

```http
Cache-Control: public, max-age=86400, stale-while-revalidate=604800
ETag: "v1:{contentVersion}:{requestHash}:{bodyHash}"
```

Do not include `Vary: Accept` unless content negotiation is actually implemented.

Support conditional requests:

```ts
if (request.headers['if-none-match'] === etag) {
  reply.code(304).send();
}
```

Use `contentVersion` based on:

```ts
{
  appVersion,
  gitCommit,
  upstreamSubmoduleSha,
  parserPackageVersion,
  rubricalEnginePackageVersion,
  compositorPackageVersion
}
```

No `Date.now()` in deterministic response bodies.

## 10. OpenAPI / Schema Policy

Every route should have:

1. params schema,
2. query schema,
3. response schema,
4. error response schema.

Example office route registration:

```ts
fastify.get(
  '/api/v1/office/:date/:hour',
  {
    schema: {
      params: OfficeParamsSchema,
      querystring: OfficeQuerySchema,
      response: {
        200: OfficeHourResponseSchema,
        400: ApiErrorSchema,
        422: ApiErrorSchema,
        501: ApiErrorSchema,
        500: ApiErrorSchema
      }
    }
  },
  officeHandler
);
```

This keeps OpenAPI honest. The contract should not live in prose alone; prose is where bugs go to hide wearing a hat.

## 11. Sub-phase Plan

### 4a — API design doc and ADR

Deliverables:

```txt
docs/phase-4-api-design.md
docs/adr/014-http-api-version-language-contract.md
```

ADR-014 should cover:

1. `version` is canonical.
2. `rubrics` is compatibility-only.
3. public language tags map to corpus language names.
4. internal `ResolvedVersion`, external `VersionDescriptor`.
5. version status model: `supported`, `deferred`, `missa-only`.
6. unsupported/deferred policies return `501`.
7. missa-only handles return `422` with hints.
8. `strict=true` composition errors return `422`.
9. `orthography` is an explicit DTO adapter option, defaulting to `version`.
10. API DTOs are adapter-backed and do not expose raw compositor output.

Acceptance criteria:

- Design doc contains endpoint list, DTOs, error model, cache model, version model, language model, and orthography profile model.
- ADR explicitly references ADR-001 and ADR-009.
- No route implementation required yet.

### 4b — API scaffold and metadata endpoints

Deliverables:

```txt
packages/api/
packages/api/src/app.ts
packages/api/src/context.ts
packages/api/src/routes/metadata.ts
packages/api/src/routes/openapi.ts
packages/api/src/services/version-registry.ts
packages/api/src/services/language-map.ts
packages/api/src/services/orthography-profile.ts
packages/api/src/services/errors.ts
```

Implement:

1. Fastify app factory.
2. Server entrypoint.
3. Config loader.
4. Context builder.
5. Error serializer.
6. OpenAPI generation.
7. `/api/v1/status`.
8. `/api/v1/versions`.
9. `/api/v1/languages`.

Acceptance criteria:

- `pnpm -C packages/api test` passes.
- `pnpm -C packages/api typecheck` passes.
- `/versions` clearly separates supported, deferred, and missa-only handles.
- `/languages` exposes `la` and `en`, while preserving the internal corpus-name mapping.
- No office composition route yet.

### 4c — Office endpoint

Deliverables:

```txt
packages/api/src/routes/office.ts
packages/api/src/services/compose-office.ts
packages/api/src/services/dto.ts
```

Implement:

```http
GET /api/v1/office/{date}/{hour}
```

Support:

```txt
version
rubrics
lang
langfb
orthography
joinLaudsToMatins
strict
```

Route responsibilities:

1. Validate ISO date.
2. Validate `HourName`.
3. Resolve canonical version.
4. Reject deferred/missa-only versions with correct errors.
5. Resolve public languages to corpus names.
6. Resolve text orthography profile.
7. Call `engine.resolveDayOfficeSummary(date)`.
8. Call `composeHour(...)`.
9. Apply `strict=true`.
10. Adapt native compositor output into public-language DTO.
11. Return `OfficeHourResponse`.

Acceptance criteria:

- Works for all eight hours.
- Works for `la`, `en`, and `la,en`.
- `lang=la,en` produces public keys `la` and `en`, not `Latin` and `English`.
- `rubrics=1960` normalizes to `"Rubrics 1960 - 1960"`.
- `strict=true` returns `422` when any composition warning has severity `error`.
- `orthography=version` adapts eligible Latin text/rubric runs without rewriting citations or metadata.
- `orthography=source` preserves canonical source spelling in public text.
- Composition warnings remain visible.

### 4d — Cache canonicalization and ETags

Deliverables:

```txt
packages/api/src/services/cache.ts
packages/api/test/cache.test.ts
```

Implement:

1. Canonical request key builder.
2. Stable JSON hash.
3. ETag builder.
4. Cache-Control headers.
5. `If-None-Match` support.
6. Canonical path metadata.

Acceptance criteria:

- Equivalent query ordering produces same ETag.
- Different language order produces different ETag, because `la,en` and `en,la` are display-distinct.
- Different `orthography` values produce different ETags, because `source` and `version` can be text-distinct.
- Content version changes produce different ETags.
- No `generatedAt` in deterministic response bodies.

### 4e — Day bundle endpoint

Deliverables:

```txt
packages/api/src/routes/day.ts
```

Implement:

```http
GET /api/v1/days/{date}
```

Support:

```txt
version
rubrics
lang
langfb
orthography
hours
strict
```

Acceptance criteria:

- Resolves day summary once.
- Composes selected hours.
- Supports `hours=all`.
- Top-level warnings include rubrical warnings and per-hour composition warnings.
- Strict mode fails if any selected hour has error-level composition warnings.

### 4f — Calendar month endpoint

Deliverables:

```txt
packages/api/src/routes/calendar.ts
```

Implement:

```http
GET /api/v1/calendar/{year}/{month}
```

Route responsibilities:

1. Validate year/month.
2. Resolve version.
3. Resolve each day of the month through the engine.
4. Return summary DTOs only.
5. Do not compose hour text.

Acceptance criteria:

- Month length is correct, including leap years.
- Celebration has no fake `color`.
- Commemoration `color` passes through when present.
- Deferred/missa-only version behavior matches office endpoint.

### 4g — Contract tests and release gate

Test matrix:

```txt
13 canonical dates
× 5 supported Roman Breviary handles if practical
× 8 hours
× at least Latin
```

At minimum, match the current supported Roman policy matrix:

```txt
Divino Afflatu
Reduced 1955
Rubrics 1960
× 13 dates
× 8 hours
```

Negative tests:

```txt
invalid date
invalid hour
missing version
unknown version
deferred version
missa-only version with hint
missa-only version without hint
invalid language
strict=true composition error
unsupported calendar month
```

Acceptance criteria:

- `pnpm -r typecheck` passes.
- `pnpm -r test` passes.
- API route tests pass.
- OpenAPI JSON validates.
- No route returns raw internal language keys.
- No route returns unserializable `ResolvedVersion.policy`.
- No endpoint invents celebration color.
- All deterministic endpoints emit cache headers and stable ETags.

## 12. Suggested Implementation Order Inside Each Sub-phase

The most efficient order is:

```txt
1. Write ADR/design doc.
2. Add package scaffold.
3. Build error model.
4. Build language map.
5. Build version registry.
6. Ship metadata endpoints.
7. Ship office endpoint.
8. Add DTO adapter tests.
9. Add cache service.
10. Add day endpoint.
11. Add calendar endpoint.
12. Add contract tests.
```

Do not start with calendar. The office route needs version and language validators anyway, so metadata first is cleaner.

## 13. Key Risks and Mitigations

### Risk: Phase 3 shape changes during 3h

Mitigation: public DTO adapters, not direct raw type exposure.

### Risk: language-name leakage

Mitigation: language-map tests that fail if `"Latin"` or `"English"` appears as a response language key.

### Risk: hidden source-text mutation through display spelling

Mitigation: keep `orthography=source` as a tested escape hatch, apply the
version profile only in DTO text/rubric run adaptation, and add tests proving
citations, references, warning payloads, and canonical corpus text are unchanged.

### Risk: accidental support for deferred families

Mitigation: explicit version classification table, not inference from `VERSION_POLICY`.

### Risk: missa-only handles get treated as unknown

Mitigation: import and surface `MISSA_ALIAS_HINTS` and `MISSA_ONLY_HANDLES` in version classification.

### Risk: cache pollution

Mitigation: canonical query normalization and `contentVersion` in the ETag.

### Risk: public API freezes too early

Mitigation: document that public v1 stability begins at Phase 4 release, not at 4a design-doc time.

## 14. Final Phase 4 Scope

### In scope

```txt
Read-only JSON API
Fastify package
OpenAPI docs
Office hour endpoint
Day bundle endpoint
Calendar month endpoint
Version metadata
Language metadata
Status endpoint
Error model
Cache headers + ETags
Contract tests
```

### Out of scope

```txt
Frontend rendering
HTML output
PDF / EPUB
Authentication
Database
Write APIs
User preferences
Search
Missal/Mass composition
Invented day colors
Non-Roman policy implementation
```

## 15. Bottom Line

Phase 4 should ship as a modest, disciplined API package:

```txt
Parser-resolved TextIndex
→ RubricalEngine.resolveDayOfficeSummary(date)
→ composeHour(...)
→ public DTO adapter
→ deterministic JSON + cache headers
```

The big design calls are settled:

```txt
canonical version, not rubrics
public language tags mapped to corpus names
ResolvedVersion inside, VersionDescriptor outside
supported/deferred/missa-only version statuses
ComposedHour-shaped DTO, not raw type leakage
no fake celebration color
metadata before calendar
422 for strict composition errors
501 for deferred policies
```

That gives the frontend a stable contract without letting Phase 4 become a second liturgical engine.

## Source References

- Repository: <https://github.com/miggalvez/officium-novum>
- README: <https://github.com/miggalvez/officium-novum/blob/main/README.md>
- Modernization spec: <https://github.com/miggalvez/officium-novum/blob/main/docs/divinum-officium-modernization-spec.md>
- ADR-001: <https://github.com/miggalvez/officium-novum/blob/main/docs/adr/001-version-handle-primary-binding.md>
- ADR-009: <https://github.com/miggalvez/officium-novum/blob/main/docs/adr/009-compositor-resolved-corpus-and-deferred-nodes.md>
- Compositor types: <https://github.com/miggalvez/officium-novum/blob/main/packages/compositor/src/types/composed-hour.ts>
- Compositor compose surface: <https://github.com/miggalvez/officium-novum/blob/main/packages/compositor/src/compose.ts>
- Rubrical engine model types: <https://github.com/miggalvez/officium-novum/blob/main/packages/rubrical-engine/src/types/model.ts>
- Rubrical policy types: <https://github.com/miggalvez/officium-novum/blob/main/packages/rubrical-engine/src/types/policy.ts>
- Ordo types: <https://github.com/miggalvez/officium-novum/blob/main/packages/rubrical-engine/src/types/ordo.ts>
- Version policy map: <https://github.com/miggalvez/officium-novum/blob/main/packages/rubrical-engine/src/version/policy-map.ts>
- Version resolver: <https://github.com/miggalvez/officium-novum/blob/main/packages/rubrical-engine/src/version/resolver.ts>
