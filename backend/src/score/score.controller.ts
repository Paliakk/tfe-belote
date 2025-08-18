import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common'
import { ScoreService } from './score.service'

@Controller('score')
export class ScoreController {
    constructor(private readonly score: ScoreService) { }

    // Endpoint de TEST pour Postman : calcule et renvoie le résultat UC09
    @Post('test/:mancheId')
    async testCalculate(@Param('mancheId', ParseIntPipe) mancheId: number) {
        return this.score.calculateScoresForManche(mancheId)
    }
}