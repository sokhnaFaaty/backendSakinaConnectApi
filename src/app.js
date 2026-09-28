import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import 'dotenv/config';

import { authRouter, authPubliqueRouter } from './routes/auth.js';
import { utilisateursRouter } from './routes/utilisateurs.js';
import { pelerinsRouter } from './routes/pelerins.js';
import { adminsRouter } from './routes/admins.js';
import { groupesRouter } from './routes/groupes.js';
import { hotelsRouter } from './routes/hotels.js';
import { categoriesRouter } from './routes/categories.js';
import { annoncesRouter } from './routes/annonces.js';
import { sosRouter } from './routes/sos.js';
import { guidesRouter } from './routes/guides.js';
import { planningsRouter } from './routes/plannings.js';
import { prochesRouter } from './routes/proches.js';
import {
  demandesRouter,
  demandeInscriptionPubliqueRouter,
} from './routes/demandeInscriptions.js';

/**
 * Construction de l'application.
 *
 * Ce fichier se limite à ASSEMBLER l'app, sans la démarrer : c'est ce qui
 * permet aux tests de la charger et de lui envoyer des requêtes directement
 * dans le processus, sans ouvrir de port. Le démarrage vit dans index.js.
 */
/**
 * Traduction des codes d'erreur Zod en français.
 *
 * L'API ne doit pas parler anglais au milieu d'un parcours francophone : un
 * message « Too small: expected string to have >=8 characters » dans un
 * formulaire de connexion est un défaut, pas un détail. Table centrale plutôt
 * qu'un message par champ : elle couvre aussi les schémas ajoutés plus tard,
 * sans avoir à penser à les traduire.
 */
const MESSAGES_ZOD = {
  invalid_type: (p) => `type attendu : ${p.expected}`,
  too_small: (p) =>
    p.origin === 'string'
      ? `doit contenir au moins ${p.minimum} caractères`
      : p.origin === 'array'
        ? `doit contenir au moins ${p.minimum} éléments`
        : `doit être supérieur ou égal à ${p.minimum}`,
  too_big: (p) =>
    p.origin === 'string'
      ? `ne doit pas dépasser ${p.maximum} caractères`
      : p.origin === 'array'
        ? `ne doit pas dépasser ${p.maximum} éléments`
        : `ne doit pas dépasser ${p.maximum}`,
  invalid_format: (p) =>
    p.format === 'email' ? 'adresse email invalide' : `format invalide (${p.format})`,
  invalid_value: () => 'valeur non autorisée',
  unrecognized_keys: () => 'champ(s) en trop',
  invalid_union: () => 'valeur invalide',
  invalid_element: () => 'élément invalide',
};

function messageZod(probleme) {
  const traducteur = MESSAGES_ZOD[probleme.code];
  // Repli sur le message d'origine : mieux vaut un message en anglais que
  // « donnée invalide » sans aucun détail sur le champ fautif.
  return traducteur ? traducteur(probleme) : probleme.message;
}

/**
 * Erreurs de validation : le front attend partout la forme { erreur: "..." }.
 *
 * SANS ce hook, @hono/zod-openapi répond sur ses 400 avec
 * { success: false, error: { name: "ZodError", message: "…" } }, forme que
 * l'appelant ne sait pas lire : il retombe alors sur un message générique
 * alors qu'il existe un message précis. Mélanger deux formats d'erreur selon
 * la route oblige le client à deviner.
 *
 * `champs` est un bonus : le formulaire peut surligner les champs fautifs
 * sans analyser le message. Le client peut l'ignorer sans breakage.
 */
function reponseValidation(resultat, c) {
  if (resultat.success) return;

  const problemes = resultat.error?.issues ?? [];
  const champs = {};

  for (const probleme of problemes) {
    const champ = probleme.path?.join('.') || 'global';
    if (!champs[champ]) champs[champ] = messageZod(probleme);
  }

  const nomPremier = problemes[0]?.path?.join('.');
  const message = nomPremier
    ? `Donnée invalide : ${nomPremier}. ${messageZod(problemes[0])}`
    : 'Données invalides.';

  return c.json({ erreur: message, champs }, 400);
}

export function creerApp() {
  const app = new OpenAPIHono({ defaultHook: reponseValidation });

  // Origines autorisées à appeler l'API (le front). Plusieurs valeurs séparées par des virgules.
  const originesAutorisees = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  app.use('*', cors({
    origin: originesAutorisees,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));

  /**
   * --- Correctif B : gestionnaire d'erreurs global ---
   *
   * Sans cela, une exception non rattrapée remontait en 500 avec une pile
   * d'appels quasi vide : impossible de distinguer une panne d'un doublon, et
   * l'API renvoyait parfois une page HTML au lieu d'un JSON, ce qui cassait le
   * front au lieu de lui afficher un message.
   *
   * Le détail technique n'est renvoyé qu'hors production : en production, une
   * stack trace est une information gratuite pour un attaquant.
   */
  const enProduction = process.env.NODE_ENV === 'production';

  app.onError((err, c) => {
    if (err.name === 'HTTPException') return err.getResponse();

    console.error('[erreur serveur]', err.name, err.message);

    return c.json(
      {
        erreur: 'Une erreur interne est survenue. Réessayez plus tard.',
        ...(enProduction ? {} : { detail: err.message }),
      },
      500,
    );
  });

  /** 404 : du JSON, pour que le front ne reçoive pas une page HTML. */
  app.notFound((c) =>
    c.json({ erreur: `Route introuvable : ${c.req.path}` }, 404),
  );

  app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
  });

  // Même découpage que pour les demandes : /connecter reste anonyme, tout le
  // reste du routeur auth exige un jeton. L'ordre compte — le routeur public
  // est monté en premier, et sa route POST renvoie une réponse avant que le
  // middleware d'authentification du second ne soit atteint.
  app.route('/', authPubliqueRouter);    // POST /connecter
  app.route('/', authRouter);            // POST /deconnexion, /changer-mot-de-passe
  app.route('/utilisateurs', utilisateursRouter);
  app.route('/pelerins', pelerinsRouter);
  app.route('/admins', adminsRouter);
  app.route('/groupes', groupesRouter);
  app.route('/hotels', hotelsRouter);
  app.route('/categories', categoriesRouter);
  app.route('/annonces', annoncesRouter);
  app.route('/sos', sosRouter);
  app.route('/guides', guidesRouter);
  app.route('/plannings', planningsRouter);
  app.route('/proches', prochesRouter);

  // Les deux routeurs partagent la même base mais des périmètres opposés :
  // le premier n'expose que la route publique POST, le second exige l'ADMIN.
  app.route('/demandes-inscription', demandeInscriptionPubliqueRouter);
  app.route('/demandes-inscription', demandesRouter);

  /**
   * --- Correctif F : documentation réservée au développement ---
   *
   * La spécification OpenAPI décrit chaque route, ses champs et ses
   * contraintes : c'est une carte complète de l'API, y compris des routes
   * sensibles. La publier en production revient à la distribuer.
   */
  if (!enProduction) {
    app.doc('/doc', {
      openapi: '3.0.0',
      info: { title: 'API Sakina Connect', version: '1.0.0' },
    });
    app.get('/ui', swaggerUI({ url: '/doc' }));
  }

  return { app, originesAutorisees, enProduction };
}
