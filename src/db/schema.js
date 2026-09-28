import { 
  pgTable, uuid, text, varchar, boolean, date, timestamp, integer, numeric, 
  pgEnum 
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ----- ENUMS -----
export const roleEnum = pgEnum('role', ['ADMIN', 'GUIDE', 'PELERIN', 'PROCHE']);
export const statutVisaEnum = pgEnum('statut_visa', ['EN_ATTENTE', 'APPROUVE', 'REFUSE']);
export const statutModerationEnum = pgEnum('statut_moderation', ['EN_ATTENTE', 'APPROUVE', 'REJETE']);
export const statutSosEnum = pgEnum('statut_sos', ['EN_ATTENTE', 'RESOLU']);
export const statutDemandeInscriptionEnum = pgEnum('statut_demande_inscription', [
  'EN_ATTENTE',
  'ACCEPTEE',
  'REFUSEE',
]);

// ----- TABLES -----

export const utilisateurs = pgTable('utilisateurs', {
  id: uuid('id').primaryKey().defaultRandom(),
  nomComplet: text('nom_complet').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  telephone: varchar('telephone', { length: 50 }).notNull().unique(),
  motDePasse: text('mot_de_passe').notNull(),
  role: roleEnum('role').notNull(),
  photo: text('photo'),
  dateCreation: date('date_creation').notNull().defaultNow(),
  isActive: boolean('is_active').default(true),
  // Parcours B (création directe par l'ADMIN) : le compte reçoit un mot de passe
  // temporaire et DOIT le changer avant de pouvoir utiliser l'application.
  // Parcours A (inscription du pèlerin lui-même) : le pèlerin choisit son mot de
  // passe, le compte est créé avec false.
  // Default false => aucun changement forcé sur les comptes déjà existants.
  doitChangerMotDePasse: boolean('doit_changer_mot_de_passe').notNull().default(false),
});

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  utilisateurId: uuid('utilisateur_id').notNull().unique().references(() => utilisateurs.id),
});

export const guides = pgTable('guides', {
  id: uuid('id').primaryKey().defaultRandom(),
  utilisateurId: uuid('utilisateur_id').notNull().unique().references(() => utilisateurs.id),
  disponibilite: boolean('disponibilite').default(true),
  isActive: boolean('is_active').default(true),
});

export const hotels = pgTable('hotels', {
  id: uuid('id').primaryKey().defaultRandom(),
  nom: text('nom').notNull(),
  ville: text('ville').notNull(),
  adresse: text('adresse'),
  telephone: varchar('telephone', { length: 50 }),
  nombreEtoiles: integer('nombre_etoiles').default(5),
});

export const groupes = pgTable('groupes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nom: text('nom').notNull(),
  guideId: uuid('guide_id').notNull().references(() => guides.id),
  hotelMecqueId: uuid('hotel_mecque_id').notNull().references(() => hotels.id),
  hotelMedineId: uuid('hotel_medine_id').notNull().references(() => hotels.id),
  dateDepart: date('date_depart').notNull(),
  dateRetour: date('date_retour').notNull(),
  isActive: boolean('is_active').default(true),
});

export const pelerins = pgTable('pelerins', {
  id: uuid('id').primaryKey().defaultRandom(),
  utilisateurId: uuid('utilisateur_id').notNull().unique().references(() => utilisateurs.id),
  numeroPasseport: varchar('numero_passeport', { length: 50 }).notNull().unique(),
  statutVisa: statutVisaEnum('statut_visa').notNull().default('EN_ATTENTE'),
  certificatVaccin: boolean('certificat_vaccin').default(false),
  informationsMedicales: text('informations_medicales'),
  contactUrgenceNom: text('contact_urgence_nom'),
  contactUrgenceTelephone: varchar('contact_urgence_telephone', { length: 50 }),
  groupeId: uuid('groupe_id').references(() => groupes.id),
  isActive: boolean('is_active').default(true),
});

