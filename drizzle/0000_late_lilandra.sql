CREATE TYPE "public"."role" AS ENUM('ADMIN', 'GUIDE', 'PELERIN', 'PROCHE');--> statement-breakpoint
CREATE TYPE "public"."statut_moderation" AS ENUM('EN_ATTENTE', 'APPROUVE', 'REJETE');--> statement-breakpoint
CREATE TYPE "public"."statut_sos" AS ENUM('EN_ATTENTE', 'RESOLU');--> statement-breakpoint
CREATE TYPE "public"."statut_visa" AS ENUM('EN_ATTENTE', 'APPROUVE', 'REFUSE');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	CONSTRAINT "admins_utilisateur_id_unique" UNIQUE("utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "annonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"urgence" boolean DEFAULT false,
	"date_publication" timestamp DEFAULT now() NOT NULL,
	"auteur_id" uuid,
	"groupe_id" uuid,
	"statut" "statut_moderation" DEFAULT 'APPROUVE' NOT NULL,
	"motif_rejet" text
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"libelle" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groupes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"guide_id" uuid NOT NULL,
	"hotel_mecque_id" uuid NOT NULL,
	"hotel_medine_id" uuid NOT NULL,
	"date_depart" date NOT NULL,
	"date_retour" date NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"disponibilite" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "guides_utilisateur_id_unique" UNIQUE("utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL,
	"adresse" text,
	"telephone" varchar(50),
	"nombre_etoiles" integer DEFAULT 5
);
--> statement-breakpoint
CREATE TABLE "pelerins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"numero_passeport" varchar(50) NOT NULL,
	"statut_visa" "statut_visa" DEFAULT 'EN_ATTENTE' NOT NULL,
	"certificat_vaccin" boolean DEFAULT false,
	"informations_medicales" text,
	"contact_urgence_nom" text,
	"contact_urgence_telephone" varchar(50),
	"groupe_id" uuid,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "pelerins_utilisateur_id_unique" UNIQUE("utilisateur_id"),
	CONSTRAINT "pelerins_numero_passeport_unique" UNIQUE("numero_passeport")
);
--> statement-breakpoint
CREATE TABLE "planning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"heure" varchar(10) NOT NULL,
	"lieu" text NOT NULL,
	"categorie_id" uuid NOT NULL,
	"groupe_id" uuid NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"etape_guide" text,
	"auteur_id" uuid,
	"statut" "statut_moderation" DEFAULT 'APPROUVE' NOT NULL,
	"motif_rejet" text
);
--> statement-breakpoint
CREATE TABLE "proches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"pelerin_id" uuid NOT NULL,
	"lien_parente" text NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "proches_utilisateur_id_unique" UNIQUE("utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "sos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pelerin_id" uuid NOT NULL,
	"guide_id" uuid NOT NULL,
	"latitude" numeric NOT NULL,
	"longitude" numeric NOT NULL,
	"date_heure" timestamp DEFAULT now() NOT NULL,
	"commentaire" text,
	"statut" "statut_sos" DEFAULT 'EN_ATTENTE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom_complet" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"telephone" varchar(50) NOT NULL,
	"mot_de_passe" text NOT NULL,
	"role" "role" NOT NULL,
	"photo" text,
	"date_creation" date DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "utilisateurs_email_unique" UNIQUE("email"),
	CONSTRAINT "utilisateurs_telephone_unique" UNIQUE("telephone")
);
--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_auteur_id_utilisateurs_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_groupe_id_groupes_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupes" ADD CONSTRAINT "groupes_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupes" ADD CONSTRAINT "groupes_hotel_mecque_id_hotels_id_fk" FOREIGN KEY ("hotel_mecque_id") REFERENCES "public"."hotels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupes" ADD CONSTRAINT "groupes_hotel_medine_id_hotels_id_fk" FOREIGN KEY ("hotel_medine_id") REFERENCES "public"."hotels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pelerins" ADD CONSTRAINT "pelerins_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pelerins" ADD CONSTRAINT "pelerins_groupe_id_groupes_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning" ADD CONSTRAINT "planning_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning" ADD CONSTRAINT "planning_groupe_id_groupes_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning" ADD CONSTRAINT "planning_auteur_id_utilisateurs_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proches" ADD CONSTRAINT "proches_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proches" ADD CONSTRAINT "proches_pelerin_id_pelerins_id_fk" FOREIGN KEY ("pelerin_id") REFERENCES "public"."pelerins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos" ADD CONSTRAINT "sos_pelerin_id_pelerins_id_fk" FOREIGN KEY ("pelerin_id") REFERENCES "public"."pelerins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos" ADD CONSTRAINT "sos_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;