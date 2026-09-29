import { createCrudService } from './base.service.js';
import { utilisateurs } from '../db/schema.js';
import { db } from '../db/client.js';
import { and, eq, or, ne, ilike } from 'drizzle-orm';
import { hashMotDePasse } from './auth.js'; //  Importe ma fonction de hachage

const baseService = createCrudService(utilisateurs);

// Le hash ne doit jamais sortir du serveur : OpenAPIHono ne valide que les
// requêtes, pas les réponses, donc UtilisateurPublicSchema ne filtre rien.
const sansMotDePasse = (utilisateur) => {
  if (!utilisateur) return utilisateur;
  const { motDePasse: _hash, ...publics } = utilisateur;
  return publics;
};

/**
 * Projection minimale servant à afficher un nom dans l'interface.
 *
 * Pourquoi c'est une liste distincte de `getAll()` : le front a besoin de
 * résoudre `utilisateurId -> nomComplet` presque partout, mais n'a PAS besoin
 * de l'email, de l'état du compte ni du drapeau « doit changer de mot de passe »
 * de tout le monde. En servant la ligne entière à un pèlerin, on lui permettait
 * d'énumérer les identifiants de connexion de tous les comptes, y compris ceux
 * des administrateurs, et l'état de chaque compte.
 *
 * Le téléphone reste présent : un pèlerin doit pouvoir appeler son guide en
 * urgence, et un proche le guide du pèlerin qu'il suit. C'est un besoin réel
 * d'affichage, pas une fuite. Le retirer ici casserait `PoleUrgencePelerinView`,
 * `SuiviFamilialView` et `DashboardProcheView` sans rien gagner côté sécurité.
 */
const versRepertoire = (u) => ({
  id: u.id,
  nomComplet: u.nomComplet,
  role: u.role,
  photo: u.photo,
  telephone: u.telephone,
});

export const utilisateursService = {
  ...baseService,

  getAll: async () => (await baseService.getAll()).map(sansMotDePasse),

  /** Répertoire public : uniquement les champs affichables, pour tout utilisateur connecté. */
  getRepertoire: async () => {
    const lignes = await db
      .select({
        id: utilisateurs.id,
        nomComplet: utilisateurs.nomComplet,
        role: utilisateurs.role,
        photo: utilisateurs.photo,
        telephone: utilisateurs.telephone,
      })
      .from(utilisateurs);

    return lignes.map(versRepertoire);
  },

  /**
   * Unicité d'un email et/ou d'un téléphone, décidée en base.
   *
   * `exclureId` permet de valider un compte en cours d'édition sans que la
   * valeur actuelle soit considérée comme un conflit avec elle-même.
   *
   * Le téléphone est comparé sur ses seuls chiffres : `77 123 45 67` et
   * `771234567` désignent la même personne, et l'unicité en base porte sur une
   * colonne texte. C'est le contrôle que le client faisait avant, en
   * normalisant de son côté — le déplacer ici sans cette normalisation
   * laisserait passer des doublons.
   */
  existe: async ({ email, telephone, exclureId } = {}) => {
    const conditions = [];
    if (exclureId) conditions.push(ne(utilisateurs.id, exclureId));

    const emailPris = email
      ? (
          await db
            .select({ id: utilisateurs.id })
            .from(utilisateurs)
            .where(
              and(
                eq(utilisateurs.email, email),
                ...(conditions.length ? conditions : []),
              ),
            )
            .limit(1)
        ).length > 0
      : false;

    let telephonePris = false;
    if (telephone) {
      const chiffres = String(telephone).replace(/\D/g, '').slice(-9);
      // On garde un peu de marge autour du suffixe : `221771234567` doit
      // être retrouvé par `771234567`. Sans cela, deux écritures du même
      // numéro passeraient toutes deux le contrôle.
      const motif = `%${chiffres}`;
      const lignes = await db
        .select({ telephone: utilisateurs.telephone })
        .from(utilisateurs)
        .where(
          and(
            or(
              eq(utilisateurs.telephone, telephone),
              ilike(utilisateurs.telephone, motif),
            ),
            ...(conditions.length ? conditions : []),
          ),
        )
        .limit(20);

      telephonePris = lignes.some((l) =>
        String(l.telephone).replace(/\D/g, '').slice(-9) === chiffres,
      );
    }

    return { email: emailPris, telephone: telephonePris };
  },

  getById: async (id) => sansMotDePasse(await baseService.getById(id)),

  create: async (data) => {
    if (data.motDePasse) {
      data.motDePasse = await hashMotDePasse(data.motDePasse);
    }
    return sansMotDePasse(await baseService.create(data));
  },

  update: async (id, data) => {
    if (data.motDePasse) {
      data.motDePasse = await hashMotDePasse(data.motDePasse);
    }
    return sansMotDePasse(await baseService.update(id, data));
  }
};
