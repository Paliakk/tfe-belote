# TFE – Belote en ligne (Backend NestJS + Prisma + PostgreSQL)

Backend du projet de Belote en ligne (NestJS, TypeScript, Prisma, PostgreSQL).  
Architecture modulaire par use cases. Toute la logique de jeu est côté serveur.

## ⚙️ Prérequis
- Node.js 18+
- PostgreSQL local (DB `belote`)
- VS Code (Thunder Client conseillé) / Postman
- Prisma CLI

## 🚀 Démarrage
```bash
# 1) Installer
npm install

# 2) Variables d’environnement (backend/.env)
# DATABASE_URL="postgresql://postgres:<mdp>@localhost:5432/belote"
# JWT_SECRET=secretdevTFE
# AUTH0_DOMAIN=...
# AUTH0_AUDIENCE=…

---

## 🔧 Seed de base (couleurs + 32 cartes)
Un seed est fourni pour initialiser les 4 couleurs et les 32 cartes.

```bash
npm run prisma:seed

# 3) Prisma
npx prisma migrate dev --name init
npx prisma generate

# 4) Lancer
npm run start:dev


Données de test minimales
npx prisma studio
Modèle Joueur → Create :
username=TestUser, email=test@local.dev, passwordHash=hash-dev.

UC03 — Créer & consulter un lobby
POST /lobby
Crée un lobby (le créateur est automatiquement ajouté comme membre dans LobbyJoueur).
Pour l’instant, le créateur est createurId = 1 (sera remplacé par Auth0).

POST http://localhost:3000/lobby
Content-Type: application/json

{
  "nom": "Salle du samedi soir",
  "password": "1234"  // optionnel (public si absent)
}

GET /lobby/:id
Retourne les infos du lobby sans exposer le password.

GET http://localhost:3000/lobby/1


UC04 — Rejoindre un lobby
POST /lobby/join
Permet à un joueur de rejoindre un lobby en_attente (capacité 4, créateur inclus).
Temporaire (avant Auth0) : joueurId est passé dans le body.


{
  "lobbyId": 1,
  "joueurId": 2,
  "password": "1234"   // requis si lobby privé, sinon omettre
}


Le lobby doit exister et être en_attente.

Si password est défini pour le lobby, il doit correspondre.

Un joueur ne peut pas être dans deux lobbys en_attente.

Capacité strictement limitée à 4 (créateur inclus).

Opération sous transaction Serializable (évite les surcapacités concurrentes).

GET /lobby/:id/members
Liste les membres actuels du lobby (inclut le créateur).


src/
  prisma/
    prisma.module.ts
    prisma.service.ts
  lobby/
    dto/
      create-lobby.dto.ts
      join-lobby.dto.ts
    lobby.controller.ts
    lobby.service.ts
  app.module.ts
prisma/
  schema.prisma
  migrations/


UC05 — Lancer une partie (depuis un lobby)
POST /lobby/:id/start
Démarre une partie à partir d’un lobby en_attente.
Seul le créateur du lobby peut lancer. Le lobby doit contenir exactement 4 membres.

{
  "joueurId": 1,     // créateur (temp, remplacé par Auth0 plus tard)
  "scoreMax": 301    // optionnel (défaut = 301)
}

Effets

Crée Partie (statut en_cours, scoreMax, nombreJoueurs=4)

Crée 2 Equipe et 4 EquipeJoueur (sièges = ordre d’entrée ; équipes = 0&2 vs 1&3)

Mélange le paquet (32 cartes) et distribue 5 cartes par joueur (Main.jouee=false)

Crée Manche #1 (donneur = créateur, carteRetournee = 21e carte du paquet)

Met à jour le Lobby (en_cours, partieId)








