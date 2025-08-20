import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

@Global()   //Comme ça il ne faut pas importer le module à chaque fois
@Module({
  providers: [RealtimeService]
})
export class RealtimeModule {}
