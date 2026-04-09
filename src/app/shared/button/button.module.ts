import { NgModule, Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
	selector: 'agic-button',
	template: `<button [class]="color" (click)="clickHandler.emit()"><ng-content></ng-content></button>`,
	styles: [`
		button {
			padding: 0.5rem 1rem;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.875rem;
			font-weight: 500;
		}
		button.primary {
			background: #007bff;
			color: #fff;
		}
		button.secondary {
			background: #6c757d;
			color: #fff;
		}
	`],
	standalone: false
})
export class ButtonComponent {
	@Input() color = 'primary';
	@Output() clickHandler = new EventEmitter<void>();
}

@NgModule({
	declarations: [ButtonComponent],
	exports: [ButtonComponent]
})
export class ButtonModule {}
