import { z } from '@hono/zod-openapi';

// ----- ENUMS -----
export const RoleEnum = z.enum(['ADMIN', 'GUIDE', 'PELERIN', 'PROCHE']);
export const StatutVisaEnum = z.enum(['EN_ATTENTE', 'APPROUVE', 'REFUSE']);
export const StatutModerationEnum = z.enum(['EN_ATTENTE', 'APPROUVE', 'REJETE']);
export const StatutSosEnum = z.enum(['EN_ATTENTE', 'RESOLU']);
export const StatutDemandeInscriptionEnum = z.enum(['EN_ATTENTE', 'ACCEPTEE', 'REFUSEE']);

// ----- SCHÉMAS COMMUNS -----
export const IdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const ErreurSchema = z.object({
  erreur: z.string(),
}).openapi('Erreur');

export const ConnexionSchema = z.object({
  email: z.string().email(),
  motDePasse: z.string().min(1),
}).openapi('Connexion');

export const UtilisateurPublicSchema = z.object({
  id: z.string().uuid(),
  nomComplet: z.string(),
  email: z.string().email(),
  telephone: z.string(),
  role: RoleEnum,
  photo: z.string().nullable(),
  dateCreation: z.string().date(), // Format YYYY-MM-DD
  isActive: z.boolean().default(true),
  // Permet au front d'afficher l'écran "changez votre mot de passe" dès la
  // connexion. Le contrôle d'accès réel reste côté backend (401), voir
  // middlewares/auth.js.
  doitChangerMotDePasse: z.boolean().default(false),
}).openapi('UtilisateurPublic');

/**
 * Répertoire minimal : ce que le front a besoin pour AFFICHER un nom.
 *
 * Volontairement sans `email`, `isActive`, `dateCreation` ni
 * `doitChangerMotDePasse`. La liste complète est réservée à l'ADMIN ; sans
 * cette séparation, un pèlerin connecté pouvait énumérer les identifiants de
 * connexion de tous les comptes, y compris les administrateurs, et l'état de
 * chaque compte.
 *
 * `telephone` reste présent : c'est un besoin d'affichage réel pour l'urgence
 * (un pèlerin appelle son guide, un proche appelle le guide du pèlerin qu'il
 * suit). Il manque encore un découpage par relation — voir chapitre 13.
 */
export const UtilisateurRepertoireSchema = z.object({
  id: z.string().uuid(),
  nomComplet: z.string(),
  role: RoleEnum,
  photo: z.string().nullable(),
  telephone: z.string(),
}).openapi('UtilisateurRepertoire');

/**
 * Réponse du contrôle d'unicité.
 *
 * Le contrôle était fait côté client en téléchargeant TOUTE la liste des
 * utilisateurs — ce qui exposait les emails et les téléphones de tout le monde
 * à chaque utilisateur connecté, y compris pour vérifier un seul champ. Il est
 * désormais décidé par le serveur, qui ne renvoie qu'un booléen.
 */
export const UtilisateurExistenceSchema = z.object({
  email: z.boolean(),
  telephone: z.boolean(),
}).openapi('UtilisateurExistence');
export const TokenSchema = z.object({
  token: z.string(),
  user: UtilisateurPublicSchema,
}).openapi('Token');

export const MessageSchema = z.object({
  message: z.string(),
}).openapi('Message');
// ----- 1. UTILISATEURS -----


export const UtilisateurCreationSchema = z.object({
  nomComplet: z.string(),
  email: z.string().email(),
  telephone: z.string(),
  motDePasse: z.string().min(6),
  role: RoleEnum,
  photo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  // Parcours B : l'ADMIN fournit un mot de passe TEMPORAIRE et ce drapeau
  // vaut true. Le compte est alors bloqué sur /changer-mot-de-passe jusqu'au
  // premier changement réel (contrôlé par authMiddleware).
  doitChangerMotDePasse: z.boolean().optional(),
}).openapi('UtilisateurCreation');

// ----- 13. CHANGEMENT DE MOT DE PASSE (propre) -----
// Route accessible avec un mot de passe provisoire, et c'est la SEULE route
// accessible dans ce cas. Voir ALLOWED_WHILE_PASSWORD_CHANGE dans
// middlewares/auth.js.
export const ChangerMotDePasseSchema = z.object({
  ancienMotDePasse: z.string().min(1),
  nouveauMotDePasse: z.string().min(8).max(128),
  confirmationMotDePasse: z.string(),
}).openapi('ChangerMotDePasse');

// ----- 2. ADMINS -----
export const AdminSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid(),
}).openapi('Admin');

// ----- 3. GUIDES -----
export const GuideSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid(),
  disponibilite: z.boolean().default(true),
  isActive: z.boolean().default(true),
}).openapi('Guide');

// ----- 4. HOTELS -----
export const HotelSchema = z.object({
  id: z.string().uuid(),
  nom: z.string(),
  ville: z.string(),
  adresse: z.string().optional(),
  telephone: z.string().optional(),
  nombreEtoiles: z.number().int().default(5),
}).openapi('Hotel');

