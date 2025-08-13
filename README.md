# Belote TFE — Backend (NestJS + Prisma + PostgreSQL)

> **Stack**: NestJS (TypeScript) · Prisma ORM · PostgreSQL · Socket.io (à venir)

## 0) Démarrage rapide

```bash
# 1) Dépendances
npm install

# 2) Configuration (backend/.env)
# exemple minimal
DATABASE_URL="postgresql://postgres:<mdp>@localhost:5432/belote"
JWT_SECRET=secretdevTFE

# 3) Prisma
npx prisma migrate dev
npx prisma generate

# 4) Lancer l'API
npm run start:dev
```

---

## 1) Modèles et terminologie

* **Partie**: enchaînement de **manches** jusqu’au score cible (ex: 301).
* **Manche (Donne)**: 2 tours d’enchères (UC06), puis **8 plis** (UC07+UC11+UC12).
* **Pli**: 4 cartes jouées (1 par joueur).

**Schéma (extraits)**

* `Joueur`, `Lobby`, `Partie`, `Equipe`, `EquipeJoueur(ordreSiege)`
* `Manche`: `tourActuel`, `joueurActuelId`, `preneurId`, `paquet(Int[])`, `carteRetourneeId`
* `Main` (cartes du joueur), `Enchere`, `Pli`, `PliCarte`, `ScoreManche`, `Bonus`

---

## 2) Endpoints API (MVP)

> Préfixe local par défaut: `http://localhost:3000`

### 2.1 Lobby (UC03, UC04, UC04b, UC05)

#### Créer un lobby (UC03)

**POST** `/lobby`

```json
{
  "nom": "Salon de test",
  "password": "optionnel",
  "createurId": 1
}
```

**201** → `{ id, nom, statut, createurId, ... }`

#### Récupérer un lobby

**GET** `/lobby/:id`

#### Rejoindre un lobby (UC04)

**POST** `/lobby/:id/join`

```json
{ "joueurId": 2, "password": "si défini" }
```

**200** → `{ message: "Rejoint" }`

#### Quitter un lobby (UC04b)

**POST** `/lobby/:id/leave`

```json
{ "joueurId": 2 }
```

**200** →

* Si **créateur** quitte → suppression du lobby + éjection de tous.
* Sinon → membre retiré, lobby mis à jour.

#### Lancer une partie (UC05)

**POST** `/lobby/:id/start`

```json
{ "joueurId": 1, "scoreMax": 301 }
```

**200** → crée `Partie`, `Equipe`s, `Manche #1` (5 cartes/joueur, carte #21 retournée), initialise enchères.

---

### 2.2 Bidding / Enchères (UC06)

#### Manche active pour une partie

**GET** `/bidding/active/:partieId`
**200** → `{ id: <mancheId>, numero: <n> }`

#### État des enchères

**GET** `/bidding/state/:mancheId`
**200** →

```json
{
  "mancheId": 3,
  "tourActuel": 1,
  "joueurActuelId": 2,
  "preneurId": null,
  "atout": null,
  "carteRetournee": { "id": 6, "valeur": "Roi", "couleurId": 1 },
  "historique": [ { "joueur": {"id": 2, "username": "Alice"}, "type": "pass", "at": "..." } ]
}
```

#### Poser une enchère

**POST** `/bidding/:mancheId/bid`

```json
{ "joueurId": 2, "type": "pass" }
```

Types supportés:

* Tour 1: `pass` | `take_card`
* Tour 2: `pass` | `choose_color` (⚠️ `couleurAtoutId` requis et **≠** `carteRetournee.couleurId`)

**Réponses**:

* Pass → `200 { message: "Pass. Joueur suivant: <id>" }`
* Take card → `200 { message: "Preneur fixé...", ... }` (distribution complétée: preneur a la retournée +2, autres +3)
* Choose color → `200 { message: "Preneur fixé...", ... }`
* 8 passes (Tour1+Tour2) → `200 { message: "Donne relancée (UC14)", newMancheId: <id> }`
* Manche périmée (après relance) → `409 { message: "...", activeMancheId, activeMancheNumero }`

**Erreurs courantes**:

* 400: joueur hors tour / type interdit au tour / couleur identique à la retournée / missing `couleurAtoutId`

---

### 2.3 Partie (abandon global, ENF‑7)

#### Quitter une partie (abandon global)

**POST** `/game/:partieId/quit`

```json
{ "joueurId": 3 }
```

Effets:

* `Partie.statut = 'abandonnee'`
* `Lobby` lié remis en `en_attente`, suppression du membre qui quitte

---

## 3) Séquences Postman recommandées

### A. Lancer et enchérir (Tour 1 → prise)

1. `POST /lobby/:lobbyId/start`  → note `partieId`
2. `GET /bidding/active/:partieId` → note `mancheId`
3. `GET /bidding/state/:mancheId` → état initial
4. `POST /bidding/:mancheId/bid` (pass)
5. `POST /bidding/:mancheId/bid` (pass)
6. `POST /bidding/:mancheId/bid` (take\_card)

### B. Tour 1 complet sans preneur → Tour 2 → choose\_color

1. 4× `pass` (Tour 1) → passage Tour 2
2. `choose_color` (couleur ≠ retournée)

### C. 8 passes → relance (UC14 minimal)

1. 4× `pass` (Tour 1) → Tour 2
2. 4× `pass` (Tour 2) → `{ newMancheId }`
3. `GET /bidding/active/:partieId` → doit renvoyer `newMancheId`
4. Toute enchère sur l’ancienne manche → `409` + `activeMancheId`

---

## 4) Scripts utiles

```bash
# Lint & format
npm run lint
npm run format

# Prisma
npx prisma migrate dev
npx prisma generate
npx prisma studio

# Dev server
npm run start:dev
```

### SQL reset (dev)

```sql
DELETE FROM "Main";
DELETE FROM "Enchere";
DELETE FROM "PliCarte";
DELETE FROM "Pli";
DELETE FROM "Manche";
DELETE FROM "EquipeJoueur";
DELETE FROM "Equipe";
DELETE FROM "Partie";
UPDATE "Lobby" SET "statut"='en_attente', "partieId"=NULL;
```

---

## 5) Roadmap Backend (MVP)

* **UC10**: Cartes jouables (suivre, couper, surcouper, se défausser à l’atout)
* **UC07**: Jouer une carte (validation via UC10)
* **UC11**: Gagnant du pli
* **UC12**: Fin de manche, scores, bonus (Belote/Rebelote, Dix de der, Capot)
* **UC14 (complet)**: Service dédié relance (statuts de manche, WS events, garde-fous centralisés)

---

## 6) Branching & PR

* Créer une branche par UC: `feat/uc06-bidding`, `feat/uc14-relance`, etc.
* Commit message court + description détaillée.
* Merge vers `main` via PR (ou GitHub Desktop) une fois les tests Postman validés.
