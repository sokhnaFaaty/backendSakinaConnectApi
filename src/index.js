import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import 'dotenv/config';

import { authRouter } from './routes/auth.js';
import { utilisateursRouter } from './routes/utilisateurs.js';
import { pelerinsRouter } from './routes/pelerins.js';
import { adminsRouter } from './routes/admins.js';
import { groupesRouter } from './routes/groupes.js';
import { hotelsRouter } from './routes/hotels.js';
import { categoriesRouter } from './routes/categories.js';
import { annoncesRouter } from './routes/annonces.js';
import { sosRouter } from './routes/sos.js';
import { guidesRouter } from './routes/guides.js';
import { planningsRouter } from './routes/plannings.js';
import { prochesRouter } from './routes/proches.js';

const app = new OpenAPIHono();

// Origines autorisées à appeler l'API (le front). Plusieurs valeurs séparées par des virgules.
const originesAutorisees = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use('*', cors({
  origin: originesAutorisees,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
});

app.route('/', authRouter);            // POST /connecter
app.route('/utilisateurs', utilisateursRouter);
app.route('/pelerins', pelerinsRouter);
app.route('/admins', adminsRouter);
app.route('/groupes', groupesRouter);
app.route('/hotels', hotelsRouter);
app.route('/categories', categoriesRouter);
app.route('/annonces', annoncesRouter);
app.route('/sos', sosRouter);
app.route('/guides', guidesRouter);
app.route('/plannings', planningsRouter);
app.route('/proches', prochesRouter);

app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'API Sakina Connect', version: '1.0.0' },
});
app.get('/ui', swaggerUI({ url: '/doc' }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`Serveur en ligne sur http://localhost:${port}/ui`);
console.log('Origines CORS autorisées :', originesAutorisees.join(', '));