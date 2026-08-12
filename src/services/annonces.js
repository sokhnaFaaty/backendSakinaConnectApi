
import { createCrudService } from './base.service.js';
import { annonces } from '../db/schema.js';
export const annoncesService = createCrudService(annonces);