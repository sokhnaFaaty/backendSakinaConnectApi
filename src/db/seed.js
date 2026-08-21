import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from './client.js';
import {
  utilisateurs, admins, guides, hotels, groupes, pelerins, proches,
  categories, planning, annonces, sos,
} from './schema.js';
import { hashMotDePasse } from '../services/auth.js';

// Les codes (U001, G001…) viennent de l'ancien json-server. Ils ne sont pas
// stockés : ils servent uniquement à relier les entités entre elles ici, et
// sont remplacés par les UUID réellement générés par Postgres.
// Aucun mot de passe n'est écrit dans ce fichier : il est versionné sur GitHub.
// Ils viennent de .env (ignoré par git), une variable par rôle.
const motDePasseDuRole = (role) => {
  const cle = `SEED_MDP_${role}`;
  const valeur = process.env[cle];
  if (!valeur) {
    throw new Error(
      `${cle} manquant dans .env — définis un mot de passe pour les comptes ${role}.`
    );
  }
  return valeur;
};

const ids = new Map();
const ref = (code) => {
  const id = ids.get(code);
  if (!id) throw new Error(`Référence inconnue : ${code}`);
  return id;
};

// Insère seulement si la ligne n'existe pas déjà (seed rejouable sans doublon).
async function inserer(code, table, condition, valeurs) {
  const [existant] = await db.select().from(table).where(condition);
  if (existant) {
    ids.set(code, existant.id);
    return false;
  }
  const [cree] = await db.insert(table).values(valeurs).returning();
  ids.set(code, cree.id);
  return true;
}

// Le mot de passe n'est plus dans ce tableau : il est déduit du rôle via .env.
const UTILISATEURS = [
  ['U001', 'Sokhna Faty Gueye',     'mamefat2004@gmail.com',    '762389486', 'ADMIN',   'https://plus.unsplash.com/premium_photo-1681493917930-829e1b41add0?q=80&w=687&auto=format&fit=crop'],
  ['U002', 'Oustadh Lamine Mbaye',  'laminembaye@gmail.com',    '772086514', 'GUIDE',   'https://images.unsplash.com/photo-1750612306471-46997387626a?w=600&auto=format&fit=crop&q=60'],
  ['U003', 'Ahmad Bin Ibrahim',     'ahmad@gmail.com',          '774268022', 'PELERIN', 'https://images.unsplash.com/photo-1655421186987-6c483d99c520?q=80&w=687&auto=format&fit=crop'],
  ['U004', 'Khadija Diaw',          'khadijadiaw@gmail.com',    '784342332', 'PELERIN', 'https://images.unsplash.com/photo-1713845784644-82265abf5872?q=80&w=687&auto=format&fit=crop'],
  ['U005', 'Fatimah Ibrahim',       'fatimah@gmail.com',        '775003108', 'PROCHE',  null],
  ['U006', 'Cheikh Diaw',           'cheikhdiaw@gmail.com',     '765785943', 'PROCHE',  'https://images.unsplash.com/photo-1656887322222-6b493d220614?w=600&auto=format&fit=crop&q=60'],
  ['U007', 'Oustadh Mamadou Gueye', 'mamadougueye@gmail.com',   '785405593', 'GUIDE',   null],
  ['U008', 'Mamadou Diouf',         'mamadou173diouf@gmail.com','767666666', 'ADMIN',   null],
];

const HOTELS = [
  ['H001', 'Fairmont Clock Tower',        'La Mecque', 'Abraj Al Bait',    '+96611111111',    5],
  ['H002', 'Anwar Al Madinah',            'Médine',    'Central Area',     '+96622222222',    5],
  ['H003', 'Al Burhan Hotel',             'La Mecque', 'Mahbass Al Jinn',  '+966125615151',   5],
  ['H004', 'Leader Al Muna Kareem Hotel', 'Médine',    'Central Area',     '+966 14 829 1010', 5],
];

const GROUPES = [
  ['GR001', 'Groupe A-1', 'G001', 'H001', 'H002', '2026-07-05', '2026-07-18'],
  ['GR002', 'Groupe B-1', 'G002', 'H003', 'H004', '2026-07-05', '2026-07-18'],
];

const PELERINS = [
  ['P001', 'U003', 'SN456987', 'APPROUVE', true, 'Hypertension', 'Fatimah Ibrahim', '775003108', 'GR001'],
  ['P002', 'U004', 'SN456988', 'APPROUVE', true, 'Diabétique',   'Cheikh Diaw',     '765785943', 'GR001'],
];

