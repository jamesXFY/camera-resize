import {
	AfterViewInit,
	Component,
	ElementRef,
	EventEmitter,
	HostListener,
	Input,
	OnDestroy,
	OnInit,
	Output,
	Renderer2,
	ViewChild
} from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest, from, fromEvent, of } from 'rxjs';
import { catchError, concatMap, debounceTime, filter, first, map, takeUntil, tap } from 'rxjs/operators';
import { ScreenOrientationMode, SourceImageData, VideoConstraints } from './camera.model';
import { CameraService } from './camera.service';

const DISABLE_SCROLL = 'disable-scroll';

@Component({
	selector: 'agic-camera',
	templateUrl: './camera.component.html',
	styleUrls: ['./camera.component.scss'],
	standalone: false
})
export class CameraComponent implements OnInit, AfterViewInit, OnDestroy {
	@Input() defaultScreenOrientation!: ScreenOrientationMode | string;
	@Input() videoConstrain!: VideoConstraints;
	@Output() sourceImageDataEmitter: EventEmitter<SourceImageData> = new EventEmitter();
	@Output() cameraFailureMessageEmitter: EventEmitter<string> = new EventEmitter();
	@Output() cameraUnsupportedMessageEmitter: EventEmitter<string> = new EventEmitter();

	@ViewChild('cameraContainer') cameraContainer!: ElementRef<Element>;
	@ViewChild('imageCanvas') imageCanvas!: ElementRef;

	/** if camera active to capture */
	public isCameraActive = false;
	/** if mobile is on landscape mode */
	public isLandscapeMode = false;
	public canvasWidth = 0;
	public canvasHeight = 0;
	/** if image canvase should be first layer to display */
	public imageCanvasForward = false;
	/** if image video should be first layer to display */
	public imageVideoForward = false;
	/** if help info should be first layer to display */
	public imageHelpInfoForward = false;
	/** if orientation info should be first layer to display */
	public orientationInforLayerForward = true;
	/** loading from user camera */
	public launchingCamera$!: Observable<string>;
	/** user camera media source */
	public cameraMediaSource$!: Observable<MediaStream>;
	/** current media stream from camera */
	public currentStream!: MediaStream;
	/** current Image DataUri from camera */
	public currentImageDataUri!: string;

	/** camera video player element reference */
	private _cameraVideoPlayer!: ElementRef;
	private _isHelpInfoLayerActive!: boolean;

	public cameraPermission$ = new BehaviorSubject<string>('');

	/** if any help info need to display */
	private alwaysShowHelpInfo = false;
	/** if user is on IPhone device*/
	private isIphone = false;
	/** if user is on iPad device*/
	private isIpad = false;
	/** IPhone Reg - needs to be left like this due to breaking change for iPhones in WSOL-128 */
	private readonly IPhoneRegx = /(iPhone).*AppleWebKit/;
	/** iPad Reg */
	private readonly IPadRegx = /(Macintosh).*AppleWebKit/;
	/** stop event reference, has to bind to this */
	private readonly stopEventReference = this.stopEvent.bind(this);

	private readonly destroy$: Subject<boolean> = new Subject<boolean>();

	constructor(
		private readonly renderer: Renderer2,
		private readonly cameraService: CameraService
	) {}

	get isCorrectOrientation(): boolean {
		if (!this.defaultScreenOrientation) {
			return true;
		}
		if (this.defaultScreenOrientation === ScreenOrientationMode.LANDSCAPE) {
			return window.innerWidth > window.innerHeight;
		}
		if (this.defaultScreenOrientation === ScreenOrientationMode.PORTRAIT) {
			return window.innerWidth < window.innerHeight;
		}

		return false;
	}

	get cameraVideoPlayer() {
		return this._cameraVideoPlayer;
	}

	get isHelpInfoLayerActive() {
		return this._isHelpInfoLayerActive;
	}

	@ViewChild('cameraVideoPlayer') set setCameraVideoPlayer(videoElementRef: ElementRef) {
		this._cameraVideoPlayer = videoElementRef;

		if (videoElementRef) {
			this.cameraMediaSource$.subscribe((mediaStream) => {
				videoElementRef.nativeElement.srcObject = mediaStream;
			});
		}
	}

	@ViewChild('helpInfoLayer') set setHelpInfoLayer(helpInfoLayer: ElementRef) {
		this._isHelpInfoLayerActive = helpInfoLayer?.nativeElement?.children?.length;
	}

	@HostListener('window:resize', ['$event'])
	onOrientationChange(event: Event) {
		if (this.imageCanvasForward) {
			return;
		}

		const currentModeIsLandscape = window.innerWidth > window.innerHeight;

		if (currentModeIsLandscape === this.isLandscapeMode) {
			return;
		}

		this.isLandscapeMode = currentModeIsLandscape;
		this.toggleOrientationInfoLayer();
	}

