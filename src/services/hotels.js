
import { createCrudService } from './base.service.js';
import { hotels } from '../db/schema.js';
export const hotelsService = createCrudService(hotels);