import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { adminsService } from '../services/admins.js';
import { AdminSchema } from '../schemas.js';

const adminsRouter = new OpenAPIHono();
adminsRouter.use('*', authMiddleware);

// GET ALL (Liste des admins)
adminsRouter.openapi({
  method: 'get',
  path: '/',
   tags: ['Admins'],
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.array(AdminSchema) } } } }
}, async (c) => {
  return c.json(await adminsService.getAll(), 200);
});

// GET BY ID
adminsRouter.openapi({
  method: 'get',
  path: '/{id}',
   tags: ['Admins'],
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: { 200: { content: { 'application/json': { schema: AdminSchema } } } }
}, async (c) => {
  const { id } = c.req.valid('param');
  const admin = await adminsService.getById(id);
  if (!admin) return c.json({ erreur: 'Admin non trouvé' }, 404);
  return c.json(admin, 200);
});


export { adminsRouter };