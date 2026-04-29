export interface RawJsonLinkProps {
  readonly href: string;
  readonly label?: string;
}

export function RawJsonLink({ href, label = 'Raw API response' }: RawJsonLinkProps): JSX.Element {
  return (
    <a className="button button--ghost" href={href} target="_blank" rel="noreferrer noopener">
      {label}
    </a>
  );
}
