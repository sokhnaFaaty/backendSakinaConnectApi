# Sakina Connect — Documentation technique

Plateforme de gestion de voyages Omra & Hajj : suivi des pèlerins et des groupes,
itinéraires, annonces et assistance SOS géolocalisée.

Ce document couvre **les deux projets** — l'API et l'interface — leur mise en
relation, et les décisions techniques prises en chemin.

---

## 1. Vue d'ensemble

Le projet est composé de trois briques indépendantes :

```
┌─────────────────────────┐        HTTPS + JWT        ┌──────────────────────────┐
│  FRONT (HTML/CSS/JS)    │  ──────────────────────>  │  API (Hono + Node.js)    │
│  Sakina Connect         │  <──────────────────────  │  backendSakinaConnectApi │
│  Live Server / statique │      JSON + CORS          │  Render (Ohio)           │
└─────────────────────────┘                           └────────────┬─────────────┘
                                                                   │ SSL
                                                      ┌────────────▼─────────────┐
                                                      │  PostgreSQL 18           │
                                                      │  sakina-connect-db       │
                                                      │  Render (Ohio)           │
                                                      └──────────────────────────┘
```

| Brique | Technologie | Emplacement |
|---|---|---|
| Interface | HTML, CSS, JavaScript natif (aucun framework, aucun build) | `Desktop/Sakina Connect` |
| API | Node.js, Hono, Zod, Drizzle ORM | `Desktop/sakina-connect-backend` |
| Base | PostgreSQL 18 hébergée sur Render | distante |

Point important : le front est en **JavaScript natif avec modules ES**. Il n'y a
ni npm, ni bundler, ni étape de compilation. Les fichiers sont servis tels quels.
C'est pourquoi les conventions de type `import.meta.env` ou `VITE_API_URL`, qui
supposent un outil de build, ne s'appliquent pas ici.

---

## 2. Démarrage rapide

### L'API

```bash
cd Desktop/sakina-connect-backend
npm install
npm run db:migrate     # crée les tables
npm run db:seed        # insère les données de démonstration
npm run dev            # démarre sur http://localhost:3000
```

Documentation interactive des routes : **http://localhost:3000/ui**

### L'interface

Ouvre `Desktop/Sakina Connect/index.html` avec **Live Server** (clic droit dans
VS Code → *Open with Live Server*).

⚠️ Ne l'ouvre pas par double-clic. En `file://`, le navigateur envoie une origine
`null` que le serveur refuse, et tous les appels échouent.

### Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| ADMIN | `mamefat2004@gmail.com` | variable `SEED_MDP_ADMIN` du `.env` |
| GUIDE | `laminembaye@gmail.com` | variable `SEED_MDP_GUIDE` |
| PELERIN | `ahmad@gmail.com` | variable `SEED_MDP_PELERIN` |
| PROCHE | `fatimah@gmail.com` | variable `SEED_MDP_PROCHE` |

Les mots de passe ne figurent **jamais** dans le code : ils vivent dans le fichier
`.env`, qui est exclu du dépôt Git.

---

## 3. L'API

### 3.1 Structure

```
src/
├── index.js              point d'entrée : CORS, montage des routes, Swagger
├── schemas.js            schémas Zod (validation + documentation OpenAPI)
├── db/
│   ├── client.js         connexion Postgres (postgres-js + Drizzle)
│   ├── schema.js         définition des 11 tables et de leurs relations
│   ├── seed.js           données de démonstration
│   └── motsdepasse.js    réinitialisation des mots de passe depuis .env
├── middlewares/
│   └── auth.js           vérification du JWT
├── routes/               une route par ressource (HTTP + validation)
└── services/             accès aux données (Drizzle)
```

La séparation est nette : **les routes ne parlent jamais à la base**, elles
appellent un service. Les services ne connaissent ni HTTP ni JSON.

### 3.2 Le modèle de données

Onze tables, reliées par des clés étrangères en UUID :

```
utilisateurs ──┬── admins
               ├── guides ──── groupes ──┬── pelerins ──── proches
               ├── pelerins              ├── planning
               └── proches               └── annonces
                                              sos ──── pelerins + guides
                              hotels ──── groupes (Mecque + Médine)
                          categories ──── planning
```

`utilisateurs` porte l'identité et l'authentification (email, mot de passe haché,
rôle). Les tables `admins`, `guides`, `pelerins` et `proches` portent les données
propres à chaque rôle et pointent vers `utilisateurs` via `utilisateurId`.

