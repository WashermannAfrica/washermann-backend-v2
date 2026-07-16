import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { UserStatus } from '../../../common/enums/user-status.enum';

export interface JwtPayload {
  sub: string;   // user id
  email?: string;
  phone?: string;
  roles: string[];
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is suspended');
    }

    if (user.status === UserStatus.DEACTIVATED) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Expose `sub` alongside the entity: controllers read either `req.user.id`
    // (via @CurrentUser('id')) or `req.user.sub` (via @Request()). Without this,
    // `req.user.sub` is undefined and every "me"/self lookup silently resolves
    // to the wrong record (a findOne with `where: { id: undefined }`).
    return Object.assign(user, { sub: user.id });
  }
}
