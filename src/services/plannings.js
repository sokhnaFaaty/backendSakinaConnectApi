import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { createCrudService } from './base.service.js';
import { planning } from '../db/schema.js';

export const planningService = {
  ...createCrudService(planning),

  findByGroupeId: (groupeId) =>
    db.select().from(planning).where(eq(planning.groupeId, groupeId)),
};

// Alias : les routes importent parfois planningsService (au pluriel)
export const planningsService = planningService;
