import { z } from '@hono/zod-openapi';

// ----- ENUMS -----
export const RoleEnum = z.enum(['ADMIN', 'GUIDE', 'PELERIN', 'PROCHE']);
export const StatutVisaEnum = z.enum(['EN_ATTENTE', 'APPROUVE', 'REFUSE']);
export const StatutModerationEnum = z.enum(['EN_ATTENTE', 'APPROUVE', 'REJETE']);
export const StatutSosEnum = z.enum(['EN_ATTENTE', 'RESOLU']);

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
}).openapi('UtilisateurPublic');
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
}).openapi('UtilisateurCreation');

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