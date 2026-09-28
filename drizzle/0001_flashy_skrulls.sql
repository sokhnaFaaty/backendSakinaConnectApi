CREATE TYPE "public"."statut_demande_inscription" AS ENUM('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');--> statement-breakpoint
CREATE TABLE "demande_inscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"telephone" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"reference_paiement" varchar(100) NOT NULL,
	"mot_de_passe" text,
	"statut" "statut_demande_inscription" DEFAULT 'EN_ATTENTE' NOT NULL,
	"motif_refus" text,
	"commentaire_refus" text,
	"groupe_id" uuid,
	"utilisateur_id" uuid,
	"pelerin_id" uuid,
	"date_demande" timestamp DEFAULT now() NOT NULL,
	"date_traitement" timestamp,
	"traite_par" uuid
);
--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD COLUMN "doit_changer_mot_de_passe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "demande_inscriptions" ADD CONSTRAINT "demande_inscriptions_groupe_id_groupes_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_inscriptions" ADD CONSTRAINT "demande_inscriptions_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_inscriptions" ADD CONSTRAINT "demande_inscriptions_pelerin_id_pelerins_id_fk" FOREIGN KEY ("pelerin_id") REFERENCES "public"."pelerins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_inscriptions" ADD CONSTRAINT "demande_inscriptions_traite_par_utilisateurs_id_fk" FOREIGN KEY ("traite_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proches" ADD CONSTRAINT "proches_pelerin_id_unique" UNIQUE("pelerin_id");