	ngOnInit(): void {
		this.launchingCamera$ = combineLatest([
			this.cameraService.mediaStreamLoading$,
			this.cameraService.mediaStreamError$
		]).pipe(
			debounceTime(150),
			map(([loading, errMessage]) => {
				if (loading) {
					return 'Loading';
				}
				if (errMessage) {
					this.cameraFailureMessageEmitter.emit(errMessage);

					return `<p>It looks like we can't access the camera.</p>
							<p>Please:</p>
							<ol>
								<li class="error-list-element">Close any other apps or tabs that could be using your camera</li>
								<li>Refresh your screen, and allow the camera permission to continue</li>
							</ol>`;
				}

				return '';
			})
		);
		this.cameraMediaSource$ = this.cameraService.mediaStream$.pipe(
			takeUntil(this.destroy$),
			filter((mediaStream) => !!mediaStream)
		);

		// Check if navigator and required APIs are available
		if (!navigator?.permissions?.query) {
			this.cameraUnsupportedMessageEmitter.emit();

			return;
		}

		this.isIphone = this.IPhoneRegx.test(window?.navigator?.userAgent);
		this.isIpad = this.IPadRegx.test(window?.navigator?.userAgent);
		this.listenToFullScreenEvent().subscribe();

		if (this.cameraService.isCameraNotSupported()) {
			this.cameraUnsupportedMessageEmitter.emit();

			return;
		}

		navigator.permissions
			.query({ name: 'camera' } as any)
			.then((status) => {
				// Sometimes camera permissions are already granted/denied
				if (status.state === 'granted' || status.state === 'denied') {
					this.cameraPermission$.next(status.state);
				}
				status.onchange = () => {
					this.cameraPermission$.next(status.state);
				};
			})
			.catch(() => {
				this.cameraUnsupportedMessageEmitter.emit(); // catch permission error on firefox
			});
	}

	ngAfterViewInit() {
		this.canvasWidth = window.innerWidth;
	}

	ngOnDestroy() {
		this.destroy$.next(true);
		this.destroy$.complete();

		// Failsafe if camera somehow gets destroyed we need to remove this class from document.body
		if (this.isIphone) {
			this.renderer.removeClass(document.body, DISABLE_SCROLL);
			this.enableScrollForIphoneCamera();
		}
	}

	/**
	 * launch user camera
	 */
	public async launchCamera(showHelpInfo = false) {
		if (this.isIphone) {
			this.renderer.addClass(document.body, DISABLE_SCROLL);
			this.disableScrollForIphoneCamera();
		}

		if (showHelpInfo) {
			this.alwaysShowHelpInfo = showHelpInfo;
		}

		this.cameraService.initialStreamFromCamera(this.isIphone);
		if (!this.isIphone && !this.isIpad) {
			// Due to a bug in iOS, we have to split this logic for iPhones (CMD2-3304)
			this.cameraPermission$
				.pipe(
					first((value) => value === 'granted' || value === 'denied'),
					concatMap((val) => {
						this.toggleOrientationInfoLayer();
						this.isCameraActive = true;

						return from(this.openFullScreen());
					})
				)
				.subscribe();
		} else {
			await this.openFullScreen();
			this.toggleOrientationInfoLayer();
			this.isCameraActive = true;
		}
	}

	/**
	 * capture image from camera
	 */
	public captureImage() {
		const loadedImageWidth = this.cameraVideoPlayer.nativeElement.videoWidth;
		const loadedImageHeight = this.cameraVideoPlayer.nativeElement.videoHeight;
		this.canvasWidth = window.outerWidth;
		this.canvasHeight = window.outerHeight;
		this.bringImageCanvasForward();
		this.drawCanvas({
			imageWidth: loadedImageWidth,
			imageHeight: loadedImageHeight,
			sourceImageElement: this.cameraVideoPlayer.nativeElement
		});
	}
	/**
	 * draw current video player frame to canvas
	 * @param event
	 */
	public drawCanvas(event: { imageWidth: number; imageHeight: number; sourceImageElement: CanvasImageSource }) {
		const offScreenCanvas: HTMLCanvasElement = this.renderer.createElement('canvas');
		const canvasContent = offScreenCanvas.getContext('2d');
		if (!canvasContent) return;
		canvasContent.canvas.width = event.imageWidth;
		canvasContent.canvas.height = event.imageHeight;
		canvasContent.drawImage(event.sourceImageElement, 0, 0);
		this.currentImageDataUri = offScreenCanvas.toDataURL('image/jpeg');
	}

	/**
	 * display image canvas layer
	 */
	public bringImageCanvasForward() {
		this.resetAllLayers();
		this.imageCanvasForward = true;
	}

	/**
	 * display video layer
	 */
	public bringImageVideoForward() {
		this.resetAllLayers();
		this.imageVideoForward = true;
	}

	/**
	 * display orientation info layer
	 */
	public bringOrientationInfoLayerForward() {
		this.resetAllLayers();
		this.orientationInforLayerForward = true;
	}

	/**
	 * display help info layer
	 */
	public bringHelpInfoLayerForward() {
		this.resetAllLayers();
		this._isHelpInfoLayerActive = true;
		this.imageHelpInfoForward = true;
	}

