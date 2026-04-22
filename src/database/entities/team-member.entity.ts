import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { TeamMemberRole } from '../../common/enums/team-member-role.enum';
import { Team } from './team.entity';
import { User } from './user.entity';

@Entity('team_members')
@Unique(['teamId', 'userId'])
export class TeamMember extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'team_id', type: 'uuid' })
  teamId: string;

  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ enum: TeamMemberRole, default: TeamMemberRole.MEMBER })
  @Column({
    name: 'role',
    type: 'varchar',
    length: 20,
    default: TeamMemberRole.MEMBER,
  })
  role: TeamMemberRole;

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty()
  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'NOW()' })
  joinedAt: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne(() => Team, (t) => t.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: Team;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
