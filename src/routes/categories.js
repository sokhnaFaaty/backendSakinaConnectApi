import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { ecritureReserveeA } from "../middlewares/authorize.js";
import { categoriesService } from "../services/categories.js";
import { CategorieSchema } from "../schemas.js";

const categoriesRouter = new OpenAPIHono();

// Protège toutes les routes
categoriesRouter.use("*", authMiddleware);

// Catégories : référentiel administré. La lecture reste ouverte à tous les
// rôles authentifiés (elle est affichée dans l'itinéraire d'un pèlerin),
// l'écriture est réservée à l'ADMIN.
categoriesRouter.use("*", ecritureReserveeA("ADMIN"));

// GET ALL
categoriesRouter.openapi(
  {
    method: "get",
    path: "/",
    tags: ["Categories"],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: z.array(CategorieSchema) } },
      },
    },
  },
  async (c) => {
    return c.json(await categoriesService.getAll(), 200);
  },
);

// GET BY ID
categoriesRouter.openapi(
  {
    method: "get",
    path: "/{id}",
    tags: ["Categories"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: CategorieSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const item = await categoriesService.getById(id);
    if (!item) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(item, 200);
  },
);

// POST
categoriesRouter.openapi(
  {
    method: "post",
    path: "/",
    tags: ["Categories"],

    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: CategorieSchema.omit({ id: true }) },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: CategorieSchema } } },
    },
  },
  async (c) => {
    const data = c.req.valid("json");
    return c.json(await categoriesService.create(data), 201);
  },
);

// PATCH
categoriesRouter.openapi(
  {
    method: "patch",
    path: "/{id}",
    tags: ["Categories"],

    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: CategorieSchema.partial() } },
      },
    },
    security: [{ Bearer: [] }],
    responses: {
      200: { content: { "application/json": { schema: CategorieSchema } } },
    },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");
    const updated = await categoriesService.update(id, data);
    if (!updated) return c.json({ erreur: "Non trouvé" }, 404);
    return c.json(updated, 200);
  },
);

// DELETE
categoriesRouter.openapi(
  {
    method: "delete",
    path: "/{id}",
    tags: ["Categories"],

    request: { params: z.object({ id: z.string().uuid() }) },
    security: [{ Bearer: [] }],
    responses: { 204: { description: "Supprimé" } },
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await categoriesService.delete(id);
    if (!deleted) return c.json({ erreur: "Non trouvé" }, 404);
    return c.body(null, 204);
  },
);

export { categoriesRouter };
