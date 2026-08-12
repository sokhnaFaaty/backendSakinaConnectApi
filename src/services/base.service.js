// src/services/base.service.js
import { db } from '../db/client.js';
import { eq } from 'drizzle-orm';

export const createCrudService = (table, idColumn = table.id) => ({
  // GET ALL 
  getAll: async () => await db.select().from(table),

  // GET BY ID 
  getById: async (id) => {
    const [result] = await db.select().from(table).where(eq(idColumn, id));
    return result;
  },

  // POST 
  create: async (data) => {
    const [result] = await db.insert(table).values(data).returning();
    return result;
  },

  // PATCH / PUT 
  update: async (id, data) => {
    const [result] = await db.update(table).set(data).where(eq(idColumn, id)).returning();
    return result;
  },

  // DELETE (équivaut à DELETE /resource/:id
  delete: async (id) => {
    const [result] = await db.delete(table).where(eq(idColumn, id)).returning();
    return result;
  }
});