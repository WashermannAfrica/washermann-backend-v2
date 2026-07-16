import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogPost } from '../../database/entities/blog-post.entity';
import { User } from '../../database/entities/user.entity';
import { BlogAdminController, BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([BlogPost, User]), NotificationsModule],
  controllers: [BlogController, BlogAdminController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
