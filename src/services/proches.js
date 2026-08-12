import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { createCrudService } from './base.service.js';
import { proches } from '../db/schema.js';

export const prochesService = {
  ...createCrudService(proches),

  findByUtilisateurId: (utilisateurId) =>
    db.select().from(proches).where(eq(proches.utilisateurId, utilisateurId)),

  findByPelerinId: (pelerinId) =>
    db.select().from(proches).where(eq(proches.pelerinId, pelerinId)),
};
