import type { FastifyInstance } from 'fastify';

export async function registerOpenApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/openapi.json', {
    schema: {
      hide: true
    }
  }, async () => app.swagger());
}
