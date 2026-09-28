/**
 * services/demandeInscriptions.js
 *
 * Logique du parcours « Nous rejoindre » : un pèlerin remplit un formulaire
 * public, l'administrateur accepte ou refuse, et l'acceptation crée le compte.
 *
 * Deux invariants tenus ici, et nulle part ailleurs :
 *  1. le hash du mot de passe choisi par le pèlerin vit UNIQUEMENT le temps
 *     que la demande est EN_ATTENTE, puis il est mis à null ;
 *  2. une demande ne peut être traitée qu'une fois, et l'acceptation crée le
 *     pilgrin, son compte et son affectation de groupe de façon atomique.
 */

import { and, count, desc, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  demandeInscriptions,
  groupes,
  pelerins,
  utilisateurs,
} from '../db/schema.js';
import { hashMotDePasse } from './auth.js';

/** Erreur métier, porteuse d'un code HTTP pour la route. */
export class ErreurMetier extends Error {
  constructor(message, statut = 400, details = {}) {
    super(message);
    this.statut = statut;
    this.details = details;
  }
}

/** 23505 = unique_violation. Sert à distinguer un doublon d'une panne. */
export const CONTRAINTE_UNIQUE = '23505';

export function estViolationUnique(err) {
  return err?.code === CONTRAINTE_UNIQUE;
}

/**
 * Retire le hash avant toute sortie.
 * Même si un jour quelqu'un ajoute `motDePasse` à un schéma Zod de lecture,
 * cette fonction reste la barrière : c'est elle, pas le schéma, qui est le
 * dernier rempart.
 */
function sansMotDePasse(demande) {
  if (!demande) return demande;
  const { motDePasse: _hash, ...safe } = demande;
  return safe;
}

// ---------------------------------------------------------------- création

/**
 * Crée une demande EN_ATTENTE.
 * Le mot de passe est choice du pèlerin : il devient le mot de passe définitif
 * du compte créé à l'acceptation, sans changement forcé.
 */
export async function creerDemandePublic(data) {
  const email = data.email.trim().toLowerCase();
  const telephone = data.telephone.trim();

  // Un email déjà utilisé ne doit pas être révélé tel quel sur une route
  // publique (énumération de comptes). Message volontairement générique.
  const [existant] = await db
    .select({ id: utilisateurs.id })
    .from(utilisateurs)
    .where(
      or(
        eq(utilisateurs.email, email),
        eq(utilisateurs.telephone, telephone),
      ),
    )
    .limit(1);

  if (existant) {
    throw new ErreurMetier(
      'Cette demande ne peut pas être enregistrée. Si vous avez déjà un compte, connectez-vous, ou contactez l\'administration.',
      409,
    );
  }

  const [doublon] = await db
    .select({ id: demandeInscriptions.id })
    .from(demandeInscriptions)
    .where(
      and(
        eq(demandeInscriptions.email, email),
        eq(demandeInscriptions.statut, 'EN_ATTENTE'),
      ),
    )
    .limit(1);

  if (doublon) {
    throw new ErreurMetier(
      'Une demande est déjà en attente avec cet email. Elle doit être traitée avant d’en soumettre une nouvelle.',
      409,
    );
  }

  const hash = await hashMotDePasse(data.motDePasse);

  const [creee] = await db
    .insert(demandeInscriptions)
    .values({
      nom: data.nom.trim(),
      prenom: data.prenom.trim(),
      telephone,
      email,
      referencePaiement: data.referencePaiement.trim(),
      motDePasse: hash,
      statut: 'EN_ATTENTE',
    })
    .returning();

  return sansMotDePasse(creee);
}

// ---------------------------------------------------------------- lectures

export async function listerDemandes({ statut } = {}) {
  const lignes = await db
    .select()
    .from(demandeInscriptions)
    .where(statut ? eq(demandeInscriptions.statut, statut) : undefined)
    .orderBy(desc(demandeInscriptions.dateDemande));

  return lignes.map(sansMotDePasse);
}

export async function getDemande(id) {
  const [demande] = await db
    .select()
    .from(demandeInscriptions)
    .where(eq(demandeInscriptions.id, id))
    .limit(1);
  return sansMotDePasse(demande);
}

/** Récupère la demande en réservant la ligne (anti-double-traitement). */
async function verrouillerDemande(tx, id) {
  const [demande] = await tx
    .select()
    .from(demandeInscriptions)
    .where(eq(demandeInscriptions.id, id))
    .for('update')
    .limit(1);
  return demande;
}

// ---------------------------------------------------------------- traitement

/**
 * Refus. Simple, mais l'exigence d'être EN_ATTENTE est ce qui empêche de
 * réécrire l'historique d'une demande déjà acceptée puis refusée.
 */
export async function refuserDemande(id, adminId, { motifRefus, commentaireRefus }) {
  const [demande] = await db
    .select()
    .from(demandeInscriptions)
    .where(eq(demandeInscriptions.id, id))
    .limit(1);

  if (!demande) throw new ErreurMetier('Demande introuvable', 404);

  if (demande.statut !== 'EN_ATTENTE') {
    throw new ErreurMetier(
      `Cette demande a déjà été traitée (${demande.statut}).`,
      409,
    );
  }

  const [refusee] = await db
    .update(demandeInscriptions)
    .set({
      statut: 'REFUSEE',
      motifRefus: motifRefus.trim(),
      commentaireRefus: commentaireRefus?.trim() || null,
      dateTraitement: new Date(),
      traitePar: adminId,
      // Le mot de passe ne sert plus à rien : on le détruit.
      motDePasse: null,
    })
    .where(
      and(
        eq(demandeInscriptions.id, id),
        eq(demandeInscriptions.statut, 'EN_ATTENTE'),
      ),
    )
    .returning();

  return sansMotDePasse(refusee);
}

