/**
 * Réinitialise les mots de passe des comptes existants à partir de .env.
 *
 * À utiliser quand un mot de passe a fuité (par exemple parce qu'il était
 * écrit en dur dans un fichier versionné) : le seed n'y suffit pas, car il
 * ignore les lignes déjà présentes en base.
 *
 * Usage : npm run db:motsdepasse
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { utilisateurs } from './schema.js';
import { hashMotDePasse } from '../services/auth.js';

const ROLES = ['ADMIN', 'GUIDE', 'PELERIN', 'PROCHE'];

async function reinitialiser() {
  // Vérifie d'abord que tout est disponible : on ne veut pas modifier la
  // moitié des comptes puis échouer.
  const motsDePasse = {};
  const manquants = [];
  for (const role of ROLES) {
    const valeur = process.env[`SEED_MDP_${role}`];
    if (!valeur) manquants.push(`SEED_MDP_${role}`);
    else motsDePasse[role] = valeur;
  }
  if (manquants.length) {
    console.error('Variables manquantes dans .env :', manquants.join(', '));
    process.exit(1);
  }

  const comptes = await db.select().from(utilisateurs);
  if (comptes.length === 0) {
    console.log('Aucun utilisateur en base. Lance d\'abord : npm run db:seed');
    process.exit(0);
  }

  let modifies = 0;
  for (const compte of comptes) {
    const nouveau = motsDePasse[compte.role];
    if (!nouveau) {
      console.log(`  ignoré : ${compte.email} (rôle ${compte.role} sans variable)`);
      continue;
    }
    await db
      .update(utilisateurs)
      .set({ motDePasse: await hashMotDePasse(nouveau) })
      .where(eq(utilisateurs.id, compte.id));
    console.log(`  mis à jour : ${compte.email} (${compte.role})`);
    modifies++;
  }

  console.log(`\n${modifies} mot(s) de passe réinitialisé(s) depuis .env.`);
  console.log('Les anciens mots de passe ne fonctionnent plus, y compris en production.');
  process.exit(0);
}

reinitialiser().catch((e) => {
  console.error('Erreur lors de la réinitialisation :', e);
  process.exit(1);
});
