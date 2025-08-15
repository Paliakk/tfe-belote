import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PlayQueriesService } from './play/play.queries';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService,private readonly playQueries:PlayQueriesService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('cards')
  async listCards(){
    return this.playQueries.listCardsHuman()
  }
}
