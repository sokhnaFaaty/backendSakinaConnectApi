import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { createCrudService } from './base.service.js';
import { proches } from '../db/schema.js';
import { ErreurMetier } from './demandeInscriptions.js';

export const prochesService = {
  ...createCrudService(proches),

  findByUtilisateurId: (utilisateurId) =>
    db.select().from(proches).where(eq(proches.utilisateurId, utilisateurId)),

  findByPelerinId: (pelerinId) =>
    db.select().from(proches).where(eq(proches.pelerinId, pelerinId)),

  /**
   * Rattache l'utilisateur connecté à SON pèlerin, en respectant au maximum un
   * lien par pèlerin.
   *
   * Trois cas, et c'est tout :
   *   1. aucun lien      -> création ;
   *   2. lien existant   -> simple mise à jour (le pèlerin peut corriger son
   *                         lien de parenté) ;
   *   3. lien existant mais SUPPRIMÉ (isActive = false) -> RÉACTIVATION.
   *
   * Le cas 3 est celui qui justifie tout ce commentaire. L'archivage
   *(positionne isActive à false) était historique : il laissait la ligne en
   * place. Comme `proches.pelerin_id` porte désormais une contrainte UNIQUE,
   * ressusciter ce lien par un INSERT échouerait, et l'utilisateur se
   * retrouverait bloqué sans pouvoir rattacher son pèlerin. On réactive donc la
   * ligne existante au lieu d'en créer une seconde.
   */
  lienPourUtilisateur: async ({ utilisateurId, pelerinId, lienParente }) => {
    const [existant] = await db
      .select()
      .from(proches)
      .where(eq(proches.utilisateurId, utilisateurId))
      .limit(1);

    if (existant) {
      if (existant.pelerinId !== pelerinId) {
        throw new ErreurMetier(
          'Ce compte est déjà rattaché à un autre pèlerin. Contactez l\'administration pour le modifier.',
          409,
        );
      }
      const [maj] = await db
        .update(proches)
        .set({ lienParente, isActive: true })
        .where(eq(proches.id, existant.id))
        .returning();
      return { proche: maj, cree: false };
    }

    // Sûreté : un AUTRE utilisateur ne doit pas déjà revendiquer ce pèlerin.
    // La contrainte UNIQUE le bloquera de toute façon ; on donne un message
    // clair plutôt qu'une erreur 500.
    const [dejaPris] = await db
      .select({ id: proches.id })
      .from(proches)
      .where(eq(proches.pelerinId, pelerinId))
      .limit(1);

    if (dejaPris) {
      throw new ErreurMetier(
        'Un proche est déjà rattaché à ce pèlerin.',
        409,
      );
    }

    const [cree] = await db
      .insert(proches)
      .values({ utilisateurId, pelerinId, lienParente, isActive: true })
      .returning();

    return { proche: cree, cree: true };
  },
};
