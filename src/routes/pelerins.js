import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { pelerinsService } from '../services/pelerins.js';
import { PelerinSchema, IdParamSchema, ErreurSchema } from '../schemas.js';

const pelerinsRouter = new OpenAPIHono();

// Protège toutes les routes
pelerinsRouter.use('*', authMiddleware);

// ---- GET ALL (avec filtre ?groupeId=) ----
pelerinsRouter.openapi(
  {
    method: 'get',
    path: '/',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Liste des pèlerins',
        content: { 'application/json': { schema: z.array(PelerinSchema) } },
      },
    },
  },
  async (c) => {
    const groupeId = c.req.query('groupeId');
    if (groupeId) {
      const data = await pelerinsService.findByGroupeId(groupeId);
      return c.json(data, 200);
    }

    const utilisateurId = c.req.query('utilisateurId');
    if (utilisateurId) {
      const data = await pelerinsService.findByUtilisateurId(utilisateurId);
      return c.json(data, 200);
    }

    const data = await pelerinsService.getAll();
    return c.json(data, 200);
  }
);

// ---- GET BY ID ----
pelerinsRouter.openapi(
  {
    method: 'get',
    path: '/{id}',
    request: { params: IdParamSchema },
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Détails du pèlerin',
        content: { 'application/json': { schema: PelerinSchema } },
      },
      404: {
        description: 'Pèlerin non trouvé',
        content: { 'application/json': { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const pelerin = await pelerinsService.getById(id);
    if (!pelerin) return c.json({ erreur: 'Pèlerin introuvable' }, 404);
    return c.json(pelerin, 200);
  }
);

// ---- POST (Création) ----
pelerinsRouter.openapi(
  {
    method: 'post',
    path: '/',
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            // Schéma pour la création (on omet l'id généré automatiquement)
            schema: PelerinSchema.omit({ id: true }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Pèlerin créé avec succès',
        content: { 'application/json': { schema: PelerinSchema } },
      },
      400: {
        description: 'Données invalides',
        content: { 'application/json': { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    try {
      const body = c.req.valid('json'); // Validation automatique via Zod
      const result = await pelerinsService.create(body);
      return c.json(result, 201);
    } catch (error) {
      return c.json({ erreur: 'Erreur lors de la création' }, 400);
    }
  }
);

// ---- PATCH (Mise à jour partielle) ----
pelerinsRouter.openapi(
  {
    method: 'patch',
    path: '/{id}',
    request: {
      params: IdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: PelerinSchema.partial(), // Tous les champs sont optionnels
          },
        },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Pèlerin mis à jour',
        content: { 'application/json': { schema: PelerinSchema } },
      },
      404: {
        description: 'Pèlerin non trouvé',
        content: { 'application/json': { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = await pelerinsService.update(id, body);
    if (!updated) return c.json({ erreur: 'Pèlerin introuvable' }, 404);
    return c.json(updated, 200);
  }
);

// ---- DELETE ----
pelerinsRouter.openapi(
  {
    method: 'delete',
    path: '/{id}',
    request: { params: IdParamSchema },
    security: [{ Bearer: [] }],
    responses: {
      204: { description: 'Pèlerin supprimé (aucun contenu)' },
      404: {
        description: 'Pèlerin non trouvé',
        content: { 'application/json': { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await pelerinsService.delete(id);
    if (!deleted) return c.json({ erreur: 'Pèlerin introuvable' }, 404);
    return c.body(null, 204); // 204 No Content
  }
);

export { pelerinsRouter };