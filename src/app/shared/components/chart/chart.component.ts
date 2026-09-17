import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Legend, LinearScale, Tooltip);

@Component({
  selector: 'app-chart',
  template: '<canvas #canvas role="img" [attr.aria-label]="accessibleLabel"></canvas>',
  styles: ':host { display: block; min-height: 280px; position: relative; } canvas { width: 100% !important; height: 280px !important; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) type: 'bar' | 'doughnut' = 'bar';
  @Input({ required: true }) labels: string[] = [];
  @Input({ required: true }) values: number[] = [];
  @Input() colors: string[] = [];
  @Input() accessibleLabel = 'Gráfico de despesas';
  @ViewChild('canvas') private canvas?: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(): void {
    if (this.canvas) this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {
    const context = this.canvas?.nativeElement.getContext('2d');
    if (!context) return;
    this.chart?.destroy();
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text-soft').trim();
    const borderColor = styles.getPropertyValue('--border').trim();
    const accent = styles.getPropertyValue('--accent').trim();
    const config: ChartConfiguration<'bar' | 'doughnut'> = {
      type: this.type,
      data: {
        labels: this.labels,
        datasets: [{
          data: this.values.map((value) => value / 100),
          backgroundColor: this.type === 'bar' ? accent : this.colors,
          borderColor: this.type === 'bar' ? accent : styles.getPropertyValue('--surface-raised').trim(),
          borderWidth: this.type === 'bar' ? 0 : 2,
          borderRadius: this.type === 'bar' ? 6 : 0,
          maxBarThickness: 34,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260 },
        plugins: {
          legend: { display: this.type === 'doughnut', position: 'bottom', labels: { color: textColor, usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: (item) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(item.raw)) } },
        },
        scales: this.type === 'bar' ? {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: {
            beginAtZero: true,
            grid: { color: borderColor },
            ticks: { color: textColor, callback: (value) => `${value} €` },
          },
        } : undefined,
        cutout: this.type === 'doughnut' ? '68%' : undefined,
      },
    };
    this.chart = new Chart(context, config);
  }
}
