export enum FacingMode {
	ENVIRONMENT = 'environment',
	USER = 'user'
}

export enum ScreenOrientationMode {
	LANDSCAPE = 'landscape',
	PORTRAIT = 'portrait'
}

export interface VideoConstraints {
	width: number;
	height: number;
	aspectRatio?: number;
	facingMode?: FacingMode;
	frameRate?: number;
}

export interface SourceImageData {
	imageWidth?: number;
	imageHeight?: number;
	sourceImageDataUrl?: string;
}
