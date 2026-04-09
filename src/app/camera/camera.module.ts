import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from '@ui/core/button/button.module';
import { CameraComponent } from './camera.component';

@NgModule({
	imports: [CommonModule, ButtonModule],
	declarations: [CameraComponent],
	providers: [],
	exports: [CameraComponent]
})
export class CameraModule {}
