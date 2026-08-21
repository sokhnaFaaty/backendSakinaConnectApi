import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { utilisateurs } from '../db/schema.js';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET;

// Réutilisée par les futurs services (guides, pelerins, proches) à la création d'un compte
export async function hashMotDePasse(motDePasse) {
  return bcrypt.hash(motDePasse, 10);
}

export async function connecter(email, motDePasse) {
  // 1. Log pour vérifier l'email reçu
  console.log(`Tentative de connexion pour l'email : ${email}`);

  const [utilisateur] = await db
    .select()
    .from(utilisateurs)
    .where(eq(utilisateurs.email, email));

  // 2. Log pour voir si la base de données a trouvé un utilisateur
  console.log(`Utilisateur trouvé dans la DB :`, utilisateur);

  if (!utilisateur) {
    throw new Error('IDENTIFIANTS_INVALIDES');
  }

  if (utilisateur.isActive === false) {
    throw new Error('COMPTE_ARCHIVE');
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasse);

  // 3. Log pour vérifier si le mot de passe correspond au hash stocké
  console.log(`Résultat de la comparaison bcrypt :`, motDePasseValide);

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

  // On ne renvoie jamais motDePasse (même hashé)
  const { motDePasse: _hash, ...userSafe } = utilisateur;

  // 4. Log de succès
  console.log(`Connexion réussie pour l'utilisateur : ${utilisateur.email}`);

  return { token, user: userSafe };
}