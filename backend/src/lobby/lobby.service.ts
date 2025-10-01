import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLobbyDto } from './dto/create-lobby.dto';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { StartGameDto } from './dto/start-game.dto';
import { Prisma } from '@prisma/client';
import { FriendsService } from 'src/friends/friends.service';

@Injectable()
export class LobbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) { }

  // -------------------------------------------------------------------------
  // 👇 Création / Recherche de lobby
  // -------------------------------------------------------------------------

  /** Créer un lobby et y ajouter le créateur comme membre */
  async create(dto: CreateLobbyDto, createurId: number) {
    // 1) Créateur existe
    const joueurExiste = await this.prisma.joueur.findUnique({
      where: { id: createurId },
      select: { id: true },
    });
    if (!joueurExiste)
      throw new BadRequestException(`Le joueur ${createurId} n'existe pas.`);

    // 2) Pas déjà un lobby en attente
    const lobbyExistant = await this.prisma.lobby.findFirst({
      where: { createurId, statut: 'en_attente' },
      select: { id: true },
    });
    if (lobbyExistant)
      throw new BadRequestException(
        `Vous avez déjà un lobby actif (id=${lobbyExistant.id}).`,
      );

    // 3) TX: créer + ajouter le créateur comme membre
    const lobbyCree = await this.prisma.$transaction(async (tx) => {
      const lobby = await tx.lobby.create({
        data: {
          nom: dto.nom,
          password: dto.password,
          statut: 'en_attente',
          visibility: (dto.visibility as any) ?? 'public',
          createur: { connect: { id: createurId } },
        },
        include: { createur: { select: { id: true, username: true } } },
      });
      await tx.lobbyJoueur.create({
        data: { lobbyId: lobby.id, joueurId: createurId },
      });
      return lobby;
    });

    return lobbyCree;
  }

  async findByIdOrThrow(id: number) {
    const lobby = await this.prisma.lobby.findUnique({
      where: { id },
      include: {
        createur: { select: { id: true, username: true } },
        partie: {
          select: {
            id: true,
            statut: true,
            scoreMax: true,
            nombreJoueurs: true,
          },
        },
      },
    });
    if (!lobby) throw new NotFoundException(`Lobby ${id} introuvable`);
    return lobby;
  }

  // -------------------------------------------------------------------------
  // 👇 Gestion des membres (join/leave/list)
  // -------------------------------------------------------------------------

  /** UC04 — Rejoindre un lobby (joueurId vient du token) */
  async join(dto: JoinLobbyDto, joueurId: number) {
    const { lobbyId, password } = dto;

    // 1) Lobby existe et en attente
    const lobby = await this.prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { membres: true, createur: true },
    });
    if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
    if (lobby.statut !== 'en_attente') {
      throw new BadRequestException(
        `Le lobby ${lobbyId} n'est pas joignable (statut: ${lobby.statut}).`,
      );
    }

    // 2) Mot de passe si privé
    if (lobby.password && lobby.password !== password) {
      throw new ForbiddenException('Mot de passe du lobby invalide');
    }
    //Règles de visibilité
    if (lobby.visibility === 'friends') {
      const ok = await this.friends.areFriends(joueurId, lobby.createurId);
      if (!ok) throw new ForbiddenException(`Ce lobby est réservé aux amis du créateur.`);
    } else if (lobby.visibility === 'private') {
      const invite = await this.prisma.lobbyInvite.findFirst({
        where: { lobbyId, toId: joueurId, status: 'sent' },
      });
      if (!invite) throw new ForbiddenException(`Ce lobby est privé. Invitation requise.`);
      // on peut marquer accepted ici (ou lors d'acceptInvite)
      await this.prisma.lobbyInvite.update({ where: { id: invite.id }, data: { status: 'accepted' } });
    }
    // 3) Joueur existe
    const joueur = await this.prisma.joueur.findUnique({
      where: { id: joueurId },
    });
    if (!joueur)
      throw new BadRequestException(`Le joueur ${joueurId} n'existe pas.`);

    // 4) Transaction stricte
    return this.prisma.$transaction(
      async (tx) => {
        const dejaMembre = await tx.lobbyJoueur.findUnique({
          where: { lobbyId_joueurId: { lobbyId, joueurId } },
        });
        if (dejaMembre)
          throw new BadRequestException('Vous êtes déjà dans ce lobby.');

        const autreLobby = await tx.lobbyJoueur.findFirst({
          where: { joueurId, lobby: { statut: 'en_attente' } },
          select: { lobbyId: true },
        });
        if (autreLobby && autreLobby.lobbyId !== lobbyId) {
          throw new BadRequestException(
            `Vous êtes déjà dans un lobby en attente (id=${autreLobby.lobbyId}).`,
          );
        }

        const count = await tx.lobbyJoueur.count({ where: { lobbyId } });
        if (count >= 4)
          throw new BadRequestException('Le lobby est plein (4/4)');

        await tx.lobbyJoueur.create({ data: { lobbyId, joueurId } });

        const updated = await tx.lobby.findUnique({
          where: { id: lobbyId },
          include: {
            createur: { select: { id: true, username: true } },
            membres: {
              include: { joueur: { select: { id: true, username: true } } },
            },
          },
        });

        return {
          id: updated!.id,
          nom: updated!.nom,
          statut: updated!.statut,
          estPrive: Boolean(updated!.password),
          createdAt: updated!.createdAt,
          createur: updated!.createur,
          nbMembres: updated!.membres.length,
          membres: updated!.membres.map((m) => m.joueur),
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async listMembers(lobbyId: number) {
    const lobby = await this.prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        membres: {
          include: { joueur: { select: { id: true, username: true } } },
        },
        createur: { select: { id: true } }
      },
    });
    if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
    return {
      lobbyId: lobby.id,
      createurId: lobby.createur.id,
      nbMembres: lobby.membres.length,
      membres: lobby.membres.map((m) => m.joueur),
    };
  }

  async leave(lobbyId: number, joueurId: number) {
    return this.prisma.$transaction(async (tx) => {
      const lobby = await tx.lobby.findUnique({
        where: { id: lobbyId },
        include: { membres: true },
      });
      if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);

      const isMember = lobby.membres.some((m) => m.joueurId === joueurId);
      if (!isMember)
        throw new BadRequestException(
          `Le joueur ${joueurId} n'est pas membre du lobby.`,
        );

      if (lobby.createurId === joueurId) {
        await tx.lobbyJoueur.deleteMany({ where: { lobbyId } });
        await tx.lobby.delete({ where: { id: lobbyId } });
        return {
          message: `Lobby ${lobbyId} supprimé car le créateur est parti.`,
        };
      }

      await tx.lobbyJoueur.delete({
        where: { lobbyId_joueurId: { lobbyId, joueurId } },
      });
      const remaining = await tx.lobbyJoueur.count({ where: { lobbyId } });
      if (remaining === 0) {
        await tx.lobby.delete({ where: { id: lobbyId } });
        return { message: `Lobby ${lobbyId} supprimé (dernier joueur parti).` };
      }
      return { message: `Joueur ${joueurId} a quitté le lobby ${lobbyId}.` };
    });
  }

  // -------------------------------------------------------------------------
  // 👇 Lancement de partie
  // -------------------------------------------------------------------------

  /** Lancer la partie — `createurId` vient du token */
  async startGame(lobbyId: number | undefined, createurId: number, scoreMax?: number) {
    if (!Number.isFinite(lobbyId) || !lobbyId) {
      throw new BadRequestException('lobbyId manquant ou invalide');
    }
    return this.prisma.$transaction(
      async (tx) => {
        // 1) Lobby
        const lobby = await tx.lobby.findUnique({
          where: { id: lobbyId },
          include: {
            membres: {
              include: { joueur: { select: { id: true, username: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
        if (!lobby)
          throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
        if (lobby.statut !== 'en_attente') {
          throw new BadRequestException(
            `Lobby ${lobbyId} n'est pas en attente.`,
          );
        }
        if (lobby.createurId !== createurId) {
          throw new ForbiddenException(
            `Seul le créateur peut lancer la partie.`,
          );
        }

        // 2) 4 joueurs
        if (lobby.membres.length !== 4) {
          throw new BadRequestException(
            `Il faut exactement 4 joueurs pour lancer la partie (actuel: ${lobby.membres.length}).`,
          );
        }

        // 3) Partie
        const partie = await tx.partie.create({
          data: {
            statut: 'en_cours',
            scoreMax: scoreMax ?? 301,
            nombreJoueurs: 4,
          },
        });

        // 4) Équipes
        const equipe1 = await tx.equipe.create({
          data: { partieId: partie.id, numero: 1 },
        });
        const equipe2 = await tx.equipe.create({
          data: { partieId: partie.id, numero: 2 },
        });

        // 5) Affectations (ordre d’entrée)
        const affectations = lobby.membres.map((m, index) => ({
          equipeId: index % 2 === 0 ? equipe1.id : equipe2.id,
          joueurId: m.joueur.id,
          ordreSiege: index,
        }));
        await tx.equipeJoueur.createMany({ data: affectations });

        // 6) Paquet
        const cartes = await tx.carte.findMany();
        if (cartes.length < 32) {
          throw new BadRequestException(
            'Le paquet de cartes n’est pas initialisé (32 cartes requises). Lance le seed.',
          );
        }
        const paquet = [...cartes].sort(() => Math.random() - 0.5);
        const idxRetournee = 20;
        const carteRetournee = paquet[idxRetournee];
        const seats = lobby.membres.map((m, i) => ({
          seat: i,
          joueurId: m.joueur.id,
        }));
        const dealerSeat = seats.find((s) => s.joueurId === createurId)!.seat;
        const leftOfDealerId = seats[(dealerSeat + 1) % 4].joueurId;
        const paquetIds = paquet.map((c) => c.id);

        // 7) Manche 1
        const manche = await tx.manche.create({
          data: {
            partieId: partie.id,
            numero: 1,
            donneurJoueurId: createurId,
            carteRetourneeId: carteRetournee.id,
            tourActuel: 1,
            joueurActuelId: leftOfDealerId,
            preneurId: null,
            paquet: paquetIds,
          },
        });
        await tx.partie.update({
          where: { id: partie.id },
          data: { mancheCouranteId: manche.id },
        });

        // 8) Mains initiales (5 cartes / joueur)
        const mainsData: Prisma.MainCreateManyInput[] = seats.flatMap((s) => {
          const start = s.seat * 5;
          const five = paquet.slice(start, start + 5);
          return five.map((carte) => ({
            joueurId: s.joueurId,
            mancheId: manche.id,
            carteId: carte.id,
            jouee: false,
          }));
        });
        await tx.main.createMany({ data: mainsData });

        // 9) MAJ lobby
        await tx.lobby.update({
          where: { id: lobbyId },
          data: { statut: 'en_cours', partieId: partie.id },
        });

        return {
          message: `Partie ${partie.id} lancée depuis le lobby ${lobbyId}`,
          partie: {
            id: partie.id,
            scoreMax: partie.scoreMax,
            statut: partie.statut,
          },
          manche: {
            id: manche.id,
            numero: manche.numero,
            donneurId: manche.donneurJoueurId,
            carteRetournee: carteRetournee,
          },
          equipes: [
            {
              id: equipe1.id,
              joueurs: affectations.filter((a) => a.equipeId === equipe1.id),
            },
            {
              id: equipe2.id,
              joueurs: affectations.filter((a) => a.equipeId === equipe2.id),
            },
          ],
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  // -------------------------------------------------------------------------
  // 👇 Utilitaires / queries complémentaires
  // -------------------------------------------------------------------------

  async findPartieWithEquipe(partieId: number, joueurId: number) {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
      include: {
        mancheCourante: true,
        equipes: {
          include: {
            joueurs: true,
          },
        },
      },
    });

    if (!partie) {
      throw new NotFoundException(`Partie ${partieId} introuvable.`);
    }

    const equipe = partie.equipes.find((e) =>
      e.joueurs.some((j) => j.joueurId === joueurId),
    );

    if (!equipe) {
      throw new ForbiddenException(
        `Joueur ${joueurId} non membre de la partie ${partieId}.`,
      );
    }

    return {
      partie,
      equipeId: equipe.id,
    };
  }

  async findByName(nom: string) {
    const lobby = await this.prisma.lobby.findFirst({
      where: { nom },
      select: { id: true },
    });
    if (!lobby) throw new NotFoundException(`Lobby "${nom}" introuvable.`);
    return lobby;
  }

  async joinByName(nom: string, joueurId: number) {
    console.log(
      `[Service] Tentative de rejoindre par nom: ${nom} (joueur ${joueurId})`,
    );
    const lobby = await this.prisma.lobby.findFirst({
      where: { nom },
    });

    if (!lobby) {
      console.warn(`[Service] Lobby "${nom}" introuvable`);
      throw new NotFoundException(`Lobby "${nom}" introuvable.`);
    }

    return this.join({ lobbyId: lobby.id }, joueurId);
  }

  async leaveSocket(lobbyId: number, joueurId: number) {
    const result = await this.leave(lobbyId, joueurId); // on réutilise la méthode existante
    return {
      lobbyId,
      joueurId,
      message: result.message,
    };
  }

  async invite(lobbyId: number, fromId: number, toId: number) {
    const lobby = await this.prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { membres: true, createur: true },
    });
    if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
    if (lobby.statut !== 'en_attente') throw new BadRequestException(`Lobby non joignable.`);

    const capacity = await this.prisma.lobbyJoueur.count({ where: { lobbyId } });
    if (capacity >= 4) throw new BadRequestException(`Lobby plein.`);

    // L’expéditeur doit être membre du lobby
    const isMember = lobby.membres.some(m => m.joueurId === fromId);
    if (!isMember) throw new ForbiddenException(`Seuls les membres du lobby peuvent inviter.`);

    // Si visibility=friends -> vérifier amitié entre destinataire et créateur
    if (lobby.visibility === 'friends') {
      const ok = await this.friends.areFriends(toId, lobby.createurId);
      if (!ok) throw new ForbiddenException(`Ce lobby est réservé aux amis du créateur.`);
    }

    // Upsert d'une invitation "sent" (unique par lobbyId+toId+status)
    const inv = await this.prisma.lobbyInvite.upsert({
      where: { lobbyId_toId_status: { lobbyId, toId, status: 'sent' } },
      create: { lobbyId, fromId, toId, status: 'sent' },
      update: { status: 'sent' },
    });

    return inv;
  }

  async acceptInvite(lobbyId: number, userId: number) {
    const invite = await this.prisma.lobbyInvite.findFirst({
      where: { lobbyId, toId: userId, status: 'sent' },
    });
    if (!invite) throw new NotFoundException(`Invitation introuvable.`);

    await this.prisma.lobbyInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted' },
    });

    // Réutilise le flux standard d’entrée dans le lobby
    return this.join({ lobbyId }, userId);
  }

  // -------------------------------------------------------------------------
  // 👇 Méthodes historiques (conservées pour compat / tooling)
  // -------------------------------------------------------------------------

  /**
   * (Historique) Vide les membres du lobby lié à la partie, puis renvoie l'id du lobby.
   * NB: pas adapté à "réutiliser le lobby avec les mêmes joueurs".
   */
  async clearLobbyMembersByPartie(partieId: number): Promise<number | null> {
    const lobby = await this.prisma.lobby.findUnique({
      where: { partieId },
      select: { id: true },
    });
    if (!lobby) return null;

    await this.prisma.lobbyJoueur.deleteMany({
      where: { lobbyId: lobby.id },
    });
    return lobby.id;
  }

  /**
   * (Historique) Réinitialise le lobby lié à la partie en le remettant "en_attente" et détachant la partie.
   * ⚠️ Supprime les membres. Préférer `reuseLobbyAfterGameByPartie` pour ton besoin actuel.
   */
  async resetLobbyAfterGameByPartie(partieId: number) {
    const lobby = await this.prisma.lobby.findFirst({
      where: { partieId },
      select: { id: true },
    });
    if (!lobby) return null;

    await this.prisma.$transaction([
      this.prisma.lobbyJoueur.deleteMany({ where: { lobbyId: lobby.id } }),
      this.prisma.lobby.update({
        where: { id: lobby.id },
        data: { partieId: null, statut: 'en_attente' },
      }),
    ]);

    return lobby.id;
  }

  // -------------------------------------------------------------------------
  // 👇 NOUVEAU — Réutiliser le lobby à la fin d'une partie (sans tout casser)
  // -------------------------------------------------------------------------

  /**
   * Réutilise le lobby lié à la partie : repasse en "en_attente", détache la partie,
   * et (re)garantit la présence des 4 joueurs de la partie dans le lobby.
   *
   * Ne publie PAS d'événements WS (laissez un gateway/service caller le faire),
   * pour éviter toute dépendance ici.
   *
   * Retourne: { lobbyId, membres: { id, username }[] }
   */
  async reuseLobbyAfterGameByPartie(partieId: number): Promise<{ lobbyId: number, membres: { id: number, username: string }[] } | null> {
    // 1) Trouver le lobby lié à la partie
    const lobby = await this.prisma.lobby.findFirst({
      where: { partieId },
      select: { id: true },
    });
    if (!lobby) return null;

    // 2) Récupérer les joueurs de la partie via EquipeJoueur
    const joueursPartie = await this.prisma.equipeJoueur.findMany({
      where: { equipe: { partieId } },
      select: { joueurId: true, joueur: { select: { id: true, username: true } } },
      orderBy: { ordreSiege: 'asc' },
    });
    const membres = joueursPartie.map(j => j.joueur);

    // 3) Transaction : repasser le lobby "en_attente", délier la partie, upsert membres
    await this.prisma.$transaction(async (tx) => {
      await tx.lobby.update({
        where: { id: lobby.id },
        data: { partieId: null, statut: 'en_attente' },
      });

      for (const m of membres) {
        await tx.lobbyJoueur.upsert({
          where: { lobbyId_joueurId: { lobbyId: lobby.id, joueurId: m.id } },
          update: {},
          create: { lobbyId: lobby.id, joueurId: m.id },
        });
      }
    });

    return { lobbyId: lobby.id, membres };
  }

  // -------------------------------------------------------------------------
  // 👇 Aide: utilitaires de lecture supplémentaires
  // -------------------------------------------------------------------------

  async findCurrentLobbyFor(joueurId: number) {
    return this.prisma.lobby.findFirst({
      where: {
        membres: { some: { joueurId } },
      },
      select: { id: true, nom: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async isMemberOfLobby(lobbyId: number, joueurId: number) {
    const row = await this.prisma.lobbyJoueur.findUnique({
      where: { lobbyId_joueurId: { lobbyId, joueurId } },
      select: { lobbyId: true },
    });
    return !!row;
  }

  async getMemberIds(lobbyId: number): Promise<number[]> {
    const rows = await this.prisma.lobbyJoueur.findMany({
      where: { lobbyId },
      select: { joueurId: true },
    });
    return rows.map(r => r.joueurId);
  }

  async getLobbyLight(lobbyId: number) {
    return this.prisma.lobby.findUnique({
      where: { id: lobbyId },
      select: { id: true, nom: true, createurId: true },
    });
  }
}
