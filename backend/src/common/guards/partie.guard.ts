import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PartieGuard {
  constructor(private readonly prisma: PrismaService) {}

  async ensureEnCoursByMancheId(mancheId: number) {
    const m = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      select: { partie: { select: { statut: true } } },
    });
    if (!m) throw new BadRequestException(`Manche ${mancheId} introuvable.`);
    if (m.partie.statut !== 'en_cours') {
      throw new BadRequestException(`La partie est terminée.`);
    }
  }

  async ensureEnCoursByPartieId(partieId: number) {
    const p = await this.prisma.partie.findUnique({
      where: { id: partieId },
      select: { statut: true },
    });
    if (!p) throw new BadRequestException(`Partie ${partieId} introuvable.`);
    if (p.statut !== 'en_cours') {
      throw new BadRequestException(`La partie est terminée.`);
    }
  }
}