export const proches = pgTable('proches', {
  id: uuid('id').primaryKey().defaultRandom(),
  utilisateurId: uuid('utilisateur_id').notNull().unique().references(() => utilisateurs.id),
  // Règle métier : un pèlerin a 0 ou 1 proche maximum (PELERIN 1 ─── 0..1 PROCHE).
  // La contrainte UNIQUE est ce qui rend cette règle vraie côté base : sans elle,
  // rien n'empêche d'insérer deux proches pour le même pèlerin.
  pelerinId: uuid('pelerin_id').notNull().unique().references(() => pelerins.id),
  lienParente: text('lien_parente').notNull(),
  isActive: boolean('is_active').default(true),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  libelle: text('libelle').notNull(),
});

export const planning = pgTable('planning', {
  id: uuid('id').primaryKey().defaultRandom(),
  titre: text('titre').notNull(),
  description: text('description'),
  date: date('date').notNull(),
  heure: varchar('heure', { length: 10 }).notNull(),
  lieu: text('lieu').notNull(),
  categorieId: uuid('categorie_id').notNull().references(() => categories.id),
  groupeId: uuid('groupe_id').notNull().references(() => groupes.id),
  // mode 'number' : sans lui, Postgres renvoie les numeric sous forme de chaîne
  // et le front casse sur latitude.toFixed(...)
  latitude: numeric('latitude', { mode: 'number' }),
  longitude: numeric('longitude', { mode: 'number' }),
  etapeGuide: text('etape_guide'),
  auteurId: uuid('auteur_id').references(() => utilisateurs.id),
  statut: statutModerationEnum('statut').notNull().default('APPROUVE'),
  motifRejet: text('motif_rejet'),
});

export const annonces = pgTable('annonces', {
  id: uuid('id').primaryKey().defaultRandom(),
  titre: text('titre').notNull(),
  contenu: text('contenu').notNull(),
  urgence: boolean('urgence').default(false),
  datePublication: timestamp('date_publication').notNull().defaultNow(),
  auteurId: uuid('auteur_id').references(() => utilisateurs.id),
  groupeId: uuid('groupe_id').references(() => groupes.id),
  statut: statutModerationEnum('statut').notNull().default('APPROUVE'),
  motifRejet: text('motif_rejet'),
});

export const sos = pgTable('sos', {
  id: uuid('id').primaryKey().defaultRandom(),
  pelerinId: uuid('pelerin_id').notNull().references(() => pelerins.id),
  guideId: uuid('guide_id').notNull().references(() => guides.id),
  latitude: numeric('latitude', { mode: 'number' }).notNull(),
  longitude: numeric('longitude', { mode: 'number' }).notNull(),
  dateHeure: timestamp('date_heure').notNull().defaultNow(),
  commentaire: text('commentaire'),
  statut: statutSosEnum('statut').notNull().default('EN_ATTENTE'),
});

// ----- 12. DEMANDES D'INSCRIPTION (parcours « Nous rejoindre ») -----
// Rappel : ce n'est PAS une table de paiements. Il n'existe volontairement
// aucune table `paiements` : `reference_paiement` est une simple référence
// saisie par le pèlerin, que l'agence compare à ses relevés. La vérification
// du paiement reste 100 % manuelle, faite par l'administrateur.
export const demandeInscriptions = pgTable('demande_inscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  nom: text('nom').notNull(),
  prenom: text('prenom').notNull(),
  telephone: varchar('telephone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  referencePaiement: varchar('reference_paiement', { length: 100 }).notNull(),
  // Hash bcrypt du mot de passe choisi par le pèlerin.
  // Volontairement NULLABLE : purgé (null) dès que la demande est traitée,
  // ACCEPTEE comme REFUSEE. Jamais renvoyé par l'API (absent des schémas Zod
  // et retiré explicitement par le service à chaque lecture).
  motDePasse: text('mot_de_passe'),
  statut: statutDemandeInscriptionEnum('statut').notNull().default('EN_ATTENTE'),
  motifRefus: text('motif_refus'),
  commentaireRefus: text('commentaire_refus'),
  // Remplis uniquement à l'acceptation, par l'ADMIN. Le pèlerin ne choisit
  // jamais son groupe : c'est la règle métier demandée.
  groupeId: uuid('groupe_id').references(() => groupes.id),
  utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id),
  pelerinId: uuid('pelerin_id').references(() => pelerins.id),
  dateDemande: timestamp('date_demande').notNull().defaultNow(),
  dateTraitement: timestamp('date_traitement'),
  traitePar: uuid('traite_par').references(() => utilisateurs.id),
});

