import {
  Controller,
  Post,
  Param,
  ParseUUIDPipe,
  Request,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { VendorsService } from '../vendors/vendors.service';
import { RepsService } from '../reps/reps.service';
import { VendorDocumentType } from '../../database/entities/vendor-document.entity';
import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UploadDocumentDto {
  @ApiProperty({
    enum: ['nin', 'cac', 'address_proof', 'photo', 'personal_photo', 'shop_photo', 'other'],
    description: 'Type of KYC document being uploaded',
  })
  @IsString()
  @IsIn(['nin', 'cac', 'address_proof', 'photo', 'personal_photo', 'shop_photo', 'other'])
  documentType: VendorDocumentType;
}

// Multer config — keep files in memory (we stream directly to Cloudinary)
const multerMemory = { storage: memoryStorage() };

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly vendorsService: VendorsService,
    private readonly repsService: RepsService,
  ) {}

  // ─── User: upload own avatar ──────────────────────────────────────────────────

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', multerMemory))
  @ApiOperation({
    summary: 'Upload profile picture (any authenticated user)',
    description: 'Accepts JPEG, PNG, or WebP. Max 5 MB. Resized to 400×400 square on Cloudinary. Updates `avatarUrl` on the user record.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Image file (jpg/png/webp, max 5 MB)' },
      },
      required: ['file'],
    },
  })
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { sub: string } },
  ) {
    return this.uploadService.uploadUserAvatar(req.user.sub, file);
  }

  // ─── Vendor: upload business logo ─────────────────────────────────────────────

  @Post('vendor/logo')
  @Roles(Role.VENDOR)
  @UseInterceptors(FileInterceptor('file', multerMemory))
  @ApiOperation({
    summary: 'Upload vendor business logo (vendor)',
    description: 'Accepts JPEG, PNG, or WebP. Max 5 MB. Resized to fit within 800×600. Updates `logoUrl` on the vendor record.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Logo image (jpg/png/webp, max 5 MB)' },
      },
      required: ['file'],
    },
  })
  async uploadVendorLogo(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { sub: string } },
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.uploadService.uploadVendorLogo(vendor.id, file);
  }

  // ─── Vendor: upload KYC document ──────────────────────────────────────────────

  @Post('vendor/document')
  @Roles(Role.VENDOR)
  @UseInterceptors(FileInterceptor('file', multerMemory))
  @ApiOperation({
    summary: 'Upload a KYC / verification document (vendor)',
    description: 'Accepts JPEG, PNG, WebP, or PDF. Max 10 MB. Append-only — previous documents are preserved. `documentType`: nin | cac | address_proof | photo | other.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file:         { type: 'string', format: 'binary', description: 'Document file (image or PDF, max 10 MB)' },
        documentType: { type: 'string', enum: ['nin', 'cac', 'address_proof', 'photo', 'personal_photo', 'shop_photo', 'other'] },
      },
      required: ['file', 'documentType'],
    },
  })
  async uploadVendorDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Request() req: { user: { sub: string } },
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.uploadService.uploadVendorDocument(vendor.id, file, dto.documentType);
  }

  // ─── Admin: upload rep contract ───────────────────────────────────────────────

  @Post('rep/:repId/contract')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', multerMemory))
  @ApiOperation({
    summary: 'Upload signed contract for a rep (admin)',
    description: 'Accepts PDF or image. Max 10 MB. Updates `contractUrl` on the rep record.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Contract file (PDF or image, max 10 MB)' },
      },
      required: ['file'],
    },
  })
  uploadRepContract(
    @UploadedFile() file: Express.Multer.File,
    @Param('repId', ParseUUIDPipe) repId: string,
  ) {
    return this.uploadService.uploadRepContract(repId, file);
  }
}
