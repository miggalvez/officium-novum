import { createApp } from './app.js';
import { loadApiConfig } from './config.js';
import { buildApiContext } from './context.js';

async function main(): Promise<void> {
  const config = loadApiConfig();
  const context = await buildApiContext(config);
  const app = await createApp({ context, config });

  await app.listen({
    host: config.host,
    port: config.port
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
