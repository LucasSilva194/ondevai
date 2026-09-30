import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  ngOnInit(): void {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;

    splash.classList.add('boot-splash-leaving');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    window.setTimeout(() => splash.remove(), 240);
  }
}
