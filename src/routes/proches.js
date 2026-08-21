import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { prochesService } from "../services/proches.js";
import { ProcheSchema } from "../schemas.js";

const prochesRouter = new OpenAPIHono();

// Protège toutes les routes
prochesRouter.use("*", authMiddleware);

// GET ALL
prochesRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Proches"],

    security: [{ Bearer: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: z.array(ProcheSchema) } },
      },
    },
  },
  async (c) => {
    const utilisateurId = c.req.query("utilisateurId");
    if (utilisateurId) {
      return c.json(
        await prochesService.findByUtilisateurId(utilisateurId),
        200,
      );
    }

    const pelerinId = c.req.query("pelerinId");
    if (pelerinId) {
      return c.json(await prochesService.findByPelerinId(pelerinId), 200);
    }

    return c.json(await prochesService.getAll(), 200);
  },
);

// GET BY ID
prochesRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Proches"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: ProcheSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const item = await prochesService.getById(id);
    if (!item) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(item, 200);
  },
);

// POST
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
    },
  },
  async (c) => {
    const data = c.req.valid("json");
    return c.json(await prochesService.create(data), 201);
  },
);

// PATCH
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
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const updated = await prochesService.update(id, data);
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

// DELETE
prochesRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Proches"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: { 204: { description: "Supprimé" } },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await prochesService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { prochesRouter };
