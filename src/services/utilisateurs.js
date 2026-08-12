import { createCrudService } from './base.service.js';
import { utilisateurs } from '../db/schema.js';
import { hashMotDePasse } from './auth.js'; //  Importe ma fonction de hachage

const baseService = createCrudService(utilisateurs);

// Le hash ne doit jamais sortir du serveur : OpenAPIHono ne valide que les
// requêtes, pas les réponses, donc UtilisateurPublicSchema ne filtre rien.
const sansMotDePasse = (utilisateur) => {
  if (!utilisateur) return utilisateur;
  const { motDePasse: _hash, ...publics } = utilisateur;
  return publics;
};

export const utilisateursService = {
  ...baseService,

  getAll: async () => (await baseService.getAll()).map(sansMotDePasse),

  getById: async (id) => sansMotDePasse(await baseService.getById(id)),

  create: async (data) => {
    if (data.motDePasse) {
      data.motDePasse = await hashMotDePasse(data.motDePasse);
    }
    return sansMotDePasse(await baseService.create(data));
  },

  update: async (id, data) => {
    if (data.motDePasse) {
      data.motDePasse = await hashMotDePasse(data.motDePasse);
    }
    return sansMotDePasse(await baseService.update(id, data));
  }
};