const PROCHES = [
  ['PR001', 'U005', 'P001', 'Fille'],
  ['PR002', 'U006', 'P002', 'Frere'],
];

const CATEGORIES = [
  ['CAT001', 'Rituel'],
  ['CAT002', 'Transport'],
  ['CAT003', 'Réunion'],
];

const PLANNING = [
  ['PL001', 'Tawaf', 'Circumambulation autour de la Kaaba', '2026-07-06', '20:00', 'Masjid Al Haram', 'CAT001', 'GR001', '21.4225', '39.8262', 'Briefing avant le départ & Séminaire de préparation spirituelle'],
  ['PL002', 'Départ Mina', 'Déplacement vers Mina', '2026-07-07', '07:30', 'Hôtel Fairmont', 'CAT002', 'GR001', '21.4187', '39.8579', null],
  ['PL003', 'Ziyarah Badr', 'Visite du champ de bataille historique de Badr et du cimetière des martyrs', '2026-07-10', '06:00', 'Champ de bataille de Badr', 'CAT001', 'GR001', '23.7744', '38.7904', 'Récit historique de la première grande bataille de l\'Islam'],
  ['PL004', 'Visite de Uhud', 'Ziyarah du mont Uhud, du cimetière des martyrs et des archers', '2026-07-12', '08:00', 'Mont Uhud, Médine', 'CAT001', 'GR001', '24.5036', '39.6108', 'Explication de la stratégie militaire et recueillement pour les martyrs'],
  ['PL005', 'Musée du Prophète', 'Visite guidée de l\'exposition internationale de la biographie du Prophète et de la civilisation islamique', '2026-07-13', '10:00', 'Musée de la Sira, face à la Mosquée du Prophète', 'CAT003', 'GR001', '24.4665', '39.6111', 'Visite technologique interactive sur l\'histoire de la Sira'],
];

// Le JSON portait un guideId ; le schéma attend un auteurId qui référence
// utilisateurs. G001 correspond à l'utilisateur U002.
const ANNONCES = [
  ['AN001', 'Réunion', 'Tous les pèlerins du groupe sont attendus dans le hall.', true, '2026-07-05T20:00:00', 'U002', 'GR001'],
  ['AN002', 'Alerte Chaleur', 'Il fait très chaud aujourd\'hui, s\'il vous plaît buvez beaucoup d\'eau pour rester hydratés.', true, '2026-07-22T08:00:00', 'U002', 'GR001'],
  ['AN003', 'Information Transport : Bus pour Uhud', 'Veuillez noter que le bus réservé pour l\'excursion au Mont Uhud sera garé devant l\'hôtel. Assurez-vous d\'avoir vos badges de groupe avant de monter à bord.', false, '2026-07-22T06:30:00', 'U002', 'GR001'],
  ['AN004', 'Réunion de suivi du groupe', 'Une brève réunion d\'information générale aura lieu aujourd\'hui pour faire un point sur le déroulement du séjour et répondre à vos questions.', false, '2026-07-22T06:35:00', 'U002', 'GR001'],
];

const SOS = [
  ['SOS001', 'P001', 'G001', '21.4225', '39.8262', '2026-07-06T14:15:00', 'Je suis perdu près de la porte 79.', 'EN_ATTENTE'],
];