/**
 * Acceptation.
 *
 * Tout se passe dans une transaction, et toutes les requêtes passent par `tx`
 * (et non par le `db` global) : c'est la seule façon d'obtenir un rollback
 * réel. Avec le `db` global, un échec à la troisième étape laisserait un
 * utilisateur créé sans pèlerin, c'est-à-dire un compte orphelin impossible à
 * nettoyer depuis l'interface.
 *
 * L'ADMIN choisit le groupe ET saisit le numéro de passeport, absent du
 * formulaire public.
 */
export async function accepterDemande(id, adminId, { groupeId, numeroPasseport, contactUrgenceNom, contactUrgenceTelephone }) {
  try {
    const resultat = await db.transaction(async (tx) => {
      const demande = await verrouillerDemande(tx, id);

      if (!demande) throw new ErreurMetier('Demande introuvable', 404);

      if (demande.statut !== 'EN_ATTENTE') {
        throw new ErreurMetier(
          `Cette demande a déjà été traitée (${demande.statut}).`,
          409,
        );
      }

      if (!demande.motDePasse) {
        throw new ErreurMetier(
          'Le mot de passe de cette demande a déjà été purgé : elle a été traitée.',
          409,
        );
      }

      // Le groupe doit exister et être actif : on ne veut pas d'un pèlerin
      // affecté à un groupe archivé.
      const [groupe] = await tx
        .select({ id: groupes.id, nom: groupes.nom, isActive: groupes.isActive })
        .from(groupes)
        .where(eq(groupes.id, groupeId))
        .limit(1);

      if (!groupe) throw new ErreurMetier('Groupe introuvable', 404);
      if (groupe.isActive === false) {
        throw new ErreurMetier(
          'Ce groupe n’est plus actif. Choisissez un autre groupe.',
          409,
        );
      }

      // Le numéro de passeport est unique en base : le contrôle applicatif
      // suivant ne sert qu'à rendre le message clair, la vraie barrière reste
      // la contrainte (voir estViolationUnique plus bas).
      const [passeportPris] = await tx
        .select({ id: pelerins.id })
        .from(pelerins)
        .where(eq(pelerins.numeroPasseport, numeroPasseport.trim()))
        .limit(1);

      if (passeportPris) {
        throw new ErreurMetier(
          'Ce numéro de passeport est déjà utilisé par un autre pèlerin.',
          409,
        );
      }

      // 1) Le compte. Mot de passe repris tel quel depuis la demande : le
      //    pèlerin l'a choisi lui-même, donc pas de changement forcé.
      const [utilisateur] = await tx
        .insert(utilisateurs)
        .values({
          nomComplet: `${demande.prenom} ${demande.nom}`,
          email: demande.email,
          telephone: demande.telephone,
          motDePasse: demande.motDePasse,
          role: 'PELERIN',
          isActive: true,
          doitChangerMotDePasse: false,
        })
        .returning();

      // 2) La fiche pèlerin, avec le groupe choisi par l'admin.
      const [pelerin] = await tx
        .insert(pelerins)
        .values({
          utilisateurId: utilisateur.id,
          numeroPasseport: numeroPasseport.trim(),
          groupeId,
          statutVisa: 'EN_ATTENTE',
          contactUrgenceNom: contactUrgenceNom?.trim() || null,
          contactUrgenceTelephone: contactUrgenceTelephone?.trim() || null,
          isActive: true,
        })
        .returning();

      // 3) Clôture de la demande et purge du mot de passe.
      //    La condition `statut = 'EN_ATTENTE'` est la barrière décisive contre
      //    le double traitement : si deux administrateurs valident en même temps,
      //    une seule ligne est touchée, et le perdant voit `traitee` vide et
      //    provoque un rollback complet (donc pas de compte orphelin créé).
      const [traitee] = await tx
        .update(demandeInscriptions)
        .set({
          statut: 'ACCEPTEE',
          groupeId,
          utilisateurId: utilisateur.id,
          pelerinId: pelerin.id,
          dateTraitement: new Date(),
          traitePar: adminId,
          motDePasse: null,
        })
        .where(
          and(
            eq(demandeInscriptions.id, id),
            eq(demandeInscriptions.statut, 'EN_ATTENTE'),
          ),
        )
        .returning();

      if (!traitee) {
        throw new ErreurMetier(
          'Cette demande vient d’être traitée par un autre administrateur.',
          409,
        );
      }

      return sansMotDePasse(traitee);
    });

    return resultat;
  } catch (err) {
    if (estViolationUnique(err)) {
      throw new ErreurMetier(
        'Cet email, ce téléphone ou ce numéro de passeport est déjà utilisé.',
        409,
      );
    }
    throw err;
  }
}

/** Compteurs pour le tableau de bord ADMIN. */
export async function compterParStatut() {
  const lignes = await db
    .select({
      statut: demandeInscriptions.statut,
      total: count(),
    })
    .from(demandeInscriptions)
    .groupBy(demandeInscriptions.statut);

  return lignes.reduce(
    (acc, l) => ({ ...acc, [l.statut]: l.total }),
    { EN_ATTENTE: 0, ACCEPTEE: 0, REFUSEE: 0 },
  );
}
