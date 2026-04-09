import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, from, throwError } from 'rxjs';
import { mergeMap, catchError, map } from 'rxjs/operators';

@Injectable({
	providedIn: 'root'
})
export class CameraService implements OnDestroy {
	public currentStream: MediaStream | undefined;
	public currentDeviceId!: string;
	public currentStreamCount = 0;

	/** IPhone back camera Reg */
	private readonly IPhoneBackCameraRegx = /Back Camera/;

	/** IPhone max observer number, reset stream to prevent camera end error */
	private readonly IPhoneMAXStreamNUM = 10;

	/** Camera Loading */
	private readonly mediaStreamLoading = new BehaviorSubject<boolean>(true);
	/** Camera Stream */
	private readonly mediaStream = new BehaviorSubject<MediaStream | undefined>(undefined);
	/** Camera Error */
	private readonly mediaStreamError = new BehaviorSubject<string>('');

	get mediaStream$() {
		return this.mediaStream.asObservable() as import('rxjs').Observable<MediaStream>;
	}

	get mediaStreamLoading$() {
		return this.mediaStreamLoading.asObservable();
	}

	get mediaStreamError$() {
		return this.mediaStreamError.asObservable();
	}

	/** Camera Constraints */
	get mediaConstraints() {
		return {
			audio: false,
			video: {
				deviceId: this.currentDeviceId,
				// reduce width, height to 1920/1080 as some phone does not support high resolution and return black screen
				width: 1920,
				height: 1080,
				aspectRatio: 1.7777777778,
				facingMode: 'environment',
				frameRate: { max: 30 }
			}
		};
	}
	/** is current stream valid */
	get isValidStream() {
		return (
			this.currentStream &&
			this.currentStream.active &&
			this.currentStream
				.getVideoTracks()
				.some(
					(track: MediaStreamTrack) =>
						track.readyState === 'live' && track.enabled === true && track.muted === false
				)
		);
	}

	ngOnDestroy(): void {
		this.stopCurrentStream();
	}

	/**
	 * init Stream from user camera
	 * @param isIphone is user device IPhone
	 * @returns
	 */
	public initialStreamFromCamera(isIphone = false) {
		this.currentStreamCount++;
		this.mediaStreamLoading.next(true);
		/**
		 *  https://autogeneral-au.atlassian.net/browse/CMD2-3392
		 *  on latest Iphone Devices (IOS 18), if the stream has been consumed by 15 videos on a sigle page,
		 *  the camera stream data will be ended automatically, and the end event will be triggered few seconds later
		 *  in order to use the camera without black screen on camera component
		 *  we have to reset the stream after 10 photos be taken.
		 */
		if (this.isValidStream && (!isIphone || this.currentStreamCount <= this.IPhoneMAXStreamNUM)) {
			this.mediaStreamLoading.next(false);

			return;
		}

		this.currentStreamCount = 0;
		try {
			this.mediaStreamError.next('');
			this.stopCurrentStream();

			if (this.isCameraNotSupported()) {
				throw Error('Your Browser Does Not Support, navigator.mediaDevices is unsupported');
			}

			from(navigator.mediaDevices.enumerateDevices())
				.pipe(
					mergeMap((devices: MediaDeviceInfo[]) => {
						const videoDevices = devices.filter((device) => device.kind === 'videoinput');

						// if there is no video input camera
						if (videoDevices.length <= 0) {
							throw Error('The camera is not available on this device');
						}

						this.currentDeviceId = this.getStreamDeviceId(videoDevices, isIphone) ?? '';

						return from(navigator.mediaDevices.getUserMedia(this.mediaConstraints));
					}),
					map((stream: MediaStream) => {
						// check if stream and track is valid to project on video element
						const videoTrack = stream
							.getVideoTracks()
							.find(
								(track: MediaStreamTrack) =>
									track.readyState === 'live' && track.enabled === true && track.muted === false
							);
if (!videoTrack) {
						throw Error('No valid video track found');
					}
					this.addEventListenerToTrack(videoTrack);
						const mediaStream: MediaStream = new MediaStream();
						mediaStream.addTrack(videoTrack);

						return mediaStream;
					}),
					catchError((error) => {
						return throwError(error);
					})
				)
				.subscribe(
					(mediaStream: MediaStream) => {
						this.currentStream = mediaStream;
						this.mediaStream.next(mediaStream);
						this.mediaStreamLoading.next(false);
					},
					(error) => {
						this.mediaStreamError.next(error?.message || 'Launch Camera Failure');
						this.mediaStreamLoading.next(false);
					}
				);
		} catch (error: any) {
			this.mediaStreamError.next(error?.message || 'Launch Camera Failure');
			this.mediaStreamLoading.next(false);
		}
	}

	/**
	 * is user device supports
	 * @returns
	 */
	public isCameraNotSupported(): boolean {
		return !navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia;
	}

	/**
	 * get current streamed device id
	 * @param videoDevices all video devices
	 * @returns device id
	 */
	public getStreamDeviceId(videoDevices: MediaDeviceInfo[], isIphone = false) {
		if (isIphone) {
			return videoDevices.find((videoDevice) => this.IPhoneBackCameraRegx.test(videoDevice?.label))?.deviceId;
		}

		return videoDevices[videoDevices.length - 1].deviceId;
	}

	/**
	 * stop current stream and tracks
	 * @returns
	 */
	public stopCurrentStream() {
		if (!this.currentStream) {
			return;
		}

		try {
			this.currentStream.getTracks().forEach((track: MediaStreamTrack) => {
				track.stop();
			});
		} finally {
			this.currentStream = undefined;
		}

	}

	/**
	 * add event listener to video track
	 * @param videoTrack
	 */
	public addEventListenerToTrack(videoTrack: MediaStreamTrack) {
		videoTrack.addEventListener('ended', () => {
			this.mediaStreamError.next('The camera has stopped working');
		});

		videoTrack.addEventListener('mute', () => {
			this.mediaStreamError.next('The Camera is muted');
		});

		videoTrack.addEventListener('unmute', () => {
			this.mediaStreamError.next('');
		});
	}
}