Quatre énumérations Postgres encadrent les valeurs autorisées : `role`,
`statut_visa`, `statut_moderation` et `statut_sos`.

### 3.3 Les routes

Toutes les routes sont protégées par JWT, **sauf** `POST /connecter`.

| Préfixe | Opérations | Filtres disponibles |
|---|---|---|
| `POST /connecter` | authentification | — |
| `/utilisateurs` | GET, GET/:id, POST, PATCH | — |
| `/pelerins` | CRUD complet | `?groupeId=` `?utilisateurId=` |
| `/guides` | CRUD complet | `?utilisateurId=` |
| `/proches` | CRUD complet | `?utilisateurId=` `?pelerinId=` |
| `/groupes` | CRUD complet | `?guideId=` |
| `/plannings` | CRUD complet | `?groupeId=` |
| `/admins` | GET, GET/:id | — |
| `/hotels`, `/categories`, `/annonces`, `/sos` | CRUD complet | — |

`DELETE /utilisateurs/:id` répond volontairement `403` : la suppression
définitive d'un compte est interdite. Il faut passer par
`PATCH { "isActive": false }` pour l'archiver — les données liées restent
cohérentes.

### 3.4 Les fonctions des services

**`services/base.service.js`** — fabrique le CRUD commun à toutes les ressources :

| Fonction | Rôle |
|---|---|
| `createCrudService(table, idColumn?)` | retourne un objet contenant les cinq fonctions ci-dessous |
| `getAll()` | toutes les lignes |
| `getById(id)` | une ligne, ou `undefined` |
| `create(data)` | insère et retourne la ligne créée |
| `update(id, data)` | met à jour partiellement et retourne la ligne |
| `delete(id)` | supprime et retourne la ligne supprimée |

Chaque service de ressource part de cette base et ajoute ce qui lui est propre :

| Service | Ajouts |
|---|---|
| `pelerinsService` | `findByGroupeId(id)`, `findByUtilisateurId(id)` |
| `guidesService` | `findByUtilisateurId(id)` |
| `prochesService` | `findByUtilisateurId(id)`, `findByPelerinId(id)` |
| `groupesService` | `findByGuideId(id)` |
| `planningsService` | `findByGroupeId(id)` |
| `utilisateursService` | `create`/`update` hachent le mot de passe ; les quatre lectures retirent le hash |

**`services/auth.js`** :

| Fonction | Rôle |
|---|---|
| `hashMotDePasse(motDePasse)` | hachage bcrypt, coût 10 |
| `connecter(email, motDePasse)` | vérifie les identifiants, refuse les comptes archivés, retourne `{ token, user }` |

### 3.5 Les schémas Zod

`schemas.js` définit seize schémas utilisés à la fois pour **valider les requêtes**
et pour **générer la documentation OpenAPI** : `IdParamSchema`, `ErreurSchema`,
`ConnexionSchema`, `TokenSchema`, `UtilisateurPublicSchema`,
`UtilisateurCreationSchema`, puis un schéma par ressource.

⚠️ Piège important : `OpenAPIHono` valide les **requêtes**, jamais les réponses.
Déclarer `UtilisateurPublicSchema` en sortie ne filtre donc rien — le hash du mot
de passe partait au client malgré la déclaration. C'est le service
`utilisateursService` qui l'écarte réellement.

---

## 4. L'interface

### 4.1 Structure

```
js/
├── app.js                amorçage
├── router.js             routage par ancre (#/page)
├── config/
│   ├── api.js            URL de l'API et liste des points d'entrée
│   └── roles.js          rôles et page d'accueil par rôle
├── services/             un service par ressource + apiClient
├── utils/                session, validation, échappement HTML
├── components/           navBar, modal, drawer, table, toast, carte Leaflet…
└── pages/                une page par écran
```

### 4.2 Les fonctions des services

**`services/apiClient.js`** — passage obligé de tous les appels réseau :

| Fonction | Rôle |
|---|---|
| `apiRequest(url, options?, messageErreur?)` | ajoute le jeton, gère les 401, remonte le message d'erreur du serveur |

**`services/authService.js`** :

| Fonction | Rôle |
|---|---|
| `login(email, password)` | appelle `POST /connecter`, enregistre jeton et utilisateur, retourne l'utilisateur |
| `logout()` | efface la session et revient à l'accueil |

