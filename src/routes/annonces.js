import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { annoncesService } from '../services/annonces.js';
import { AnnonceSchema } from '../schemas.js'; 

const annoncesRouter = new OpenAPIHono();

// Protège toutes les routes
annoncesRouter.use('*', authMiddleware);

// GET ALL
annoncesRouter.openapi({
  method: 'get',
  path: '/',
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.array(AnnonceSchema) } } } }
}, async (c) => {
  return c.json(await annoncesService.getAll(), 200);
});

// GET BY ID
annoncesRouter.openapi({
  method: 'get',
  path: '/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: AnnonceSchema } } } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const item = await annoncesService.getById(id);
  if (!item) return c.json({ erreur: 'Non trouvé' }, 404);
  return c.json(item, 200);
});

// POST
annoncesRouter.openapi({
  method: 'post',
  path: '/',
  security: [{ Bearer: [] }],
  request: { body: { content: { 'application/json': { schema: AnnonceSchema.omit({ id: true }) } } } },
  responses: { 201: { content: { 'application/json': { schema: AnnonceSchema } } } }
}, async (c) => {
  const data = c.req.valid('json');
  return c.json(await annoncesService.create(data), 201);
});

// PATCH
annoncesRouter.openapi({
  method: 'patch',
  path: '/{id}',
  request: { 
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: AnnonceSchema.partial() } } }
  },
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: AnnonceSchema } } } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');
  const updated = await annoncesService.update(id, data);
  if (!updated) return c.json({ erreur: 'Non trouvé' }, 404);
  return c.json(updated, 200);
});

// DELETE
annoncesRouter.openapi({
  method: 'delete',
  path: '/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: { 204: { description: 'Supprimé' } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const deleted = await annoncesService.delete(id);
  if (!deleted) return c.json({ erreur: 'Non trouvé' }, 404);
  return c.body(null, 204);
});

export { annoncesRouter };