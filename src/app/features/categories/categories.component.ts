import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/stores/app.store';
import { Category } from '../../models/domain.models';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page">
      <header class="page-header-row">
        <div>
          <p class="eyebrow">Categorias</p>
          <h1>A sua forma de organizar</h1>
          <p class="page-intro">Crie, ordene e arquive categorias. O histórico mantém sempre as referências originais.</p>
        </div>
        <button class="btn btn-primary" type="button" (click)="openCreate()"><span>Nova categoria</span><span class="button-symbol" aria-hidden="true">+</span></button>
      </header>

      @if (store.categories().length === 0) {
        <section class="empty-state">
          <h2>Crie a primeira categoria</h2>
          <p>Pode começar apenas com o essencial e acrescentar subcategorias quando precisar.</p>
          <button class="btn btn-primary" type="button" (click)="openCreate()">Criar categoria</button>
        </section>
      } @else {
        <section class="category-section">
          <div class="section-title"><h2>Categorias ativas</h2><span>{{ activeCategories().length }}</span></div>
          @if (activeCategories().length === 0) {
            <div class="empty-inline">Não existem categorias ativas.</div>
          }
          <div class="category-grid">
            @for (category of activeCategories(); track category.id; let first = $first; let last = $last) {
              <article class="category-card card-flat">
                <header class="category-header">
                  <div class="category-name"><i [style.background]="category.color"></i><div><h3>{{ category.name }}</h3><span>{{ activeSubcategoryCount(category) }} subcategorias ativas</span></div></div>
                  <div class="order-actions" aria-label="Ordenar categoria">
                    <button type="button" class="mini-button" (click)="move(category.id, -1)" [disabled]="first" [attr.aria-label]="'Mover ' + category.name + ' para cima'">↑</button>
                    <button type="button" class="mini-button" (click)="move(category.id, 1)" [disabled]="last" [attr.aria-label]="'Mover ' + category.name + ' para baixo'">↓</button>
                  </div>
                </header>

                @if (category.subcategories.length > 0) {
                  <div class="subcategory-list">
                    @for (subcategory of category.subcategories; track subcategory.id; let subFirst = $first; let subLast = $last) {
                      <div [class.archived-item]="subcategory.archived">
                        @if (isEditingSubcategory(category.id, subcategory.id)) {
                          <form class="rename-subcategory" (ngSubmit)="saveSubcategoryName()">
                            <label class="visually-hidden" [for]="'rename-sub-' + subcategory.id">Novo nome</label>
                            <input [id]="'rename-sub-' + subcategory.id" [value]="editingSubcategoryName()" (input)="setEditingSubcategoryName($event)" required>
                            <button class="text-button" type="submit">Guardar</button>
                            <button class="text-button" type="button" (click)="cancelEditSubcategory()">Cancelar</button>
                          </form>
                        } @else {
                          <span>{{ subcategory.name }} @if (subcategory.archived) { <small>Arquivada</small> }</span>
                          <div class="subcategory-actions">
                            <button class="mini-button" type="button" (click)="moveSubcategory(category.id, subcategory.id, -1)" [disabled]="subFirst" [attr.aria-label]="'Mover ' + subcategory.name + ' para cima'">↑</button>
                            <button class="mini-button" type="button" (click)="moveSubcategory(category.id, subcategory.id, 1)" [disabled]="subLast" [attr.aria-label]="'Mover ' + subcategory.name + ' para baixo'">↓</button>
                            <button class="text-button" type="button" (click)="startEditSubcategory(category.id, subcategory.id, subcategory.name)">Editar</button>
                            <button class="text-button" type="button" (click)="toggleSubcategory(category.id, subcategory.id)">{{ subcategory.archived ? 'Restaurar' : 'Arquivar' }}</button>
                          </div>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <p class="no-subcategories">Sem subcategorias.</p>
                }

                @if (addingSubcategoryFor() === category.id) {
                  <form class="subcategory-form" (ngSubmit)="saveSubcategory(category.id)">
                    <div class="field"><label [for]="'new-sub-' + category.id">Nome da subcategoria</label><input [id]="'new-sub-' + category.id" [value]="newSubcategoryName()" (input)="setSubcategoryName($event)" required></div>
                    <div class="button-row"><button class="btn btn-primary btn-compact" type="submit">Adicionar</button><button class="btn btn-ghost btn-compact" type="button" (click)="cancelSubcategory()">Cancelar</button></div>
                  </form>
                }

                <footer class="category-actions">
                  <button class="text-button" type="button" (click)="startSubcategory(category.id)">Adicionar subcategoria</button>
                  <div><button class="btn btn-ghost btn-compact" type="button" (click)="openEdit(category)">Editar</button><button class="btn btn-ghost btn-compact danger-text" type="button" (click)="archive(category)">Arquivar</button></div>
                </footer>
              </article>
            }
          </div>
        </section>

        @if (archivedCategories().length > 0) {
          <section class="archived-section">
            <div class="section-title"><h2>Categorias arquivadas</h2><span>{{ archivedCategories().length }}</span></div>
            <div class="archived-list card-flat">
              @for (category of archivedCategories(); track category.id) {
                <div><span><i [style.background]="category.color"></i>{{ category.name }}</span><button class="btn btn-secondary btn-compact" type="button" (click)="restore(category.id)">Restaurar</button></div>
              }
            </div>
          </section>
        }
      }
    </div>

    @if (categoryFormOpen()) {
      <div class="modal-backdrop">
        <section class="modal category-modal" role="dialog" aria-modal="true" aria-labelledby="category-form-title">
          <header class="modal-header">
            <div><h2 id="category-form-title">{{ editingCategory() ? 'Editar categoria' : 'Nova categoria' }}</h2><p>Escolha um nome simples e uma cor distinta.</p></div>
            <button class="btn btn-ghost btn-compact" type="button" (click)="closeCategoryForm()">Fechar</button>
          </header>
          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()">
            <div class="form-grid">
              <div class="field">
                <label for="category-name">Nome *</label>
                <input id="category-name" formControlName="name" maxlength="60" required>
                @if (categoryForm.controls.name.touched && categoryForm.controls.name.invalid) { <p class="field-error">Indique um nome para a categoria.</p> }
              </div>
              <div class="field color-field">
                <label for="category-color">Cor</label>
                <input id="category-color" type="color" formControlName="color">
              </div>
              @if (!editingCategory()) {
                <div class="field wide">
                  <label for="initial-subcategories">Subcategorias iniciais</label>
                  <textarea id="initial-subcategories" formControlName="subcategories" placeholder="Ex.: Supermercado, Restaurantes, Cafés"></textarea>
                  <p class="helper">Opcional. Separe os nomes por vírgulas.</p>
                </div>
              }
            </div>
            @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
            <div class="button-row form-actions"><button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">Guardar categoria</button><button class="btn btn-secondary" type="button" (click)="closeCategoryForm()">Cancelar</button></div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './categories.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesComponent {
  readonly store = inject(AppStore);
  private readonly formBuilder = inject(FormBuilder);
  readonly categoryFormOpen = signal(false);
  readonly editingCategory = signal<Category | null>(null);
  readonly addingSubcategoryFor = signal<string | null>(null);
  readonly newSubcategoryName = signal('');
  readonly editingSubcategory = signal<{ categoryId: string; subcategoryId: string } | null>(null);
  readonly editingSubcategoryName = signal('');
  readonly formError = signal<string | null>(null);
  readonly activeCategories = this.store.activeCategories;
  readonly archivedCategories = computed(() => this.store.categories().filter((category) => category.archived));
  readonly categoryForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    color: ['#52796f', Validators.required],
    subcategories: [''],
  });

  openCreate(): void {
    this.editingCategory.set(null);
    this.categoryForm.reset({ name: '', color: '#52796f', subcategories: '' });
    this.formError.set(null);
    this.categoryFormOpen.set(true);
  }

  openEdit(category: Category): void {
    this.editingCategory.set(category);
    this.categoryForm.reset({ name: category.name, color: category.color, subcategories: '' });
    this.formError.set(null);
    this.categoryFormOpen.set(true);
  }

  closeCategoryForm(): void {
    this.categoryFormOpen.set(false);
    this.editingCategory.set(null);
  }

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid) { this.categoryForm.markAllAsTouched(); return; }
    const value = this.categoryForm.getRawValue();
    try {
      const editing = this.editingCategory();
      if (editing) {
        await this.store.renameCategory(editing.id, value.name, value.color);
      } else {
        await this.store.createCategory(value.name, value.color, value.subcategories.split(','));
      }
      this.closeCategoryForm();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar a categoria.');
    }
  }

  async archive(category: Category): Promise<void> {
    if (!confirm(`Arquivar a categoria "${category.name}"? Continuará visível nas despesas anteriores.`)) return;
    try { await this.store.archiveCategory(category.id); } catch { /* Global error is visible. */ }
  }

  async restore(id: string): Promise<void> {
    try { await this.store.restoreCategory(id); } catch { /* Global error is visible. */ }
  }

  async move(id: string, direction: -1 | 1): Promise<void> {
    try { await this.store.moveCategory(id, direction); } catch { /* Global error is visible. */ }
  }

  startSubcategory(categoryId: string): void {
    this.addingSubcategoryFor.set(categoryId);
    this.newSubcategoryName.set('');
  }

  cancelSubcategory(): void {
    this.addingSubcategoryFor.set(null);
    this.newSubcategoryName.set('');
  }

  setSubcategoryName(event: Event): void {
    this.newSubcategoryName.set((event.target as HTMLInputElement).value);
  }

  async saveSubcategory(categoryId: string): Promise<void> {
    if (!this.newSubcategoryName().trim()) return;
    try {
      await this.store.addSubcategory(categoryId, this.newSubcategoryName());
      this.cancelSubcategory();
    } catch { /* Global error is visible. */ }
  }

  async toggleSubcategory(categoryId: string, subcategoryId: string): Promise<void> {
    try { await this.store.toggleSubcategory(categoryId, subcategoryId); } catch { /* Global error is visible. */ }
  }

  startEditSubcategory(categoryId: string, subcategoryId: string, name: string): void {
    this.editingSubcategory.set({ categoryId, subcategoryId });
    this.editingSubcategoryName.set(name);
  }

  cancelEditSubcategory(): void {
    this.editingSubcategory.set(null);
    this.editingSubcategoryName.set('');
  }

  setEditingSubcategoryName(event: Event): void {
    this.editingSubcategoryName.set((event.target as HTMLInputElement).value);
  }

  isEditingSubcategory(categoryId: string, subcategoryId: string): boolean {
    const editing = this.editingSubcategory();
    return editing?.categoryId === categoryId && editing.subcategoryId === subcategoryId;
  }

  async saveSubcategoryName(): Promise<void> {
    const editing = this.editingSubcategory();
    if (!editing || !this.editingSubcategoryName().trim()) return;
    try {
      await this.store.renameSubcategory(editing.categoryId, editing.subcategoryId, this.editingSubcategoryName());
      this.cancelEditSubcategory();
    } catch { /* Global error is visible. */ }
  }

  async moveSubcategory(categoryId: string, subcategoryId: string, direction: -1 | 1): Promise<void> {
    try { await this.store.moveSubcategory(categoryId, subcategoryId, direction); } catch { /* Global error is visible. */ }
  }

  activeSubcategoryCount(category: Category): number {
    return category.subcategories.filter((subcategory) => !subcategory.archived).length;
  }

}