// ----- 5. GROUPES -----
export const GroupeSchema = z.object({
  id: z.string().uuid(),
  nom: z.string(),
  guideId: z.string().uuid(),
  hotelMecqueId: z.string().uuid(),
  hotelMedineId: z.string().uuid(),
  dateDepart: z.string().date(),
  dateRetour: z.string().date(),
  isActive: z.boolean().default(true),
}).openapi('Groupe');

// ----- 6. PELERINS -----
export const PelerinSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid(),
  numeroPasseport: z.string(),
  statutVisa: StatutVisaEnum.default('EN_ATTENTE'),
  certificatVaccin: z.boolean().default(false),
  informationsMedicales: z.string().optional(),
  contactUrgenceNom: z.string().optional(),
  contactUrgenceTelephone: z.string().optional(),
  groupeId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
}).openapi('Pelerin');

// ----- 7. PROCHES -----
export const ProcheSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid(),
  pelerinId: z.string().uuid(),
  lienParente: z.string(),
  isActive: z.boolean().default(true),
}).openapi('Proche');

// ----- 8. CATEGORIES -----
export const CategorieSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
}).openapi('Categorie');

// ----- 9. PLANNING -----
export const PlanningSchema = z.object({
  id: z.string().uuid(),
  titre: z.string(),
  description: z.string().optional(),
  date: z.string().date(),
  heure: z.string(),
  lieu: z.string(),
  categorieId: z.string().uuid(),
  groupeId: z.string().uuid(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  etapeGuide: z.string().optional(),
  auteurId: z.string().uuid().optional(),
  statut: StatutModerationEnum.default('APPROUVE'),
  motifRejet: z.string().optional(),
}).openapi('Planning');

// ----- 10. ANNONCES -----
export const AnnonceSchema = z.object({
  id: z.string().uuid(),
  titre: z.string(),
  contenu: z.string(),
  urgence: z.boolean().default(false),
  datePublication: z.string().datetime({ offset: true }), // ISO 8601
  auteurId: z.string().uuid().optional(),
  groupeId: z.string().uuid().optional(),
  statut: StatutModerationEnum.default('APPROUVE'),
  motifRejet: z.string().optional(),
}).openapi('Annonce');

// ----- 11. SOS -----
export const SosSchema = z.object({
  id: z.string().uuid(),
  pelerinId: z.string().uuid(),
  guideId: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
  dateHeure: z.string().datetime({ offset: true }),
  commentaire: z.string().optional(),
  statut: StatutSosEnum.default('EN_ATTENTE'),
}).openapi('Sos');

// ----- 12. DEMANDES D'INSCRIPTION -----
// Schéma de lecture renvoyé par l'API.
// `motDePasse` en est ABSENT VOLONTAIREMENT : le hash ne sort jamais du serveur,
// ni à l'ADMIN, ni dans les logs. C'est le seul moyen de garantir qu'il ne
// fuite pas, plutôt que d'espérer que chaque appelant sache l'omettre.
export const DemandeInscriptionSchema = z.object({
  id: z.string().uuid(),
  nom: z.string(),
  prenom: z.string(),
  telephone: z.string(),
  email: z.string().email(),
  referencePaiement: z.string(),
  statut: StatutDemandeInscriptionEnum.default('EN_ATTENTE'),
  motifRefus: z.string().nullable().optional(),
  commentaireRefus: z.string().nullable().optional(),
  groupeId: z.string().uuid().nullable().optional(),
  utilisateurId: z.string().uuid().nullable().optional(),
  pelerinId: z.string().uuid().nullable().optional(),
  dateDemande: z.string().datetime({ offset: true }),
  dateTraitement: z.string().datetime({ offset: true }).nullable().optional(),
  traitePar: z.string().uuid().nullable().optional(),
}).openapi('DemandeInscription');

// Corps de la demande publique POST /demandes-inscription.
// Le pèlerin ne fournit PAS son groupe (choisi par l'ADMIN) et PAS son
// numéro de passeport (saisi par l'ADMIN dans la modale d'acceptation).
export const DemandeInscriptionCreationSchema = z.object({
  nom: z.string().trim().min(2).max(100),
  prenom: z.string().trim().min(2).max(100),
  telephone: z.string().trim().min(6).max(20),
  email: z.string().trim().email().max(255),
  referencePaiement: z.string().trim().min(1).max(100),
  motDePasse: z.string().min(8).max(128),
  confirmationMotDePasse: z.string(),
}).openapi('DemandeInscriptionCreation');

export const DemandeInscriptionAccepterSchema = z.object({
  groupeId: z.string().uuid(),
  numeroPasseport: z.string().trim().min(3).max(50),
  // Facultatif : le pilgrin n'est pas obligé d'en fournir à l'inscription.
  contactUrgenceNom: z.string().trim().max(100).optional(),
  contactUrgenceTelephone: z.string().trim().max(20).optional(),
}).openapi('DemandeInscriptionAccepter');

export const DemandeInscriptionRefuserSchema = z.object({
  motifRefus: z.string().trim().min(2).max(500),
  commentaireRefus: z.string().trim().max(1000).optional(),
}).openapi('DemandeInscriptionRefuser');