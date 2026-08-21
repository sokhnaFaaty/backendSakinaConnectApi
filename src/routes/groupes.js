import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { groupesService } from "../services/groupes.js";
import { GroupeSchema } from "../schemas.js";

const groupesRouter = new OpenAPIHono();

// Protège toutes les routes
groupesRouter.use("*", authMiddleware);

// GET ALL

groupesRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Groupes"],

    security: [{ Bearer: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: z.array(GroupeSchema) } },
      },
    },
  },
  async (c) => {
    const guideId = c.req.query("guideId");
    if (guideId) {
      return c.json(await groupesService.findByGuideId(guideId), 200);
    }
    return c.json(await groupesService.getAll(), 200);
  },
);
// GET BY ID
groupesRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Groupes"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: GroupeSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const item = await groupesService.getById(id);
    if (!item) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(item, 200);
  },
);

// POST
groupesRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["Groupes"],

    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: GroupeSchema.omit({ id: true }) },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: GroupeSchema } } },
    },
  },
  async (c) => {
    const data = c.req.valid("json");
    return c.json(await groupesService.create(data), 201);
  },
);

// PATCH
groupesRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["Groupes"],

    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: GroupeSchema.partial() } },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: GroupeSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const updated = await groupesService.update(id, data);
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

// DELETE
groupesRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Groupes"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: { 204: { description: "Supprimé" } },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await groupesService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { groupesRouter };
