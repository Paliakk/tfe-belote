\# TFE – Belote en ligne (Backend NestJS + Prisma + PostgreSQL)



Backend du projet de Belote en ligne (NestJS, TypeScript, Prisma, PostgreSQL).  

Architecture modulaire (modules par use case), typage strict, et logique serveur.



\## ⚙️ Prérequis

\- Node.js 18+

\- PostgreSQL local (DB: `belote`)

\- VS Code + Thunder Client (ou Postman)

\- Prisma CLI (`npx prisma -v`)



\## 🚀 Démarrage rapide

```bash

\# 1) Installer

npm install



\# 2) Variables d’environnement

\# backend/.env

\# DATABASE\_URL="postgresql://postgres:<mdp>@localhost:5432/belote"

\# JWT\_SECRET=secretdevTFE

\# AUTH0\_DOMAIN, AUTH0\_AUDIENCE (plus tard)



\# 3) Prisma

npx prisma migrate dev --name init

npx prisma generate

npx prisma studio  # (optionnel) interface DB



\# 4) Lancer l’API

npm run start:dev

