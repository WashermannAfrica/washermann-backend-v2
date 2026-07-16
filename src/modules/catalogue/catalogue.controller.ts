import {
  Body, Controller, Get, Param, Patch, Post, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogueService } from './catalogue.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import {
  CreateCategoryDto, UpdateCategoryDto, CreateSubCategoryDto, UpdateSubCategoryDto,
  CreateItemDto, UpdateItemDto, CreateSuggestionDto, ApproveSuggestionDto, RejectSuggestionDto,
} from './dto/catalogue.dto';

@ApiTags('Catalogue')
@ApiBearerAuth()
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly service: CatalogueService) {}

  // ─── Public read (any authenticated user) ─────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Active catalogue — categories with their items (customer/vendor browsing)' })
  getCatalogue() {
    return this.service.getPublicCatalogue();
  }

  // ─── Categories (admin) ───────────────────────────────────────────────────────
  @Get('categories')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List categories (admin) — includes inactive' })
  listCategories() {
    return this.service.listCategories(true);
  }

  @Post('categories')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a category' })
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser('id') adminId: string) {
    return this.service.createCategory(dto, adminId);
  }

  @Patch('categories/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a category (incl. enable/disable)' })
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @CurrentUser('id') adminId: string) {
    return this.service.updateCategory(id, dto, adminId);
  }

  // ─── Sub-categories (admin) ───────────────────────────────────────────────────
  @Get('subcategories')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List sub-categories (admin)' })
  listSubCategories(@Query('categoryId') categoryId?: string) {
    return this.service.listSubCategories(categoryId, true);
  }

  @Post('subcategories')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a sub-category' })
  createSubCategory(@Body() dto: CreateSubCategoryDto, @CurrentUser('id') adminId: string) {
    return this.service.createSubCategory(dto, adminId);
  }

  @Patch('subcategories/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a sub-category (incl. enable/disable)' })
  updateSubCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubCategoryDto, @CurrentUser('id') adminId: string) {
    return this.service.updateSubCategory(id, dto, adminId);
  }

  // ─── Items (admin) ────────────────────────────────────────────────────────────
  @Get('items')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List items (admin) — filters: categoryId, everyday' })
  listItems(@Query('categoryId') categoryId?: string, @Query('everyday') everyday?: string) {
    return this.service.listItems({
      categoryId,
      everyday: everyday == null ? undefined : everyday === 'true',
      includeInactive: true,
    });
  }

  @Post('items')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create an item' })
  createItem(@Body() dto: CreateItemDto, @CurrentUser('id') adminId: string) {
    return this.service.createItem(dto, adminId);
  }

  @Patch('items/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an item (incl. enable/disable, everyday flag, category)' })
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto, @CurrentUser('id') adminId: string) {
    return this.service.updateItem(id, dto, adminId);
  }

  // ─── Suggestions ──────────────────────────────────────────────────────────────
  @Post('suggestions')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor: suggest an item missing from the catalogue (with a price)' })
  createSuggestion(@Body() dto: CreateSuggestionDto, @CurrentUser('id') userId: string) {
    return this.service.createSuggestion(userId, dto);
  }

  @Get('suggestions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list suggestions (filter: status)' })
  listSuggestions(@Query('status') status?: string) {
    return this.service.listSuggestions(status);
  }

  @Post('suggestions/:id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: approve a suggestion — creates or merges into an item' })
  approveSuggestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveSuggestionDto, @CurrentUser('id') adminId: string) {
    return this.service.approveSuggestion(id, adminId, dto);
  }

  @Post('suggestions/:id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: reject a suggestion' })
  rejectSuggestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectSuggestionDto, @CurrentUser('id') adminId: string) {
    return this.service.rejectSuggestion(id, adminId, dto);
  }

  @Post('migrate-legacy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: bridge legacy free-text garments (vendor prices, packages) into the suggestion queue (idempotent)' })
  migrateLegacy() {
    return this.service.migrateLegacy();
  }
}
