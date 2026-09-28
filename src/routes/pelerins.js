import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import {
  ecritureReserveeA,
  groupeDuGuidePourUtilisateur,
  pelerinIdSuiviParProche,
} from "../middlewares/authorize.js";
import { pelerinsService } from "../services/pelerins.js";
import { PelerinSchema, IdParamSchema, ErreurSchema } from "../schemas.js";

const pelerinsRouter = new OpenAPIHono();

// Toutes les routes exigent au minimum un jeton valide.
pelerinsRouter.use("*", authMiddleware);

/**
 * Écritures : création et suppression réservées à l'ADMIN. La mise à jour est
 * ouverte au pèlerin, mais le handler PATCH vérifie ensuite qu'il s'agit bien
 * de SA fiche et retire les champs réservés à l'administration.
 *
 * `ecritureReserveeA` s'appuie sur `use('*')`, seule forme de `use` qu'Hono
 * applique réellement.
 */
pelerinsRouter.use("*", ecritureReserveeA({
  POST: "ADMIN",
  PATCH: ["ADMIN", "PELERIN"],
  DELETE: "ADMIN",
}));

/**
 * Champs que seul l'ADMIN peut écrire sur une fiche pèlerin.
 *
 * Le numéro de passeport en particulier : le laisser modifiable par le
 * pèlerin lui-même reviendrait à lui permettre de réécrire son identité
 * administrative. Idem pour le groupe (affectation faite par
 * l'administration) et le statut de visa (décision administrative).
 */
const CHAMPS_RESERVES_ADMIN = [
  "utilisateurId",
  "numeroPasseport",
  "groupeId",
  "statutVisa",
  "isActive",
];

/** Le lecteur a-t-il le droit de consulter cette fiche ? */
async function peutLirePelerin(c, pelerin) {
  const role = c.get("role");
  const userId = c.get("userId");

  if (role === "ADMIN" || role === "GUIDE") return true;
  if (pelerin.utilisateurId === userId) return true;
  if (role === "PROCHE") {
    return (await pelerinIdSuiviParProche(userId)) === pelerin.id;
  }
  return false;
}

const accesRefuse = { content: { "application/json": { schema: ErreurSchema } } };

// ---- GET ALL (filtres ?groupeId= / ?utilisateurId=) ----
pelerinsRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Pelerins"],

    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        groupeId: z.string().optional(),
        utilisateurId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Liste des pèlerins",
        content: { "application/json": { schema: z.array(PelerinSchema) } },
      },
      401: accesRefuse,
      403: accesRefuse,
    },
  },
  async (c) => {
    const role = c.get("role");
    const userId = c.get("userId");
    const { groupeId, utilisateurId } = c.req.valid("query");

    // ADMIN : comportement inchangé, il a besoin de la vue complète.
    if (role === "ADMIN") {
      if (groupeId) {
        return c.json(await pelerinsService.findByGroupeId(groupeId), 200);
      }
      if (utilisateurId) {
        return c.json(await pelerinsService.findByUtilisateurId(utilisateurId), 200);
      }
      return c.json(await pelerinsService.getAll(), 200);
    }

    // GUIDE : borné à SON groupe. Le filtre est imposé par le serveur, donc
    // passer ?groupeId=<autre groupe> ne change rien — c'est tout l'intérêt.
    if (role === "GUIDE") {
      const sonGroupeId = await groupeDuGuidePourUtilisateur(userId);
      if (!sonGroupeId) return c.json([], 200);
      return c.json(await pelerinsService.findByGroupeId(sonGroupeId), 200);
    }

    // PELERIN et PROCHE : bornés à la fiche rattachée à leur propre compte.
    // Un appel sans filtre ne renvoie donc plus « tout le monde », mais la
    // seule fiche qui les concerne.
    if (role === "PELERIN" || role === "PROCHE") {
      if (utilisateurId && utilisateurId !== userId) {
        return c.json({ erreur: "Accès refusé" }, 403);
      }
      const monPelerin = await pelerinsService.findByUtilisateurId(userId);
      if (role === "PELERIN") return c.json(monPelerin, 200);

      // PROCHE : sa propre fiche ne passe pas par son compte, elle passe par
      // la fiche du pèlerin qu'il suit.
      const prochePelerinId = await pelerinIdSuiviParProche(userId);
      if (!prochePelerinId) return c.json([], 200);
      const fiche = await pelerinsService.getById(prochePelerinId);
      return c.json(fiche ? [fiche] : [], 200);
    }

    return c.json({ erreur: "Accès refusé" }, 403);
  },
);

