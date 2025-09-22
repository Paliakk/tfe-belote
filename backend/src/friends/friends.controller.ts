import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RealtimeService } from 'src/realtime/realtime.service';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService, private readonly rt: RealtimeService) { }

  @Get()
  list(@CurrentUser() user: any) {
    return this.friends.listForUser(user);
  }
  @Get('requests')
  async listRequests(
    @CurrentUser() user: any,
    @Query('direction') direction: 'incoming' | 'outgoing' = 'incoming',
  ) {
    return direction === 'outgoing'
      ? this.friends.listOutgoingRequestsForUser(user)
      : this.friends.listIncomingRequestsForUser(user);
  }

  @Post('requests')
  sendRequest(@Req() req: any, @Body('toUsername') toUsername: string) {
    return this.friends.sendRequest(req.user.sub, toUsername);
  }

  @Post('requests/:id/accept')
  accept(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.friends.acceptRequest(id, req.user.sub);
  }
  @Post('requests/:id/decline')
  decline(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.friends.declineRequest(id, req.user.sub);
  }
  @Delete(':friendId')
  async removeFriend(
    @Param('friendId', ParseIntPipe) friendId: number,
    @Req() req: any,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('unauthenticated');

    const removed = await this.friends.unfriend(userId, friendId);

    // push temps réel aux deux parties
    this.rt.emitToJoueur(userId, 'friend:removed', { userId, friendId });
    this.rt.emitToJoueur(friendId, 'friend:removed', { userId: friendId, friendId: userId });

    return { ok: true, removed };
  }
}
