import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open) {
      <div class="modal open" (mousedown)="backdrop($event)">
        <div #panel class="modal-panel" [class.wide]="wide" role="dialog" aria-modal="true" [attr.aria-label]="title" tabindex="-1">
          <div class="modal-head"><strong>{{ title }}</strong><button class="icon-btn" type="button" aria-label="Fechar janela" (click)="close.emit()">×</button></div>
          <div class="modal-body"><ng-content></ng-content></div>
          @if (showFooter) { <div class="modal-footer"><ng-content select="[modal-footer]"></ng-content></div> }
        </div>
      </div>
    }
  `
})
export class ModalComponent implements OnDestroy {
  @Input() open = false;
  @Input() title = '';
  @Input() wide = false;
  @Input() showFooter = false;
  @Output() close = new EventEmitter<void>();
  private static stack: ModalComponent[] = [];
  private element?: HTMLElement;
  private previousFocus?: HTMLElement;
  @ViewChild('panel') set panel(ref: ElementRef<HTMLElement> | undefined) {
    if (!ref) { this.release(); return; }
    this.element = ref.nativeElement;
    this.previousFocus = document.activeElement as HTMLElement;
    ModalComponent.stack.push(this);
    document.addEventListener('keydown', this.keydown, true);
    document.addEventListener('focusin', this.focusin, true);
    queueMicrotask(() => { if (this.top()) (this.focusable()[0] || this.element)?.focus(); });
  }
  private top() { return ModalComponent.stack.at(-1) === this; }
  private focusable() {
    return Array.from(this.element?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]') || [])
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
  }
  private focusin = (event: FocusEvent) => {
    if (this.top() && !this.element?.contains(event.target as Node)) this.element?.focus();
  };
  private keydown = (event: KeyboardEvent) => {
    if (!this.top()) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close.emit(); }
    if (event.key === 'Tab') {
      const items = this.focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); this.element?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === this.element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === this.element)) { event.preventDefault(); first.focus(); }
    }
  };
  private release() {
    if (!this.element) return;
    const wasTop = this.top();
    ModalComponent.stack = ModalComponent.stack.filter(modal => modal !== this);
    document.removeEventListener('keydown', this.keydown, true);
    document.removeEventListener('focusin', this.focusin, true);
    this.element = undefined;
    if (wasTop && this.previousFocus?.isConnected) this.previousFocus.focus();
  }
  ngOnDestroy() { this.release(); }
  backdrop(event: MouseEvent) { if (this.top() && (event.target as HTMLElement).classList.contains('modal')) this.close.emit(); }
}