// ----- RELATIONS (Drizzle) -----
export const utilisateursRelations = relations(utilisateurs, ({ one, many }) => ({
  admin: one(admins, { fields: [utilisateurs.id], references: [admins.utilisateurId] }),
  guide: one(guides, { fields: [utilisateurs.id], references: [guides.utilisateurId] }),
  pelerin: one(pelerins, { fields: [utilisateurs.id], references: [pelerins.utilisateurId] }),
  proche: one(proches, { fields: [utilisateurs.id], references: [proches.utilisateurId] }),
  planningAuteur: many(planning),
  annoncesAuteur: many(annonces),
  demandesInscription: many(demandeInscriptions),
  demandesTraitees: many(demandeInscriptions, { relationName: 'demandeTraitePar' }),
}));

export const adminsRelations = relations(admins, ({ one }) => ({
  utilisateur: one(utilisateurs, { fields: [admins.utilisateurId], references: [utilisateurs.id] }),
}));

export const guidesRelations = relations(guides, ({ one, many }) => ({
  utilisateur: one(utilisateurs, { fields: [guides.utilisateurId], references: [utilisateurs.id] }),
  groupes: many(groupes),
  sos: many(sos),
}));

export const hotelsRelations = relations(hotels, ({ many }) => ({
  groupesMecque: many(groupes, { relationName: 'hotelMecque' }),
  groupesMedine: many(groupes, { relationName: 'hotelMedine' }),
}));

export const groupesRelations = relations(groupes, ({ one, many }) => ({
  guide: one(guides, { fields: [groupes.guideId], references: [guides.id] }),
  hotelMecque: one(hotels, { fields: [groupes.hotelMecqueId], references: [hotels.id], relationName: 'hotelMecque' }),
  hotelMedine: one(hotels, { fields: [groupes.hotelMedineId], references: [hotels.id], relationName: 'hotelMedine' }),
  pelerins: many(pelerins),
  planning: many(planning),
  annonces: many(annonces),
  demandesInscription: many(demandeInscriptions),
}));

export const pelerinsRelations = relations(pelerins, ({ one, many }) => ({
  utilisateur: one(utilisateurs, { fields: [pelerins.utilisateurId], references: [utilisateurs.id] }),
  groupe: one(groupes, { fields: [pelerins.groupeId], references: [groupes.id] }),
  proches: many(proches),
  sos: many(sos),
  demandesInscription: many(demandeInscriptions),
}));

export const prochesRelations = relations(proches, ({ one }) => ({
  utilisateur: one(utilisateurs, { fields: [proches.utilisateurId], references: [utilisateurs.id] }),
  pelerin: one(pelerins, { fields: [proches.pelerinId], references: [pelerins.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  planning: many(planning),
}));

export const planningRelations = relations(planning, ({ one }) => ({
  categorie: one(categories, { fields: [planning.categorieId], references: [categories.id] }),
  groupe: one(groupes, { fields: [planning.groupeId], references: [groupes.id] }),
  auteur: one(utilisateurs, { fields: [planning.auteurId], references: [utilisateurs.id] }),
}));

export const annoncesRelations = relations(annonces, ({ one }) => ({
  auteur: one(utilisateurs, { fields: [annonces.auteurId], references: [utilisateurs.id] }),
  groupe: one(groupes, { fields: [annonces.groupeId], references: [groupes.id] }),
}));

export const sosRelations = relations(sos, ({ one }) => ({
  pelerin: one(pelerins, { fields: [sos.pelerinId], references: [pelerins.id] }),
  guide: one(guides, { fields: [sos.guideId], references: [guides.id] }),
}));

export const demandeInscriptionsRelations = relations(demandeInscriptions, ({ one }) => ({
  groupe: one(groupes, { fields: [demandeInscriptions.groupeId], references: [groupes.id] }),
  utilisateur: one(utilisateurs, {
    fields: [demandeInscriptions.utilisateurId],
    references: [utilisateurs.id],
    relationName: 'demandeInscription',
  }),
  pelerin: one(pelerins, { fields: [demandeInscriptions.pelerinId], references: [pelerins.id] }),
  traitePar: one(utilisateurs, {
    fields: [demandeInscriptions.traitePar],
    references: [utilisateurs.id],
    relationName: 'demandeTraitePar',
  }),
}));