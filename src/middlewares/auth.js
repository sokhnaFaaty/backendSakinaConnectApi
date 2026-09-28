import { jwt } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import 'dotenv/config';
import { db } from '../db/client.js';
import { utilisateurs } from '../db/schema.js';

/**
 * Routes autorisées même quand le compte est encore sur un mot de passe
 * provisoire (doitChangerMotDePasse = true).
 *
 * Tout le reste est refusé en 401. C'est le point important : un compte ADMIN
 * créé par un autre administrateur ne doit pas pouvoir être utilisé pour
 * lire les données des pèlerins tant que le mot de passe provisoire n'a pas
 * été changé. La seule sortie est la route de changement de mot de passe.
 */
const ALLOWED_WHILE_PASSWORD_CHANGE = [
  '/changer-mot-de-passe',
  '/connecter',
  '/deconnexion',
];

/**
 * Middleware d'authentification.
 *
 * Remplace l'ancien `jwt({...})` nu, qui avait une faille de vérification
 * d'algorithme et ne relisait jamais la base. Le secret est désormais vérifié
 * au démarrage plutôt qu'au premier appel : une configuration absente doit
 * faire échouer le serveur, pas produire un `undefined` signé.
 */
const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error(
    'JWT_SECRET absent. Le serveur refuse de démarrer : sans secret, aucun jeton ne peut être validé.',
  );
}

const verifier = jwt({ secret, alg: 'HS256' });

export const authMiddleware = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return c.json({ erreur: 'Authentification requise' }, 401);
  }

  let payload;
  try {
    // verify() contrôle la signature ET l'algorithme : un token en "none" ou
    // en HS512 est rejeté. C'était le but du durcissement.
    payload = await verifier.verify(token);
  } catch {
    return c.json({ erreur: 'Jeton invalide ou expiré' }, 401);
  }

  // Relecture de la base à chaque requête. Le rôle du JWT n'est plus la
  // référence : c'est la valeur en base. Un compte désactivé, ou dont le rôle
  // a été corrigé, s'applique donc immédiatement, sans attendre l'expiration
  // du jeton.
  const [utilisateur] = await db
    .select({
      id: utilisateurs.id,
      role: utilisateurs.role,
      isActive: utilisateurs.isActive,
      doitChangerMotDePasse: utilisateurs.doitChangerMotDePasse,
    })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, payload.sub))
    .limit(1);

  if (!utilisateur || utilisateur.isActive === false) {
    return c.json({ erreur: 'Compte introuvable ou désactivé' }, 401);
  }

  c.set('userId', utilisateur.id);
  c.set('role', utilisateur.role);
  c.set('doitChangerMotDePasse', Boolean(utilisateur.doitChangerMotDePasse));

  if (
    utilisateur.doitChangerMotDePasse &&
    !ALLOWED_WHILE_PASSWORD_CHANGE.includes(c.req.path)
  ) {
    return c.json(
      {
        erreur:
          'Mot de passe provisoire : vous devez le changer avant de continuer.',
        doitChangerMotDePasse: true,
      },
      401,
    );
  }

  return next();
};
