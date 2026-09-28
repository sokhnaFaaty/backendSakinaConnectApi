import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { authMiddleware } from "../middlewares/auth.js";
import { ecritureReserveeA } from "../middlewares/authorize.js";
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
    return c.json(await sosService.getAll(), 200);
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
      201: { content: { "application/json": { schema: SosSchema } } },
      403: accesRefuse,
    },
  },
  async (c) => {
    const data = c.req.valid("json");
    return c.json(await sosService.create(data), 201);
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
          "application/json": { schema: SosSchema.omit({ id: true }) },
        },
      },
    },
    responses: {
      201: { content: { "application/json": { schema: SosSchema } } },
    },
  },
  async (c) => {
    const data = c.req.valid("json");
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
