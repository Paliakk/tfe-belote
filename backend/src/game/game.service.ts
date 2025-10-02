import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { LobbyService } from 'src/lobby/lobby.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/realtime/realtime.service';
type Totals = { team1: number; team2: number } | null

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lobbyService: LobbyService,
    private readonly rt: RealtimeService,
  ) { }
  private timeoutStreak = new Map<string, number>();

  async quitGame(partieId: number, joueurId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        //1. Vérifier que la partie existe et est en cours
        const partie = await tx.partie.findUnique({
          where: { id: partieId },
          include: { lobby: true, equipes: { include: { joueurs: true } } },
        });
        if (!partie) {
          throw new NotFoundException(`Partie ${partieId} introuvable`);
        }
        if (partie.statut !== 'en_cours') {
          throw new BadRequestException(
            `La partie ${partieId} n'est pas en cours`,
          );
        }

        //2. Vérifier que le joueur fait partie de la partie
        const joueurPresent = partie.equipes.some((eq) =>
          eq.joueurs.some((j) => j.joueurId === joueurId),
        );
        if (!joueurPresent) {
          throw new BadRequestException(
            `Le joueur ${joueurId} ne participe pas à cette partie`,
          );
        }

        //3. Marquer la partie comme abandonnée
        await tx.partie.update({
          where: { id: partieId },
          data: { statut: 'abandonnee' },
        });

        //4. Si un lobby est lié --> retour en attente et suppression du joueur qui quitte
        if (partie.lobby) {
          await tx.lobby.update({
            where: { id: partie.lobby.id },
            data: {
              statut: 'en_attente',
              partieId: null,
              membres: {
                deleteMany: { joueurId }, //On supprime celui qui quitte
              },
            },
          });
        }
        return {
          message: `Partie ${partieId} abandonnée par le joueur ${joueurId}`,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async onGameOver(partieId: number): Promise<void> {
    const lobbyId = await this.lobbyService.clearLobbyMembersByPartie(partieId);
    if (lobbyId) {
      // informer les clients du lobby qu’il est vidé
      this.rt.emitToLobby(lobbyId, 'lobby:state', { lobbyId, membres: [] });
    }
  }

  async endPartieAndReturnToLobby(
    partieId: number,
    opts?: { winnerTeamNumero?: 1 | 2; totals?: Totals }
  ) {
    await this.prisma.partie.update({
      where: { id: partieId },
      data: { statut: 'finie' },
    });
    this.clearTimeoutsForPartie(partieId);

    const reused = await this.lobbyService.reuseLobbyAfterGameByPartie(partieId);
    const lobbyId = reused?.lobbyId ?? null;

    // 🔔 game.js a besoin de winnerTeamNumero & totals ici
    this.rt.emitToPartie(partieId, 'game:over', {
      partieId,
      lobbyId,
      winnerTeamNumero: opts?.winnerTeamNumero ?? null,
      totals: opts?.totals ?? null,
    });

    if (lobbyId != null) {
      await this.rt.movePartieToLobby(partieId, lobbyId);
      this.rt.emitToLobby(lobbyId, 'lobby:state', {
        lobbyId,
        membres: reused!.membres,
      });
      this.rt.emitToLobby(lobbyId, 'lobby:updated', {
        lobbyId,
        membres: reused!.membres,
        statut: 'en_attente',
      });
    }

    return { ok: true, lobbyId };
  }

  async abandonPartie(partieId: number, joueurId: number) {
    // (option) vérifier membre... (inchangé)

    // 🔹 Trouver l'équipe (1/2) du joueur qui abandonne
    const seat = await this.prisma.equipeJoueur.findFirst({
      where: { equipe: { partieId }, joueurId },
      select: { equipe: { select: { numero: true } } },
    });
    const leaverTeamNumero = seat?.equipe.numero as 1 | 2 | undefined;
    const winnerTeamNumero =
      leaverTeamNumero ? ((leaverTeamNumero === 1 ? 2 : 1) as 1 | 2) : undefined;

    // statut 'abandonnee'
    await this.prisma.partie.update({
      where: { id: partieId },
      data: { statut: 'abandonnee' },
    });

    // 🔹 Loguer l’évènement (volontaire) pour les stats
    await this.prisma.playerEvent.create({
      data: {
        joueurId,
        partieId,
        type: 'ABANDON_TRIGGERED',
      },
    });

    // Reuse lobby (inchangé)
    const reused = await this.lobbyService.reuseLobbyAfterGameByPartie(partieId);
    const lobbyId = reused?.lobbyId ?? null;
    this.clearTimeoutsForPartie(partieId);

    // 🔔 Notifier la fin + indiquer l’équipe gagnante
    this.rt.emitToPartie(partieId, 'game:over', {
      partieId,
      lobbyId,
      reason: 'abandon',
      by: joueurId,
      winnerTeamNumero: winnerTeamNumero ?? null, // 👈 maintenant défini
      totals: null,
    });

    if (lobbyId != null) {
      await this.rt.movePartieToLobby(partieId, lobbyId);
      this.rt.emitToLobby(lobbyId, 'lobby:state', {
        lobbyId,
        membres: reused!.membres,
      });
      this.rt.emitToLobby(lobbyId, 'lobby:updated', {
        lobbyId,
        membres: reused!.membres,
        statut: 'en_attente',
      });
    }

    return { ok: true, lobbyId };
  }
  private key(partieId: number, joueurId: number) {
    return `${partieId}:${joueurId}`;
  }
  public incTimeout(partieId: number, joueurId: number): number {
    const k = this.key(partieId, joueurId);
    const v = (this.timeoutStreak.get(k) ?? 0) + 1;
    this.timeoutStreak.set(k, v);
    return v;
  }
  public resetTimeout(partieId: number, joueurId: number) {
    this.timeoutStreak.delete(this.key(partieId, joueurId));
  }
  public clearTimeoutsForPartie(partieId: number) {
    for (const k of Array.from(this.timeoutStreak.keys())) {
      if (k.startsWith(partieId + ':')) this.timeoutStreak.delete(k);
    }
  }
}
