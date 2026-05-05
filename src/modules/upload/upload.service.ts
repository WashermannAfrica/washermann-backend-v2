import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { User } from '../../database/entities/user.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { VendorDocument, VendorDocumentType } from '../../database/entities/vendor-document.entity';

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private configService: ConfigService,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,

    @InjectRepository(Rep)
    private repRepository: Repository<Rep>,

    @InjectRepository(VendorDocument)
    private vendorDocumentRepository: Repository<VendorDocument>,
  ) {}

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.configService.get<string>('cloudinary.cloudName'),
      api_key:    this.configService.get<string>('cloudinary.apiKey'),
      api_secret: this.configService.get<string>('cloudinary.apiSecret'),
      secure:     true,
    });
    this.logger.log('Cloudinary configured');
  }

  // ─── Core upload helper ───────────────────────────────────────────────────────

  /**
   * Upload a buffer to Cloudinary and return the secure URL.
   * `folder` is appended to the base folder from config (e.g. washermann/avatars).
   */
  private async uploadBuffer(
    buffer: Buffer,
    folder: string,
    publicId: string,
    options: {
      resourceType?: 'image' | 'raw' | 'auto';
      transformation?: object[];
      allowedFormats?: string[];
    } = {},
  ): Promise<UploadApiResponse> {
    const baseFolder = this.configService.get<string>('cloudinary.folder') ?? 'washermann';

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder:        `${baseFolder}/${folder}`,
          public_id:     publicId,
          overwrite:     true,
          resource_type: options.resourceType ?? 'image',
          transformation: options.transformation,
          allowed_formats: options.allowedFormats,
        },
        (error, result) => {
          if (error) return reject(new BadRequestException(`Upload failed: ${error.message}`));
          resolve(result!);
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  // ─── User avatar ──────────────────────────────────────────────────────────────

  /**
   * Upload a profile picture for any user (customer, rep, admin, staff).
   * Replaces the existing avatar if one exists.
   * Returns the updated user.
   */
  async uploadUserAvatar(userId: string, file: Express.Multer.File) {
    this.validateImage(file);

    const result = await this.uploadBuffer(
      file.buffer,
      'avatars',
      `user_${userId}`,
      {
        // Resize to a square 400×400 — good for profile pictures on any device
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      },
    );

    await this.userRepository.update(userId, { avatarUrl: result.secure_url });
    const user = await this.userRepository.findOne({ where: { id: userId } });

    this.logger.log(`Avatar uploaded for user ${userId}: ${result.secure_url}`);
    return { avatarUrl: result.secure_url, user };
  }

  // ─── Vendor logo ──────────────────────────────────────────────────────────────

  /**
   * Upload a business logo / shop photo for a vendor.
   * Replaces the existing logo if one exists.
   * Returns the updated vendor.
   */
  async uploadVendorLogo(vendorId: string, file: Express.Multer.File) {
    this.validateImage(file);

    const result = await this.uploadBuffer(
      file.buffer,
      'vendor-logos',
      `vendor_${vendorId}`,
      {
        // Keep aspect ratio, fit within 800×600
        transformation: [{ width: 800, height: 600, crop: 'limit' }],
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      },
    );

    await this.vendorRepository.update(vendorId, { logoUrl: result.secure_url });
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });

    this.logger.log(`Logo uploaded for vendor ${vendorId}: ${result.secure_url}`);
    return { logoUrl: result.secure_url, vendor };
  }

  // ─── Vendor KYC document ──────────────────────────────────────────────────────

  /**
   * Upload a KYC / verification document for a vendor.
   * Creates a new VendorDocument record (append-only — previous docs are kept).
   * Accepts images and PDFs.
   */
  async uploadVendorDocument(
    vendorId: string,
    file: Express.Multer.File,
    documentType: VendorDocumentType,
  ) {
    this.validateDocument(file);

    const isPdf = file.mimetype === 'application/pdf';
    const result = await this.uploadBuffer(
      file.buffer,
      'vendor-docs',
      `vendor_${vendorId}_${documentType}_${Date.now()}`,
      {
        resourceType:    isPdf ? 'raw' : 'image',
        allowedFormats:  isPdf ? ['pdf'] : ['jpg', 'jpeg', 'png', 'webp'],
      },
    );

    const doc = this.vendorDocumentRepository.create({
      vendorId,
      documentType,
      fileUrl:      result.secure_url,
      originalName: file.originalname,
    });
    await this.vendorDocumentRepository.save(doc);

    this.logger.log(`Document uploaded for vendor ${vendorId} (${documentType}): ${result.secure_url}`);
    return doc;
  }

  // ─── Rep contract ─────────────────────────────────────────────────────────────

  /**
   * Upload a signed contract document for a rep (admin only).
   * Updates Rep.contractUrl. Accepts PDF and images.
   */
  async uploadRepContract(repId: string, file: Express.Multer.File) {
    this.validateDocument(file);

    const isPdf = file.mimetype === 'application/pdf';
    const result = await this.uploadBuffer(
      file.buffer,
      'rep-contracts',
      `rep_${repId}_contract`,
      {
        resourceType:   isPdf ? 'raw' : 'image',
        allowedFormats: isPdf ? ['pdf'] : ['jpg', 'jpeg', 'png', 'webp'],
      },
    );

    await this.repRepository.update(repId, { contractUrl: result.secure_url });
    const rep = await this.repRepository.findOne({ where: { id: repId } });

    this.logger.log(`Contract uploaded for rep ${repId}: ${result.secure_url}`);
    return { contractUrl: result.secure_url, rep };
  }

  // ─── Validation helpers ───────────────────────────────────────────────────────

  private validateImage(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type. Allowed: ${allowed.join(', ')}`);
    }

    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('Image must be smaller than 5 MB');
    }
  }

  private validateDocument(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type. Allowed: images and PDF`);
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('File must be smaller than 10 MB');
    }
  }
}
