import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import {
  ecritureReserveeA,
  pelerinIdDeUtilisateur,
  pelerinIdSuiviParProche,
  guideDePelerin,
  guideEstEnChargeDuPelerin,
  groupeDuGuidePourUtilisateur,
} from "../middlewares/authorize.js";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { pelerins } from "../db/schema.js";
import { sosService } from "../services/sos.js";
import { SosSchema, ErreurSchema } from "../schemas.js";

const sosRouter = new OpenAPIHono();

// Protège toutes les routes
sosRouter.use("*", authMiddleware);

// Déclarer une alerte : le pèlerin uniquement. C'est une position GPS, elle
// n'a rien à faire dans le corps d'une requête d'un guide ou d'un proche.
// Prise en charge : administration et guides. Le PROCHE est informé, il ne
// traite pas. Suppression : administration.
sosRouter.use("*", ecritureReserveeA({
  POST: "PELERIN",
  PATCH: ["ADMIN", "GUIDE"],
  DELETE: "ADMIN",
}));

const accesRefuse = { content: { "application/json": { schema: ErreurSchema } } };

/**
 * Bornage des lectures par rôle.
 *
 * Une position GPS d'urgence est une donnée de santé et de sécurité : elle
 * n'a pas vocation à être lisible par tout le monde. Le bornage se fait
 * ICI, dans le service, et pas seulement dans les gardes de rôle : un garde
 * dit « tu as le droit de demander », pas « voici les seules lignes que tu as
 * le droit de voir ».
 */
async function alertesVisibles(c) {
  const role = c.get("role");
  const userId = c.get("userId");

  if (role === "ADMIN") return sosService.getAll();

  // GUIDE : uniquement les alertes des pèlerins de SON groupe.
  if (role === "GUIDE") {
    const sonGroupeId = await groupeDuGuidePourUtilisateur(userId);
    if (!sonGroupeId) return [];
    const ids = await db
      .select({ id: pelerins.id })
      .from(pelerins)
      .where(eq(pelerins.groupeId, sonGroupeId));
    if (ids.length === 0) return [];
    return sosService.getAll().then((toutes) =>
      toutes.filter((s) => ids.some((p) => p.id === s.pelerinId)),
    );
  }

  // PELERIN : ses propres alertes. PROCHE : celles du pèlerin qu'il suit.
  if (role === "PELERIN") {
    const monId = await pelerinIdDeUtilisateur(userId);
    if (!monId) return [];
    return sosService.getAll().then((toutes) => toutes.filter((s) => s.pelerinId === monId));
  }

  if (role === "PROCHE") {
    const suiviId = await pelerinIdSuiviParProche(userId);
    if (!suiviId) return [];
    return sosService.getAll().then((toutes) => toutes.filter((s) => s.pelerinId === suiviId));
  }

  return [];
}

/** Le lecteur a-t-il le droit de voir CETTE alerte ? */
async function peutLireAlerte(c, alerte) {
  const role = c.get("role");
  if (role === "ADMIN") return true;
  if (role === "GUIDE") {
    return guideEstEnChargeDuPelerin(c.get("userId"), alerte.pelerinId);
  }
  if (role === "PELERIN") {
    return (await pelerinIdDeUtilisateur(c.get("userId"))) === alerte.pelerinId;
  }
  if (role === "PROCHE") {
    return (await pelerinIdSuiviParProche(c.get("userId"))) === alerte.pelerinId;
  }
  return false;
}

// GET ALL
sosRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["SOS"],

    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: z.array(SosSchema) } } },
    },
  },
  async (c) => {
    return c.json(await alertesVisibles(c), 200);
  },
);

// GET BY ID
sosRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["SOS"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: "Alerte trouvée",
        content: { "application/json": { schema: SosSchema } },
      },
      403: accesRefuse,
      404: { content: { "application/json": { schema: ErreurSchema } } },
    },
  },
  async (c) => {
    // Ce handler lisait `c.req.valid("json")` et appelait sosService.create() :
    // un GET créait une alerte et renvoyait 201. Sur une requête sans corps,
    // `valid("json")` ne retourne pas de données exploitables, donc le
    // comportement était incohérent au mieux, et une écriture non autorisée
    // au pire.
    const { id } = c.req.valid("param");
    const alerte = await sosService.getById(id);
    if (!alerte) return c.json({ erreur: "Alerte introuvable" }, 404);

    if (!(await peutLireAlerte(c, alerte))) {
      return c.json({ erreur: "Accès refusé" }, 403);
    }
    return c.json(alerte, 200);
  },
);

// POST
sosRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["SOS"],

    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          // `pelerinId` et `guideId` sont retirés du contrat : le serveur les
          // déduit, il ne les accepte pas. Le schéma garde la forme complète
          // pour la LECTURE (un client qui récupère une alerte doit pouvoir la
          // relire), mais l'écriture n'en attend aucun.
          "application/json": {
            schema: SosSchema.omit({ id: true, pelerinId: true, guideId: true }),
          },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: SosSchema } } },
      400: {
        description: "Aucun groupe affecté, donc aucun guide à alerter",
        content: { "application/json": { schema: ErreurSchema } },
      },
    },
  },
  async (c) => {
    const body = c.req.valid("json");

    // 1. Le pèlerin est déduit du jeton, jamais lu dans le corps. C'est ce qui
    //    empêche un pèlerin de déclencher une alerte au nom d'un autre.
    const monPelerinId = await pelerinIdDeUtilisateur(c.get("userId"));
    if (!monPelerinId) {
      return c.json({ erreur: "Aucune fiche pèlerin rattachée à ce compte" }, 400);
    }

    // 2. Le guide destinataire se déduit de l'appartenance du pèlerin. Sans
    //    cela, un pèlerin pourrait router son alerte vers le guide d'un autre
    //    groupe, l'informer d'un groupe qu'il ne suit pas, ou le faire
    //    intervenir hors de sa mission.
    const monGuideId = await guideDePelerin(monPelerinId);
    if (!monGuideId) {
      return c.json(
        { erreur: "Vous n'êtes affecté à aucun groupe : aucun guide ne peut être alerté" },
        400,
      );
    }

    const data = { ...body, pelerinId: monPelerinId, guideId: monGuideId };
    return c.json(await sosService.create(data), 201);
  },
);

// PATCH
sosRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["SOS"],

    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: SosSchema.partial() } },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: SosSchema } } },
      403: accesRefuse,
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const role = c.get("role");

    // Un guide ne traite que les alertes de SES pèlerins. La garde de rôle
    // autorise ADMIN et GUIDE, mais elle ne dit rien de la ligne visée : sans
    // ce contrôle, un guide pouvait résoudre ou supprimer l'alerte d'un autre
    // groupe, y compris en changeant le `guideId` pour la détourner de son
    // destinataire légitime.
    if (role === "GUIDE") {
      const alerte = await sosService.getById(id);
      if (!alerte) return c.json({ erreur: "Alerte introuvable" }, 404);
      if (!(await guideEstEnChargeDuPelerin(c.get("userId"), alerte.pelerinId))) {
        return c.json({ erreur: "Accès refusé" }, 403);
      }
    }

    // `guideId` et `pelerinId` sont hors de portée d'une mise à jour : ils
    // décrivent à qui l'alerte appartient, pas son état de traitement.
    delete data.guideId;
    delete data.pelerinId;

    const updated = await sosService.update(id, data);
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

// DELETE
sosRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["SOS"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      204: { description: "Supprimé" },
      403: accesRefuse,
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await sosService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { sosRouter };
