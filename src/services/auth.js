import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { utilisateurs } from '../db/schema.js';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET;

// Réutilisée par les services (demandes d'inscription, création directe par
// l'ADMIN) pour hasher un mot de passe.
export async function hashMotDePasse(motDePasse) {
  return bcrypt.hash(motDePasse, 10);
}

/** Retire le hash avant tout envoi au client. */
export function sansMotDePasse(utilisateur) {
  const { motDePasse: _hash, ...userSafe } = utilisateur;
  return userSafe;
}

export async function connecter(email, motDePasse) {
  const [utilisateur] = await db
    .select()
    .from(utilisateurs)
    .where(eq(utilisateurs.email, email));

  // --- Correctif D : plus aucun log de donnée personnelle ---
  // Les anciens console.log affichaient l'email, puis l'INTÉGRALITÉ de la ligne
  // utilisateurs (donc le hash bcrypt) en cas d'échec. Un log d'erreur n'a
  // jamais besoin de contenir une donnée personnelle pour être utile.
  if (!utilisateur) {
    throw new Error('IDENTIFIANTS_INVALIDES');
  }

  if (utilisateur.isActive === false) {
    throw new Error('COMPTE_ARCHIVE');
  }

  const motDePasseValide = await bcrypt.compare(
    motDePasse,
    utilisateur.motDePasse,
  );

  if (!motDePasseValide) {
    throw new Error('IDENTIFIANTS_INVALIDES');
  }

  const payload = {
    sub: utilisateur.id,
    email: utilisateur.email,
    role: utilisateur.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
  };
  const token = await sign(payload, JWT_SECRET);

  return { token, user: sansMotDePasse(utilisateur) };
}

/**
 * Changement de mot de passe par le propriétaire du compte.
 *
 * Deux cas d'appel :
 *  - mot de passe définitif  : ancien = le mot de passe actuel ;
 *  - mot de passe provisoire : idem, le provisoire EST le mot de passe actuel.
 *    C'est ce qui permet à un compte ADMIN créé par quelqu'un d'autre de
 *    s'authentifier juste ce qu'il faut pour choisir son propre mot de passe.
 *
 * Le drapeau doitRepasser est remis à false quand le changement réussit :
 * c'est la condition pour que le compte récupère ses droits.
 */
export async function changerMotDePasse(utilisateurId, ancien, nouveau) {
  const [utilisateur] = await db
    .select()
    .from(utilisateurs)
    .where(eq(utilisateurs.id, utilisateurId))
    .limit(1);

  if (!utilisateur) throw new Error('IDENTIFIANTS_INVALIDES');

  const valide = await bcrypt.compare(ancien, utilisateur.motDePasse);
  if (!valide) throw new Error('ANCIEN_MOT_DE_PASSE_INCORRECT');

  if (ancien === nouveau) {
    throw new Error('MOT_DE_PASSE_IDENTIQUE');
  }

  const hash = await hashMotDePasse(nouveau);

  const [misAJour] = await db
    .update(utilisateurs)
    .set({ motDePasse: hash, doitChangerMotDePasse: false })
    .where(eq(utilisateurs.id, utilisateurId))
    .returning();

  return sansMotDePasse(misAJour);
}

export async function deconnecter() {
  return { message: 'Déconnexion réussie' };
}
