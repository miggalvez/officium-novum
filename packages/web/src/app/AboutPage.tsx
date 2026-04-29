import { apiDocsUrl, openApiUrl } from '../api/client';

export function AboutPage(): JSX.Element {
  return (
    <article>
      <h1>About this demo</h1>
      <p>
        This site is a hosted beta of <strong>Officium Novum</strong>, a modernization of the
        Divinum Officium project. It displays the traditional Roman Breviary Office produced by
        the Officium Novum API.
      </p>
      <p>
        The demo is a pure consumer of the public API — it does not invent liturgical logic,
        compose text in the browser, or ship its own calendar. If you find an issue with the
        rendered Office, please use the <strong>Report this</strong> button on the relevant page.
      </p>

      <h2>Limitations</h2>
      <ul>
        <li>Currently supports the three Roman policies: Divino Afflatu (1911), Reduced (1955), and Rubrics 1960.</li>
        <li>Languages: Latin and English. Translations follow the corpus rather than a new translation effort.</li>
        <li>No accounts, tracking, or analytics. Settings are stored in your browser only.</li>
        <li>Mass / Missal composition is out of scope for this demo.</li>
      </ul>

      <h2>API</h2>
      <p>
        See the <a href={apiDocsUrl()}>API docs</a> or the
        {' '}<a href={openApiUrl()}>OpenAPI document</a>.
      </p>
    </article>
  );
}

export function NotFoundPage(): JSX.Element {
  return (
    <article>
      <h1>Page not found</h1>
      <p>
        That route does not look like a valid Office, day, or calendar URL. Try choosing a date and
        Hour from the navigation above.
      </p>
    </article>
  );
}

export function ApiPage(): JSX.Element {
  return (
    <article>
      <h1>API</h1>
      <ul>
        <li>
          <a href={apiDocsUrl()}>Interactive API docs</a>
        </li>
        <li>
          <a href={openApiUrl()}>OpenAPI document</a>
        </li>
      </ul>
    </article>
  );
}
