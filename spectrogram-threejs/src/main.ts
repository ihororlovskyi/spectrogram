import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import vertexShader from './shaders/vertex.glsl?raw';
import fragmentShader from './shaders/fragment.glsl?raw';

// Constants
let frequencyBins: number = 1024; // кількість бінів FFT (frequencyBinCount).
let frequencySegments: number = 256; // кількість вершин по осі частот (як у WebGL).
let timeSamples: number = 256; // кількість вершин по осі часу.
let nVertices: number = frequencySegments * timeSamples; // загальна кількість вершин сітки.
let xSegments: number = timeSamples; // кількість вершин по осі X (рівно timeSamples).
let ySegments: number = frequencySegments; // кількість вершин по осі Y (рівно frequencySegments).
let xSize: number = 11; // ширина спектрограми по осі X
let ySize: number = 11; // висота по осі Y
let zSize: number = 11; // довжина по осі Z
const RAD_TO_DEG: number = 180 / Math.PI; // 57.29577951308232 — коефіцієнт перетворення радіанів у градуси.
type ScaleMode = 'linear' | 'log' | 'mel'; // Можливі режимі масштабування спектрограми.
type ColormapMode = 'gray' | 'inferno' | 'rainbow'; // Доступні кольорові мапи.
type CameraLogger = {
  log: () => void;
  check: () => void;
};
type SpectrogramViewOptions = {
  containerId: string;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  backgroundColor: THREE.Vector3;
  heightScale: number;
  cameraPosition?: THREE.Vector3;
  rotation?: THREE.Euler;
  translation?: THREE.Vector3;
};

type SpectrogramView = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  mesh: THREE.Mesh;
  rotateGroup: THREE.Group;
  scaleGroup: THREE.Group;
  translateGroup: THREE.Group;
  resize: () => void;
  render: () => void;
};

const createSpectrogramView = (options: SpectrogramViewOptions): SpectrogramView | null => {
  const container = document.getElementById(options.containerId);
  if (!container) {
    console.error(`Spectrogram container not found: ${options.containerId}`);
    return null;
  }

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 100);
  if (options.cameraPosition) {
    camera.position.copy(options.cameraPosition);
  } else {
    camera.position.set(0, 0, 12);
  }
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(
    new THREE.Color(
      options.backgroundColor.x,
      options.backgroundColor.y,
      options.backgroundColor.z
    ),
    1
  );
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;

  container.appendChild(renderer.domElement);

  const mesh = new THREE.Mesh(options.geometry, options.material);
  const rotateGroup = new THREE.Group();
  const scaleGroup = new THREE.Group();
  const translateGroup = new THREE.Group();

  if (options.rotation) {
    rotateGroup.rotation.copy(options.rotation);
  }

  if (options.translation) {
    translateGroup.position.copy(options.translation);
  } else {
    translateGroup.position.set(-options.heightScale * 0.5, 0, 0);
  }

  rotateGroup.add(mesh);
  scaleGroup.add(rotateGroup);
  translateGroup.add(scaleGroup);
  scene.add(translateGroup);

  const resize = (): void => {
    const rect = container.getBoundingClientRect();
    const newWidth = rect.width;
    const newHeight = rect.height;
    if (newWidth <= 0 || newHeight <= 0) {
      return;
    }

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
  };

  const render = (): void => {
    renderer.clear();
    renderer.render(scene, camera);
  };

  return {
    scene,
    camera,
    renderer,
    mesh,
    rotateGroup,
    scaleGroup,
    translateGroup,
    resize,
    render
  };
};

/**
 * Initialize and start the application
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, t: number): number => start + (end - start) * t;

/**
 * Generate a grayscale colormap: black for quiet, white for loud (matches WebGL)
 */
const generateGrayColormap = (nshades: number): [number, number, number, number][] => {
  const colors: [number, number, number, number][] = [];
  for (let i = 0; i < nshades; i++) {
    const value = i / (nshades - 1);
    const gray = Math.round(255 * value);
    colors.push([gray, gray, gray, 255]);
  }
  return colors;
};

const infernoColormap = (t: number): [number, number, number] => {
  const c0: [number, number, number] = [0.0, 0.0, 0.015];
  const c1: [number, number, number] = [0.258, 0.039, 0.406];
  const c2: [number, number, number] = [0.578, 0.148, 0.404];
  const c3: [number, number, number] = [0.865, 0.316, 0.226];
  const c4: [number, number, number] = [0.988, 0.645, 0.039];
  const c5: [number, number, number] = [0.988, 1.0, 0.644];

  const value = clamp(t, 0, 1);
  let from = c0;
  let to = c1;
  let localT = value / 0.2;

  if (value < 0.2) {
    from = c0;
    to = c1;
    localT = value / 0.2;
  } else if (value < 0.4) {
    from = c1;
    to = c2;
    localT = (value - 0.2) / 0.2;
  } else if (value < 0.6) {
    from = c2;
    to = c3;
    localT = (value - 0.4) / 0.2;
  } else if (value < 0.8) {
    from = c3;
    to = c4;
    localT = (value - 0.6) / 0.2;
  } else {
    from = c4;
    to = c5;
    localT = (value - 0.8) / 0.2;
  }

  return [
    lerp(from[0], to[0], localT),
    lerp(from[1], to[1], localT),
    lerp(from[2], to[2], localT)
  ];
};

const hsvToRgb = (hue: number, saturation: number, lightness: number): [number, number, number] => {
  const chroma = lightness * saturation;
  const hueDash = hue / 60.0;
  const x = chroma * (1.0 - Math.abs((hueDash % 2) - 1.0));

  let r = 0;
  let g = 0;
  let b = 0;

  if (hueDash < 1.0) {
    r = chroma;
    g = x;
  } else if (hueDash < 2.0) {
    r = x;
    g = chroma;
  } else if (hueDash < 3.0) {
    g = chroma;
    b = x;
  } else if (hueDash < 4.0) {
    g = x;
    b = chroma;
  } else if (hueDash < 5.0) {
    r = x;
    b = chroma;
  } else if (hueDash < 6.0) {
    r = chroma;
    b = x;
  }

  return [r, g, b];
};

const generateInfernoColormap = (nshades: number): [number, number, number, number][] => {
  const colors: [number, number, number, number][] = [];
  for (let i = 0; i < nshades; i++) {
    const t = i / (nshades - 1);
    const [r, g, b] = infernoColormap(t);
    colors.push([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]);
  }
  return colors;
};

const generateRainbowColormap = (nshades: number): [number, number, number, number][] => {
  const colors: [number, number, number, number][] = [];
  for (let i = 0; i < nshades; i++) {
    const t = i / (nshades - 1);
    const hue = 360.0 - (t * 360.0);
    const [r, g, b] = hsvToRgb(hue, 1.0, 1.0);
    colors.push([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]);
  }
  return colors;
};

/**
 * Generate colormap colors to match the WebGL shaders
 */
const generateColormap = (mode: ColormapMode, nshades: number): [number, number, number, number][] => {
  if (mode === 'gray') {
    return generateGrayColormap(nshades);
  } else if (mode === 'inferno') {
    return generateInfernoColormap(nshades);
  } else if (mode === 'rainbow') {
    return generateRainbowColormap(nshades);
  }
  return generateInfernoColormap(nshades);
};

