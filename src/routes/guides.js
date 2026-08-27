import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { guidesService } from "../services/guides.js";
import { GuideSchema } from "../schemas.js";

const guidesRouter = new OpenAPIHono();

// Protège toutes les routes
guidesRouter.use("*", authMiddleware);

// GET ALL
guidesRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Guides"],

    security: [{ Bearer: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: z.array(GuideSchema) } },
      },
    },
  },
  async (c) => {
    const utilisateurId = c.req.query("utilisateurId");
    if (utilisateurId) {
      return c.json(
        await guidesService.findByUtilisateurId(utilisateurId),
        200,
      );
    }
    return c.json(await guidesService.getAll(), 200);
  },
);

// GET BY ID
guidesRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Guides"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: GuideSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const item = await guidesService.getById(id);
    if (!item) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(item, 200);
  },
);

// POST
guidesRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["Guides"],

    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: GuideSchema.omit({ id: true }) },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: GuideSchema } } },
    },
  },
  async (c) => {
    const data = c.req.valid("json");
    return c.json(await guidesService.create(data), 201);
  },
);

// PATCH
guidesRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["Guides"],

    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: GuideSchema.partial() } },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: GuideSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const updated = await guidesService.update(id, data);
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

// DELETE
guidesRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Guides"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: { 204: { description: "Supprimé" } },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await guidesService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { guidesRouter };
