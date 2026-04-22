import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { TeamMember } from './team-member.entity';

@Entity('teams')
export class Team extends BaseEntity {
  // ─── Identity ──────────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'Design Team' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 'Our internal design squad', nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ─── Ownership ────────────────────────────────────────────────────────────────

  /**
   * Denormalised for fast queries. The authoritative owner is the
   * TeamMember row with role = OWNER. This field stays in sync with it.
   */
  @ApiProperty()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  // ─── Profile ──────────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'Technology', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  industry: string | null;

  @ApiProperty({ example: '12 Business Way, Lagos', nullable: true })
  @Column({ type: 'text', nullable: true })
  address: string | null;

  @ApiProperty({ example: 'https://team.com', nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @ApiProperty({ example: 12, nullable: true })
  @Column({ name: 'member_count', type: 'int', nullable: true })
  memberCount: number | null;

  // ─── Status ───────────────────────────────────────────────────────────────────

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => TeamMember, (tm) => tm.team, { cascade: true })
  members: TeamMember[];
}