async function seed() {
  let crees = 0;
  const compter = (nouveau) => { if (nouveau) crees++; };

  // --- utilisateurs (MISE À JOUR SÉCURISÉE) ---
  for (const [code, nomComplet, email, telephone, role, photo] of UTILISATEURS) {
    const hashedPassword = await hashMotDePasse(motDePasseDuRole(role));
    
    // 1. On cherche l'utilisateur par son email
    const [existant] = await db.select().from(utilisateurs).where(eq(utilisateurs.email, email));
    
    if (existant) {
      // Si l'utilisateur existe, on le MET À JOUR (pour appliquer le nouveau mot de passe du .env)
      await db.update(utilisateurs)
        .set({
          nomComplet,
          telephone,
          photo,
          motDePasse: hashedPassword, // Le nouveau mot de passe hashé
        })
        .where(eq(utilisateurs.email, email));
      
      ids.set(code, existant.id);
      console.log(` Utilisateur ${email} mis à jour (mot de passe actualisé).`);
    } else {
      // Sinon, on le crée
      const [newUser] = await db.insert(utilisateurs).values({
        nomComplet, email, telephone,
        motDePasse: hashedPassword,
        role, photo, dateCreation: '2026-07-01',
      }).returning();
      ids.set(code, newUser.id);
      console.log(`Utilisateur ${email} créé.`);
    }
  }

  // --- admins / guides ---
  for (const [code, u] of [['A001', 'U001'], ['A002', 'U008']]) {
    compter(await inserer(code, admins, eq(admins.utilisateurId, ref(u)), { utilisateurId: ref(u) }));
  }
  for (const [code, u] of [['G001', 'U002'], ['G002', 'U007']]) {
    compter(await inserer(code, guides, eq(guides.utilisateurId, ref(u)), { utilisateurId: ref(u), disponibilite: true }));
  }

  // --- hôtels ---
  for (const [code, nom, ville, adresse, telephone, nombreEtoiles] of HOTELS) {
    compter(await inserer(code, hotels, eq(hotels.nom, nom), { nom, ville, adresse, telephone, nombreEtoiles }));
  }

  // --- groupes ---
  for (const [code, nom, g, hMecque, hMedine, dateDepart, dateRetour] of GROUPES) {
    compter(await inserer(code, groupes, eq(groupes.nom, nom), {
      nom, guideId: ref(g), hotelMecqueId: ref(hMecque), hotelMedineId: ref(hMedine), dateDepart, dateRetour,
    }));
  }

  // --- pèlerins ---
  for (const [code, u, numeroPasseport, statutVisa, certificatVaccin, informationsMedicales, contactUrgenceNom, contactUrgenceTelephone, g] of PELERINS) {
    compter(await inserer(code, pelerins, eq(pelerins.numeroPasseport, numeroPasseport), {
      utilisateurId: ref(u), numeroPasseport, statutVisa, certificatVaccin,
      informationsMedicales, contactUrgenceNom, contactUrgenceTelephone, groupeId: ref(g),
    }));
  }

  // --- proches ---
  for (const [code, u, p, lienParente] of PROCHES) {
    compter(await inserer(code, proches, eq(proches.utilisateurId, ref(u)), {
      utilisateurId: ref(u), pelerinId: ref(p), lienParente,
    }));
  }

  // --- catégories ---
  for (const [code, libelle] of CATEGORIES) {
    compter(await inserer(code, categories, eq(categories.libelle, libelle), { libelle }));
  }

  // --- planning ---
  for (const [code, titre, description, date, heure, lieu, cat, g, latitude, longitude, etapeGuide] of PLANNING) {
    compter(await inserer(code, planning, and(eq(planning.titre, titre), eq(planning.groupeId, ref(g))), {
      titre, description, date, heure, lieu,
      categorieId: ref(cat), groupeId: ref(g), latitude, longitude, etapeGuide,
      auteurId: ref('U002'),
    }));
  }

  // --- annonces ---
  for (const [code, titre, contenu, urgence, datePublication, auteur, g] of ANNONCES) {
    compter(await inserer(code, annonces, and(eq(annonces.titre, titre), eq(annonces.groupeId, ref(g))), {
      titre, contenu, urgence, datePublication: new Date(datePublication),
      auteurId: ref(auteur), groupeId: ref(g),
    }));
  }

  // --- SOS ---
  for (const [code, p, g, latitude, longitude, dateHeure, commentaire, statut] of SOS) {
    compter(await inserer(code, sos, and(eq(sos.pelerinId, ref(p)), eq(sos.guideId, ref(g))), {
      pelerinId: ref(p), guideId: ref(g), latitude, longitude,
      dateHeure: new Date(dateHeure), commentaire, statut,
    }));
  }

  console.log(`Seed terminé : ${crees} ligne(s) créée(s), le reste a été mis à jour ou existait déjà.`);
  console.log('\nComptes de démonstration (mots de passe hachés en base) :');
  console.log('  ADMIN   mamefat2004@gmail.com   -> SEED_MDP_ADMIN');
  console.log('  GUIDE   laminembaye@gmail.com   -> SEED_MDP_GUIDE');
  console.log('  PELERIN ahmad@gmail.com         -> SEED_MDP_PELERIN');
  console.log('  PROCHE  fatimah@gmail.com       -> SEED_MDP_PROCHE');
  console.log('Les valeurs sont dans ton fichier .env, jamais dans le dépôt.');
  process.exit(0);
}

seed().catch((e) => {
  console.error('Erreur lors du seed :', e);
  process.exit(1);
});