import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Bundle } from '../../database/entities/bundle.entity';
import { BundleLine } from '../../database/entities/bundle-line.entity';
import { ItemPricingService } from '../pricing/item-pricing.service';
import { slugify } from '../catalogue/catalogue-seed';
import { CreateBundleDto, UpdateBundleDto, BundleLineDto } from './dto/bundle.dto';

@Injectable()
export class BundlesService {
  constructor(
    @InjectRepository(Bundle) private bundles: Repository<Bundle>,
    @InjectRepository(BundleLine) private lines: Repository<BundleLine>,
    private itemPricing: ItemPricingService,
    private dataSource: DataSource,
  ) {}

  async list(includeInactive = false) {
    const bundles = await this.bundles.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return Promise.all(bundles.map(async (b) => ({ ...b, lines: await this.linesFor(b.id) })));
  }

  async get(id: string) {
    const bundle = await this.bundles.findOne({ where: { id } });
    if (!bundle) throw new NotFoundException('Bundle not found');
    return { ...bundle, lines: await this.linesFor(id) };
  }

  private linesFor(bundleId: string) {
    return this.lines.find({ where: { bundleId }, order: { sortOrder: 'ASC' } });
  }

  private validateLines(lines: BundleLineDto[]) {
    for (const l of lines) {
      if (l.lineType === 'item' && !l.itemId) throw new BadRequestException('item line requires itemId');
      if (l.lineType === 'category' && !l.categoryId) throw new BadRequestException('category line requires categoryId');
    }
  }

  async create(dto: CreateBundleDto, adminId: string) {
    this.validateLines(dto.lines);
    const slug = await this.uniqueSlug(slugify(dto.name));

    const bundle = await this.dataSource.transaction(async (m) => {
      const b = await m.save(m.create(Bundle, {
        name: dto.name.trim(), slug, description: dto.description ?? null, imageUrl: dto.imageUrl ?? null,
        isActive: true,
        isPromo: dto.isPromo ?? false, promoType: dto.promoType ?? null, promoValue: dto.promoValue ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        audience: dto.audience ?? null, sortOrder: dto.sortOrder ?? 100,
        createdBy: adminId, updatedBy: adminId,
      }));
      await this.saveLines(m, b.id, dto.lines);
      return b;
    });

    await this.itemPricing.recomputeBundles();   // price the new bundle immediately
    return this.get(bundle.id);
  }

  async update(id: string, dto: UpdateBundleDto, adminId: string) {
    const bundle = await this.bundles.findOne({ where: { id } });
    if (!bundle) throw new NotFoundException('Bundle not found');
    if (dto.lines) this.validateLines(dto.lines);

    await this.dataSource.transaction(async (m) => {
      if (dto.name != null) bundle.name = dto.name.trim();
      if (dto.description !== undefined) bundle.description = dto.description ?? null;
      if (dto.imageUrl !== undefined) bundle.imageUrl = dto.imageUrl ?? null;
      if (dto.isActive != null) bundle.isActive = dto.isActive;
      if (dto.isPromo != null) bundle.isPromo = dto.isPromo;
      if (dto.promoType !== undefined) bundle.promoType = dto.promoType ?? null;
      if (dto.promoValue !== undefined) bundle.promoValue = dto.promoValue ?? null;
      if (dto.expiresAt !== undefined) bundle.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
      if (dto.audience !== undefined) bundle.audience = dto.audience ?? null;
      if (dto.sortOrder != null) bundle.sortOrder = dto.sortOrder;
      bundle.updatedBy = adminId;
      await m.save(bundle);

      if (dto.lines) {
        await m.delete(BundleLine, { bundleId: id });
        await this.saveLines(m, id, dto.lines);
      }
    });

    await this.itemPricing.recomputeBundles();   // promo / lines change re-prices
    return this.get(id);
  }

  private async saveLines(m: any, bundleId: string, lines: BundleLineDto[]) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await m.save(m.create(BundleLine, {
        bundleId,
        lineType: l.lineType,
        itemId: l.lineType === 'item' ? l.itemId ?? null : null,
        categoryId: l.lineType === 'category' ? l.categoryId ?? null : null,
        quantity: l.quantity,
        sortOrder: (i + 1) * 10,
      }));
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base, n = 1;
    while (await this.bundles.findOne({ where: { slug } })) { n++; slug = `${base}-${n}`; }
    return slug;
  }
}
