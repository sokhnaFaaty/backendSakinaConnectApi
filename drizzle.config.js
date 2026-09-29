import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Render impose le SSL sur les connexions externes. drizzle-kit ignore l'option
// `ssl` quand on lui fournit une `url`, il faut donc le passer dans l'URL.
//
// Trois cas, parce que la meme config sert au developpement local ET a la
// production :
//
//   1. L'URL porte deja un `sslmode=` -> on ne touche a rien, l'appelant a tranche.
//   2. La base est en local -> on n'ajoute rien. Imposer `require` ici casserait
//      un PostgreSQL local qui n'active pas SSL, pour aucune raison de securite.
//   3. La base est distante (Render) -> `require`, donc le certificat est
//      verifie. C'est le defaut correct.
//
// `no-verify` desactive la verification du certificat : une connexion
// interceptee devient silencieusement lisible. Ce n'est plus force nulle part.
// Si un intermediate precis (un proxy d'entreprise) casse la chaine de
// certificats, l'echec doit etre explicite et temporaire :
//
//   DB_SSLMODE=no-verify npm run db:migrate
//
function urlAvecSsl(brut) {
  if (!brut) return brut;
  if (/[?&]sslmode=/.test(brut)) return brut;

  const mode = process.env.DB_SSLMODE?.trim();
  if (mode) return `${brut}${brut.includes('?') ? '&' : '?'}sslmode=${mode}`;

  const hote = new URL(brut).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hote);
  if (local) return brut;

  return `${brut}${brut.includes('?') ? '&' : '?'}sslmode=require`;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  dbCredentials: { url: urlAvecSsl(process.env.DATABASE_URL) },
  verbose: true,
  strict: true,
});