	/**
	 * retake image from camera
	 */
	public retakeImage() {
		this.toggleOrientationInfoLayer();
	}

	/**
	 * use current image and emit image content
	 */
	public async useImage() {
		await this.closeCamera();
		this.sourceImageDataEmitter.emit({
			imageWidth: this.cameraVideoPlayer?.nativeElement?.videoWidth,
			imageHeight: this.cameraVideoPlayer?.nativeElement?.videoHeight,
			sourceImageDataUrl: this.currentImageDataUri
		});
	}

	/**
	 * close camera
	 */
	public async closeCamera() {
		if (this.isIphone) {
			this.renderer.removeClass(document.body, DISABLE_SCROLL);
			this.enableScrollForIphoneCamera();
		}

		this.isCameraActive = false;
		this.disableVideo();
		this.disableImg();
		this.bringOrientationInfoLayerForward();
		await this.exitFullScreen();
	}

	/**
	 * toggle orientation info layer
	 */
	public toggleOrientationInfoLayer() {
		if (this.isCorrectOrientation) {
			if (this.isHelpInfoLayerActive || this.alwaysShowHelpInfo) {
				this.bringHelpInfoLayerForward();
			} else {
				this.bringImageVideoForward();
			}
		} else {
			this.bringOrientationInfoLayerForward();
		}
	}

	/**
	 *	disable video to release memory
	 */
	public disableVideo() {
		if (!this.cameraVideoPlayer?.nativeElement) {
			return;
		}
		this.renderer.removeAttribute(this.cameraVideoPlayer.nativeElement, 'src');
		this.cameraVideoPlayer?.nativeElement.load();
	}

	/**
	 * disable img
	 * @returns
	 */
	public disableImg() {
		if (!this.imageCanvas?.nativeElement) {
			return;
		}
		this.renderer.removeAttribute(this.imageCanvas.nativeElement, 'src');
	}

	/**
	 *  stop event
	 * @param event
	 */
	public stopEvent(event: Event) {
		event.preventDefault();
		event.stopImmediatePropagation();
		event.stopPropagation();
	}

	/**
	 * reset all layers
	 */
	private resetAllLayers() {
		this.imageCanvasForward = false;
		this.imageVideoForward = false;
		this.orientationInforLayerForward = false;
		this._isHelpInfoLayerActive = false;
		this.imageHelpInfoForward = false;
	}

	/**
	 * open camera in full screen
	 */
	private async openFullScreen() {
		const cameraContainerElement = this.cameraContainer.nativeElement;

		// Exit early if we're already in full screen
		const doc = document as any;
		const elem = cameraContainerElement as any;

		if (
			!!doc.webkitFullscreenElement ||
			!!document.fullscreenElement ||
			elem.webkitDisplayingFullscreen
		) {
			return;
		}

		if (cameraContainerElement.requestFullscreen) {
			await cameraContainerElement.requestFullscreen().catch((error) => {
				// Log error then continue
				console.error('requestFullscreen()', error);
			});
		} else if (elem.webkitRequestFullscreen) {
			/* Safari */
			elem.webkitRequestFullscreen();
		}
	}
	/**
	 * camera exist full screen
	 */
	private async exitFullScreen() {
		// Only call if camera is currently full screen
		const doc = document as any;
		if (document && (!!doc.webkitFullscreenElement || !!document.fullscreenElement)) {
			if (document.exitFullscreen) {
				await document.exitFullscreen().catch((error) => {
					// Log error then continue
					console.error('exitFullScreen()', error);
				});
			} else if (doc.webkitExitFullscreen) {
				doc.webkitExitFullscreen(); // Not a promise according to apple docs
			} else if (doc.mozCancelFullScreen) {
				doc.mozCancelFullScreen();
			}

			// If Fullscreen API is still not supported by browser, let user remove fullscreen mode themselves
		}
	}

	/**
	 * Listen to the fullscreenchange document event
	 */
	private listenToFullScreenEvent() {
		let isFullscreen = false;

		return fromEvent(document.documentElement, 'fullscreenchange').pipe(
			tap((event) => {
				isFullscreen = !!(document as any).webkitFullscreenElement || !!document.fullscreenElement;
			}),
			filter(() => !isFullscreen && this.isCameraActive),
			concatMap((val: Event) => {
				return from(this.closeCamera());
			}),
			catchError((error) => {
				console.error(error);

				return of(error);
			}),
			takeUntil(this.destroy$)
		);
	}
	/**
	 * disable scroll event for iphone when camera launched
	 * have to use addEventListener to make sure scroll event passive is false
	 */
	private disableScrollForIphoneCamera() {
		window.addEventListener('touchmove', this.stopEventReference, {
			passive: false
		});
		window.addEventListener('scroll', this.stopEventReference, {
			passive: false
		});
	}
	/**
	 * enable scroll event when camera off
	 */
	private enableScrollForIphoneCamera() {
		window.removeEventListener('touchmove', this.stopEventReference);
		window.removeEventListener('scroll', this.stopEventReference);
	}
}
