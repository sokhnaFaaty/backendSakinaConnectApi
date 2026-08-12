
import { createCrudService } from './base.service.js';
import { categories} from '../db/schema.js';
export const categoriesService = createCrudService(categories);