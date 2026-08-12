
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { createCrudService } from './base.service.js';
import { pelerins } from '../db/schema.js';

export const pelerinsService = {
  ...createCrudService(pelerins),

  findByGroupeId: (groupeId) =>
    db.select().from(pelerins).where(eq(pelerins.groupeId, groupeId)),

  findByUtilisateurId: (utilisateurId) =>
    db.select().from(pelerins).where(eq(pelerins.utilisateurId, utilisateurId)),
};
