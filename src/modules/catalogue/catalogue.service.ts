import {
  Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { CatalogueCategory } from '../../database/entities/catalogue-category.entity';
import { CatalogueSubCategory } from '../../database/entities/catalogue-subcategory.entity';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { VendorItemSuggestion } from '../../database/entities/vendor-item-suggestion.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { PricingPackage } from '../../database/entities/pricing-package.entity';
import { CATALOGUE_SEED, slugify } from './catalogue-seed';
import {
  CreateCategoryDto, UpdateCategoryDto, CreateSubCategoryDto, UpdateSubCategoryDto,
  CreateItemDto, UpdateItemDto, CreateSuggestionDto, ApproveSuggestionDto, RejectSuggestionDto,
} from './dto/catalogue.dto';

@Injectable()
export class CatalogueService implements OnModuleInit {
  private readonly logger = new Logger(CatalogueService.name);

  constructor(
    @InjectRepository(CatalogueCategory) private categories: Repository<CatalogueCategory>,
    @InjectRepository(CatalogueSubCategory) private subCategories: Repository<CatalogueSubCategory>,
    @InjectRepository(CatalogueItem) private items: Repository<CatalogueItem>,
    @InjectRepository(VendorItemSuggestion) private suggestions: Repository<VendorItemSuggestion>,
    @InjectRepository(Vendor) private vendors: Repository<Vendor>,
    @InjectRepository(VendorPricing) private vendorPricing: Repository<VendorPricing>,
    @InjectRepository(PricingPackage) private pricingPackages: Repository<PricingPackage>,
    private dataSource: DataSource,
  ) {}

  // ─── Seeding ──────────────────────────────────────────────────────────────────
  async onModuleInit() {
    // Never crash boot on a fresh DB where catalogue tables aren't migrated yet.
    try {
      await this.seedDefaults();
    } catch (err) {
      this.logger.warn(`Skipped catalogue seeding (${(err as Error).message})`);
    }
  }

  async seedDefaults(): Promise<void> {
    let cats = 0, its = 0;
    for (let c = 0; c < CATALOGUE_SEED.length; c++) {
      const seed = CATALOGUE_SEED[c];
      const catSlug = slugify(seed.name);
      let category = await this.categories.findOne({ where: { slug: catSlug } });
      if (!category) {
        category = await this.categories.save(this.categories.create({
          name: seed.name, slug: catSlug, source: 'seeded', sortOrder: (c + 1) * 10, isActive: true,
        }));
        cats++;
      }
      for (let i = 0; i < seed.items.length; i++) {
        const itemName = seed.items[i];
        const itemSlug = `${catSlug}-${slugify(itemName)}`;
        const exists = await this.items.findOne({ where: { slug: itemSlug } });
        if (!exists) {
          await this.items.save(this.items.create({
            categoryId: category.id, subCategoryId: null, name: itemName, slug: itemSlug,
            isEveryday: seed.everyday, isActive: true, isAvailable: false,
            priceNgn: null, priceWp: null, source: 'seeded', sortOrder: (i + 1) * 10,
          }));
          its++;
        }
      }
    }
    if (cats || its) this.logger.log(`Catalogue seeded: ${cats} categories, ${its} items`);
  }

  // ─── Slug helper ──────────────────────────────────────────────────────────────
  private async uniqueSlug(repo: Repository<any>, base: string): Promise<string> {
    let slug = base, n = 1;
    while (await repo.findOne({ where: { slug } })) { n++; slug = `${base}-${n}`; }
    return slug;
  }

  // ─── Categories ───────────────────────────────────────────────────────────────
  listCategories(includeInactive = false) {
    return this.categories.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(dto: CreateCategoryDto, adminId: string) {
    const slug = await this.uniqueSlug(this.categories, slugify(dto.name));
    return this.categories.save(this.categories.create({
      name: dto.name.trim(), slug, description: dto.description ?? null,
      svgIcon: dto.svgIcon ?? null, sortOrder: dto.sortOrder ?? 100,
      source: 'admin', isActive: true, createdBy: adminId, updatedBy: adminId,
    }));
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, adminId: string) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (dto.name != null) category.name = dto.name.trim();
    if (dto.description !== undefined) category.description = dto.description ?? null;
    if (dto.svgIcon !== undefined) category.svgIcon = dto.svgIcon ?? null;
    if (dto.sortOrder != null) category.sortOrder = dto.sortOrder;
    if (dto.isActive != null) category.isActive = dto.isActive;
    category.updatedBy = adminId;
    return this.categories.save(category);
  }

  // ─── Sub-categories ───────────────────────────────────────────────────────────
  listSubCategories(categoryId?: string, includeInactive = false) {
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (!includeInactive) where.isActive = true;
    return this.subCategories.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async createSubCategory(dto: CreateSubCategoryDto, adminId: string) {
    const category = await this.categories.findOne({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Parent category not found');
    const slug = await this.uniqueSlug(this.subCategories, `${category.slug}-${slugify(dto.name)}`);
    return this.subCategories.save(this.subCategories.create({
      categoryId: dto.categoryId, name: dto.name.trim(), slug,
      sortOrder: dto.sortOrder ?? 100, source: 'admin', isActive: true,
      createdBy: adminId, updatedBy: adminId,
    }));
  }

  async updateSubCategory(id: string, dto: UpdateSubCategoryDto, adminId: string) {
    const sub = await this.subCategories.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Sub-category not found');
    if (dto.name != null) sub.name = dto.name.trim();
    if (dto.sortOrder != null) sub.sortOrder = dto.sortOrder;
    if (dto.isActive != null) sub.isActive = dto.isActive;
    sub.updatedBy = adminId;
    return this.subCategories.save(sub);
  }

  // ─── Items ────────────────────────────────────────────────────────────────────
  listItems(filter: { categoryId?: string; everyday?: boolean; includeInactive?: boolean } = {}) {
    const where: any = {};
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.everyday != null) where.isEveryday = filter.everyday;
    if (!filter.includeInactive) where.isActive = true;
    return this.items.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async getItem(id: string) {
    const item = await this.items.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  /** Fetch several items by id at once (used to validate a rep's garment log). */
  async getItemsByIds(ids: string[]): Promise<CatalogueItem[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    return this.items.find({ where: { id: In(unique) } });
  }

  async createItem(dto: CreateItemDto, adminId: string) {
    await this.assertCategory(dto.categoryId, dto.subCategoryId);
    const slug = await this.uniqueSlug(this.items, slugify(dto.name));
    return this.items.save(this.items.create({
      categoryId: dto.categoryId, subCategoryId: dto.subCategoryId ?? null,
      name: dto.name.trim(), slug, svgIcon: dto.svgIcon ?? null,
      isEveryday: dto.isEveryday ?? false, isActive: true, isAvailable: false,
      priceNgn: null, priceWp: null, sortOrder: dto.sortOrder ?? 100,
      source: 'admin', createdBy: adminId, updatedBy: adminId,
    }));
  }

  async updateItem(id: string, dto: UpdateItemDto, adminId: string) {
    const item = await this.getItem(id);
    if (dto.categoryId || dto.subCategoryId !== undefined) {
      await this.assertCategory(dto.categoryId ?? item.categoryId, dto.subCategoryId ?? undefined);
    }
    if (dto.categoryId != null) item.categoryId = dto.categoryId;
    if (dto.subCategoryId !== undefined) item.subCategoryId = dto.subCategoryId ?? null;
    if (dto.name != null) item.name = dto.name.trim();
    if (dto.svgIcon !== undefined) item.svgIcon = dto.svgIcon ?? null;
    if (dto.isEveryday != null) item.isEveryday = dto.isEveryday;
    if (dto.isActive != null) item.isActive = dto.isActive;
    if (dto.sortOrder != null) item.sortOrder = dto.sortOrder;
    item.updatedBy = adminId;
    return this.items.save(item);
  }

  private async assertCategory(categoryId: string, subCategoryId?: string) {
    const category = await this.categories.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    if (subCategoryId) {
      const sub = await this.subCategories.findOne({ where: { id: subCategoryId } });
      if (!sub) throw new NotFoundException('Sub-category not found');
      if (sub.categoryId !== categoryId) throw new BadRequestException('Sub-category does not belong to that category');
    }
  }

  // ─── Public read (customer / vendor browsing) ──────────────────────────────────
  async getPublicCatalogue() {
    const categories = await this.categories.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    const items = await this.items.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
    return categories.map((c) => ({
      ...c,
      items: items.filter((i) => i.categoryId === c.id),
    }));
  }

  // ─── Suggestions ────────────────────────────────────────────────────────────--
  async createSuggestion(userId: string, dto: CreateSuggestionDto) {
    const vendor = await this.vendors.findOne({ where: { userId } });
    const normalized = dto.rawText.trim().toLowerCase();

    // Dedup: if this vendor already has a pending suggestion for the same text, reuse it.
    const existing = await this.suggestions.findOne({
      where: { vendorId: vendor?.id ?? null, normalizedText: normalized, status: 'pending' },
    });
    if (existing) return existing;

    return this.suggestions.save(this.suggestions.create({
      source: 'vendor', vendorId: vendor?.id ?? null,
      rawText: dto.rawText.trim(), normalizedText: normalized,
      proposedPriceNaira: dto.proposedPriceNaira ?? null,
      status: 'pending',
    }));
  }

  listSuggestions(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.suggestions.find({ where, order: { createdAt: 'DESC' } });
  }

  async approveSuggestion(id: string, adminId: string, dto: ApproveSuggestionDto) {
    const sug = await this.suggestions.findOne({ where: { id } });
    if (!sug) throw new NotFoundException('Suggestion not found');
    if (sug.status !== 'pending') throw new BadRequestException(`Suggestion already ${sug.status}`);

    let item: CatalogueItem;
    if (dto.mergeIntoItemId) {
      item = await this.getItem(dto.mergeIntoItemId);
      sug.status = 'merged';
    } else {
      await this.assertCategory(dto.categoryId, dto.subCategoryId);
      const name = (dto.name ?? sug.rawText).trim();
      const slug = await this.uniqueSlug(this.items, slugify(name));
      item = await this.items.save(this.items.create({
        categoryId: dto.categoryId, subCategoryId: dto.subCategoryId ?? null,
        name, slug, isEveryday: dto.isEveryday ?? false, isActive: true, isAvailable: false,
        priceNgn: null, priceWp: null, source: 'promoted_from_suggestion',
        originSuggestionId: sug.id, sortOrder: 100, createdBy: adminId, updatedBy: adminId,
      }));
      sug.status = 'approved';
    }

    sug.resolvedItemId = item.id;
    sug.reviewerId = adminId;
    sug.reviewedAt = new Date();
    await this.suggestions.save(sug);
    // NOTE: relinking the vendor's pending price line happens once vendor pricing
    // references itemId (Phase 2/3).
    return { suggestion: sug, item };
  }

  async rejectSuggestion(id: string, adminId: string, dto: RejectSuggestionDto) {
    const sug = await this.suggestions.findOne({ where: { id } });
    if (!sug) throw new NotFoundException('Suggestion not found');
    if (sug.status !== 'pending') throw new BadRequestException(`Suggestion already ${sug.status}`);
    sug.status = 'rejected';
    sug.reviewNotes = dto.reason ?? null;
    sug.reviewerId = adminId;
    sug.reviewedAt = new Date();
    return this.suggestions.save(sug);
  }

  // ─── Legacy migration (Phase 5) ───────────────────────────────────────────────
  /**
   * One-time, idempotent bridge: pull legacy free-text garment strings from
   * vendor pricing and pricing packages into the suggestion queue for an admin to
   * map into the catalogue. Skips entries already linked to an item, already
   * present in the catalogue by name, or already queued.
   */
  async migrateLegacy(): Promise<{ created: number; skipped: number; sources: { vendorPricing: number; packages: number } }> {
    const itemNames = new Set((await this.items.find()).map((i) => i.name.trim().toLowerCase()));
    const seen = new Set((await this.suggestions.find()).map((s) => s.normalizedText));
    const toCreate: VendorItemSuggestion[] = [];
    let skipped = 0;
    const sources = { vendorPricing: 0, packages: 0 };

    const consider = (raw: string | undefined, vendorId: string | null, price: number | null, src: keyof typeof sources, hasItemId = false) => {
      if (hasItemId) { skipped++; return; }                 // already catalogue-linked
      const norm = (raw ?? '').trim().toLowerCase();
      if (!norm || itemNames.has(norm) || seen.has(norm)) { skipped++; return; }
      seen.add(norm);
      toCreate.push(this.suggestions.create({
        source: 'migration', vendorId, rawText: raw!.trim(), normalizedText: norm,
        proposedPriceNaira: price, status: 'pending',
      }));
      sources[src]++;
    };

    for (const vp of await this.vendorPricing.find()) {
      for (const it of vp.items ?? []) {
        consider(it.garmentType, vp.vendorId, it.priceNaira ?? null, 'vendorPricing', !!it.itemId);
      }
    }
    for (const pkg of await this.pricingPackages.find()) {
      for (const c of ((pkg.criteria as any[]) ?? [])) {
        consider(c.garmentType ?? c.label, null, null, 'packages');
      }
    }

    if (toCreate.length) await this.suggestions.save(toCreate);
    return { created: toCreate.length, skipped, sources };
  }
}
