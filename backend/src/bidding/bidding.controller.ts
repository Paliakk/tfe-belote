import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { EnsureJoueurGuard } from 'src/auth/ensure-joueur.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CurrentJoueurId } from 'src/auth/current-user.decorator';

@UseGuards(JwtAuthGuard, EnsureJoueurGuard)
@Controller('bidding')
export class BiddingController {
  constructor(private readonly service: BiddingService) {}

  @Get('state/:mancheId')
  state(@Param('mancheId', ParseIntPipe) mancheId: number) {
    return this.service.getState(mancheId);
  }

  @Post(':mancheId/bid')
  placeBid(
    @Param('mancheId', ParseIntPipe) mancheId: number,
    @CurrentJoueurId() joueurId: number, 
    @Body() dto: CreateBidDto,
  ) {
    return this.service.placeBid(mancheId,joueurId, dto);
  }
  @Get('active/:partieId')
getActive(@Param('partieId', ParseIntPipe) partieId: number) {
  return this.service.getActiveMancheIdByPartie(partieId);
}
}
