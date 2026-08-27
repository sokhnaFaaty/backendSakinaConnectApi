import { OpenAPIHono } from '@hono/zod-openapi';
import { ConnexionSchema, TokenSchema, ErreurSchema, MessageSchema } from '../schemas.js';
import * as authService from '../services/auth.js';

export const authRouter = new OpenAPIHono();

authRouter.openapi({
  method: 'post',
  path: '/connecter',
   tags: ['Auth'],
  request: { 
    body: { 
      content: { 
        'application/json': { 
          schema: ConnexionSchema 
        } 
      } 
    } 
  },
  responses: {
    200: { 
      description: 'Connexion réussie', 
      content: { 'application/json': { schema: TokenSchema } } 
    },
    401: { 
      description: 'Erreur d\'authentification', 
      content: { 'application/json': { schema: ErreurSchema } } 
    }
  }
}, async (c) => {
  const { email, motDePasse } = c.req.valid('json');
  try {
    const resultat = await authService.connecter(email, motDePasse);
    return c.json(resultat, 200);
  } catch (e) {
    if (e.message === 'COMPTE_ARCHIVE') {
      return c.json({ erreur: 'Ce compte a été archivé. Contactez l\'administration.' }, 401);
    }
    return c.json({ erreur: 'Email ou mot de passe incorrect.' }, 401);
  }
});

authRouter.openapi({
  method: 'post',
  path: '/deconnexion',
  tags: ['Auth'],
  security: [{ Bearer: [] }], // Protégée par JWT
  responses: {
    200: {
      description: 'Déconnexion réussie',
      content: { 'application/json': { schema: MessageSchema } }
    }
  }
}, async (c) => {
  return c.json(await authService.deconnecter(), 200);
});