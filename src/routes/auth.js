import { OpenAPIHono } from '@hono/zod-openapi';
import { ConnexionSchema, TokenSchema, ErreurSchema, MessageSchema, ChangerMotDePasseSchema, UtilisateurPublicSchema } from '../schemas.js';
import { authMiddleware } from '../middlewares/auth.js';
import { rateLimitConnexion } from '../middlewares/rateLimit.js';
import * as authService from '../services/auth.js';

/**
 * Deux routeurs séparés, montés sur la même base.
 *
 * Raison : /connecter doit rester anonyme alors que les deux autres routes
 * exigent un jeton. Poser un `use('*', authMiddleware)` ici protégerait aussi
 * /doc et /ui, et étoufferait l'API entière. On sépare donc les périmètres et
 * on cible chaque chemin protégé individuellement.
 *
 * Voir routes/demandeInscriptions.js pour la même situation.
 */

/** Routeur PUBLIC : la connexion. */
const authPubliqueRouter = new OpenAPIHono();

/** Routeur protégé : déconnexion et changement de mot de passe. */
const authRouter = new OpenAPIHono();

/**
 * Correctif A : 5 tentatives par email et par quart d'heure.
 *
 * Le message de retour reste volontairement identique à celui d'un mot de
 * passe erroné. Distinguer les deux cas aiderait un attaquant à découvrir
 * quelles adresses sont enregistrées.
 *
 * Cible par CHEMIN et non `use('*')` : un routeur monté à la racine avec un
 * `use('*')` s'appliquerait à toute l'API et la rendrait indisponible au bout
 * de quelques appels. /connecter est la seule route de ce routeur, donc le
 * ciblage par chemin n'expose pas d'autre méthode.
 */
authPubliqueRouter.use('/connecter', rateLimitConnexion);

authPubliqueRouter.openapi({
  method: 'post',
  path: '/connecter',
   tags: ['Auth'],
  request: { 
    body: { 
      content: { 
        'application/json': { 
          schema: ConnexionSchema 
        } 
      } 
    } 
  },
  responses: {
    200: { 
      description: 'Connexion réussie', 
      content: { 'application/json': { schema: TokenSchema } } 
    },
    401: { 
      description: 'Erreur d\'authentification', 
      content: { 'application/json': { schema: ErreurSchema } } 
    },
    429: { 
      description: 'Trop de tentatives', 
      content: { 'application/json': { schema: ErreurSchema } } 
    }
  }
}, async (c) => {
  // Sans le bon Content-Type, la validation Zod n'a rien à analyser et
  // `valid('json')` vaut undefined. Sans ce garde-fou, la déstructuration
  // levait et le catch renvoyait un 401 trompeur — alors qu'aucun jeton n'est
  // en cause. Un corps absent est une erreur de requête, pas d'authentification.
  const corps = c.req.valid('json');
  if (!corps) {
    return c.json({ erreur: 'Corps de requête JSON attendu.' }, 400);
  }

  const { email, motDePasse } = corps;
  try {
    const resultat = await authService.connecter(email, motDePasse);
    return c.json(resultat, 200);
  } catch (e) {
    if (e.message === 'COMPTE_ARCHIVE') {
      return c.json({ erreur: 'Ce compte a été archivé. Contactez l\'administration.' }, 401);
    }
    return c.json({ erreur: 'Email ou mot de passe incorrect.' }, 401);
  }
});

// ---- Périmètre authentifié ----
//
// Ciblage par CHEMIN, jamais `use('*')` : ce routeur est monté à la racine
// alongside /doc et /ui, et un `use('*')` protégé toute l'API — la doc
// devenait injoignable et le contrôle s'appliquait à des routes anonymes.
// Chaque chemin protégé ne porte qu'une seule méthode (POST), donc le ciblage
// par chemin n'expose pas d'autre opération.
authRouter.use('/deconnexion', authMiddleware);
authRouter.use('/changer-mot-de-passe', authMiddleware);

authRouter.openapi({
  method: 'post',
  path: '/deconnexion',
  tags: ['Auth'],
  security: [{ Bearer: [] }],
  responses: {
    200: {
      description: 'Déconnexion réussie',
      content: { 'application/json': { schema: MessageSchema } }
    },
    401: { content: { 'application/json': { schema: ErreurSchema } } }
  }
}, async (c) => {
  return c.json(await authService.deconnecter(), 200);
});

/**
 * POST /changer-mot-de-passe
 *
 * Atteignable même avec un mot de passe provisoire : authMiddleware
 * l'autorise explicitement tout en refusant (401) toutes les autres routes.
 * Le drapeau `doitChangerMotDePasse` n'est remis à false qu'après un
 * changement réussi, ce qui rend ses droits à l'utilisateur.
 */
authRouter.openapi({
  method: 'post',
  path: '/changer-mot-de-passe',
  tags: ['Auth'],
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: ChangerMotDePasseSchema }
      }
    }
  },
  responses: {
    200: {
      description: 'Mot de passe mis à jour',
      content: { 'application/json': { schema: UtilisateurPublicSchema } }
    },
    400: { content: { 'application/json': { schema: ErreurSchema } } },
    401: { content: { 'application/json': { schema: ErreurSchema } } }
  }
}, async (c) => {
  const { ancienMotDePasse, nouveauMotDePasse, confirmationMotDePasse } = c.req.valid('json');

  if (nouveauMotDePasse !== confirmationMotDePasse) {
    return c.json({ erreur: 'Les deux mots de passe ne correspondent pas.' }, 400);
  }

  try {
    const utilisateur = await authService.changerMotDePasse(
      c.get('userId'),
      ancienMotDePasse,
      nouveauMotDePasse,
    );
    return c.json(utilisateur, 200);
  } catch (e) {
    if (e.message === 'ANCIEN_MOT_DE_PASSE_INCORRECT') {
      return c.json({ erreur: 'Le mot de passe actuel est incorrect.' }, 400);
    }
    if (e.message === 'MOT_DE_PASSE_IDENTIQUE') {
      return c.json(
        { erreur: 'Le nouveau mot de passe doit être différent de l\'ancien.' },
        400,
      );
    }
    return c.json({ erreur: 'Changement de mot de passe impossible.' }, 400);
  }
});

export { authRouter, authPubliqueRouter };
