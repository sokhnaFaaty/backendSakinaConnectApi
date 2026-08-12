import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { hotelsService } from '../services/hotels.js';
import { HotelSchema } from '../schemas.js';

export const hotelsRouter = new OpenAPIHono();

// Protection de TOUTES les routes de ce routeur
hotelsRouter.use('*', authMiddleware);

// ---- GET ALL ----
hotelsRouter.openapi(
  {
    method: 'get',
    path: '/', // Chemin relatif, le routeur sera monté sur /hotels
    security: [{ Bearer: [] }],
    responses: { 
      200: { 
        description: 'Liste des hôtels', 
        content: { 'application/json': { schema: z.array(HotelSchema) } } 
      } 
    },
  },
  async (c) => {
    const hotels = await hotelsService.getAll();
    return c.json(hotels, 200);
  }
);

// ---- GET BY ID ----
hotelsRouter.openapi(
  {
    method: 'get',
    path: '/{id}',
    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: { 
      200: { 
        description: 'Détail d\'un hôtel', 
        content: { 'application/json': { schema: HotelSchema } } 
      },
      404: { description: 'Hôtel non trouvé' }
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const hotel = await hotelsService.getById(id);
    if (!hotel) return c.json({ erreur: 'Hôtel non trouvé' }, 404);
    return c.json(hotel, 200);
  }
);

// ---- POST ----
hotelsRouter.openapi(
  {
    method: 'post',
    path: '/',
    security: [{ Bearer: [] }],
    request: { body: { content: { 'application/json': { schema: HotelSchema.omit({ id: true }) } } } },
    responses: { 
      201: { 
        description: 'Hôtel créé', 
        content: { 'application/json': { schema: HotelSchema } } 
      } 
    },
  },
  async (c) => {
    const data = c.req.valid('json');
    const newHotel = await hotelsService.create(data);
    return c.json(newHotel, 201);
  }
);

// ---- PATCH ----
hotelsRouter.openapi(
  {
    method: 'patch',
    path: '/{id}',
    security: [{ Bearer: [] }],
    request: { 
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: HotelSchema.partial() } } }
    },
    responses: { 
      200: { 
        description: 'Hôtel modifié', 
        content: { 'application/json': { schema: HotelSchema } } 
      },
      404: { description: 'Hôtel non trouvé' }
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const updated = await hotelsService.update(id, data);
    if (!updated) return c.json({ erreur: 'Hôtel non trouvé' }, 404);
    return c.json(updated, 200);
  }
);

// ---- DELETE (FINI) ----
hotelsRouter.openapi(
  {
    method: 'delete',
    path: '/{id}',
    security: [{ Bearer: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: 'Hôtel supprimé avec succès (aucun contenu)' },
      404: { description: 'Hôtel non trouvé' }
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await hotelsService.delete(id);
    if (!deleted) return c.json({ erreur: 'Hôtel non trouvé' }, 404);
    return c.body(null, 204); // 204 No Content
  }
);