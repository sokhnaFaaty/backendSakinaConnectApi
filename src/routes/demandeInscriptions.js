import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/authorize.js';
import { rateLimitDemandePublique } from '../middlewares/rateLimit.js';
import {
  accepterDemande,
  creerDemandePublic,
  ErreurMetier,
  getDemande,
  listerDemandes,
  refuserDemande,
} from '../services/demandeInscriptions.js';
import {
  DemandeInscriptionAccepterSchema,
  DemandeInscriptionCreationSchema,
  DemandeInscriptionRefuserSchema,
  DemandeInscriptionSchema,
  ErreurSchema,
  StatutDemandeInscriptionEnum,
} from '../schemas.js';

/**
 * Deux routeurs volontairement séparés, montés sur la même base.
 *
 * Pourquoi ne pas faire un seul routeur : un `use('*', authMiddleware)` porte
 * sur TOUTES les méthodes, y compris le POST public. Protéger les routes
 * d'admin ici reviendrait donc à interdire la route publique. Plutôt que de
 * jongler avec des motifs de chemin fragiles, on sépare les deux périmètres.
 */

/** Routeur PUBLIC : une seule route, la création d'une demande. */
const demandeInscriptionPubliqueRouter = new OpenAPIHono();

/** Routeur ADMIN : consultation et traitement des demandes. */
const demandesRouter = new OpenAPIHono();

/**
 * Seule route anonyme de l'application. Elle crée une demande en attente,
 * jamais un compte : rien n'existe en base avant validation par l'administrateur,
 * donc elle n'ouvre aucun accès à une donnée préexistante.
 *
 * La limite de débit est indispensable sur une route anonyme — sans elle,
 * c'est un formulaire libre de remplir la table et de servir de relais de spam.
 *
 * Ciblage par CHEMIN, jamais `use('*')` : ce routeur est monté sur une base
 * partagée avec le routeur ADMIN, et un `use('*')` ici s'appliquerait aussi
 * aux routes de consultation, qui ne doivent pas être limitées ainsi.
 * La racine de ce routeur ne contient que la création.
 */
demandeInscriptionPubliqueRouter.use('/', rateLimitDemandePublique);

demandeInscriptionPubliqueRouter.openapi(
  {
    method: 'post',
    path: '/',
    tags: ['DemandesInscription'],
    request: {
      body: {
        content: {
          'application/json': { schema: DemandeInscriptionCreationSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Demande enregistrée, en attente de validation.',
        content: { 'application/json': { schema: DemandeInscriptionSchema } },
      },
      400: { content: { 'application/json': { schema: ErreurSchema } } },
      409: {
        description: 'Email ou téléphone déjà utilisé, ou demande en attente.',
        content: { 'application/json': { schema: ErreurSchema } },
      },
      429: { content: { 'application/json': { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    try {
      const demande = await creerDemandePublic(c.req.valid('json'));
      return c.json(demande, 201);
    } catch (err) {
      if (err instanceof ErreurMetier) {
        return c.json({ erreur: err.message }, err.statut);
      }
      throw err;
    }
  },
);

// ---- Périmètre ADMIN : authentification ET rôle, dans cet ordre ----
demandesRouter.use('*', authMiddleware);
demandesRouter.use('*', requireRole('ADMIN'));

/** Traduit une erreur métier en réponse HTTP ; laisse remonter le reste. */
function gerer(c, err) {
  if (err instanceof ErreurMetier) {
    return c.json({ erreur: err.message }, err.statut);
  }
  throw err;
}

const refsErreur = {
  401: { content: { 'application/json': { schema: ErreurSchema } } },
  403: { content: { 'application/json': { schema: ErreurSchema } } },
  404: { content: { 'application/json': { schema: ErreurSchema } } },
  409: { content: { 'application/json': { schema: ErreurSchema } } },
};

demandesRouter.openapi(
  {
    method: 'get',
    path: '/',
    tags: ['DemandesInscription'],
    security: [{ Bearer: [] }],
    request: {
      query: z.object({ statut: StatutDemandeInscriptionEnum.optional() }),
    },
    responses: {
      200: {
        content: {
          'application/json': { schema: z.array(DemandeInscriptionSchema) },
        },
      },
      ...refsErreur,
    },
  },
  async (c) => {
    const { statut } = c.req.valid('query');
    return c.json(await listerDemandes({ statut }), 200);
  },
);

demandesRouter.openapi(
  {
    method: 'get',
    path: '/{id}',
    tags: ['DemandesInscription'],
    security: [{ Bearer: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: DemandeInscriptionSchema } },
      },
      ...refsErreur,
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const demande = await getDemande(id);
    if (!demande) return c.json({ erreur: 'Non trouvé' }, 404);
    return c.json(demande, 200);
  },
);

demandesRouter.openapi(
  {
    method: 'post',
    path: '/{id}/accepter',
    tags: ['DemandesInscription'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': { schema: DemandeInscriptionAccepterSchema },
        },
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: DemandeInscriptionSchema } },
      },
      ...refsErreur,
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    try {
      return c.json(await accepterDemande(id, c.get('userId'), data), 200);
    } catch (err) {
      return gerer(c, err);
    }
  },
);

demandesRouter.openapi(
  {
    method: 'post',
    path: '/{id}/refuser',
    tags: ['DemandesInscription'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': { schema: DemandeInscriptionRefuserSchema },
        },
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: DemandeInscriptionSchema } },
      },
      ...refsErreur,
    },
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    try {
      return c.json(await refuserDemande(id, c.get('userId'), data), 200);
    } catch (err) {
      return gerer(c, err);
    }
  },
);

export { demandesRouter, demandeInscriptionPubliqueRouter };
