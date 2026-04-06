import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity('addresses')
export class Address extends BaseEntity {
  @ApiProperty({ example: 'some-uuid' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ example: '12 Lekki Phase 1, Lagos' })
  @Column({ name: 'address_text', type: 'varchar', length: 500 })
  addressText: string;

  @ApiProperty({ example: 6.4281 })
  @Column({ type: 'float', nullable: true })
  latitude: number;

  @ApiProperty({ example: 3.4219 })
  @Column({ type: 'float', nullable: true })
  longitude: number;

  @ApiProperty({ example: false })
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