// ---- GET BY ID ----
pelerinsRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Pelerins"],

    request: { params: IdParamSchema },
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: "Détails du pèlerin",
        content: { "application/json": { schema: PelerinSchema } },
      },
      401: accesRefuse,
      403: accesRefuse,
      404: {
        description: "Pèlerin non trouvé",
        content: { "application/json": { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const pelerin = await pelerinsService.getById(id);
    if (!pelerin) return c.json({ erreur: "Pèlerin introuvable" }, 404);

    // Un pèlerin ne lit que SA fiche, un proche celle qu'il suit. Le guide garde
    // la lecture libre sur sa mission d'urgence, et l'ADMIN sur tout.
    if (!(await peutLirePelerin(c, pelerin))) {
      return c.json({ erreur: "Accès refusé" }, 403);
    }
    return c.json(pelerin, 200);
  },
);

// ---- POST (Création) ----
pelerinsRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["Pelerins"],

    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            // Schéma pour la création (on omet l'id généré automatiquement)
            schema: PelerinSchema.omit({ id: true }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Pèlerin créé avec succès",
        content: { "application/json": { schema: PelerinSchema } },
      },
      400: {
        description: "Données invalides",
        content: { "application/json": { schema: ErreurSchema } },
      },
      403: accesRefuse,
    },
  },
  async (c) => {
    try {
      const body = c.req.valid("json"); // Validation automatique via Zod
      const result = await pelerinsService.create(body);
      return c.json(result, 201);
    } catch (error) {
      return c.json({ erreur: "Erreur lors de la création" }, 400);
    }
  },
);

// ---- PATCH (Mise à jour partielle) ----
pelerinsRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["Pelerins"],

    request: {
      params: IdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: PelerinSchema.partial(), // Tous les champs sont optionnels
          },
        },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: "Pèlerin mis à jour",
        content: { "application/json": { schema: PelerinSchema } },
      },
      403: accesRefuse,
      404: {
        description: "Pèlerin introuvable",
        content: { "application/json": { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const pelerin = await pelerinsService.getById(id);
    if (!pelerin) return c.json({ erreur: "Pèlerin introuvable" }, 404);

    if (!(await peutLirePelerin(c, pelerin))) {
      return c.json({ erreur: "Accès refusé" }, 403);
    }

    // Un pèlerin ne peut pas se promouvoir, se changer de groupe ni réécrire
    // son propre numéro de passeport depuis son profil : ces champs relèvent
    // de l'administration. Sans cette liste, un PATCH libre permettrait de réécrire
    // son identité administrative et de changer de groupe sans autorisation.
    if (c.get("role") !== "ADMIN") {
      for (const champ of CHAMPS_RESERVES_ADMIN) delete body[champ];
    }

    const updated = await pelerinsService.update(id, body);
    if (!updated) return c.json({ erreur: "Pèlerin introuvable" }, 404);
    return c.json(updated, 200);
  },
);

// ---- DELETE ----
pelerinsRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Pelerins"],

    request: { params: IdParamSchema },
    security: [{ Bearer: [] }],
    responses: {
      204: { description: "Pèlerin supprimé (aucun contenu)" },
      403: accesRefuse,
      404: {
        description: "Pèlerin introuvable",
        content: { "application/json": { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await pelerinsService.delete(id);
    if (!deleted) return c.json({ erreur: "Pèlerin introuvable" }, 404);
    return c.body(null, 204); // 204 No Content
  },
);

export { pelerinsRouter };
