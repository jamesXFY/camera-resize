import { NgModule, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'agic-button',
	template: `
		<button [class]="color" [disabled]="disabled || loading" (click)="clickHandler.emit()">
			<span *ngIf="loading" class="spinner"></span>
			<ng-content></ng-content>
		</button>
	`,
	styles: [`
		button {
			padding: 0.5rem 1rem;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.875rem;
			font-weight: 500;
			display: inline-flex;
			align-items: center;
			gap: 0.25rem;
		}
		button:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}
		button.primary {
			background: #007bff;
			color: #fff;
		}
		button.secondary {
			background: #6c757d;
			color: #fff;
		}
		.spinner {
			display: inline-block;
			width: 0.875rem;
			height: 0.875rem;
			border: 2px solid currentColor;
			border-right-color: transparent;
			border-radius: 50%;
			animation: spin 0.6s linear infinite;
		}
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
	`],
	standalone: false
})
export class ButtonComponent {
	@Input() color = 'primary';
	@Input() disabled = false;
	@Input() loading = false;
	@Output() clickHandler = new EventEmitter<void>();
}

@NgModule({
	imports: [CommonModule],
	declarations: [ButtonComponent],
	exports: [ButtonComponent]
})
export class ButtonModule {}
