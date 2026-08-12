import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { utilisateursService } from '../services/utilisateurs.js';
import { UtilisateurPublicSchema, UtilisateurCreationSchema, ErreurSchema } from '../schemas.js';

const utilisateursRouter = new OpenAPIHono();

// Protège toutes les routes
utilisateursRouter.use('*', authMiddleware);

// ---- GET ALL ----
utilisateursRouter.openapi({
  method: 'get',
  path: '/',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      description: 'Liste des utilisateurs',
      content: { 'application/json': { schema: z.array(UtilisateurPublicSchema) } }
    }
  }
}, async (c) => {
  return c.json(await utilisateursService.getAll(), 200);
});

// ---- GET BY ID ----
utilisateursRouter.openapi({
  method: 'get',
  path: '/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: {
    200: {
      description: 'Détails de l\'utilisateur',
      content: { 'application/json': { schema: UtilisateurPublicSchema } }
    },
    404: {
      description: 'Utilisateur non trouvé',
      content: { 'application/json': { schema: ErreurSchema } }
    }
  }
}, async (c) => {
  const { id } = c.req.valid('param');
  const user = await utilisateursService.getById(id);
  if (!user) return c.json({ erreur: 'Utilisateur introuvable' }, 404);
  return c.json(user, 200);
});

// ---- POST (Création) ----
utilisateursRouter.openapi({
  method: 'post',
  path: '/',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: UtilisateurCreationSchema // Contient motDePasse
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Utilisateur créé avec succès',
      content: { 'application/json': { schema: UtilisateurPublicSchema } }
    },
    400: {
      description: 'Données invalides',
      content: { 'application/json': { schema: ErreurSchema } }
    }
  }
}, async (c) => {
  try {
    const body = c.req.valid('json');
    // Le service utilisateur hashe le mot de passe automatiquement
    const result = await utilisateursService.create(body);
    return c.json(result, 201);
  } catch (error) {
    return c.json({ erreur: 'Erreur lors de la création' }, 400);
  }
});

// ---- PATCH (Mise à jour partielle) ----
utilisateursRouter.openapi({
  method: 'patch',
  path: '/{id}',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: UtilisateurCreationSchema.partial() // Tous les champs optionnels
        }
      }
    }
  },
  security: [{ Bearer: [] }],
  responses: {
    200: {
      description: 'Utilisateur mis à jour',
      content: { 'application/json': { schema: UtilisateurPublicSchema } }
    },
    404: {
      description: 'Utilisateur non trouvé',
      content: { 'application/json': { schema: ErreurSchema } }
    }
  }
}, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const updated = await utilisateursService.update(id, body);
  if (!updated) return c.json({ erreur: 'Utilisateur introuvable' }, 404);
  return c.json(updated, 200);
});

// ---- DELETE (Désactivé pour sécurité) ----
utilisateursRouter.openapi({
  method: 'delete',
  path: '/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: {
    403: {
      description: 'Suppression interdite',
      content: { 'application/json': { schema: ErreurSchema } }
    }
  }
}, async (c) => {
  return c.json({ 
    erreur: 'La suppression définitive d\'un utilisateur n\'est pas autorisée. Utilisez PATCH pour désactiver le compte (ex: { "isActive": false }).' 
  }, 403);
});

export { utilisateursRouter };