
import { createCrudService } from './base.service.js';
import { sos} from '../db/schema.js';
export const sosService = createCrudService(sos);