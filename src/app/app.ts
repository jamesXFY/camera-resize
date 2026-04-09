import { Component, signal, ViewChild } from '@angular/core';
import { CameraModule } from './camera/camera.module';
import { CameraComponent } from './camera/camera.component';
import { SourceImageData } from './camera/camera.model';

@Component({
  selector: 'app-root',
  imports: [CameraModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('camera-resize');
  isLandscapeMode = false;

  @ViewChild('camera') camera!: CameraComponent;

  launchCamera() {
    this.camera.launchCamera(true);
  }

  closeCamera() {
    this.camera.closeCamera();
  }

  bringCameraForward() {
    this.camera.bringImageVideoForward();
  }

  cameraImageSourceOutput(event: SourceImageData) {
    console.log('Image captured:', event);
  }

  cameraFailureMessageOutput(message: string) {
    console.error('Camera failure:', message);
  }

  cameraUnsupportedMessageOutput() {
    console.error('Camera not supported');
  }
}
