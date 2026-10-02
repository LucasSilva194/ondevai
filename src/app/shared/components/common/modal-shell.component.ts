import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-modal-shell',
  standalone: true,
  template: `
    <div class="modal-backdrop">
      <section #panel [class]="panelClass" role="dialog" aria-modal="true" tabindex="-1" [attr.aria-labelledby]="labelledBy" (keydown)="onKeydown($event)">
        <ng-content />
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalShellComponent implements AfterViewInit, OnDestroy {
  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;
  @Input({ required: true }) labelledBy = '';
  @Input() panelClass = 'modal';
  @Output() readonly closeRequest = new EventEmitter<void>();

  private readonly previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngAfterViewInit(): void {
    const first = this.focusableElements()[0];
    (first ?? this.panel.nativeElement).focus();
  }

  ngOnDestroy(): void {
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeRequest.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = this.focusableElements();
    if (!items.length) {
      event.preventDefault();
      this.panel.nativeElement.focus();
      return;
    }
    const first = items[0]!;
    const last = items.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !this.panel.nativeElement.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !this.panel.nativeElement.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
  }
}
