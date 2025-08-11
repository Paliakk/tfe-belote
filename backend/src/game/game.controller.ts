import { Controller, Body, Param, ParseIntPipe, Post } from '@nestjs/common';
import { GameService } from './game.service';
import { QuitGameDto } from './dto/quit-game.dto';

@Controller('game')
export class GameController {
    constructor(private readonly gameService: GameService) { }
    @Post(':id/quit')
    quitGame(
        @Param('id', ParseIntPipe) partieId: number,
        @Body() dto: QuitGameDto
    ) {
        return this.gameService.quitGame(partieId, dto.joueurId)
    }
}
