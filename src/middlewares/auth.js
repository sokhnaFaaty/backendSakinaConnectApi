import { jwt } from 'hono/jwt';
import 'dotenv/config';

export const authMiddleware = jwt({
  secret: process.env.JWT_SECRET,
  alg: 'HS256',
});