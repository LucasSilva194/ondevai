import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-modal-shell',
  standalone: true,
  template: `
    <div class="modal-backdrop">
      <section [class]="panelClass" role="dialog" aria-modal="true" [attr.aria-labelledby]="labelledBy">
        <ng-content />
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalShellComponent {
  @Input({ required: true }) labelledBy = '';
  @Input() panelClass = 'modal';
}
