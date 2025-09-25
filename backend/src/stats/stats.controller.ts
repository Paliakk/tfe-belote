import { Controller, Get, Param, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('players')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get(':id/stats')
  async getStats(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const win = {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
    return this.stats.getPlayerCoreStats(Number(id), win);
  }
}