**`utils/auth.js`** — gestion de la session :

| Fonction | Rôle |
|---|---|
| `saveSession(user, token?)` | enregistre l'utilisateur, et le jeton s'il est fourni |
| `getToken()` | lit le jeton |
| `getSession()` | lit l'utilisateur connecté |
| `clearSession()` | efface utilisateur **et** jeton |
| `isAuthenticated()` | vrai si une session existe |
| `getUserRole()` | rôle courant |
| `hasRole(...roles)` | vrai si le rôle courant est dans la liste |

Le paramètre `token` de `saveSession` est optionnel à dessein : les pages de
profil appellent `saveSession({...})` sans jeton pour rafraîchir les informations
affichées. Sans cette précaution, chaque modification de profil déconnecterait
l'utilisateur.

**Services métier** — tous construits sur `apiRequest` :

| Service | Fonctions principales |
|---|---|
| `pelerinService` | `getPelerins`, `getPelerinsArchives`, `getPelerinsDuGroupe`, `createPelerin`, `updatePelerin`, `deletePelerin`, `restorePelerin`, `deletePelerinDefinitif`, `affecterPelerinAuGroupe`, `getPelerinByUtilisateurId` |
| `guideService` | `getGuides`, `getGuidesArchives`, `getGuideByUtilisateurId`, `getGroupeDuGuide`, `createGuide`, `updateGuide`, `deleteGuide`, `restoreGuide`, `deleteGuideDefinitif` |
| `procheService` | `getProches`, `getProchesArchives`, `getProcheByUtilisateurId`, `getProcheByPelerinId`, `createProche`, `updateProche`, `deleteProche`, `restoreProche`, `deleteProcheDefinitif` |
| `groupeService` | `getGroupes`, `getGroupesArchives`, `createGroupe`, `updateGroupe`, `deleteGroupe`, `restoreGroupe`, `deleteGroupeDefinitif`, `countPelerinsDuGroupe` |
| `annonceService` | `statutAnnonce`, `getAnnonces`, `getAnnoncesVisibles`, `getAnnoncesEnAttente`, `createAnnonce`, `updateAnnonce`, `approuverAnnonce`, `rejeterAnnonce`, `deleteAnnonce` |
| `planningService` | `statutEvenement`, `filtrerPlanningVisible`, `getPlanningDuGroupe`, `getPlanningEnAttente`, `createPlanningEvent`, `updatePlanningEvent`, `approuverPlanningEvent`, `rejeterPlanningEvent`, `deletePlanningEvent` |
| `sosService` | `getSos`, `getSosParPelerinIds`, `declencherSos`, `marquerSosResolu`, `getSosActifDuPelerin` |
| `utilisateurService` | `getUtilisateurs`, `getUtilisateurById`, `updateUtilisateur` |
| `validationService` | `emailExiste`, `telephoneExiste`, `passeportExiste` |
| `hotelService`, `categorieService` | `getHotels`, `createHotel`, `getCategories` |
| `notificationService` | `getNotifications`, `getLastSeen`, `markSeen`, `countUnseen` |
| `cloudinaryService` | `uploadUserPhoto` (envoi direct à Cloudinary, sans passer par l'API) |

**`utils/`** :

| Fichier | Fonctions |
|---|---|
| `html.js` | `escapeHtml(value)` — **défense principale contre le XSS**, utilisée 284 fois |
| `validators.js` | `required`, `validateEmailFormat`, `validateTelephone`, `validateLoginEmail`, `validateLoginPassword` |
| `formValidator.js` | `showError`, `hideError`, `validateField`, `validateNumber`, `validateSelect` |
| `password.js` | `generateTempPassword` |
| `id.js` | `createId` |

### 4.3 L'URL de l'API

`config/api.js` choisit automatiquement la cible selon l'endroit d'où la page est
servie :

```js
const EN_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_BASE_URL = EN_LOCAL
  ? "http://localhost:3000"
  : "https://backendsakinaconnectapi.onrender.com";
```

Aucune modification n'est donc nécessaire pour passer du développement à la
production.

⚠️ L'URL ne doit **jamais** se terminer par `/`. Les points d'entrée sont
construits par concaténation (`${API_BASE_URL}/pelerins`) : un slash superflu
produirait `//pelerins`, qui répond `404`.

---

## 5. Le flux d'authentification

```
1. L'utilisateur saisit email + mot de passe
2. login()          →  POST /connecter { email, motDePasse }
3. Le serveur       →  bcrypt.compare(saisie, hash stocké)
                       refuse si isActive === false
4. Le serveur       →  { token: "<JWT 24 h>", user: { … sans motDePasse } }
5. saveSession()    →  localStorage : "token" + "currentUser"
6. Chaque appel     →  apiRequest ajoute  Authorization: Bearer <token>
7. Le middleware    →  vérifie la signature HS256 avec JWT_SECRET
8. Si 401           →  clearSession() + retour à la page de connexion
```

Le jeton contient `sub` (identifiant), `email`, `role` et `exp`. Il expire au bout
de 24 heures.

### Le hachage des mots de passe

**Hacher n'est pas chiffrer.** Un chiffrement se déchiffre avec une clé ; un hachage
est à sens unique. Aucune opération ne permet de remonter de l'empreinte au mot de
passe d'origine, même avec un accès complet à la base. Une fuite de la base ne livre
donc aucun mot de passe utilisable.

**Ce que contient une empreinte** — les quatre parties tiennent dans une seule chaîne :

```
$2b$ 10 $ n.1jvOCjJgwo70CUa2Re6e 2edr2olmG0P0hD0Aj/qsaH3X6zUNUYy
 │    │        │                              │
 │    │        │                              └─ empreinte (31 caractères)
 │    │        └─ sel aléatoire (22 caractères)
 │    └─ coût : 2^10 = 1024 tours de calcul
 └─ algorithme bcrypt, version b
```

**Le sel.** Hacher deux fois le même mot de passe produit deux chaînes différentes,
car le sel est tiré au hasard à chaque fois. Sans lui, deux personnes ayant choisi le
même mot de passe auraient la même empreinte : casser l'une reviendrait à casser
l'autre, et une table pré-calculée des mots de passe courants suffirait à toutes les
retrouver. Le sel étant rangé *dans* l'empreinte, il n'a pas besoin d'être stocké à
part : `bcrypt.compare` l'extrait, rehache la saisie avec lui, puis compare.

**La lenteur est une fonctionnalité.** Le coût `10` impose 1024 tours, soit environ
**55 ms** par vérification. Imperceptible pour un utilisateur qui se connecte une
fois ; ruineux pour qui voudrait tester des millions de combinaisons. Un algorithme
rapide comme MD5 ou SHA-256 serait ici un défaut, pas un avantage.

**Où le hachage intervient.** Une seule fonction appelle `bcrypt.hash` :

```js
// services/auth.js
export async function hashMotDePasse(motDePasse) {
  return bcrypt.hash(motDePasse, 10);
}
```

| Sens | Endroit | Moment |
|---|---|---|
| écriture | `db/seed.js` | création des comptes de démonstration |
| écriture | `utilisateursService.create` / `update` | l'API reçoit un mot de passe |
| écriture | `db/motsdepasse.js` | réinitialisation depuis `.env` |
| lecture | `connecter()` | vérification à la connexion, via `bcrypt.compare` |

Le mot de passe en clair n'existe jamais plus de quelques millisecondes en mémoire, et
n'est écrit nulle part — ni en base, ni dans les journaux, ni dans les réponses de l'API.

### Deux décisions de conception

**Décision de conception :** le mot de passe n'est jamais comparé côté navigateur.
La version initiale du front, conçue pour `json-server`, récupérait tous les
utilisateurs et comparait le mot de passe en clair dans le navigateur — impossible
avec bcrypt, qui produit une empreinte non réversible, et dangereux en soi.

**Sur le stockage du jeton :** `localStorage` est utilisé plutôt que
`sessionStorage`. Contrairement à une idée répandue, `sessionStorage` n'offre
aucune protection supplémentaire contre le XSS — les deux sont lisibles par tout
script exécuté sur la page. La seule option réellement plus sûre serait un cookie
`httpOnly`, mais elle impose que le front et l'API partagent le même domaine.
La vraie défense reste l'échappement systématique des données affichées.

---

## 6. Scripts et configuration

### Scripts npm de l'API

| Commande | Effet |
|---|---|
| `npm run dev` | démarre avec rechargement automatique |
| `npm start` | démarre en production |
| `npm run db:generate` | génère un fichier de migration à partir du schéma |
| `npm run db:migrate` | applique les migrations |
| `npm run db:seed` | insère les données de démonstration (rejouable sans doublon) |
| `npm run db:motsdepasse` | réinitialise les mots de passe existants depuis `.env` |
| `npm run db:studio` | explorateur visuel de la base |

### Pourquoi `db:motsdepasse` existe

Le seed est **idempotent** : avant chaque insertion il vérifie si la ligne existe déjà
et passe son chemin. C'est ce qui permet de le relancer sans créer de doublons — il
affiche alors `0 ligne(s) créée(s)`.

Mais cette qualité devient un blocage dans un cas précis : **changer le mot de passe
d'un compte déjà en base**. On peut modifier `SEED_MDP_ADMIN` dans `.env` et relancer
`db:seed` autant de fois qu'on veut, rien ne bouge — le compte existe, donc il est ignoré.

C'est exactement la situation rencontrée sur ce projet : des mots de passe de
démonstration écrits en dur dans `seed.js`, donc publiés sur GitHub, étaient déjà en
base et ouvraient un compte administrateur sur une API publique.

**Ce que le script fait :**

1. Lit les quatre variables `SEED_MDP_*` et **s'arrête avant toute modification** si
   l'une manque — pour ne pas changer la moitié des comptes puis échouer, ce qui
   laisserait des identifiants incohérents.
2. Charge tous les utilisateurs.
3. Pour chacun, prend le mot de passe correspondant à son rôle, le hache, met à jour.
4. Rend compte de chaque compte traité.

**Pourquoi ce n'est pas dans le seed.** Les deux scripts ont des intentions opposées :
le seed crée et ne détruit jamais rien, la réinitialisation écrase délibérément des
identifiants existants. Les fusionner voudrait dire que chaque `db:seed` réinitialise
silencieusement les mots de passe de tout le monde — une mauvaise surprise le jour où
on le lance juste pour ajouter un hôtel.

**Attention à la portée.** Le développement et la production partagent la même base.
Le script agit donc immédiatement sur l'API en ligne, sans redéploiement : les anciens
mots de passe cessent de fonctionner partout dès qu'il se termine.

### Variables d'environnement

| Variable | Requise | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | connexion Postgres (URL **externe** de Render, SSL requis) |
| `JWT_SECRET` | oui | signature des jetons |
| `CORS_ORIGIN` | recommandée | origines autorisées, séparées par des virgules |
| `PORT` | non | port d'écoute, `3000` par défaut ; Render l'impose |
| `SEED_MDP_ADMIN/GUIDE/PELERIN/PROCHE` | pour le seed | mots de passe des comptes de démonstration |

`.env` est exclu du dépôt par `.gitignore` — vérifié.

---

## 7. Déploiement

### L'API sur Render

| Réglage | Valeur |
|---|---|
| Type | Web Service |
| Region | **Ohio** — la même que la base |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Variables | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` |

Ne définis pas `PORT` : Render l'injecte lui-même.

Prends l'URL **externe** de la base, pas l'interne : `client.js` impose
`ssl: 'require'`, que la connexion interne ne propose pas.

Le plan gratuit met le service en veille après 15 minutes d'inactivité ; la
requête suivante peut prendre une cinquantaine de secondes.

### L'interface

N'importe quel hébergeur de fichiers statiques convient (GitHub Pages, Netlify,
Vercel) — aucune compilation n'est nécessaire.

Après mise en ligne, **ajoute l'URL du front à `CORS_ORIGIN`** sur Render, sinon
le navigateur bloquera tous les appels.

---

## 8. Méthodologie : de json-server à une vraie API

Le front avait été développé contre `json-server`, un serveur de développement qui
expose un fichier JSON en REST. Le passage à une véritable API a demandé quatre
adaptations.

**L'authentification.** `json-server` n'a pas de notion de compte. Le front lisait
donc tous les utilisateurs et comparait le mot de passe localement. Cette logique
a été remplacée par un appel à `POST /connecter`.

**Le jeton.** Aucune route n'était protégée auparavant. `apiClient` ajoute
désormais l'en-tête `Authorization` à chaque requête.

**Les filtres.** `json-server` accepte n'importe quel `?champ=valeur`. Les filtres
réellement utilisés par le front ont donc été implémentés côté API :
`?utilisateurId=`, `?pelerinId=`, `?groupeId=`, `?guideId=`.

**Les types.** Postgres ne renvoie pas les mêmes types qu'un fichier JSON. Les
colonnes `numeric` arrivent sous forme de **chaînes** (pour préserver la précision
arbitraire), ce qui cassait `latitude.toFixed()`. Résolu par `mode: 'number'` dans
le schéma Drizzle. De même, les numéros de téléphone sont désormais des chaînes et
les horodatages sortent au format ISO avec fuseau.

Choix structurant : les clés de `ENDPOINTS` ont été conservées à l'identique
(`planning` continue de désigner `/plannings`). Les 84 usages répartis dans le
code n'ont ainsi eu besoin d'aucune modification.

---

## 9. Problèmes rencontrés et résolutions

| Symptôme | Cause réelle | Correction |
|---|---|---|
| `relation "utilisateurs" does not exist` | `drizzle-kit migrate` échouait en silence : `DATABASE_URL` sans `sslmode`, alors que Render l'exige | `sslmode` ajouté à l'URL dans `drizzle.config.js` |
| `GET /pelerins/:id` en erreur 500 | la route appelait `findById`, inexistant dans le service | remplacé par `getById` |
| Toutes les routes planning en erreur | import de `planningService`, appels à `planningsService` | import corrigé + alias exporté |
| Hash du mot de passe visible dans les réponses | `OpenAPIHono` ne valide pas les réponses ; le schéma déclaré ne filtre rien | retrait explicite dans `utilisateursService` |
| `sos.latitude.toFixed is not a function` | Postgres renvoie les `numeric` en chaînes | `mode: 'number'` sur les quatre colonnes de coordonnées |
| « Serveur injoignable » depuis le front | CORS absent, puis serveur arrêté | middleware `cors` de Hono + origines Live Server |
| Déploiement : `Application exited early` | `package.json` déclarait `"main": "drizzle.config.js"`, que Render lançait | `main` corrigé + `Start Command: npm start` |
| Déploiement : `DATABASE_URL is not defined` | variables non enregistrées sur le service | ajoutées dans l'onglet *Environment* |

Deux leçons de méthode ressortent. D'abord, un processus qui se termine sans
message n'est pas un processus qui a réussi : le `migrate` sortait en code 1 sans
rien afficher. Ensuite, un code de statut ne prouve rien à lui seul : le préflight
CORS renvoyait `204` même pour une origine refusée — seul l'en-tête
`access-control-allow-origin` fait foi.

---

## 10. Sécurité

**En place :**

- mots de passe hachés en bcrypt (coût 10), jamais stockés ni renvoyés en clair
- toutes les routes de données protégées par JWT, expiration 24 h
- hash retiré de toutes les réponses de l'API
- CORS restreint à une liste explicite d'origines
- `.env` exclu du dépôt Git
- suppression définitive d'un utilisateur interdite (`403`)
- échappement systématique du HTML à l'affichage
- mots de passe de démonstration sortis du code et placés dans `.env`

**Points ouverts :**

- `sslmode=no-verify` chiffre la connexion à la base sans vérifier le certificat.
  Acceptable en développement ; en production, utiliser le certificat CA de Render
  et passer en `verify-full`.
- le jeton dans `localStorage` reste exposé à une faille XSS. La parade est
  l'échappement, déjà appliqué — il doit le rester sans exception.
- l'historique Git contient encore les anciens mots de passe. Ils ont été
  invalidés en base, donc inutilisables, mais l'historique ne peut être nettoyé
  sans réécriture.

---

## 11. Ce qui reste à faire

1. **Héberger l'interface**, puis ajouter son URL à `CORS_ORIGIN`.
2. **Tester chaque page une par une.** Seuls la connexion et le tableau de bord
   administrateur ont été validés en conditions réelles. Les formulaires de
   création envoient encore des données au format `json-server`, alors que l'API
   valide strictement via Zod et impose des contraintes de clés étrangères :
   des réponses `400` sont à prévoir.
3. **Ajouter une route racine** à l'API. `GET /` répond aujourd'hui `404`, ce qui
   déroute au premier coup d'œil ; un petit message avec un lien vers `/ui` serait
   plus accueillant.
4. **Envisager la pagination** sur les listes, si le nombre de pèlerins croît.

---

*Dernière mise à jour : 13 août 2026.*
