import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';

@Global() //Comme ça il ne faut pas importer le module à chaque fois
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
  controllers: [RealtimeController],
})
export class RealtimeModule {}
