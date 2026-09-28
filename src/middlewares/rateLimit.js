/**
 * middlewares/rateLimit.js  —  Correctif A
 *
 * Limitation de débit par clé, en mémoire, dans le processus.
 *
 * Pourquoi en mémoire et pas Redis : le projet tourne sur une seule instance.
 * Ajouter Redis ici serait de l'infrastructure inutile. Le compromis assumé est
 * explicite — un redémarrage du serveur remet les compteurs à zéro, et un
 * déploiement multi-instances appliquerait la limite par instance. Le jour où
 * l'application tourne sur plusieurs instances, ce fichier est le SEUL à
 * remplacer (même interface), aucun appelant n'aurait à changer.
 */

/** @type {Map<string, { count: number, resetAt: number }>} */
const hits = new Map();

/**
 * Purge expirée. Appelée à chaque nouvelle requête : quelques itérations sur
 * une Map petite, bien moins coûteux qu'un setInterval qui garderait le
 * processus vivant.
 */
function purger(now) {
  for (const [cle, entree] of hits) {
    if (entree.resetAt <= now) hits.delete(cle);
  }
}

/** Extrait l'IP cliente en tenant compte du proxy. */
function ipDe(c) {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return (
    c.req.header('x-real-ip') ??
    c.req.header('cf-connecting-ip') ??
    'inconnue'
  );
}

/**
 * @param {object} options
 * @param {number} [options.max=5]        nombre de tentatives autorisées
 * @param {number} [options.windowMs]     durée de la fenêtre en ms
 * @param {() => string} [options.key]    clé de regroupement (défaut : IP)
 * @param {string} [options.message]
 */
export function rateLimit(options = {}) {
  const {
    max = 5,
    windowMs = 15 * 60 * 1000,
    key,
    message = 'Trop de tentatives. Réessayez dans quelques minutes.',
  } = options;

  return async (c, next) => {
    const now = Date.now();
    purger(now);

    const cle = key ? await key(c) : ipDe(c);
    const entree = hits.get(cle);

    if (entree && entree.resetAt > now && entree.count >= max) {
      const secondes = Math.ceil((entree.resetAt - now) / 1000);
      return c.json(
        { erreur: message, reessayerDans: secondes },
        429,
      );
    }

    if (!entree || entree.resetAt <= now) {
      hits.set(cle, { count: 1, resetAt: now + windowMs });
    } else {
      entree.count += 1;
    }

    return next();
  };
}

/**
 * Limite de connexion par EMAIL, et non par IP.
 *
 * C'est le bon critère ici : l'attaque qui nous intéresse est le bourrage
 * d'identifiants (mot de passe faible, leaké, ou « spray » sur plusieurs
 * comptes), qui part d'une IP variable. Compter par IP protégerait surtout
 * l'utilisateur légitime derrière un partage de connexion ou un CGNAT. Si le
 * débit d'un utilisateur légitime dépasse la limite, le compromis assumé est de
 * bloquer : mieux vaut un blocage temporaire qu'une attaque par force brute
 * qui passe.
 *
 * `.clone()` est indispensable : c'est lui qui permet de lire le body pour en
 * tirer l'email sans le consommer, sinon la validation Zod de la route ne
 * trouverait plus rien à analyser.
 */
export const rateLimitConnexion = rateLimit({
  max: 5,
  windowMs: 15 * 60 * 1000,
  key: async (c) => {
    try {
      const body = await c.req.raw.clone().json();
      const email = String(body?.email ?? '').trim().toLowerCase();
      return email ? `connexion:${email}` : `connexion:${ipDe(c)}`;
    } catch {
      return `connexion:${ipDe(c)}`;
    }
  },
  message:
    'Trop de tentatives de connexion pour ce compte. Réessayez dans 15 minutes.',
});

/**
 * Limite d'écriture publique (formulaire « Nous rejoindre »).
 * Protège la base contre le remplissage massif et l'envoi de spam.
 * Fenêtre plus large et par IP : ici on protège une ressource publique, pas
 * un compte.
 */
export const rateLimitDemandePublique = rateLimit({
  max: 5,
  windowMs: 60 * 60 * 1000,
  message:
    'Trop de demandes envoyées depuis ce poste. Réessayez plus tard.',
});
