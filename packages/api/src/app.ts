import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import type { ApiConfig } from './config.js';
import type { ApiContext } from './context.js';
import { registerErrorHandler } from './services/errors.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerDayRoutes } from './routes/day.js';
import { registerMetadataRoutes } from './routes/metadata.js';
import { registerOfficeRoutes } from './routes/office.js';
import { registerOpenApiRoutes } from './routes/openapi.js';

export interface CreateAppOptions {
  readonly context: ApiContext;
  readonly config?: Pick<ApiConfig, 'logger'>;
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.config?.logger ?? false
  });

  app.decorate('apiContext', options.context);
  registerErrorHandler(app);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Officium Novum API',
        version: '0.1.0'
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/v1/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  await registerMetadataRoutes(app);
  await registerOfficeRoutes(app);
  await registerDayRoutes(app);
  await registerCalendarRoutes(app);
  await registerOpenApiRoutes(app);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    apiContext: ApiContext;
  }
}
