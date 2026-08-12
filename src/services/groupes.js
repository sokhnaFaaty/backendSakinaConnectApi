
import { createCrudService } from './base.service.js';
import { groupes} from '../db/schema.js';
import { db } from '../db/client.js';
import { eq } from 'drizzle-orm';     


export const groupesService = {
  ...createCrudService(groupes),
  findByGuideId: (guideId) => db.select().from(groupes).where(eq(groupes.guideId, guideId))
};