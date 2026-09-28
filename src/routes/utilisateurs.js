import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middlewares/auth.js';
import { exigerRole } from '../middlewares/authorize.js';
import { utilisateursService } from '../services/utilisateurs.js';
import { utilisateurs } from '../db/schema.js';
import { db } from '../db/client.js';
import { estViolationUnique } from '../services/demandeInscriptions.js';
import { UtilisateurPublicSchema, UtilisateurCreationSchema, ErreurSchema } from '../schemas.js';

const utilisateursRouter = new OpenAPIHono();

// Toutes les routes exigent au minimum un jeton valide.
utilisateursRouter.use('*', authMiddleware);

/**
 * POST / — réservé à l'ADMIN.
 *
 * Faille corrigée ici : la route était accessible à TOUT utilisateur
 * authentifié, et le corps de la requête contenait `role`. Un pèlerin pouvait
 * donc s'envoyer `role: "ADMIN"` et obtenir un compte administrateur complet.
 * Le rôle n'est plus un champ que le client choisit : seul un administrateur
 * déjà authentifié peut en attribuer un.
 *
 * Le contrôle est fait dans le handler, pas via `use('POST', …)` : Hono ignore
 * silencieusement cette forme de `use` (voir middlewares/authorize.js).
 */

/**
 * Champs d'ascension interdits hors ADMIN.
 *
 * Un utilisateur légitime peut modifier son nom, son email, son téléphone, sa
 * photo et son mot de passe. Il ne doit en revanche jamais pouvoir : se
 * nommer ADMIN, se réactiver un compte archivé, ni supprimer son propre
 * « changement de mot de passe » obligatoire.
 */
const CHAMPS_RESERVES_ADMIN = ['role', 'isActive', 'doitChangerMotDePasse'];

/** Résout le propriétaire du compte visé, pour la vérification d'accès. */
async function proprietaireDe(id) {
  const [ligne] = await db
    .select({ id: utilisateurs.id })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, id))
    .limit(1);
  return ligne?.id;
}

// ---- GET ALL ----
utilisateursRouter.openapi({
  method: 'get',
  path: '/',
       tags: ['Utilisateurs'],

  security: [{ Bearer: [] }],
  responses: {
    200: {
      description: 'Liste des utilisateurs',
      content: { 'application/json': { schema: z.array(UtilisateurPublicSchema) } }
    },
    401: { content: { 'application/json': { schema: ErreurSchema } } }
  }
}, async (c) => {
  return c.json(await utilisateursService.getAll(), 200);
});

// ---- GET BY ID ----
utilisateursRouter.openapi({
  method: 'get',
  path: '/{id}',
       tags: ['Utilisateurs'],

  request: { params: z.object({ id: z.string().uuid() }) },
  security: [{ Bearer: [] }],
  responses: {
    200: {
      description: 'Détails de l\'utilisateur',
      content: { 'application/json': { schema: UtilisateurPublicSchema } }
    },
    401: { content: { 'application/json': { schema: ErreurSchema } } },
    403: { content: { 'application/json': { schema: ErreurSchema } } },
    404: {
      description: 'Utilisateur non trouvé',
      content: { 'application/json': { schema: ErreurSchema } }
    }
  }
}, async (c) => {
  const { id } = c.req.valid('param');

  const role = c.get('role');
  const userId = c.get('userId');

  // Même règle que sur le PATCH : on ne lit le compte d'autrui que si l'on est
  // l'administrateur, ou si l'on est soi-même.
  if (role !== 'ADMIN' && id !== userId) {
    const existe = await proprietaireDe(id);
    if (!existe) return c.json({ erreur: 'Utilisateur introuvable' }, 404);
    return c.json({ erreur: 'Accès refusé' }, 403);
  }

  const user = await utilisateursService.getById(id);
  if (!user) return c.json({ erreur: 'Utilisateur introuvable' }, 404);
  return c.json(user, 200);
});

// ---- POST (Création) ----
utilisateursRouter.openapi({
  method: 'post',
  path: '/',
       tags: ['Utilisateurs'],

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
    },
    403: { content: { 'application/json': { schema: ErreurSchema } } },
    409: { content: { 'application/json': { schema: ErreurSchema } } }
  }
}, async (c) => {
  // V2 : sans ce contrôle, n'importe quel utilisateur authentifié se créait
  // un compte ADMIN en envoyant role: "ADMIN" dans le corps.
  const refus = exigerRole(c, 'ADMIN');
  if (refus) return refus;

  try {
    const body = c.req.valid('json');
    // Le service utilisateur hashe le mot de passe automatiquement
    const result = await utilisateursService.create(body);
    return c.json(result, 201);
  } catch (error) {
    // --- Correctif B : une violation d'unicité n'est pas une erreur 400 ---
    // C'était le cas avant, ce qui rendait le doublon d'email indistinguable
    // d'une simple faute de frappe, et l'administrateur ne comprenait pas
    // pourquoi la création échouait.
    if (estViolationUnique(error)) {
      return c.json(
        { erreur: 'Cet email ou ce téléphone est déjà utilisé.' },
        409,
      );
    }
    return c.json({ erreur: 'Erreur lors de la création' }, 400);
  }
});

// ---- PATCH (Mise à jour partielle) ----
utilisateursRouter.openapi({
  method: 'patch',
  path: '/{id}',
       tags: ['Utilisateurs'],

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
    403: { content: { 'application/json': { schema: ErreurSchema } } },
    404: {
      description: 'Utilisateur non trouvé',
      content: { 'application/json': { schema: ErreurSchema } }
    }
  }
}, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  const role = c.get('role');
  const userId = c.get('userId');

  // V1 : on ne modifie que son propre compte, sauf pour l'ADMIN.
  if (role !== 'ADMIN' && id !== userId) {
    const existe = await proprietaireDe(id);
    if (!existe) return c.json({ erreur: 'Utilisateur introuvable' }, 404);
    return c.json({ erreur: 'Accès refusé' }, 403);
  }

  // --- Correctif C : champs d'ascension retirés du corps ---
  if (role !== 'ADMIN') {
    for (const champ of CHAMPS_RESERVES_ADMIN) delete body[champ];
  }

  // Un changement de mot de passe réussi remet le drapeau à false : on ne
  // fait donc pas confiance à une valeur envoyée par le client.
  if (body.motDePasse) body.doitChangerMotDePasse = false;

  const updated = await utilisateursService.update(id, body);
  if (!updated) return c.json({ erreur: 'Utilisateur introuvable' }, 404);
  return c.json(updated, 200);
});

// ---- DELETE (Désactivé pour sécurité) ----
utilisateursRouter.openapi({
  method: 'delete',
  path: '/{id}',
       tags: ['Utilisateurs'],

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
