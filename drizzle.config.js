import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Render impose le SSL sur les connexions externes. drizzle-kit ignore l'option
// `ssl` quand on lui fournit une `url`, il faut donc le passer dans l'URL.
const url = process.env.DATABASE_URL?.includes('sslmode=')
  ? process.env.DATABASE_URL
  : `${process.env.DATABASE_URL}${process.env.DATABASE_URL?.includes('?') ? '&' : '?'}sslmode=no-verify`;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});