const init = async function(): Promise<void> {

  const micButton = document.getElementById('mic-button') as HTMLButtonElement | null;
  const demoOnsetButton = document.getElementById('demo-onset-button') as HTMLButtonElement | null;
  const demoButton = document.getElementById('demo-button') as HTMLButtonElement | null;
  const demoGazMaskButton = document.getElementById('demo-gazmask-button') as HTMLButtonElement | null;
  const demoGazMaskButton2 = document.getElementById('demo-gazmask-button-2') as HTMLButtonElement | null;
  const stopButton = document.getElementById('stop-button') as HTMLButtonElement | null;
  const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement | null;
  const linearButton = document.getElementById('scale-linear') as HTMLButtonElement | null;
  const logButton = document.getElementById('scale-log') as HTMLButtonElement | null;
  const melButton = document.getElementById('scale-mel') as HTMLButtonElement | null;
  const grayButton = document.getElementById('colormap-gray') as HTMLButtonElement | null;
  const infernoButton = document.getElementById('colormap-inferno') as HTMLButtonElement | null;
  const rainbowButton = document.getElementById('colormap-rainbow') as HTMLButtonElement | null;
  const closePanelButton = document.getElementById('close-panel') as HTMLButtonElement | null;
  const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
  const controlPanel = document.getElementById('controlPanel');
  const artworkToggle = document.getElementById('artwork-toggle') as HTMLButtonElement | null;
  const artworkBlock = document.getElementById('Tracklist');
  const eyeOpen = document.getElementById('eye-open');
  const eyeClosed = document.getElementById('eye-closed');
  const cameraAxesToggle = document.getElementById('camera-axes-toggle') as HTMLButtonElement | null;
  const gridXButton = document.getElementById('grid-x') as HTMLButtonElement | null;
  const gridYButton = document.getElementById('grid-y') as HTMLButtonElement | null;
  const gridZButton = document.getElementById('grid-z') as HTMLButtonElement | null;
  const statusLabel = document.getElementById('source-status');
  const trackTimeCurrent = document.getElementById('TrackTimeCurrent');
  const trackTimeTotal = document.getElementById('TrackTimeTotal');
  const dropzoneInput = document.getElementById('dropzone-input') as HTMLInputElement | null;
  const dropzone = document.getElementById('audio-dropzone');
  const angleRotateXButton = document.getElementById('angle-rotate-x') as HTMLButtonElement | null;
  const angleRotateYButton = document.getElementById('angle-rotate-y') as HTMLButtonElement | null;
  const angleRotateZButton = document.getElementById('angle-rotate-z') as HTMLButtonElement | null;
  const angleRotateXNegButton = document.getElementById('angle-rotate-x-neg') as HTMLButtonElement | null;
  const angleRotateYNegButton = document.getElementById('angle-rotate-y-neg') as HTMLButtonElement | null;
  const angleRotateZNegButton = document.getElementById('angle-rotate-z-neg') as HTMLButtonElement | null;
  const camera1Rotation000Button = document.getElementById('camera1-rot-0-0-0') as HTMLButtonElement | null;
  const camera1RotationNeg90Button = document.getElementById('camera1-rot-neg90-0-neg90') as HTMLButtonElement | null;
  const camera2Rotation000Button = document.getElementById('camera2-rot-0-0-0') as HTMLButtonElement | null;
  const camera2RotationNeg90Button = document.getElementById('camera2-rot-neg90-0-neg90') as HTMLButtonElement | null;
  const closeControlPanel = (): void => {
    if (controlPanel) {
      controlPanel.style.display = 'none';
    }
    if (menuButton) {
      menuButton.style.display = 'block';
    }
  };

  // Preset buttons
  const preset000Button = document.getElementById('preset-0-0-0') as HTMLButtonElement | null;
  const preset90_90Button = document.getElementById('preset-90-90-0') as HTMLButtonElement | null;
  const preset45_45Button = document.getElementById('preset-45-45-0') as HTMLButtonElement | null;
  const preset0_180Button = document.getElementById('preset-0-180-0') as HTMLButtonElement | null;
  const preset45_180Button = document.getElementById('preset-45-180-0') as HTMLButtonElement | null;
  const preset90_180Button = document.getElementById('preset-90-180-0') as HTMLButtonElement | null;

  // Flip buttons
  const flipXButton = document.getElementById('flip-x') as HTMLButtonElement | null;
  const flipYButton = document.getElementById('flip-y') as HTMLButtonElement | null;
  const flipZButton = document.getElementById('flip-z') as HTMLButtonElement | null;

  // Initialize Audio Context
  const ACTX: AudioContext = new AudioContext();
  const ANALYSER: AnalyserNode = ACTX.createAnalyser();
  ANALYSER.fftSize = frequencyBins * 2;
  ANALYSER.smoothingTimeConstant = 0;

  // Log FFT configuration
  console.log(`FFT Size: ${ANALYSER.fftSize}`);

  let mediaStream: MediaStream | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let bufferSource: AudioBufferSourceNode | null = null;
  let currentBuffer: AudioBuffer | null = null;
  let playStartTime: number = 0;
  let pauseOffset: number = 0;
  let isPlayingBuffer: boolean = false;
  let waveformData: Float32Array | null = null;
  let waveformWidth: number = 0;
  let waveformDuration: number = 0;
  type WaveformCache = {
    base: HTMLCanvasElement;
    progress: HTMLCanvasElement;
    playhead: HTMLCanvasElement;
    width: number;
    height: number;
  };
  let waveformCache: WaveformCache | null = null;
  let waveformCacheDirty: boolean = true;

  const invalidateWaveformCache = (): void => {
    waveformCacheDirty = true;
  };

  const clearWaveformCache = (): void => {
    waveformCache = null;
    waveformCacheDirty = false;
  };

  const buildWaveformData = (audioBuffer: AudioBuffer, targetWidth: number = 2048): Float32Array => {
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPixel = Math.max(1, Math.floor(channelData.length / targetWidth));
    const data = new Float32Array(targetWidth * 2);

    for (let i = 0; i < targetWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, channelData.length);

      for (let j = start; j < end; j++) {
        const sample = channelData[j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      data[i * 2] = min;
      data[i * 2 + 1] = max;
    }

    return data;
  };

  const setWaveformFromBuffer = (audioBuffer: AudioBuffer): void => {
    waveformData = buildWaveformData(audioBuffer, 2048);
    waveformWidth = waveformData.length / 2;
    waveformDuration = audioBuffer.duration;
    invalidateWaveformCache();
  };

  const stopBufferPlayback = (): void => {
    if (bufferSource) {
      try {
        bufferSource.stop();
      } catch (error) {
        console.warn("Failed to stop buffer source:", error);
      }
      bufferSource.disconnect();
      bufferSource = null;
    }
    isPlayingBuffer = false;
  };

  const startBufferPlayback = (offset: number): void => {
    if (!currentBuffer || waveformDuration <= 0) {
      return;
    }
    stopBufferPlayback();
    const newBufferSource: AudioBufferSourceNode = ACTX.createBufferSource();
    newBufferSource.buffer = currentBuffer;
    newBufferSource.loop = true;
    newBufferSource.connect(ANALYSER);
    newBufferSource.connect(ACTX.destination);
    const safeOffset = Math.max(0, Math.min(offset, waveformDuration));
    newBufferSource.start(0, safeOffset);
    bufferSource = newBufferSource;
    pauseOffset = safeOffset;
    playStartTime = ACTX.currentTime - safeOffset;
    isPlayingBuffer = true;
  };

  const getPlaybackOffset = (): number => {
    if (!currentBuffer || waveformDuration <= 0) return 0;
    if (!isPlayingBuffer) return pauseOffset;
    const elapsed = ACTX.currentTime - playStartTime;
    const wrapped = ((elapsed % waveformDuration) + waveformDuration) % waveformDuration;
    return wrapped;
  };

  const seekToPosition = (normalizedPos: number): void => {
    if (!currentBuffer || waveformDuration <= 0) return;
    const clampedPos = Math.max(0, Math.min(1, normalizedPos));
    pauseOffset = clampedPos * waveformDuration;
    if (!paused) {
      startBufferPlayback(pauseOffset);
    }
  };

  const getPlayheadPosition = (): number => {
    if (!currentBuffer || !waveformData || waveformDuration <= 0) return 0;
    const offset = isPlayingBuffer ? (ACTX.currentTime - playStartTime) : pauseOffset;
    if (offset <= 0) return 0;
    const wrapped = ((offset % waveformDuration) + waveformDuration) % waveformDuration;
    return wrapped / waveformDuration;
  };

  const formatTime = (totalSeconds: number): string => {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return '0:00';
    }
    const rounded = Math.floor(totalSeconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  let lastCurrentTimeText = '';
  let lastTotalTimeText = '';

  const updateTrackTimeDisplay = (): void => {
    if (!trackTimeCurrent && !trackTimeTotal) return;
    const total = waveformDuration > 0 ? waveformDuration : 0;
    const current = total > 0 ? getPlaybackOffset() : 0;
    const currentText = formatTime(current);
    const totalText = formatTime(total);

    if (trackTimeCurrent && lastCurrentTimeText !== currentText) {
      trackTimeCurrent.textContent = currentText;
      lastCurrentTimeText = currentText;
    }
    if (trackTimeTotal && lastTotalTimeText !== totalText) {
      trackTimeTotal.textContent = totalText;
      lastTotalTimeText = totalText;
    }
  };

  const setStatus = (text: string): void => {
    if (statusLabel) {
      statusLabel.textContent = text;
    }
  };

  const disconnectSources = (): void => {
    stopBufferPlayback();

    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      mediaStream = null;
    }
  };

  const useMicrophone = async (): Promise<void> => {
    disconnectSources();
    waveformData = null;
    waveformWidth = 0;
    waveformDuration = 0;
    clearWaveformCache();
    currentBuffer = null;
    pauseOffset = 0;
    playStartTime = 0;

    try {
      await ACTX.resume();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false }
      });
      micSource = ACTX.createMediaStreamSource(mediaStream);
      micSource.connect(ANALYSER);
      setStatus("Source: microphone");
      closeControlPanel();
    } catch (error) {
      console.error("Failed to get microphone access:", error);
      setStatus("Microphone unavailable");
    }
  };

  const playFile = async (file: File): Promise<void> => {
    disconnectSources();

    try {
      await ACTX.resume();
      const arrayBuffer: ArrayBuffer = await file.arrayBuffer();
      const audioBuffer: AudioBuffer = await ACTX.decodeAudioData(arrayBuffer);
      currentBuffer = audioBuffer;
      setWaveformFromBuffer(audioBuffer);
      pauseOffset = 0;
      startBufferPlayback(0);
      setStatus(`File: ${file.name}`);
      closeControlPanel();
    } catch (error) {
      console.error("Failed to play file:", error);
      setStatus("File playback failed");
    }
  };

  const playFromUrl = async (url: string, label: string): Promise<void> => {
    disconnectSources();

    try {
      await ACTX.resume();
      const response: Response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer: ArrayBuffer = await response.arrayBuffer();
      const audioBuffer: AudioBuffer = await ACTX.decodeAudioData(arrayBuffer);
      currentBuffer = audioBuffer;
      setWaveformFromBuffer(audioBuffer);
      pauseOffset = 0;
      startBufferPlayback(0);
      setStatus(`File: ${label}`);
      closeControlPanel();
    } catch (error) {
      console.error("Failed to play file from URL:", error);
      setStatus("Demo playback failed");
    }
  };

  // Pause/resume functionality
  let paused: boolean = false;
  let hasAudioFile: boolean = false;

  const updatePlayPauseButton = (): void => {
    if (playPauseBtn) {
      playPauseBtn.textContent = paused ? 'Play' : 'Pause';
    }
  };

  const togglePlayPause = (): void => {
    if (!hasAudioFile) return;
    paused = !paused;
    updatePlayPauseButton();

    if (paused) {
      pauseOffset = getPlaybackOffset();
      stopBufferPlayback();
    } else {
      startBufferPlayback(pauseOffset);
    }
  };

  const enablePlayPauseBtn = (): void => {
    hasAudioFile = true;
    if (playPauseBtn) {
      playPauseBtn.disabled = false;
    }
    paused = false;
    updatePlayPauseButton();
  };

  const disablePlayPauseBtn = (): void => {
    hasAudioFile = false;
    paused = false;
    if (playPauseBtn) {
      playPauseBtn.disabled = true;
      playPauseBtn.textContent = 'Play';
    }
  };

  document.body.onkeyup = function (e: KeyboardEvent): void {
    if (e.key === " " || e.code === "Space" || e.keyCode === 32) {
      // Prevent spacebar when focused on input elements
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'BUTTON') {
        return;
      }
      togglePlayPause();
    }
  };

  playPauseBtn?.addEventListener('click', togglePlayPause);

  // Setup Three.js scene
  const width: number = window.innerWidth;
  const height: number = window.innerHeight;
  const camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(
    55,
    width / height,
    1,
    100
  );
  camera.position.set(-0.74, 8.0, 0);
  camera.lookAt(0, 0, 0);
  const defaultCameraTarget = new THREE.Vector3(0, 0, 0);
  const formatCameraPosition = (target: THREE.PerspectiveCamera): { x: number; y: number; z: number } => ({
    x: Number(target.position.x.toFixed(3)),
    y: Number(target.position.y.toFixed(3)),
    z: Number(target.position.z.toFixed(3))
  });
  const formatCameraRotation = (target: THREE.PerspectiveCamera): { x: number; y: number; z: number } => ({
    x: Math.round(target.rotation.x * RAD_TO_DEG),
    y: Math.round(target.rotation.y * RAD_TO_DEG),
    z: Math.round(target.rotation.z * RAD_TO_DEG)
  });
  const createCameraLogger = (label: string, target: THREE.PerspectiveCamera): CameraLogger => {
    const lastPosition = target.position.clone();
    const lastRotation = target.rotation.clone();
    const log = (): void => {
      lastPosition.copy(target.position);
      lastRotation.copy(target.rotation);
      console.log(`${label} position`, formatCameraPosition(target));
      console.log(`${label} rotation (deg)`, formatCameraRotation(target));
    };
    const check = (): void => {
      const positionChanged = lastPosition.distanceToSquared(target.position) > 1e-6;
      const rotationChanged = Math.abs(lastRotation.x - target.rotation.x) > 1e-6
        || Math.abs(lastRotation.y - target.rotation.y) > 1e-6
        || Math.abs(lastRotation.z - target.rotation.z) > 1e-6;
      if (positionChanged || rotationChanged) {
        log();
      }
    };
    return { log, check };
  };
  const cameraLogger = createCameraLogger('Camera1', camera);

  const scene: THREE.Scene = new THREE.Scene();

  // створюємо сітку
  // GridHelper( size, divisions, colorCenterLine, colorGrid )
  // const gridHelper = new THREE.GridHelper(10, 10);
  // scene.add(gridHelper);

  // const axesHelper = new THREE.AxesHelper(5); // довжина осей
  // scene.add(axesHelper);

  // Create geometry
  const geometry: THREE.BufferGeometry = new THREE.BufferGeometry();
  const indices: number[] = [];
  let heights: Uint8Array = new Uint8Array(nVertices);
  const scaledRow: Uint8Array = new Uint8Array(ySegments);
  let scaleMode: ScaleMode = 'mel';
  let colormapMode: ColormapMode = 'gray';

  // Log FFT Scale on initialization
  console.log(`FFT Scale: ${scaleMode.charAt(0).toUpperCase() + scaleMode.slice(1)}`);

  const nyquist: number = ACTX.sampleRate / 2;
  const LOG_SCALE_BASE = 256;

  const applyFrequencyScale = (t: number, mode: ScaleMode): number => {
    if (mode === 'linear') {
      return t;
    }
    if (mode === 'log') {
      return Math.pow(LOG_SCALE_BASE, t - 1);
    }
    const melMax = 2595 * Math.log10(1 + nyquist / 700);
    const mel = t * melMax;
    const freq = 700 * (Math.pow(10, mel / 2595) - 1);
    return clamp(freq / nyquist, 0, 1);
  };

  const buildVertices = (): number[] => {
    const verts: number[] = [];

    for (let i = 0; i < xSegments; i++) {
      const z: number = zSize * (i - (xSegments / 2)) / xSegments; // час по Z
      for (let j = 0; j < ySegments; j++) {
        const x: number = xSize * (j - (ySegments / 2)) / ySegments; // Hz по X
        const y: number = 0; // гучність буде по Y через displacement
        verts.push(x, y, z);
      }
    }
    return verts;
  };

  const buildUVs = (): number[] => {
    const uvs: number[] = [];
    for (let i = 0; i < xSegments; i++) {
      for (let j = 0; j < ySegments; j++) {
        uvs.push(j / ySegments, (i + 0.5) / xSegments);
      }
    }
    return uvs;
  };

  const buildFrequencySampleMap = (mode: ScaleMode): Float32Array => {
    const map = new Float32Array(ySegments);
    const maxIndex = frequencyBins - 1;
    for (let j = 0; j < ySegments; j++) {
      const t = j / ySegments;
      const scaled = applyFrequencyScale(t, mode);
      map[j] = clamp(scaled, 0, 1) * maxIndex;
    }
    return map;
  };

  let frequencySampleMap: Float32Array = buildFrequencySampleMap(scaleMode);

  const vertices: number[] = buildVertices();
  const uvs: number[] = buildUVs();

  // Generate indices for triangles
  for (let i = 0; i < xSegments - 1; i++) {
    for (let j = 0; j < ySegments - 1; j++) {
      const a: number = i * ySegments + (j + 1);
      const b: number = i * ySegments + j;
      const c: number = (i + 1) * ySegments + j;
      const d: number = (i + 1) * ySegments + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const displacementAttribute = new THREE.Uint8BufferAttribute(heights, 1);
  displacementAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('displacement', displacementAttribute);

  let mesh: THREE.Mesh;
  let secondaryView: SpectrogramView | null = null;
  let secondaryControls: OrbitControls | null = null;
  let secondaryCameraLogger: CameraLogger | null = null;

  // Setup color mapping
  type ColorMapColor = [number, number, number, number];

  const updateColormap = (): THREE.Vector3[] => {
    const colors = generateColormap(colormapMode, 256);
    colors[0] = [0, 0, 0, 0];

    const newLut: THREE.Vector3[] = colors.map((color: ColorMapColor) => {
      const red: number = color[0] / 255;
      const green: number = color[1] / 255;
      const blue: number = color[2] / 255;
      return new THREE.Vector3(red, green, blue);
    });
    return newLut;
  };

  let lut: THREE.Vector3[] = updateColormap();

  // Define uniforms
  const backgroundColor = new THREE.Vector3(0x17 / 255, 0x17 / 255, 0x17 / 255);
  const heightScale = xSize / 3.5;
  const uniforms: {
    vLut: { type: string; value: THREE.Vector3[] };
    uBackground: { value: THREE.Vector3 };
    uHeightScale: { value: number };
  } = {
    vLut: { type: "v3v", value: lut },
    uBackground: { value: backgroundColor },
    uHeightScale: { value: heightScale }
  };

  // Setup renderer
  const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(new THREE.Color(backgroundColor.x, backgroundColor.y, backgroundColor.z), 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;

  const container = document.getElementById('SpectrogramCamera1');
  if (!container) {
    console.error("SpectrogramCamera1 container not found");
    return;
  }
  container.appendChild(renderer.domElement);

  const onWindowResize = (): void => {
    const rect = container.getBoundingClientRect();
    const newWidth = rect.width;
    const newHeight = rect.height;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth, newHeight);
    secondaryView?.resize();

  };

  window.addEventListener('resize', onWindowResize);
  onWindowResize();

  // Setup orbit controls
  const controls: OrbitControls = new OrbitControls(camera, renderer.domElement);
  // controls.maxPolarAngle = Math.PI / 2;
  // controls.minPolarAngle = Math.PI / 2;
  // controls.minAzimuthAngle = 5 * Math.PI / 3;
  // controls.maxAzimuthAngle = -5 * Math.PI / 3;
  controls.target.copy(defaultCameraTarget);
  controls.update();
  controls.addEventListener('end', cameraLogger.log);

  // Create material and mesh
  const material: THREE.ShaderMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader
  });
  material.toneMapped = false;

  mesh = new THREE.Mesh(geometry, material);
  const rotateGroup = new THREE.Group();
  const scaleGroup = new THREE.Group();
  const translateGroup = new THREE.Group();
  const spectrogramRotation = new THREE.Euler(0, 0, 0);
  const secondaryRotation = new THREE.Euler(0, 0, 0);
  const spectrogramTranslation = new THREE.Vector3(-heightScale * 0.5 + 1.5, -4.8, 0);
  const secondaryTranslation = new THREE.Vector3(-heightScale * 0.5 + 1.5, -4.8, 0);
  // Match WebGL transform order: rotate -> scale -> translate
  rotateGroup.rotation.copy(spectrogramRotation);
  translateGroup.position.copy(spectrogramTranslation);
  rotateGroup.add(mesh);
  scaleGroup.add(rotateGroup);
  translateGroup.add(scaleGroup);
  scene.add(translateGroup);
  mesh.geometry.computeVertexNormals();

  const secondaryCameraPosition = new THREE.Vector3(-0.4, 0.0, 15.0);

  secondaryView = createSpectrogramView({
    containerId: 'SpectrogramCamera2',
    geometry,
    material,
    backgroundColor,
    heightScale,
    cameraPosition: secondaryCameraPosition,
    rotation: secondaryRotation,
    translation: secondaryTranslation
  });
  secondaryView?.resize();
  if (secondaryView) {
    secondaryCameraLogger = createCameraLogger('Camera2', secondaryView.camera);
    secondaryControls = new OrbitControls(secondaryView.camera, secondaryView.renderer.domElement);
    secondaryControls.update();
    applyCameraRotation(secondaryView.camera, secondaryControls, new THREE.Vector3(0, 0, 0));
    secondaryCameraLogger.log();
    secondaryControls.addEventListener('end', secondaryCameraLogger.log);
  }

  // Функція ease-out cubica
  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  // Отримуємо поточні кути в градусах
  const getRotationInDegrees = (): { xRot: number; yRot: number; zRot: number } => {
    const RAD_TO_DEG_LOCAL = 180 / Math.PI;
    return {
      xRot: Math.round(rotateGroup.rotation.x * RAD_TO_DEG_LOCAL),
      yRot: Math.round(rotateGroup.rotation.y * RAD_TO_DEG_LOCAL),
      zRot: Math.round(rotateGroup.rotation.z * RAD_TO_DEG_LOCAL)
    };
  };

  // Логування поточних кутів при ініціалізації
  console.log('now', getRotationInDegrees());

  // Анімована функція обертання спектрограми
  const rotateMeshByDegrees = (axis: 'x' | 'y' | 'z', degrees: number): void => {
    const startRot = getRotationInDegrees();
    const radians: number = degrees * Math.PI / 180;
    const duration: number = 1024; // мс
    const startTime: number = Date.now();

    // Отримуємо початкові кути обертання
    const startRotation = {
      x: rotateGroup.rotation.x,
      y: rotateGroup.rotation.y,
      z: rotateGroup.rotation.z
    };

    // Розраховуємо кінцеві кути обертання
    const endRotation = {
      x: rotateGroup.rotation.x,
      y: rotateGroup.rotation.y,
      z: rotateGroup.rotation.z
    };
    endRotation[axis] += radians;

    const endRot = getRotationInDegrees();
    endRot[axis === 'x' ? 'xRot' : axis === 'y' ? 'yRot' : 'zRot'] += degrees;

    // Логування переходу
    const axisName = axis === 'x' ? 'X' : axis === 'y' ? 'Y' : 'Z';
    console.log(`Rotating ${axisName}: from`, startRot, `to`, endRot);

    // Анімаційний цикл
    const animateFrame = (): void => {
      const now: number = Date.now();
      let elapsed: number = now - startTime;

      if (elapsed >= duration) {
        // Анімація закінчена
        rotateGroup.rotation.x = endRotation.x;
        rotateGroup.rotation.y = endRotation.y;
        rotateGroup.rotation.z = endRotation.z;
        return;
      }

      // Нормалізуємо час (0 до 1)
      const t: number = elapsed / duration;
      // Застосовуємо ease-out кубічну криву
      const eased: number = easeOutCubic(t);

      // Інтерполюємо кути обертання
      rotateGroup.rotation.x = startRotation.x + (endRotation.x - startRotation.x) * eased;
      rotateGroup.rotation.y = startRotation.y + (endRotation.y - startRotation.y) * eased;
      rotateGroup.rotation.z = startRotation.z + (endRotation.z - startRotation.z) * eased;

      // Продовжуємо анімацію
      requestAnimationFrame(animateFrame);
    };

  // Запускаємо анімацію
  animateFrame();
};

  function applyCameraRotation(
    targetCamera: THREE.PerspectiveCamera,
    targetControls: OrbitControls | null,
    targetRotation: THREE.Vector3
  ): void {
    const currentTarget = targetControls?.target ?? new THREE.Vector3(0, 0, 0);
    const radius = targetCamera.position.distanceTo(currentTarget);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (targetRotation.x * Math.PI) / 180,
      (targetRotation.y * Math.PI) / 180,
      (targetRotation.z * Math.PI) / 180
    ));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const target = targetCamera.position.clone().add(forward.multiplyScalar(radius));
    targetCamera.up.copy(up);
    targetCamera.lookAt(target);
    if (targetControls) {
      targetControls.target.copy(target);
      targetControls.update();
    }
  }

  const animateCameraRotation = (
    targetCamera: THREE.PerspectiveCamera,
    targetControls: OrbitControls | null,
    targetRotation: THREE.Vector3
  ): void => {
    const target = targetControls?.target ?? new THREE.Vector3(0, 0, 0);
    const radius = targetCamera.position.distanceTo(target);
    const startQuat = targetCamera.quaternion.clone();
    const endQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (targetRotation.x * Math.PI) / 180,
      (targetRotation.y * Math.PI) / 180,
      (targetRotation.z * Math.PI) / 180
    ));
    const duration = 1024;
    const startTime = Date.now();

    const animateFrame = (): void => {
      const now = Date.now();
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);

      const currentQuat = startQuat.clone().slerp(endQuat, eased);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentQuat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(currentQuat);
      const position = target.clone().sub(forward.multiplyScalar(radius));
      targetCamera.position.copy(position);
      targetCamera.up.copy(up);
      targetCamera.lookAt(target);
      targetControls?.update();

      if (elapsed < duration) {
        requestAnimationFrame(animateFrame);
      }
    };

    animateFrame();
  };

  applyCameraRotation(camera, controls, new THREE.Vector3(-90, 0, -90));
  cameraLogger.log();

  const updateScale = (mode: ScaleMode): void => {
    const oldMode = scaleMode;
    scaleMode = mode;
    if (oldMode !== mode) {
      console.log(`FFT Scale changed: from ${oldMode.charAt(0).toUpperCase() + oldMode.slice(1)} to ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    }
    frequencySampleMap = buildFrequencySampleMap(scaleMode);
    heights = new Uint8Array(nVertices);
    const attr = mesh.geometry.getAttribute('displacement') as THREE.BufferAttribute;
    attr.array = heights;
    attr.needsUpdate = true;
  };

  // Active state management for Scale buttons
  const scaleButtons = [linearButton, logButton, melButton];
  const setActiveScaleButton = (activeBtn: HTMLButtonElement | null): void => {
    scaleButtons.forEach(btn => {
      if (btn) {
        btn.classList.remove('btn-active');
      }
    });
    activeBtn?.classList.add('btn-active');
  };

  // Active state management for Colormap buttons
  const colormapButtons = [grayButton, infernoButton, rainbowButton];
  const setActiveColormapButton = (activeBtn: HTMLButtonElement | null): void => {
    colormapButtons.forEach(btn => {
      if (btn) {
        btn.classList.remove('btn-active');
      }
    });
    activeBtn?.classList.add('btn-active');
  };

  // Set initial active states (Mel is default scale, Gray is default colormap)
  setActiveScaleButton(melButton);
  setActiveColormapButton(grayButton);

  // Active state management for Demo buttons
  const demoButtons = [demoOnsetButton, demoButton, demoGazMaskButton, demoGazMaskButton2];
  const setActiveDemoButton = (activeBtn: HTMLButtonElement | null): void => {
    demoButtons.forEach(btn => {
      if (btn) {
        btn.classList.remove('btn-active');
      }
    });
    activeBtn?.classList.add('btn-active');
  };

  // Active state management for Preset buttons
  const presetButtons = [
    preset90_90Button,
    preset000Button,
    preset45_45Button,
    preset0_180Button,
    preset45_180Button,
    preset90_180Button
  ];
  const setActivePresetButton = (activeBtn: HTMLButtonElement | null): void => {
    presetButtons.forEach(btn => {
      if (btn) {
        btn.classList.remove('btn-active');
      }
    });
    activeBtn?.classList.add('btn-active');
  };

  // Active state management for Source (Microphone) button
  const setMicActive = (active: boolean): void => {
    if (micButton) {
      if (active) {
        micButton.classList.add('btn-active');
      } else {
        micButton.classList.remove('btn-active');
      }
    }
  };

  // Mic is initially inactive
  setMicActive(false);
  setStatus("Select a source");

  // Dropzone click handler
  dropzone?.addEventListener('click', () => {
    dropzoneInput?.click();
  });

  // Dropzone file input handler
  dropzoneInput?.addEventListener('change', async (event: Event): Promise<void> => {
    const target = event.target as HTMLInputElement;
    const file: File | undefined = target.files?.[0];
    if (!file) {
      return;
    }
    await playFile(file);
    enablePlayPauseBtn();
    setMicActive(false);
  });

  // Drag and drop handlers
  dropzone?.addEventListener('dragover', (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (dropzone) {
      dropzone.classList.add('border-gray-300', 'bg-white/10');
      dropzone.classList.remove('border-gray-500');
    }
  });

  dropzone?.addEventListener('dragleave', (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (dropzone) {
      dropzone.classList.remove('border-gray-300', 'bg-white/10');
      dropzone.classList.add('border-gray-500');
    }
  });

  dropzone?.addEventListener('drop', async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (dropzone) {
      dropzone.classList.remove('border-gray-300', 'bg-white/10');
      dropzone.classList.add('border-gray-500');
    }
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      await playFile(file);
      enablePlayPauseBtn();
      setMicActive(false);
    }
  });

  micButton?.addEventListener('click', () => {
    // Toggle microphone on/off
    if (micButton.classList.contains('btn-active')) {
      disconnectSources();
      heights = new Uint8Array(nVertices);
      mesh.geometry.setAttribute('displacement', new THREE.Uint8BufferAttribute(heights, 1));
      setStatus("Select a source");
      setMicActive(false);
    } else {
      void useMicrophone();
      setMicActive(true);
      disablePlayPauseBtn();
    }
  });

  demoOnsetButton?.addEventListener('click', () => {
    void playFromUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/SENCD006-01_Irukanji_-_Onset_(In)_(72)-Reel_v1.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9TRU5DRDAwNi0wMV9JcnVrYW5qaV8tX09uc2V0XyhJbilfKDcyKS1SZWVsX3YxLm1wMyIsImlhdCI6MTc2ODA3MTk0NSwiZXhwIjoxNzk5NjA3OTQ1fQ.OgyQF8iUUYpAK3vK38H8CVltYGaskn7ecphcoRGPWa0', 'Irukanji - Onset (In)');
    setMicActive(false);
    enablePlayPauseBtn();
    setActiveDemoButton(demoOnsetButton);
  });

  demoButton?.addEventListener('click', () => {
    void playFromUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/MKRL019-04_Irukanji_-_Percentage_Of_Yes-ness_(149bpm)-Reel_v2.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9NS1JMMDE5LTA0X0lydWthbmppXy1fUGVyY2VudGFnZV9PZl9ZZXMtbmVzc18oMTQ5YnBtKS1SZWVsX3YyLm1wMyIsImlhdCI6MTc2ODA3MTkwMCwiZXhwIjoxNzk5NjA3OTAwfQ.lqJwqNqbc--WJMiswXXJYFI2OpaumpNrEw7tgwpNw2o', 'Irukanji - Percentage Of Yes-ness');
    setMicActive(false);
    enablePlayPauseBtn();
    setActiveDemoButton(demoButton);
  });

  demoGazMaskButton?.addEventListener('click', () => {
    void playFromUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/sentimony/SENCD098-01_Gaz%20Mask_-_Sic_Mundus_Creatus_Est_(133bpm)-Reel_v1.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9zZW50aW1vbnkvU0VOQ0QwOTgtMDFfR2F6IE1hc2tfLV9TaWNfTXVuZHVzX0NyZWF0dXNfRXN0XygxMzNicG0pLVJlZWxfdjEubXAzIiwiaWF0IjoxNzY4MDcyMDIxLCJleHAiOjE3OTk2MDgwMjF9.PCioHd4Xz63dzj_ujm9DczOHrNFmfvms8ML0FlJK3hA', 'Gaz Mask - Sic Mundus Creatus Est');
    setMicActive(false);
    enablePlayPauseBtn();
    setActiveDemoButton(demoGazMaskButton);
  });

  demoGazMaskButton2?.addEventListener('click', () => {
    void playFromUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/sentimony/SENCD098-04_Gaz_Mask_-_The_Breath_Of_The_Elder_(138bpm)-Reel_v1.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9zZW50aW1vbnkvU0VOQ0QwOTgtMDRfR2F6X01hc2tfLV9UaGVfQnJlYXRoX09mX1RoZV9FbGRlcl8oMTM4YnBtKS1SZWVsX3YxLm1wMyIsImlhdCI6MTc2ODA3MjA4NywiZXhwIjoxNzk5NjA4MDg3fQ.anbSAf5XrFtKZvM-dpxJIO_KDB31Tl9pyByLmJg29Nk', 'Gaz Mask - The Breath Of The Elder');
    setMicActive(false);
    enablePlayPauseBtn();
    setActiveDemoButton(demoGazMaskButton2);
  });

  stopButton?.addEventListener('click', () => {
    disconnectSources();
    heights = new Uint8Array(nVertices);
    mesh.geometry.setAttribute('displacement', new THREE.Uint8BufferAttribute(heights, 1));
    setStatus("Stopped");
    pauseOffset = 0;
    playStartTime = 0;
    disablePlayPauseBtn();
    setMicActive(false);
  });

  linearButton?.addEventListener('click', () => {
    updateScale('linear');
    setActiveScaleButton(linearButton);
  });
  logButton?.addEventListener('click', () => {
    updateScale('log');
    setActiveScaleButton(logButton);
  });
  melButton?.addEventListener('click', () => {
    updateScale('mel');
    setActiveScaleButton(melButton);
  });

  const updateColormapMode = (mode: ColormapMode): void => {
    colormapMode = mode;
    lut = updateColormap();
    material.uniforms.vLut.value = lut;
  };

  grayButton?.addEventListener('click', () => {
    updateColormapMode('gray');
    setActiveColormapButton(grayButton);
  });
  infernoButton?.addEventListener('click', () => {
    updateColormapMode('inferno');
    setActiveColormapButton(infernoButton);
  });
  rainbowButton?.addEventListener('click', () => {
    updateColormapMode('rainbow');
    setActiveColormapButton(rainbowButton);
  });

  // Функція для переходу на предустановлені кути
  const setRotationToPreset = (targetX: number, targetY: number, targetZ: number): void => {
    const startRot = getRotationInDegrees();
    const targetRot = { xRot: targetX, yRot: targetY, zRot: targetZ };

    console.log(`Rotating to preset: from`, startRot, `to`, targetRot);

    const startRotation = {
      x: rotateGroup.rotation.x,
      y: rotateGroup.rotation.y,
      z: rotateGroup.rotation.z
    };

    const endRotation = {
      x: (targetX * Math.PI) / 180,
      y: (targetY * Math.PI) / 180,
      z: (targetZ * Math.PI) / 180
    };

    const duration: number = 1024; // мс
    const startTime: number = Date.now();

    // Анімаційний цикл
    const animateFrame = (): void => {
      const now: number = Date.now();
      let elapsed: number = now - startTime;

      if (elapsed >= duration) {
        // Анімація закінчена
        rotateGroup.rotation.x = endRotation.x;
        rotateGroup.rotation.y = endRotation.y;
        rotateGroup.rotation.z = endRotation.z;
        return;
      }

      // Нормалізуємо час (0 до 1)
      const t: number = elapsed / duration;
      // Застосовуємо ease-out кубічну криву
      const eased: number = easeOutCubic(t);

      // Інтерполюємо кути обертання
      rotateGroup.rotation.x = startRotation.x + (endRotation.x - startRotation.x) * eased;
      rotateGroup.rotation.y = startRotation.y + (endRotation.y - startRotation.y) * eased;
      rotateGroup.rotation.z = startRotation.z + (endRotation.z - startRotation.z) * eased;

      // Продовжуємо анімацію
      requestAnimationFrame(animateFrame);
    };

    // Запускаємо анімацію
    animateFrame();
  };

  angleRotateXButton?.addEventListener('click', () => rotateMeshByDegrees('x', 45));
  angleRotateYButton?.addEventListener('click', () => rotateMeshByDegrees('y', 45));
  angleRotateZButton?.addEventListener('click', () => rotateMeshByDegrees('z', 45));
  angleRotateXNegButton?.addEventListener('click', () => rotateMeshByDegrees('x', -45));
  angleRotateYNegButton?.addEventListener('click', () => rotateMeshByDegrees('y', -45));
  angleRotateZNegButton?.addEventListener('click', () => rotateMeshByDegrees('z', -45));

  camera1Rotation000Button?.addEventListener('click', () => {
    console.log('Camera1 Rotation Preset: 0, 0, 0');
    animateCameraRotation(camera, controls, new THREE.Vector3(0, 0, 0));
  });
  camera1RotationNeg90Button?.addEventListener('click', () => {
    console.log('Camera1 Rotation Preset: -90, 0, -90');
    animateCameraRotation(camera, controls, new THREE.Vector3(-90, 0, -90));
  });
  camera2Rotation000Button?.addEventListener('click', () => {
    if (!secondaryView) return;
    console.log('Camera2 Rotation Preset: 0, 0, 0');
    animateCameraRotation(secondaryView.camera, secondaryControls, new THREE.Vector3(0, 0, 0));
  });
  camera2RotationNeg90Button?.addEventListener('click', () => {
    if (!secondaryView) return;
    console.log('Camera2 Rotation Preset: -90, 0, -90');
    animateCameraRotation(secondaryView.camera, secondaryControls, new THREE.Vector3(-90, 0, -90));
  });

  // Функція для дзеркального відображення (flip)
  const updateFlipButtonsActive = (): void => {
    flipXButton?.classList.toggle('btn-active', scaleGroup.scale.x < 0);
    flipYButton?.classList.toggle('btn-active', scaleGroup.scale.y < 0);
    flipZButton?.classList.toggle('btn-active', scaleGroup.scale.z < 0);
  };

  const flipMesh = (axis: 'x' | 'y' | 'z'): void => {
    const currentRot = getRotationInDegrees();
    console.log(`Flipping ${axis.toUpperCase()}: before`, currentRot);

    if (axis === 'x') {
      scaleGroup.scale.x *= -1;
    } else if (axis === 'y') {
      scaleGroup.scale.y *= -1;
    } else if (axis === 'z') {
      scaleGroup.scale.z *= -1;
    }

    const afterRot = getRotationInDegrees();
    console.log(`Flipping ${axis.toUpperCase()}: after`, afterRot);
    updateFlipButtonsActive();
  };

  // Preset buttons
  preset000Button?.addEventListener('click', () => {
    setRotationToPreset(0, 0, 0);
    setActivePresetButton(preset000Button);
  });
  preset90_90Button?.addEventListener('click', () => {
    setRotationToPreset(90, 90, 0);
    setActivePresetButton(preset90_90Button);
  });
  preset45_45Button?.addEventListener('click', () => {
    setRotationToPreset(45, 45, 0);
    setActivePresetButton(preset45_45Button);
  });
  preset0_180Button?.addEventListener('click', () => {
    setRotationToPreset(0, 180, 0);
    setActivePresetButton(preset0_180Button);
  });
  preset45_180Button?.addEventListener('click', () => {
    setRotationToPreset(45, 180, 0);
    setActivePresetButton(preset45_180Button);
  });
  preset90_180Button?.addEventListener('click', () => {
    setRotationToPreset(90, 180, 0);
    setActivePresetButton(preset90_180Button);
  });

  setActivePresetButton(preset000Button);
  updateFlipButtonsActive();

  // Flip buttons
  flipXButton?.addEventListener('click', () => flipMesh('x'));
  flipYButton?.addEventListener('click', () => flipMesh('y'));
  flipZButton?.addEventListener('click', () => flipMesh('z'));

  // Control panel toggle
  closePanelButton?.addEventListener('click', () => {
    closeControlPanel();
  });

  menuButton?.addEventListener('click', () => {
    if (controlPanel) {
      controlPanel.style.display = 'block';
    }
    if (menuButton) {
      menuButton.style.display = 'none';
    }
  });

  // Close control panel when clicking outside of it
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const isClickInsidePanel = controlPanel?.contains(target);
    const isClickOnMenuButton = menuButton?.contains(target);
    const isPanelVisible = controlPanel && (controlPanel.style.display === 'block' || controlPanel.style.display === '');

    if (!isClickInsidePanel && !isClickOnMenuButton && isPanelVisible) {
      closeControlPanel();
    }
  });

  const setArtworkVisibility = (visible: boolean): void => {
    if (artworkBlock) {
      artworkBlock.style.display = visible ? 'flex' : 'none';
    }
    if (eyeOpen && eyeClosed && artworkToggle) {
      eyeOpen.style.display = visible ? 'block' : 'none';
      eyeClosed.style.display = visible ? 'none' : 'block';
      if (visible) {
        artworkToggle.classList.add('btn-active');
      } else {
        artworkToggle.classList.remove('btn-active');
      }
    }
  };

  // Initialize artwork as enabled (visible by default)
  setArtworkVisibility(true);

  // Artwork visibility toggle
  artworkToggle?.addEventListener('click', () => {
    const isVisible = artworkBlock
      ? artworkBlock.style.display !== 'none'
      : artworkToggle?.classList.contains('btn-active') ?? true;
    setArtworkVisibility(!isVisible);
  });

  // Create axes helper with labels
  let cameraAxesGroup: THREE.Group | null = null;
  let cameraAxesGroup2: THREE.Group | null = null;

  const createTextLabel = (text: string, color: number, fontSize: number): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 128);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, color: color });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 4, 1);
    return sprite;
  };

  const createAxesWithLabels = (
    axisLength: number = 30,
    labelFontSize: number = 32,
    labelOffset: number = 4
  ): THREE.Group => {
    const group = new THREE.Group();

    // X axis (red)
    const xGeometry = new THREE.BufferGeometry();
    xGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, axisLength, 0, 0]), 3));
    const xMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
    const xLine = new THREE.Line(xGeometry, xMaterial);
    group.add(xLine);

    // Y axis (green)
    const yGeometry = new THREE.BufferGeometry();
    yGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, axisLength, 0]), 3));
    const yMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });
    const yLine = new THREE.Line(yGeometry, yMaterial);
    group.add(yLine);

    // Z axis (blue)
    const zGeometry = new THREE.BufferGeometry();
    zGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, axisLength]), 3));
    const zMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 3 });
    const zLine = new THREE.Line(zGeometry, zMaterial);
    group.add(zLine);

    // X label (red)
    const xLabel = createTextLabel('X', 0xff0000, labelFontSize);
    xLabel.position.set(axisLength + labelOffset, 0, 0);
    group.add(xLabel);

    // Y label (green)
    const yLabel = createTextLabel('Y', 0x00ff00, labelFontSize);
    yLabel.position.set(0, axisLength + labelOffset, 0);
    group.add(yLabel);

    // Z label (blue)
    const zLabel = createTextLabel('Z', 0x0000ff, labelFontSize);
    zLabel.position.set(0, 0, axisLength + labelOffset);
    group.add(zLabel);

    return group;
  };

  const axesLength = 8;
  const axesFontSize = 32;
  const axesLabelOffset = 1;
  type GridAxis = 'x' | 'y' | 'z';
  const gridSize = 22;
  const gridStep = 2;
  const gridDivisions = Math.round(gridSize / gridStep);
  const gridHelpers: Record<GridAxis, { main: THREE.GridHelper | null; secondary: THREE.GridHelper | null }> = {
    x: { main: null, secondary: null },
    y: { main: null, secondary: null },
    z: { main: null, secondary: null }
  };

  const createGridHelper = (axis: GridAxis): THREE.GridHelper => {
    const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x3a3a3a, 0x262626);
    if (axis === 'x') {
      grid.rotation.z = Math.PI / 2;
    } else if (axis === 'z') {
      grid.rotation.x = Math.PI / 2;
    }
    return grid;
  };

  const setGridButtonActive = (axis: GridAxis, active: boolean): void => {
    const button = axis === 'x' ? gridXButton : axis === 'y' ? gridYButton : gridZButton;
    button?.classList.toggle('btn-active', active);
  };

  const setGridVisibility = (axis: GridAxis, visible: boolean): void => {
    const grids = gridHelpers[axis];
    if (visible) {
      if (!grids.main) {
        grids.main = createGridHelper(axis);
        scene.add(grids.main);
      }
      if (secondaryView && !grids.secondary) {
        grids.secondary = createGridHelper(axis);
        secondaryView.scene.add(grids.secondary);
      }
    } else {
      if (grids.main) {
        scene.remove(grids.main);
        grids.main = null;
      }
      if (secondaryView && grids.secondary) {
        secondaryView.scene.remove(grids.secondary);
        grids.secondary = null;
      }
    }
    setGridButtonActive(axis, visible);
  };

  const setCameraAxesVisibility = (visible: boolean): void => {
    if (visible && !cameraAxesGroup) {
      cameraAxesGroup = createAxesWithLabels(axesLength, axesFontSize, axesLabelOffset);
      scene.add(cameraAxesGroup);
      if (cameraAxesToggle) {
        cameraAxesToggle.classList.add('btn-active');
      }
      if (secondaryView && !cameraAxesGroup2) {
        cameraAxesGroup2 = createAxesWithLabels(axesLength, axesFontSize, axesLabelOffset);
        secondaryView.scene.add(cameraAxesGroup2);
      }
    } else if (!visible && cameraAxesGroup) {
      scene.remove(cameraAxesGroup);
      cameraAxesGroup = null;
      if (cameraAxesToggle) {
        cameraAxesToggle.classList.remove('btn-active');
      }
      if (secondaryView && cameraAxesGroup2) {
        secondaryView.scene.remove(cameraAxesGroup2);
        cameraAxesGroup2 = null;
      }
    }
  };

  // Camera axes toggle
  cameraAxesToggle?.addEventListener('click', () => {
    setCameraAxesVisibility(cameraAxesGroup === null);
  });

  gridXButton?.addEventListener('click', () => {
    setGridVisibility('x', gridHelpers.x.main === null);
  });
  gridYButton?.addEventListener('click', () => {
    setGridVisibility('y', gridHelpers.y.main === null);
  });
  gridZButton?.addEventListener('click', () => {
    setGridVisibility('z', gridHelpers.z.main === null);
  });


  // Animation loop
  const animate = function (): void {
    requestAnimationFrame(animate);
    controls.update();
    secondaryControls?.update();
    render();
  };

  const render = function (): void {
    if (!paused) {
      updateGeometry();
    } else {
      updateWaveformRendering();
    }
    renderer.clear();
    renderer.render(scene, camera);
    secondaryView?.render();
  };

  // Setup waveform canvas
  const waveformCanvas = document.getElementById('waveform') as HTMLCanvasElement | null;
  const waveformCtx = waveformCanvas?.getContext('2d');

  const resizeWaveformCanvas = (): void => {
    if (waveformCanvas) {
      const rect = waveformCanvas.getBoundingClientRect();
      waveformCanvas.width = rect.width;
      waveformCanvas.height = rect.height;
      invalidateWaveformCache();
    }
  };

  resizeWaveformCanvas();
  window.addEventListener('resize', resizeWaveformCanvas);
  waveformCanvas?.addEventListener('click', (event: MouseEvent) => {
    if (!waveformCanvas || !currentBuffer || waveformDuration <= 0) return;
    const rect = waveformCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const normalizedPos = x / rect.width;
    seekToPosition(normalizedPos);
  });

  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
      : { r: 0, g: 0, b: 0 };
  };

  const waveformPalette = {
    wave: hexToRgb('#404040'),
    progress: hexToRgb('#a3a3a3'),
    playhead: hexToRgb('#ffffff'),
    background: hexToRgb('#171717')
  };

  const waveformBackgroundStyle = `rgb(${waveformPalette.background.r}, ${waveformPalette.background.g}, ${waveformPalette.background.b})`;

  const buildWaveformCache = (width: number, height: number): void => {
    if (!waveformData || waveformWidth <= 0 || width <= 0 || height <= 0) {
      clearWaveformCache();
      return;
    }

    const baseCanvas = document.createElement('canvas');
    const progressCanvas = document.createElement('canvas');
    const playheadCanvas = document.createElement('canvas');
    baseCanvas.width = width;
    baseCanvas.height = height;
    progressCanvas.width = width;
    progressCanvas.height = height;
    playheadCanvas.width = width;
    playheadCanvas.height = height;

    const baseCtx = baseCanvas.getContext('2d');
    const progressCtx = progressCanvas.getContext('2d');
    const playheadCtx = playheadCanvas.getContext('2d');
    if (!baseCtx || !progressCtx || !playheadCtx) {
      clearWaveformCache();
      return;
    }

    const baseImage = baseCtx.createImageData(width, height);
    const progressImage = progressCtx.createImageData(width, height);
    const playheadImage = playheadCtx.createImageData(width, height);
    const baseData = baseImage.data;
    const progressData = progressImage.data;
    const playheadData = playheadImage.data;

    const baseAlpha = Math.round(255 * 0.7);
    const progressAlpha = Math.round(255 * 0.9);
    const playheadAlpha = 255;

    for (let pixelX = 0; pixelX < width; pixelX++) {
      const normX = pixelX / width;
      const dataPos = normX * (waveformWidth - 1);
      const dataIndex = Math.floor(dataPos);
      const dataIndexNext = Math.min(dataIndex + 1, waveformWidth - 1);
      const fracPart = dataPos - dataIndex;

      const minAmp1 = waveformData[dataIndex * 2];
      const maxAmp1 = waveformData[dataIndex * 2 + 1];
      const minAmp2 = waveformData[dataIndexNext * 2];
      const maxAmp2 = waveformData[dataIndexNext * 2 + 1];

      const minAmp = minAmp1 + (minAmp2 - minAmp1) * fracPart;
      const maxAmp = maxAmp1 + (maxAmp2 - maxAmp1) * fracPart;

      for (let pixelY = 0; pixelY < height; pixelY++) {
        const normY = (pixelY / height) * 2.0 - 1.0;
        if (normY < minAmp || normY > maxAmp) {
          continue;
        }

        const pixelIndex = (pixelY * width + pixelX) * 4;
        baseData[pixelIndex] = waveformPalette.wave.r;
        baseData[pixelIndex + 1] = waveformPalette.wave.g;
        baseData[pixelIndex + 2] = waveformPalette.wave.b;
        baseData[pixelIndex + 3] = baseAlpha;

        progressData[pixelIndex] = waveformPalette.progress.r;
        progressData[pixelIndex + 1] = waveformPalette.progress.g;
        progressData[pixelIndex + 2] = waveformPalette.progress.b;
        progressData[pixelIndex + 3] = progressAlpha;

        playheadData[pixelIndex] = waveformPalette.playhead.r;
        playheadData[pixelIndex + 1] = waveformPalette.playhead.g;
        playheadData[pixelIndex + 2] = waveformPalette.playhead.b;
        playheadData[pixelIndex + 3] = playheadAlpha;
      }
    }

    baseCtx.putImageData(baseImage, 0, 0);
    progressCtx.putImageData(progressImage, 0, 0);
    playheadCtx.putImageData(playheadImage, 0, 0);

    waveformCache = {
      base: baseCanvas,
      progress: progressCanvas,
      playhead: playheadCanvas,
      width,
      height
    };
    waveformCacheDirty = false;
  };

  const updateWaveformRendering = (): void => {
    updateTrackTimeDisplay();
    if (!waveformCanvas || !waveformCtx) return;

    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    if (waveformData && waveformWidth > 0) {
      if (
        waveformCacheDirty ||
        !waveformCache ||
        waveformCache.width !== width ||
        waveformCache.height !== height
      ) {
        buildWaveformCache(width, height);
      }

      if (waveformCache) {
        const playheadPos = getPlayheadPosition();
        const playedWidth = Math.min(width, Math.floor(width * playheadPos) + 1);
        const unplayedWidth = width - playedWidth;

        waveformCtx.fillStyle = waveformBackgroundStyle;
        waveformCtx.fillRect(0, 0, width, height);

        if (unplayedWidth > 0) {
          waveformCtx.drawImage(
            waveformCache.base,
            playedWidth,
            0,
            unplayedWidth,
            height,
            playedWidth,
            0,
            unplayedWidth,
            height
          );
        }

        if (playedWidth > 0) {
          waveformCtx.drawImage(
            waveformCache.progress,
            0,
            0,
            playedWidth,
            height,
            0,
            0,
            playedWidth,
            height
          );
        }

        const playheadWidth = Math.max(1, Math.ceil(width * 0.002));
        const playheadCenter = Math.round(width * playheadPos);
        const playheadX = Math.max(0, Math.min(width - playheadWidth, playheadCenter - Math.floor(playheadWidth / 2)));
        waveformCtx.drawImage(
          waveformCache.playhead,
          playheadX,
          0,
          playheadWidth,
          height,
          playheadX,
          0,
          playheadWidth,
          height
        );
        return;
      }
    }

    waveformCtx.fillStyle = waveformBackgroundStyle;
    waveformCtx.fillRect(0, 0, width, height);

    const waveformBuffer = new Uint8Array(ANALYSER.frequencyBinCount);
    ANALYSER.getByteTimeDomainData(waveformBuffer);
    const samplesPerPixel = waveformBuffer.length / Math.max(1, width);

    waveformCtx.strokeStyle = '#404040';
    waveformCtx.lineWidth = 1;
    waveformCtx.beginPath();

    for (let pixelX = 0; pixelX < width; pixelX++) {
      let start = Math.floor(pixelX * samplesPerPixel);
      let end = Math.floor((pixelX + 1) * samplesPerPixel);
      if (end <= start) {
        end = start + 1;
      }
      start = Math.min(start, waveformBuffer.length - 1);
      end = Math.min(end, waveformBuffer.length);
      let min = 255;
      let max = 0;

      for (let i = start; i < end; i++) {
        const value = waveformBuffer[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }

      const minNorm = (min / 255) * height;
      const maxNorm = (max / 255) * height;
      waveformCtx.moveTo(pixelX + 0.5, minNorm);
      waveformCtx.lineTo(pixelX + 0.5, maxNorm);
    }

    waveformCtx.stroke();
  };

  // Update geometry with new audio data
  const updateGeometry = function (): void {
    const audioData = new Uint8Array(frequencyBins);
    ANALYSER.getByteFrequencyData(audioData);
    const rowLength: number = ySegments;
    const lastRowStart: number = nVertices - rowLength;

    for (let j = 0; j < ySegments; j++) {
      const samplePos = frequencySampleMap[j];
      const index0 = Math.floor(samplePos);
      const index1 = Math.min(index0 + 1, frequencyBins - 1);
      const frac = samplePos - index0;
      const value = audioData[index0] + (audioData[index1] - audioData[index0]) * frac;
      scaledRow[j] = Math.round(value);
    }

    heights.copyWithin(0, rowLength, nVertices);
    heights.set(scaledRow, lastRowStart);

    const attr = mesh.geometry.getAttribute('displacement') as THREE.BufferAttribute;
    attr.array = heights;
    attr.needsUpdate = true;

    // Update waveform
    updateWaveformRendering();
  };

  // Start animation
  animate();
};

// Initialize the application
init();
