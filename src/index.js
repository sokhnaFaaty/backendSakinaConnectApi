import { serve } from '@hono/node-server';
import 'dotenv/config';
import { creerApp } from './app.js';

const { app, originesAutorisees, enProduction } = creerApp();

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port });

console.log(`Serveur en ligne sur http://localhost:${port}`);
if (!enProduction) {
  console.log(`Documentation : http://localhost:${port}/ui`);
}
console.log('Origines CORS autorisées :', originesAutorisees.join(', '));
