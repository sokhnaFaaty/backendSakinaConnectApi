
import { createCrudService } from './base.service.js';
import { admins } from '../db/schema.js';
export const adminsService = createCrudService(admins);