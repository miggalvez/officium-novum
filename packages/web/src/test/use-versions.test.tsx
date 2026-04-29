import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { _resetVersionCache, useLanguagesMetadata, useVersions } from '../features/settings/use-versions';
import { getLanguages, getVersions } from '../api/client';

vi.mock('../api/client', () => ({
  getVersions: vi.fn(),
  getLanguages: vi.fn()
}));

const mockedGetVersions = vi.mocked(getVersions);
const mockedGetLanguages = vi.mocked(getLanguages);

beforeEach(() => {
  _resetVersionCache();
  mockedGetVersions.mockReset();
  mockedGetLanguages.mockReset();
});

describe('metadata hooks', () => {
  it('retries versions after an initial request failure', async () => {
    mockedGetVersions
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({
        kind: 'versions',
        apiVersion: 'v1',
        defaultVersion: 'Rubrics 1960 - 1960',
        versions: [{ handle: 'Rubrics 1960 - 1960', status: 'supported', aliases: [] }]
      });

    const first = render(<VersionsProbe />);
    await waitFor(() => expect(mockedGetVersions).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<VersionsProbe />);
    await screen.findByText('Rubrics 1960 - 1960');
    expect(mockedGetVersions).toHaveBeenCalledTimes(2);
  });

  it('retries languages after an initial request failure', async () => {
    mockedGetLanguages
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({
        kind: 'languages',
        apiVersion: 'v1',
        languages: [{ tag: 'la', corpusName: 'Latin', label: 'Latin' }]
      });

    const first = render(<LanguagesProbe />);
    await waitFor(() => expect(mockedGetLanguages).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<LanguagesProbe />);
    await screen.findByText('Latin');
    expect(mockedGetLanguages).toHaveBeenCalledTimes(2);
  });
});

function VersionsProbe(): JSX.Element {
  const versions = useVersions();
  return <div>{versions.map((version) => version.handle).join(',')}</div>;
}

function LanguagesProbe(): JSX.Element {
  const languages = useLanguagesMetadata();
  return <div>{languages.map((language) => language.label).join(',')}</div>;
}
