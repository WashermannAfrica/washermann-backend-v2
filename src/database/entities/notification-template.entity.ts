import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'whatsapp';

/**
 * Email styling blob stored as JSONB.
 * All fields are optional — the renderer falls back to platform defaults.
 */
export interface EmailStyle {
  primaryColor:   string;   // Header background, e.g. "#1a1a2e"
  accentColor:    string;   // Button and highlight colour, e.g. "#4fc3f7"
  bodyBgColor:    string;   // Page background, e.g. "#f5f5f5"
  cardBgColor:    string;   // Card background, e.g. "#ffffff"
  textColor:      string;   // Body text, e.g. "#444444"
  logoUrl:        string | null;
  logoAlt:        string;
  footerText:     string;
  fontFamily:     string;
}

/**
 * One row per (event key + channel) pair.
 * Template bodies use Handlebars syntax: {{variableName}}.
 *
 * Example keys:
 *   order.placed.customer    — fires when customer places an order
 *   assignment.broadcast.rep — fires when a rep is notified of a new job
 *   payout.approved.vendor   — fires when admin approves a payout
 */
@Entity('notification_templates')
export class NotificationTemplate {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'order.placed.customer', description: 'Unique event key — format: <domain>.<event>.<audience>' })
  @Column({ type: 'varchar', length: 100 })
  key: string;

  @ApiProperty({ enum: ['email', 'sms', 'push', 'in_app', 'whatsapp'] })
  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannel;

  @ApiProperty({ example: 'Order Placed — Customer Email' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ nullable: true, description: 'Email subject line (supports {{variables}})' })
  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @ApiProperty({ description: 'Plain-text body — used for SMS, push, in-app, WhatsApp (supports {{variables}})' })
  @Column({ type: 'text' })
  body: string;

  @ApiProperty({ nullable: true, description: 'Full HTML email body (Handlebars template). If null, body is wrapped in the default layout.' })
  @Column({ name: 'html_body', type: 'text', nullable: true })
  htmlBody: string | null;

  @ApiProperty({ nullable: true, description: 'Email styling configuration (JSONB)' })
  @Column({ name: 'email_style', type: 'jsonb', nullable: true })
  emailStyle: EmailStyle | null;

  @ApiProperty({ type: [String], description: 'Available Handlebars variables for this template (informational)' })
  @Column({ type: 'jsonb', default: '[]' })
  variables: string[];

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
