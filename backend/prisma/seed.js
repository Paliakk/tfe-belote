const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Reset minimal (si tu veux repartir propre)
  await prisma.main.deleteMany();
  await prisma.enchere.deleteMany();
  await prisma.pliCarte.deleteMany();
  await prisma.pli.deleteMany();
  await prisma.manche.deleteMany();
  await prisma.equipeJoueur.deleteMany();
  await prisma.equipe.deleteMany();
  await prisma.partie.deleteMany();
  await prisma.lobbyJoueur.deleteMany();
  await prisma.lobby.deleteMany();
  await prisma.carte.deleteMany();
  await prisma.couleur.deleteMany();

  // Couleurs (♥ ♦ ♣ ♠)
  const couleursData = [
    { nom: 'coeur' },
    { nom: 'carreau' },
    { nom: 'trefle' },
    { nom: 'pique' },
  ];
  const couleurs = {};
  for (const c of couleursData) {
    const row = await prisma.couleur.upsert({
      where: { nom: c.nom },
      update: {},
      create: c,
    });
    couleurs[c.nom] = row.id;
  }

  // Points belote
  const VALEURS = ['7','8','9','Valet','Dame','Roi','10','As'];
  const pointsAtout = { '7':0,'8':0,'9':14,'Valet':20,'Dame':3,'Roi':4,'10':10,'As':11 };
  const pointsNon  = { '7':0,'8':0,'9':0,  'Valet':2, 'Dame':3,'Roi':4,'10':10,'As':11 };

  // 32 cartes
  for (const [nomCouleur, couleurId] of Object.entries(couleurs)) {
    for (const v of VALEURS) {
      await prisma.carte.upsert({
        where: {
          // Unicité logique par (couleurId, valeur) -> si tu as un unique composite diff, adapte.
          id: 0, // hack pour forcer create; mieux: mets @@unique([couleurId, valeur]) dans Prisma et utilise where: { couleurId_valeur: { ... } }
        },
        update: {},
        create: {
          couleurId,
          valeur: v,
          pointsAtout: pointsAtout[v],
          pointsNonAtout: pointsNon[v],
        },
      });
    }
  }

  console.log('Seed terminé: couleurs + 32 cartes.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });