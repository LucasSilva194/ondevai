import { Injectable, inject } from '@angular/core';
import { Category, Settings, Subcategory } from '../../models/domain.models';
import { cloneSuggestedCategories } from '../../models/suggested-categories';
import { CATEGORY_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly categories = inject(CATEGORY_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);

  async useSuggestedCategories(): Promise<void> {
    const existing = await this.categories.getAll();
    if (existing.length === 0) await this.categories.bulkPut(cloneSuggestedCategories());
  }

  async create(name: string, color: string, subcategoryNames: readonly string[]): Promise<Category> {
    const existing = await this.categories.getAll();
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Indique um nome para a categoria.');
    const category: Category = {
      id: crypto.randomUUID(),
      name: trimmedName,
      color,
      order: existing.length,
      archived: false,
      subcategories: subcategoryNames
        .map((item) => item.trim())
        .filter(Boolean)
        .map((subcategoryName) => ({ id: crypto.randomUUID(), name: subcategoryName, archived: false })),
    };
    await this.categories.put(category);
    await this.registerChange();
    return category;
  }

  async rename(id: string, name: string, color: string): Promise<Category> {
    const category = await this.requireCategory(id);
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Indique um nome para a categoria.');
    const updated = { ...category, name: trimmedName, color };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async archive(id: string): Promise<Category> {
    const category = await this.requireCategory(id);
    const updated = { ...category, archived: true };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async restore(id: string): Promise<Category> {
    const category = await this.requireCategory(id);
    const updated = { ...category, archived: false };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async addSubcategory(categoryId: string, name: string): Promise<Category> {
    const category = await this.requireCategory(categoryId);
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Indique um nome para a subcategoria.');
    const subcategory: Subcategory = { id: crypto.randomUUID(), name: trimmedName, archived: false };
    const updated = { ...category, subcategories: [...category.subcategories, subcategory] };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async toggleSubcategory(categoryId: string, subcategoryId: string): Promise<Category> {
    const category = await this.requireCategory(categoryId);
    const updated = {
      ...category,
      subcategories: category.subcategories.map((subcategory) =>
        subcategory.id === subcategoryId ? { ...subcategory, archived: !subcategory.archived } : subcategory,
      ),
    };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async renameSubcategory(categoryId: string, subcategoryId: string, name: string): Promise<Category> {
    const category = await this.requireCategory(categoryId);
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Indique um nome para a subcategoria.');
    const updated = {
      ...category,
      subcategories: category.subcategories.map((subcategory) =>
        subcategory.id === subcategoryId ? { ...subcategory, name: trimmedName } : subcategory,
      ),
    };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async moveSubcategory(categoryId: string, subcategoryId: string, direction: -1 | 1): Promise<Category> {
    const category = await this.requireCategory(categoryId);
    const subcategories = [...category.subcategories];
    const index = subcategories.findIndex((subcategory) => subcategory.id === subcategoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= subcategories.length) return category;
    [subcategories[index], subcategories[target]] = [subcategories[target], subcategories[index]];
    const updated = { ...category, subcategories };
    await this.categories.put(updated);
    await this.registerChange();
    return updated;
  }

  async move(id: string, direction: -1 | 1): Promise<Category[]> {
    const all = (await this.categories.getAll()).sort((a, b) => a.order - b.order);
    const active = all.filter((category) => !category.archived);
    const archived = all.filter((category) => category.archived);
    const index = active.findIndex((category) => category.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) return all;
    [active[index], active[target]] = [active[target], active[index]];
    const reordered = [...active, ...archived].map((category, order) => ({ ...category, order }));
    await this.categories.bulkPut(reordered);
    await this.registerChange();
    return reordered;
  }

  private async requireCategory(id: string): Promise<Category> {
    const category = await this.categories.getById(id);
    if (!category) throw new Error('A categoria já não existe.');
    return category;
  }

  private async registerChange(): Promise<void> {
    const current = await this.settings.get();
    if (!current) return;
    const next: Settings = { ...current, changesSinceExport: current.changesSinceExport + 1 };
    await this.settings.put(next);
  }
}
