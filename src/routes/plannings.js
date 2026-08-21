import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { planningsService } from "../services/plannings.js";
import { PlanningSchema } from "../schemas.js";

const planningsRouter = new OpenAPIHono();

// Protège toutes les routes
planningsRouter.use("*", authMiddleware);

// GET ALL
planningsRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Plannings"],

    security: [{ Bearer: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: z.array(PlanningSchema) } },
      },
    },
  },
  async (c) => {
    const groupeId = c.req.query("groupeId");
    if (groupeId) {
      return c.json(await planningsService.findByGroupeId(groupeId), 200);
    }
    return c.json(await planningsService.getAll(), 200);
  },
);

// GET BY ID
planningsRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Plannings"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: PlanningSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const item = await planningsService.getById(id);
    if (!item) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(item, 200);
  },
);

// POST
planningsRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["Plannings"],

    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: PlanningSchema.omit({ id: true }) },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: PlanningSchema } } },
    },
  },
  async (c) => {
    const data = c.req.valid("json");
    return c.json(await planningsService.create(data), 201);
  },
);

// PATCH
planningsRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["Plannings"],

    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: PlanningSchema.partial() } },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: PlanningSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const updated = await planningsService.update(id, data);
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

// DELETE
planningsRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Plannings"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: { 204: { description: "Supprimé" } },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await planningsService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { planningsRouter };
