import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SupportConversation } from '../../database/entities/support-conversation.entity';
import { SupportMessage } from '../../database/entities/support-message.entity';
import { User } from '../../database/entities/user.entity';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportGateway } from './support.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportConversation, SupportMessage, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('jwt.accessSecret') }),
    }),
  ],
  controllers: [SupportController],
  providers: [SupportService, SupportGateway],
  exports: [SupportService],
})
export class SupportModule {}
