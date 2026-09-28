import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { ecritureReserveeA, exigerRole, pelerinIdDeUtilisateur } from "../middlewares/authorize.js";
import { prochesService } from "../services/proches.js";
import { ErreurMetier } from "../services/demandeInscriptions.js";
import { ProcheSchema, ErreurSchema } from "../schemas.js";

const prochesRouter = new OpenAPIHono();

prochesRouter.use("*", authMiddleware);

/**
 * Écritures : administration, sauf le rattachement personnel que fait le
 * pèlerin via POST /mon-proche (autorisé à PELERIN uniquement, et uniquement
 * sur sa propre fiche — vérifié plus bas).
 */
prochesRouter.use("*", ecritureReserveeA({
  POST: ["ADMIN", "PELERIN"],
  PATCH: "ADMIN",
  DELETE: "ADMIN",
}));

// ---------------------------------------------------------------- lecture

/**
 * GET / — deux modes de lecture coexistent déjà dans l'application :
 *  - ?utilisateurId=… pour un PROCHE qui veut sa propre ligne ;
 *  - ?pelerinId=… pour afficher le contact d'un pèlerin.
 *
 * Le durcissement consiste à ne plus laisser l'appelant choisir son périmètre
 * quand il n'est pas administrateur : on le déduit du compte connecté. Le
 * comportement de l'ADMIN est inchangé, donc aucun écran ne bouge.
 */
prochesRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Proches"],
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        utilisateurId: z.string().optional(),
        pelerinId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.array(ProcheSchema) } },
      },
      401: { content: { "application/json": { schema: ErreurSchema } } },
      403: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    const role = c.get("role");
    const userId = c.get("userId");
    const { utilisateurId, pelerinId } = c.req.valid("query");

    // ADMIN et GUIDE : inchangé. Le guide a besoin de connaître le contact
    // d'urgence des pèlerins de son groupe, c'est un usage métier légitime.
    if (role === "ADMIN" || role === "GUIDE") {
      if (utilisateurId) {
        return c.json(await prochesService.findByUtilisateurId(utilisateurId), 200);
      }
      if (pelerinId) {
        return c.json(await prochesService.findByPelerinId(pelerinId), 200);
      }
      return c.json(await prochesService.getAll(), 200);
    }

    // PROCHE : uniquement sa propre ligne.
    if (role === "PROCHE") {
      if (utilisateurId && utilisateurId !== userId) {
        return c.json({ erreur: "Accès refusé" }, 403);
      }
      return c.json(await prochesService.findByUtilisateurId(userId), 200);
    }

    // PELERIN : uniquement le contact rattaché à SON pèlerin.
    if (role === "PELERIN") {
      const sonPelerinId = await pelerinIdDeUtilisateur(userId);
      if (pelerinId && pelerinId !== sonPelerinId) {
        return c.json({ erreur: "Accès refusé" }, 403);
      }
      if (!sonPelerinId) return c.json([], 200);
      return c.json(await prochesService.findByPelerinId(sonPelerinId), 200);
    }

    return c.json({ erreur: "Accès refusé" }, 403);
  },
);

prochesRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Proches"],
    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: ProcheSchema } } },
      401: { content: { "application/json": { schema: ErreurSchema } } },
      403: { content: { "application/json": { schema: ErreurSchema } } },
      404: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const item = await prochesService.getById(id);
    if (!item) return c.json({ erreur: "Non trouvé" }, 404);

    const role = c.get("role");
    const userId = c.get("userId");

    if (role === "ADMIN" || role === "GUIDE") return c.json(item, 200);
    if (item.utilisateurId === userId) return c.json(item, 200);

    return c.json({ erreur: "Accès refusé" }, 403);
  },
);

// ------------------------------------------------- rattachement par le pèlerin

/**
 * POST /mon-proche — le pèlerin rattache lui-même son contact d'urgence.
 *
 * Cette route remplace, pour le parcours d'auto-inscription, la création d'un
 * PROCHE par l'administrateur, qui dépendait d'un identifiant fabriqué côté
 * navigateur. Elle applique la règle « un pèlerin, au plus un proche » en
 * réactivant la ligne existante lorsqu'elle avait été archivée.
 */
prochesRouter.openapi(
  {
    method: "post",
    path: "/mon-proche",
    tags: ["Proches"],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              lienParente: z.string().trim().min(2).max(100),
            }),
          },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: ProcheSchema } } },
      401: { content: { "application/json": { schema: ErreurSchema } } },
      403: { content: { "application/json": { schema: ErreurSchema } } },
      404: { content: { "application/json": { schema: ErreurSchema } } },
      409: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    // Seul un pèlerin déclare son propre contact d'urgence. Le rattachement est
    // ensuite dérivé du compte connecté : impossible de rattacher quelqu'un
    // d'autre.
    const refus = exigerRole(c, "PELERIN");
    if (refus) return refus;

    const userId = c.get("userId");
    const { lienParente } = c.req.valid("json");

    const pelerinId = await pelerinIdDeUtilisateur(userId);
    if (!pelerinId) {
      return c.json({ erreur: 'Aucune fiche pèlerin ne vous est rattachée.' }, 404);
    }

    try {
      const { proche, cree } = await prochesService.lienPourUtilisateur({
        utilisateurId: userId,
        pelerinId,
        lienParente,
      });
      return c.json(proche, cree ? 201 : 200);
    } catch (err) {
      if (err instanceof ErreurMetier) {
        return c.json({ erreur: err.message }, err.statut);
      }
      throw err;
    }
  },
);

// ---------------------------------------------------------------- écritures

prochesRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["Proches"],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: ProcheSchema.omit({ id: true }) },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: ProcheSchema } } },
      403: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    // Créer un proche POUR quelqu'un d'autre est une opération d'administration.
    // Le pèlerin, lui, ne passe que par /mon-proche, qui ne rattache que sa
    // propre fiche. Sans cette distinction, un pèlerin pourrait rattacher son
    // compte au pèlerin d'un autre en appelant cette route.
    const refus = exigerRole(c, "ADMIN");
    if (refus) return refus;

    const data = c.req.valid("json");
    return c.json(await prochesService.create(data), 201);
  },
);

prochesRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["Proches"],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: ProcheSchema.partial() } },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: ProcheSchema } } },
      403: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const updated = await prochesService.update(id, c.req.valid("json"));
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

prochesRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Proches"],
    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      204: { description: "Supprimé" },
      403: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await prochesService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { prochesRouter };
