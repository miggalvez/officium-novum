import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { PublicComposedHourDto } from '../api/types';
import { OfficeRenderer } from '../features/office/OfficeRenderer';
import { LineRenderer } from '../features/office/LineRenderer';
import { RunRenderer } from '../features/office/RunRenderer';

const sampleOffice: PublicComposedHourDto = {
  date: '2026-04-28',
  hour: 'lauds',
  celebration: 'Sample feast',
  languages: ['la', 'en'],
  orthography: 'version',
  warnings: [],
  sections: [
    {
      type: 'invitatorium',
      slot: 'opening',
      languages: ['la', 'en'],
      lines: [
        {
          marker: 'V.',
          texts: {
            la: [{ type: 'text', value: 'Deus, in adjutórium meum inténde.' }],
            en: [{ type: 'text', value: 'O God, come to my aid.' }]
          }
        }
      ]
    },
    {
      type: 'rubric',
      slot: 'incipit',
      languages: ['la', 'en'],
      lines: [
        {
          texts: {
            la: [
              {
                type: 'rubric',
                value: 'Hic genuflectitur.'
              }
            ],
            en: [{ type: 'rubric', value: 'Here all genuflect.' }]
          }
        }
      ]
    }
  ]
};

describe('OfficeRenderer', () => {
  it('preserves the order of sections from the API', () => {
    const { container } = render(
      <OfficeRenderer
        office={sampleOffice}
        languages={['la', 'en']}
        displayMode="parallel"
        reviewerMode={false}
      />
    );
    const sections = container.querySelectorAll('.office__section');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.textContent).toContain('Deus');
    expect(sections[1]?.textContent).toContain('genuflect');
  });

  it('renders both Latin and English in parallel mode', () => {
    render(
      <OfficeRenderer
        office={sampleOffice}
        languages={['la', 'en']}
        displayMode="parallel"
        reviewerMode={false}
      />
    );
    expect(screen.getByText(/Deus, in adjut/i)).toBeInTheDocument();
    expect(screen.getByText(/come to my aid/i)).toBeInTheDocument();
  });

  it('renders only Latin when only la is requested', () => {
    render(
      <OfficeRenderer
        office={sampleOffice}
        languages={['la']}
        displayMode="parallel"
        reviewerMode={false}
      />
    );
    expect(screen.getByText(/Deus, in adjut/i)).toBeInTheDocument();
    expect(screen.queryByText(/come to my aid/i)).not.toBeInTheDocument();
  });

  it('shows reviewer metadata only when reviewerMode is on', () => {
    const { rerender, container } = render(
      <OfficeRenderer
        office={sampleOffice}
        languages={['la']}
        displayMode="parallel"
        reviewerMode={false}
      />
    );
    expect(container.querySelector('.reviewer-meta')).toBeNull();
    rerender(
      <OfficeRenderer
        office={sampleOffice}
        languages={['la']}
        displayMode="parallel"
        reviewerMode={true}
      />
    );
    expect(container.querySelector('.reviewer-meta')).not.toBeNull();
  });

  it('marks rubrics with a distinct CSS class so they are visually distinguished', () => {
    const { container } = render(
      <OfficeRenderer
        office={sampleOffice}
        languages={['la', 'en']}
        displayMode="parallel"
        reviewerMode={false}
      />
    );
    const rubrics = container.querySelectorAll('.run-rubric');
    expect(rubrics.length).toBeGreaterThan(0);
  });
});

describe('LineRenderer', () => {
  it('switches to single-cell rendering when only one language is visible', () => {
    const { container } = render(
      <LineRenderer
	        line={{ marker: 'R.', texts: { la: [{ type: 'text', value: 'Amen.' }] } }}
	        languages={['la']}
	        displayMode="parallel"
	        reviewerMode={false}
	      />
    );
    const line = container.querySelector('.office__line');
    expect(line?.getAttribute('data-mode')).toBe('single');
  });

  it('renders the marker once per line', () => {
    render(
      <LineRenderer
        line={{
          marker: 'V.',
          texts: {
            la: [{ type: 'text', value: 'Foo' }],
            en: [{ type: 'text', value: 'Bar' }]
          }
        }}
	        languages={['la', 'en']}
	        displayMode="parallel"
	        reviewerMode={false}
	      />
    );
    const markers = screen.getAllByText('℣.');
    expect(markers.length).toBeGreaterThan(0);
  });
});

describe('RunRenderer', () => {
  it('does not use innerHTML for any run type', () => {
    const cases = [
      { type: 'text', value: '<script>alert(1)</script>' },
      { type: 'rubric', value: '<b>x</b>' },
      { type: 'citation', value: '<i>y</i>' }
    ] as const;
    for (const run of cases) {
	      const { container, unmount } = render(<RunRenderer run={run} reviewerMode={false} />);
      expect(container.innerHTML).not.toContain('<script>');
      expect(container.innerHTML).not.toContain('<b>');
      expect(container.innerHTML).not.toContain('<i>');
      const found = within(container).getByText(run.value);
      expect(found).toBeInTheDocument();
      unmount();
    }
  });

	  it('renders unresolved-macro as a reviewer-mode warning chip', () => {
	    const { container } = render(
	      <RunRenderer run={{ type: 'unresolved-macro', name: 'foo' }} reviewerMode={true} />
	    );
	    expect(container.querySelector('.run-unresolved')).not.toBeNull();
	  });

	  it('hides unresolved internal chips outside reviewer mode', () => {
	    const { container } = render(
	      <RunRenderer run={{ type: 'unresolved-macro', name: 'foo' }} reviewerMode={false} />
	    );
	    expect(container.querySelector('.run-unresolved')).toBeNull();
	  });
	});
