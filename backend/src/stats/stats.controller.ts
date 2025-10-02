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
  @Get(':id/recent')
  async getRecent(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const n = Math.max(1, Math.min(10, Number(limit ?? 5)));
    return this.stats.getRecentResults(Number(id), n);
  }
}
