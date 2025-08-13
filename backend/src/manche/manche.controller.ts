import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { MancheService } from './manche.service';

@Controller()
export class MancheController {
    constructor(private readonly service: MancheService) { }

    //Relancer explicitement une donne par mancheId
    @Post('manche/:mancheId/relancer')
    relancerByManche(@Param('mancheId', ParseIntPipe) mancheId: number) {
        return this.service.relancerMancheByMancheId(mancheId);
    }

    //Relancer explicitement une donne par partieId (relancer la manche active)
    @Post('partie/:partieId/relancer')
    relancerByPartie(@Param('partieId', ParseIntPipe) partieId: number) {
        return this.service.relancerMancheByPartieId(partieId);
    }
}
