import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { createCrudService } from './base.service.js';
import { guides } from '../db/schema.js';

export const guidesService = {
  ...createCrudService(guides),

  findByUtilisateurId: (utilisateurId) =>
    db.select().from(guides).where(eq(guides.utilisateurId, utilisateurId)),
};
