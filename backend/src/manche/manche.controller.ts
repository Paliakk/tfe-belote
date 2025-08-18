import { Controller, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { MancheService } from './manche.service';
import { AuthGuard } from '@nestjs/passport';
import { EnsureJoueurGuard } from 'src/auth/ensure-joueur.guard';

@UseGuards(AuthGuard('jwt'), EnsureJoueurGuard)
@Controller()
export class MancheController {
    constructor(private readonly service: MancheService) { }

    //Relancer explicitement une donne par mancheId
    @Post('manche/:mancheId/relancer')
    relancerByManche(@Param('mancheId', ParseIntPipe) mancheId: number,@Req() req: any) {
        return this.service.relancerMancheByMancheId(mancheId);
    }

    //Relancer explicitement une donne par partieId (relancer la manche active)
    @Post('partie/:partieId/relancer')
    relancerByPartie(@Param('partieId', ParseIntPipe) partieId: number,@Req() req: any) {
        return this.service.relancerMancheByPartieId(partieId);
    }
}
