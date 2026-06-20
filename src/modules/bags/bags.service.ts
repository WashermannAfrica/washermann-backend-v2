import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bag } from '../../database/entities/bag.entity';
import { ItemPricingService } from '../pricing/item-pricing.service';
import { slugify } from '../catalogue/catalogue-seed';
import { CreateBagDto, UpdateBagDto } from './dto/bag.dto';

@Injectable()
export class BagsService {
  constructor(
    @InjectRepository(Bag) private bags: Repository<Bag>,
    private itemPricing: ItemPricingService,
  ) {}

  list(includeInactive = false) {
    return this.bags.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async get(id: string) {
    const bag = await this.bags.findOne({ where: { id } });
    if (!bag) throw new NotFoundException('Bag not found');
    return bag;
  }

  async create(dto: CreateBagDto, adminId: string) {
    const slug = await this.uniqueSlug(slugify(dto.name));
    const bag = await this.bags.save(this.bags.create({
      name: dto.name.trim(), slug, description: dto.description ?? null,
      allowedItemCount: dto.allowedItemCount,
      eligibleItemIds: dto.eligibleItemIds ?? [],
      eligibleCategoryIds: dto.eligibleCategoryIds ?? [],
      sortOrder: dto.sortOrder ?? 100, isActive: true,
      createdBy: adminId, updatedBy: adminId,
    }));
    await this.itemPricing.recomputeBags();   // price the new bag immediately
    return this.get(bag.id);
  }

  async update(id: string, dto: UpdateBagDto, adminId: string) {
    const bag = await this.get(id);
    if (dto.name != null) bag.name = dto.name.trim();
    if (dto.description !== undefined) bag.description = dto.description ?? null;
    if (dto.allowedItemCount != null) bag.allowedItemCount = dto.allowedItemCount;
    if (dto.eligibleItemIds != null) bag.eligibleItemIds = dto.eligibleItemIds;
    if (dto.eligibleCategoryIds != null) bag.eligibleCategoryIds = dto.eligibleCategoryIds;
    if (dto.sortOrder != null) bag.sortOrder = dto.sortOrder;
    if (dto.isActive != null) bag.isActive = dto.isActive;
    bag.updatedBy = adminId;
    await this.bags.save(bag);
    await this.itemPricing.recomputeBags();   // capacity change re-prices the bag
    return this.get(id);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base, n = 1;
    while (await this.bags.findOne({ where: { slug } })) { n++; slug = `${base}-${n}`; }
    return slug;
  }
}
