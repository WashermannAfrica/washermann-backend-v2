import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rep } from '../../database/entities/rep.entity';
import { RepPseudoWallet } from '../../database/entities/rep-pseudo-wallet.entity';
import { RepPseudoLedgerEntry } from '../../database/entities/rep-pseudo-ledger-entry.entity';
import { User } from '../../database/entities/user.entity';
import { RepsController } from './reps.controller';
import { RepsService } from './reps.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rep, RepPseudoWallet, RepPseudoLedgerEntry, User]),
  ],
  controllers: [RepsController],
  providers: [RepsService],
  exports: [RepsService],
})
export class RepsModule {}
