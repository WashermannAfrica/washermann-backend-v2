import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GiftCard } from './gift-card.entity';

@Entity('gift_card_redemptions')
export class GiftCardRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'gift_card_id' })
  giftCardId: string;

  @ManyToOne(() => GiftCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gift_card_id' })
  giftCard: GiftCard;

  @Column({ name: 'redeemed_by', comment: 'userId of the redeemer' })
  redeemedBy: string;

  @Column({
    name: 'wp_credited', type: 'bigint',
    transformer: { to: (v) => v, from: (v) => parseInt(v, 10) },
  })
  wpCredited: number;

  @CreateDateColumn({ name: 'redeemed_at' })
  redeemedAt: Date;
}
