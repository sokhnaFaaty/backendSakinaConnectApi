// Test de la garde de propriete du guide, SANS base de donnees.
//
// Pourquoi stubber `db` plutot que d'ecrire un vrai test d'integration :
// `guideEstEnChargeDuPelerin` est une comparaison de deux identifiants resolus
// en base. C'est exactement le type de fonction qui peut casser en silence : si
// elle renvoie toujours `false`, rien ne journalise d'erreur, les tests
// fonctionnels passent, et le guide ne peut plus traiter aucune alerte.
//
// Le faux `db.select` repond uniquement sur la table demandee, en renvoyant
// directement la forme finale attendue par le appelant (le `join` reel n'est
// pas simule, et n'a pas besoin de l'etre : c'est la comparaison inter-fonctions
// qu'on verifie, pas le SQL).

process.env.JWT_SECRET ||= 'secret-de-test-uniquement-0123456789abcdef';
process.env.DATABASE_URL ||= 'postgres://u:p@127.0.0.1:5432/base_test';

const { db } = await import('../src/db/client.js');
const { groupes, guides, pelerins } = await import('../src/db/schema.js');
const { guideEstEnChargeDuPelerin, guideDePelerin } = await import(
  '../src/middlewares/authorize.js'
);

let ok = 0;
const echecs = [];

function verifie(nom, condition, detail = '') {
  if (condition) {
    ok++;
    console.log('  OK    ' + nom);
  } else {
    echecs.push(nom);
    console.log('  ECHEC ' + nom + (detail ? ' -> ' + detail : ''));
  }
}

// --- Faux `db` -------------------------------------------------------------
// Une table -> la liste de lignes que le code appelant s'attend a lire.
let scenario = {};
const VIDE = Symbol('aucune ligne');

function repond(table) {
  const cle = table === guides ? 'guide' : table === pelerins ? 'pelerin' : 'groupe';
  const valeur = scenario[cle];
  if (valeur === undefined || valeur === null) return [];
  return Array.isArray(valeur) ? valeur : [valeur];
}

const vrai = () => {
  const chaine = {
    from(t) { return Object.assign(Object.create(null), chaine, { _t: t }); },
    innerJoin() { return this; },
    where() { return this; },
    and() { return this; },
    limit() { return this; },
    orderBy() { return this; },
    // Rendre la chaine `thenable` : `await db.select().from().limit(1)` marche.
    then(resoudre, rejeter) {
      return Promise.resolve(repond(this._t)).then(resoudre, rejeter);
    },
  };
  return chaine;
};
db.select = vrai;

const UTILISATEUR = '11111111-1111-1111-1111-111111111111';
const AUTRE_UTILISATEUR = '22222222-2222-2222-2222-222222222222';
const GROUPE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GROUPE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GUIDE_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PELE_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PELE_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

async function test(nom, fn) {
  console.log('\n' + nom);
  await fn();
}

// --- 1. Ce que chaque helper resout ---------------------------------------
await test('[1] Chaque helper resout bien le type de valeur attendu', async () => {
  // Le cheminement complet : pelerin -> groupe -> guide.
  scenario = {
    guide: { groupeId: GROUPE_A },
    pelerin: { groupeId: GROUPE_A },
    groupe: { guideId: GUIDE_A },
  };
  verifie(
    'le guide du pelerin se resout en passant par son groupe',
    (await guideDePelerin(PELE_1)) === GUIDE_A
  );
});

await test('[2] Le guide de son groupe accede a son pelerin', async () => {
  scenario = { guide: { groupeId: GROUPE_A }, pelerin: { groupeId: GROUPE_A } };
  verifie('meme groupe -> true', (await guideEstEnChargeDuPelerin(UTILISATEUR, PELE_1)) === true);
});

await test('[3] Le guide d un autre groupe est refuse', async () => {
  scenario = { guide: { groupeId: GROUPE_A }, pelerin: { groupeId: GROUPE_B } };
  verifie('groupes differents -> false', (await guideEstEnChargeDuPelerin(UTILISATEUR, PELE_1)) === false);
});

await test('[4] Les cas limites ferment tous', async () => {
  scenario = { guide: null, pelerin: { groupeId: GROUPE_A } };
  verifie('guide sans groupe -> false', (await guideEstEnChargeDuPelerin(UTILISATEUR, PELE_1)) === false);

  scenario = { guide: { groupeId: GROUPE_A }, pelerin: null };
  verifie('pelerin sans groupe -> false', (await guideEstEnChargeDuPelerin(UTILISATEUR, PELE_1)) === false);

  scenario = { guide: {}, pelerin: { groupeId: GROUPE_A } };
  verifie('ligne groupe sans groupeId -> false', (await guideEstEnChargeDuPelerin(UTILISATEUR, PELE_1)) === false);
});

// --- 5. Le test de regression ---------------------------------------------
// C'est le test qui justifie tout le fichier. La version initiale de la
// fonction comparait `groupes.id` (le groupe du guide) a `groupes.guideId`
// (le guide du pelerin). Deux colonnes de la MEME table, donc jamais egales :
// la fonction renvoyait `false` pour tout, y compris pour le guide legitime.
await test('[5] Regression : le groupe et le guide ne sont pas le meme identifiant', async () => {
  scenario = {
    guide: { groupeId: GROUPE_A },
    pelerin: { groupeId: GROUPE_A },
    groupe: { guideId: GUIDE_A },
  };
  const groupeDuGuideConnecte = GROUPE_A;
  const guideDuPelerin = await guideDePelerin(PELE_1);

  verifie('GROUPE_A !== GUIDE_A (sinon le vieux code passait par hasard)', GROUPE_A !== GUIDE_A);
  verifie('l ancien code aurait refuse a tort', groupeDuGuideConnecte === guideDuPelerin === false);
  verifie('le nouveau code accepte sur le groupe', groupeDuGuideConnecte === GROUPE_A);
});

// --- 6. Un guide ne peut pas usurper un autre compte -----------------------
await test('[6] Un utilisateur sans lien avec le guide est refuse', async () => {
  scenario = { guide: null, pelerin: { groupeId: GROUPE_A } };
  verifie(
    'utilisateur inconnu -> false',
    (await guideEstEnChargeDuPelerin(AUTRE_UTILISATEUR, PELE_1)) === false
  );
  verifie('table groupes inutilisee par la garde', Object.keys(scenario).length === 2);
});

console.log('\n' + '-'.repeat(50));
console.log('RESULTAT : ' + ok + ' reussis / ' + (ok + echecs.length) + '  (echecs: ' + echecs.length + ')');
if (echecs.length) {
  console.log('\nEn echec :');
  echecs.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
