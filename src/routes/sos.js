import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { sosService } from '../services/sos.js';
import { SosSchema } from '../schemas.js'; 

const sosRouter = new OpenAPIHono();

// Protège toutes les routes
sosRouter.use('*', authMiddleware);

// GET ALL
sosRouter.openapi({
  method: 'get',
  path: '/',
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.array(SosSchema) } } } }
}, async (c) => {
  return c.json(await sosService.getAll(), 200);
});

// GET BY ID
sosRouter.openapi({
  method: 'get',
  path: '/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: SosSchema } } } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const item = await sosService.getById(id);
  if (!item) return c.json({ erreur: 'Non trouvé' }, 404);
  return c.json(item, 200);
});

// POST
sosRouter.openapi({
  method: 'post',
  path: '/',
  security: [{ Bearer: [] }],
  request: { body: { content: { 'application/json': { schema: SosSchema.omit({ id: true }) } } } },
  responses: { 201: { content: { 'application/json': { schema: SosSchema } } } }
}, async (c) => {
  const data = c.req.valid('json');
  return c.json(await sosService.create(data), 201);
});

// PATCH
sosRouter.openapi({
  method: 'patch',
  path: '/{id}',
  request: { 
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: SosSchema.partial() } } }
  },
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: SosSchema } } } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');
  const updated = await sosService.update(id, data);
  if (!updated) return c.json({ erreur: 'Non trouvé' }, 404);
  return c.json(updated, 200);
});

// DELETE
sosRouter.openapi({
  method: 'delete',
  path: '/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: { 204: { description: 'Supprimé' } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const deleted = await sosService.delete(id);
  if (!deleted) return c.json({ erreur: 'Non trouvé' }, 404);
  return c.body(null, 204);
});

export { sosRouter };