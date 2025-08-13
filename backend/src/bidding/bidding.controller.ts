import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { CreateBidDto } from './dto/create-bid.dto';

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
    @Body() dto: CreateBidDto,
  ) {
    return this.service.placeBid(mancheId, dto);
  }
  @Get('active/:partieId')
getActive(@Param('partieId', ParseIntPipe) partieId: number) {
  return this.service.getActiveMancheIdByPartie(partieId);
}
}
