/**
 * middlewares/authorize.js
 *
 * Contrôle d'accès backend. C'est ici que se décide, côté serveur, qui a le
 * droit de faire quoi. Le front a déjà ses gardes de routes et ses `v-if`
 * par rôle : ce sont là des conforts d'affichage, PAS une sécurité. Tout ce
 * fichier existe pour que la protection ne dépende pas de l'interface.
 *
 * Convention de réponse :
 *   401 = « je ne sais pas qui tu es » (jeton absent, invalide, ou compte
 *         désactivé / mot de passe provisoire)
 *   403 = « je sais qui tu es, mais ton rôle ne te permet pas ça »
 *
 * Cette distinction est volontaire : un 401 doit déclencher une
 * reconnexion côté client, un 403 ne doit pas.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { groupes, guides, pelerins, proches } from '../db/schema.js';

/** 401 : jeton absent / invalide / compte inactif. */
export function Unauthorized(message = 'Authentification requise') {
  return new Response(JSON.stringify({ erreur: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 403 : rôle insuffisant, ou tentative d'accès à la ressource d'autrui. */
export function Forbidden(message = 'Accès refusé') {
  return new Response(JSON.stringify({ erreur: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * ⚠️ Pourquoi des vérifications DANS les handlers plutôt que des middlewares
 * de route.
 *
 * Hono n'expose PAS de surcharge `use(méthode, chemin, middleware)` : cette
 * forme est acceptée sans erreur mais **silencieusement ignorée**. Seul
 * `use(chemin, mw)` et `use('*', mw)` sont effectifs. Or une même URL sert
 * souvent deux méthodes avec deux permissions différentes (`POST /utilisateurs`
 * réservé à l'admin, `PATCH /utilisateurs/:id` ouvert au propriétaire), ce que
 * `use(chemin, …)` ne sait pas exprimer.
 *
 * Conséquence mesurée sur ce projet : une première version de ces gardes
 * utilisait `use('POST', '/', requireRole('ADMIN'))` et ne bloquait RIEN. Les
 * contrôles sont donc faits soit explicitement dans chaque handler, via
 * exigerRole(), soit via ecritureReserveeA() posé sur `use('*', …)`, qui est
 * la seule forme de use("*") effective.
 */

/**
 * Contrôle de rôle à appeler EN TÊTE d'un handler.
 *
 * @returns {Response|null} une réponse à renvoyer immédiatement si l'accès est
 *          refusé, ou null si l'appelant peut continuer.
 *
 * @example
 *   const refus = exigerRole(c, 'ADMIN');
 *   if (refus) return refus;
 */
export function exigerRole(c, ...roles) {
  const autorises = listeDeRoles(roles);
  const role = c.get('role');

  // Pas de rôle posé = authMiddleware n'a pas tourné. On refuse par défaut.
  if (!role) return Unauthorized();

  if (!autorises.includes(role)) {
    return Forbidden(
      `Accès refusé : rôle ${role} non autorisé sur cette ressource.`,
    );
  }
  return null;
}

/** true si la requête est une lecture (donc non soumise à `ecritureReserveeA`). */
export function estLecture(c) {
  const methode = c.req.method.toUpperCase();
  return methode === 'GET' || methode === 'HEAD' || methode === 'OPTIONS';
}

/**
 * Normalise un rôle ou une liste de rôles en tableau.
 * `requireRole` et `ecritureReserveeA` acceptent les deux écritures.
 */
function listeDeRoles(valeur) {
  return (Array.isArray(valeur) ? valeur : [valeur]).flat().filter(Boolean);
}

/**
 * Middleware : réserve chaque méthode d'écriture à une liste de rôles.
 * Les lectures ne sont jamais concernées.
 *
 * @param {string|string[]|Record<string,string|string[]>} permissions
 *        soit un rôle ou un tableau, appliqué à toutes les écritures :
 *            ecritureReserveeA('ADMIN')
 *        soit un objet méthode → rôles, pour des droits différents par
 *        opération :
 *            ecritureReserveeA({ POST: 'ADMIN', PATCH: ['ADMIN','PELERIN'] })
 *
 * Une méthode d'écriture non listée reste ouverte : l'absence dans la table
 * signifie « pas de contrainte supplémentaire ici », pas « tout le monde ».
 * Les contrôles fins (par exemple « son propre compte uniquement ») se font
 * dans le handler, où la ligne visée est connue.
 */
export function ecritureReserveeA(permissions) {
  const table =
    typeof permissions === 'string' || Array.isArray(permissions)
      ? {
          POST: permissions,
          PUT: permissions,
          PATCH: permissions,
          DELETE: permissions,
        }
      : Object.fromEntries(
          Object.entries(permissions).map(([m, r]) => [
            m.toUpperCase(),
            listeDeRoles(r),
          ]),
        );

  return async (c, next) => {
    if (estLecture(c)) return next();

    const autorises = table[c.req.method.toUpperCase()];
    if (!autorises) return next();

    const refus = exigerRole(c, ...listeDeRoles(autorises));
    if (refus) return refus;
    return next();
  };
}

/**
 * Restreint une route à une liste de rôles.
 * L'ADMIN n'est PAS ajouté automatiquement : chaque route déclare donc
 * explicitement si l'admin y a accès. C'est plus verbeux, mais cela évite
 * d'accorder par accident des droits à l'admin sur une route sensible.
 *
 * Utilisable en `use('*', ...)` pour un routeur entièrement réservé.
 */
export function requireRole(...roles) {
  const autorises = listeDeRoles(roles);
  return async (c, next) => {
    const refus = exigerRole(c, ...autorises);
    if (refus) return refus;
    return next();
  };
}

/** Résout l'id du groupe affecté au guide connecté. */
async function groupeDuGuide(utilisateurId) {
  const rows = await db
    .select({ groupeId: groupes.id })
    .from(guides)
    .innerJoin(groupes, eq(guides.id, groupes.guideId))
    .where(and(eq(guides.utilisateurId, utilisateurId)))
    .limit(1);
  return rows[0]?.groupeId ?? null;
}

/** Même chose, exportée pour les routes qui doivent borner une lecture. */
export const groupeDuGuidePourUtilisateur = groupeDuGuide;

/** Résout l'id du pèlerin rattaché à l'utilisateur connecté. */
export async function pelerinIdDeUtilisateur(utilisateurId) {
  const rows = await db
    .select({ id: pelerins.id })
    .from(pelerins)
    .where(eq(pelerins.utilisateurId, utilisateurId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Résout le groupe d'un pèlerin. C'est le maillon qui relie un pèlerin à son
 * guide : pèlerin → groupe → guide.
 */
export async function groupeIdDePelerin(pelerinId) {
  const rows = await db
    .select({ groupeId: pelerins.groupeId })
    .from(pelerins)
    .where(eq(pelerins.id, pelerinId))
    .limit(1);
  return rows[0]?.groupeId ?? null;
}

/**
 * Résout le guide EN CHARGE d'un pèlerin, par le groupe qui le rattache.
 *
 * Sert à ne pas faire confiance à un `guideId` venu du client : sur une alerte
 * SOS, le guide destinataire se déduit de l'appartenance du pèlerin, il ne se
 * choisit pas dans un formulaire. Un pèlerin pourrait sinon router sa propre
 * alerte vers le guide d'un autre groupe — l'informer d'un groupe qu'il ne suit
 * pas, ou le faire intervenir hors de sa mission.
 */
export async function guideDePelerin(pelerinId) {
  const groupeId = await groupeIdDePelerin(pelerinId);
  if (!groupeId) return null;

  const rows = await db
    .select({ guideId: groupes.guideId })
    .from(groupes)
    .where(eq(groupes.id, groupeId))
    .limit(1);
  return rows[0]?.guideId ?? null;
}

/**
 * Le guide connecté est-il le guide en charge de ce pèlerin ?
 *
 * Garde de propriété sur les lectures et les écritures qui visent une ligne
 * existante : un guide manipule les alertes de SES pèlerins, pas celles des
 * autres groupes.
 */
export async function guideEstEnChargeDuPelerin(utilisateurId, pelerinId) {
  const monGuideId = await groupeDuGuide(utilisateurId);
  if (!monGuideId) return false;
  return monGuideId === (await guideDePelerin(pelerinId));
}

/**
 * Résout l'id du pèlerin SUIVI par un proche.
 *
 * Inverse de pelerinIdDeUtilisateur : on part du proche pour remonter au
 * pèlerin. C'est le seul accès légitime d'un PROCHE à une fiche pèlerin, et le
 * seul qui autorise le dashboard de suivi familial à fonctionner.
 */
export async function pelerinIdSuiviParProche(utilisateurId) {
  const rows = await db
    .select({ pelerinId: proches.pelerinId })
    .from(proches)
    .where(eq(proches.utilisateurId, utilisateurId))
    .limit(1);
  return rows[0]?.pelerinId ?? null;
}
