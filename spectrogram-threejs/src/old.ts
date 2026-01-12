import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import colormap from 'colormap';

// Constants
let frequencySamples: number = 2048; // 1024 — кількість бінів FFT, що визначає вертикальну роздільність.
let timeSamples: number = 512; // 800 — кількість часових зрізів по горизонталі.
let nVertices: number = (frequencySamples + 1) * (timeSamples + 1); // 821025 — загальна кількість вершин сітки (точок).
let xSegments: number = timeSamples; // 800 — сегментів по осі X (рівно timeSamples).
let ySegments: number = frequencySamples; // 1024 — сегментів по осі Y (рівно frequencySamples).
let xSize: number = 20; // 20 — ширина спектрограми по осі X (Hz)
let ySize: number = 20; // 20 — висота по осі Y (гучність)
let zSize: number = 20; // 40 — довжина по осі Z (час)
const RAD_TO_DEG: number = 180 / Math.PI; // 57.29577951308232 — коефіцієнт перетворення радіанів у градуси.
type ScaleMode = 'linear' | 'log' | 'mel'; // Можливі режимі масштабування спектрограми.
type ColormapMode = 'gray' | 'inferno' | 'rainbow'; // Доступні кольорові мапи.

/**
 * Initialize and start the application
 */
/**
 * Generate a grayscale colormap: white (full alpha) for loud, black (zero alpha) for quiet
 */
const generateGrayColormap = (nshades: number): [number, number, number, number][] => {
  const colors: [number, number, number, number][] = [];
  for (let i = 0; i < nshades; i++) {
    const value = i / (nshades - 1);
    const gray = Math.round(255 * value);
    const alpha = value;
    colors.push([gray, gray, gray, alpha]);
  }
  return colors;
};

/**
 * Generate colormap colors from colormap library or custom functions
 */
const generateColormap = (mode: ColormapMode, nshades: number): [number, number, number, number][] => {
  if (mode === 'gray') {
    return generateGrayColormap(nshades);
  } else if (mode === 'inferno') {
    return colormap({
      colormap: 'inferno',
      nshades: nshades,
      format: 'rgba',
      alpha: 1
    });
  } else if (mode === 'rainbow') {
    return colormap({
      colormap: 'rainbow',
      nshades: nshades,
      format: 'rgba',
      alpha: 1
    });
  }
  // Default to inferno
  return colormap({
    colormap: 'inferno',
    nshades: nshades,
    format: 'rgba',
    alpha: 1
  });
};

const init = async function(): Promise<void> {

  const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
  const micButton = document.getElementById('mic-button') as HTMLButtonElement | null;
  const demoButton = document.getElementById('demo-button') as HTMLButtonElement | null;
  const demoGazMaskButton = document.getElementById('demo-gazmask-button') as HTMLButtonElement | null;
  const stopButton = document.getElementById('stop-button') as HTMLButtonElement | null;
  const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement | null;
  const linearButton = document.getElementById('scale-linear') as HTMLButtonElement | null;
  const logButton = document.getElementById('scale-log') as HTMLButtonElement | null;
  const melButton = document.getElementById('scale-mel') as HTMLButtonElement | null;
  const grayButton = document.getElementById('colormap-gray') as HTMLButtonElement | null;
  const infernoButton = document.getElementById('colormap-inferno') as HTMLButtonElement | null;
  const rainbowButton = document.getElementById('colormap-rainbow') as HTMLButtonElement | null;
  const freqBinsIncreaseButton = document.getElementById('freq-bins-increase') as HTMLButtonElement | null;
  const freqBinsDecreaseButton = document.getElementById('freq-bins-decrease') as HTMLButtonElement | null;
  const closePanelButton = document.getElementById('close-panel') as HTMLButtonElement | null;
  const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
  const controlPanel = document.getElementById('controlPanel');
  const artworkToggle = document.getElementById('artwork-toggle') as HTMLButtonElement | null;
  const artworkBlock = document.getElementById('Artwork');
  const eyeOpen = document.getElementById('eye-open');
  const eyeClosed = document.getElementById('eye-closed');
  const cameraAxesToggle = document.getElementById('camera-axes-toggle') as HTMLButtonElement | null;
  const spectrogramAxesToggle = document.getElementById('spectrogram-axes-toggle') as HTMLButtonElement | null;
  const statusLabel = document.getElementById('source-status');
  const infoFreqRange = document.getElementById('info-freq-range');
  const infoFreqBins = document.getElementById('info-freq-bins');
  const infoTimeSamples = document.getElementById('info-time-samples');
  const infoFFTSize = document.getElementById('info-fft-size');
  const infoSpectrogramHeight = document.getElementById('info-spectrogram-height');
  const infoSpectrogramWidth = document.getElementById('info-spectrogram-width');
  const infoSpectrogramLength = document.getElementById('info-spectrogram-length');
  const infoCameraX = document.getElementById('info-camera-x');
  const infoCameraY = document.getElementById('info-camera-y');
  const infoCameraZ = document.getElementById('info-camera-z');
  const infoRotationX = document.getElementById('info-rotation-x');
  const infoRotationY = document.getElementById('info-rotation-y');
  const infoRotationZ = document.getElementById('info-rotation-z');
  const angleRotateXButton = document.getElementById('angle-rotate-x') as HTMLButtonElement | null;
  const angleRotateYButton = document.getElementById('angle-rotate-y') as HTMLButtonElement | null;
  const angleRotateZButton = document.getElementById('angle-rotate-z') as HTMLButtonElement | null;
  const angleRotateXNegButton = document.getElementById('angle-rotate-x-neg') as HTMLButtonElement | null;
  const angleRotateYNegButton = document.getElementById('angle-rotate-y-neg') as HTMLButtonElement | null;
  const angleRotateZNegButton = document.getElementById('angle-rotate-z-neg') as HTMLButtonElement | null;

  // Preset buttons
  const preset000Button = document.getElementById('preset-0-0-0') as HTMLButtonElement | null;
  const preset90_90Button = document.getElementById('preset-90-90-0') as HTMLButtonElement | null;
  const preset45_45Button = document.getElementById('preset-45-45-0') as HTMLButtonElement | null;
  const preset45_180Button = document.getElementById('preset-45-180-0') as HTMLButtonElement | null;
  const preset90_180Button = document.getElementById('preset-90-180-0') as HTMLButtonElement | null;

  // Flip buttons
  const flipXButton = document.getElementById('flip-x') as HTMLButtonElement | null;
  const flipYButton = document.getElementById('flip-y') as HTMLButtonElement | null;
  const flipZButton = document.getElementById('flip-z') as HTMLButtonElement | null;

  // Initialize Audio Context
  const ACTX: AudioContext = new AudioContext();
  const ANALYSER: AnalyserNode = ACTX.createAnalyser();
  ANALYSER.fftSize = 4096;
  ANALYSER.smoothingTimeConstant = 0.64;

  let mediaStream: MediaStream | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let bufferSource: AudioBufferSourceNode | null = null;

  const setStatus = (text: string): void => {
    if (statusLabel) {
      statusLabel.textContent = text;
    }
  };

  const disconnectSources = (): void => {
    if (bufferSource) {
      try {
        bufferSource.stop();
      } catch (error) {
        console.warn("Failed to stop buffer source:", error);
      }
      bufferSource.disconnect();
      bufferSource = null;
    }

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

    try {
      await ACTX.resume();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false }
      });
      micSource = ACTX.createMediaStreamSource(mediaStream);
      micSource.connect(ANALYSER);
      setStatus("Source: microphone");
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
      const newBufferSource: AudioBufferSourceNode = ACTX.createBufferSource();
      newBufferSource.buffer = audioBuffer;
      newBufferSource.loop = true;
      newBufferSource.connect(ANALYSER);
      newBufferSource.connect(ACTX.destination);
      newBufferSource.start();
      bufferSource = newBufferSource;
      setStatus(`File: ${file.name}`);
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
      const newBufferSource: AudioBufferSourceNode = ACTX.createBufferSource();
      newBufferSource.buffer = audioBuffer;
      newBufferSource.loop = true;
      newBufferSource.connect(ANALYSER);
      newBufferSource.connect(ACTX.destination);
      newBufferSource.start();
      bufferSource = newBufferSource;
      setStatus(`File: ${label}`);
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

    // Pause/resume audio context
    if (paused) {
      void ACTX.suspend();
    } else {
      void ACTX.resume();
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
    20,
    width / height,
    1,
    1000
  );
  camera.position.x = 0;
  camera.position.y = -6.40;
  camera.position.z = 68;
  // camera.position.set( 0, 0, 128 );
  camera.rotation.z = ( 90 * Math.PI );
  camera.lookAt( 0, 0, 0 );

  const scene: THREE.Scene = new THREE.Scene();
  const overlayScene: THREE.Scene = new THREE.Scene();
  const overlaySize: number = 336;
  const overlayMarginTop: number = 24;
  const overlayCamera: THREE.OrthographicCamera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    100
  );
  overlayCamera.position.z = 10;
  overlayCamera.lookAt(0, 0, 0);
  overlayScene.add(overlayCamera);
  overlayCamera.updateProjectionMatrix();

  const textureLoader = new THREE.TextureLoader();
  const artworkUrl = 'https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/MKRL019-3000-100perc.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9NS1JMMDE5LTMwMDAtMTAwcGVyYy5qcGciLCJpYXQiOjE3NjgxNzY2MTgsImV4cCI6MTc5OTcxMjYxOH0.21OXReD0eU2WjkxzJfgp0Z1K9gd91ILSNIxJcI5bRvM';
  let overlayMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  const updateOverlayPosition = (): void => {
    if (overlayMesh) {
      overlayMesh.position.set(0, overlayCamera.top - overlayMarginTop - overlaySize / 2, overlayMesh.position.z);
    }
  };
  textureLoader.load(artworkUrl, (texture: THREE.Texture) => {
    console.log('Overlay artwork loaded:', artworkUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const overlayGeometry = new THREE.PlaneGeometry(overlaySize, overlaySize);
    overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);
    overlayMesh.renderOrder = 999;
    overlayMesh.position.set(0, overlayCamera.top - overlayMarginTop - overlaySize / 2, 1);
    overlayMesh.visible = false;
    overlayMesh.frustumCulled = false;
    overlayScene.add(overlayMesh);
    updateOverlayPosition();
  }, undefined, (error: unknown) => {
    console.error("Failed to load overlay artwork", error);
  });

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
  let scaleMode: ScaleMode = 'mel';
  let colormapMode: ColormapMode = 'gray';

  const nyquist: number = ACTX.sampleRate / 2;
  const toMel = (freq: number): number => 2595 * Math.log10(1 + freq / 700);
  const maxMel: number = toMel(nyquist);

  const setInfoBlock = (): void => {
    if (infoFreqRange) {
      infoFreqRange.textContent = `0 – ${(nyquist / 1000).toFixed(1)} kHz`;
    }
    if (infoFreqBins) {
      infoFreqBins.textContent = `${frequencySamples}`;
    }
    if (infoTimeSamples) {
      infoTimeSamples.textContent = `${timeSamples}`;
    }
    if (infoFFTSize) {
      infoFFTSize.textContent = `${ANALYSER.fftSize}`;
    }
    if (infoSpectrogramHeight) {
      infoSpectrogramHeight.textContent = `${ySize} (Гучність)`;
    }
    if (infoSpectrogramWidth) {
      infoSpectrogramWidth.textContent = `${xSize} (Hz)`;
    }
    if (infoSpectrogramLength) {
      infoSpectrogramLength.textContent = `${zSize} (Час)`;
    }
    console.log(`Frequency bins: ${frequencySamples}`);
  };
  setInfoBlock();

  const freqToNorm = (freq: number, mode: ScaleMode): number => {
    if (mode === 'linear') {
      return freq / nyquist;
    }
    if (mode === 'log') {
      const numerator: number = Math.log10(1 + freq);
      const denominator: number = Math.log10(1 + nyquist);
      return denominator === 0 ? 0 : numerator / denominator;
    }
    const mel: number = toMel(freq);
    return mel / maxMel;
  };

  const buildVertices = (mode: ScaleMode): number[] => {
    const verts: number[] = [];
    const zSegmentSize: number = zSize / xSegments;

    for (let i = 0; i <= xSegments; i++) {
      const z: number = (i * zSegmentSize) - (zSize / 2); // час по Z
      for (let j = 0; j <= ySegments; j++) {
        const freq: number = (j / ySegments) * nyquist;
        const norm: number = freqToNorm(freq, mode);
        const x: number = (norm * xSize) - (xSize / 2); // Hz по X
        const y: number = 0; // гучність буде по Y через displacement
        verts.push(x, y, z);
      }
    }
    return verts;
  };

  const vertices: number[] = buildVertices(scaleMode);

  // Generate indices for triangles
  for (let i = 0; i < xSegments; i++) {
    for (let j = 0; j < ySegments; j++) {
      const a: number = i * (ySegments + 1) + (j + 1);
      const b: number = i * (ySegments + 1) + j;
      const c: number = (i + 1) * (ySegments + 1) + j;
      const d: number = (i + 1) * (ySegments + 1) + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const displacementAttribute = new THREE.Uint8BufferAttribute(heights, 1);
  displacementAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('displacement', displacementAttribute);

  let mesh: THREE.Mesh;

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

  // Get shaders from DOM
  const vShader = document.getElementById('vertexshader') as HTMLScriptElement | null;
  const fShader = document.getElementById('fragmentshader') as HTMLScriptElement | null;

  if (!vShader || !fShader) {
    console.error("Shader elements not found in DOM");
    return;
  }

  // Define uniforms
  const uniforms: { vLut: { type: string; value: THREE.Vector3[] } } = {
    vLut: { type: "v3v", value: lut }
  };

  // Setup renderer
  const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  const container = document.getElementById('Spectrogram');
  if (!container) {
    console.error("Spectrogram container not found");
    return;
  }
  container.appendChild(renderer.domElement);

  const onWindowResize = (): void => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth, newHeight);

    overlayCamera.left = -newWidth / 2;
    overlayCamera.right = newWidth / 2;
    overlayCamera.top = newHeight / 2;
    overlayCamera.bottom = -newHeight / 2;
    overlayCamera.updateProjectionMatrix();
    updateOverlayPosition();
  };

  window.addEventListener('resize', onWindowResize);

  // Setup orbit controls
  const controls: OrbitControls = new OrbitControls(camera, renderer.domElement);
  // controls.maxPolarAngle = Math.PI / 2;
  // controls.minPolarAngle = Math.PI / 2;
  // controls.minAzimuthAngle = 5 * Math.PI / 3;
  // controls.maxAzimuthAngle = -5 * Math.PI / 3;
  controls.update();

  // Create material and mesh
  const material: THREE.ShaderMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vShader.text,
    fragmentShader: fShader.text
  });

  mesh = new THREE.Mesh(geometry, material);
  // Set default rotation to 90, 90, 0
  mesh.rotation.x = (90 * Math.PI) / 180;
  mesh.rotation.y = (90 * Math.PI) / 180;
  mesh.rotation.z = 0;

  scene.add(mesh);
  mesh.geometry.computeVertexNormals();

  // Функція ease-out cubica
  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  // Отримуємо поточні кути в градусах
  const getRotationInDegrees = (): { xRot: number; yRot: number; zRot: number } => {
    const RAD_TO_DEG_LOCAL = 180 / Math.PI;
    return {
      xRot: Math.round(mesh.rotation.x * RAD_TO_DEG_LOCAL),
      yRot: Math.round(mesh.rotation.y * RAD_TO_DEG_LOCAL),
      zRot: Math.round(mesh.rotation.z * RAD_TO_DEG_LOCAL)
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
      x: mesh.rotation.x,
      y: mesh.rotation.y,
      z: mesh.rotation.z
    };

    // Розраховуємо кінцеві кути обертання
    const endRotation = {
      x: mesh.rotation.x,
      y: mesh.rotation.y,
      z: mesh.rotation.z
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
        mesh.rotation.x = endRotation.x;
        mesh.rotation.y = endRotation.y;
        mesh.rotation.z = endRotation.z;
        return;
      }

      // Нормалізуємо час (0 до 1)
      const t: number = elapsed / duration;
      // Застосовуємо ease-out кубічну криву
      const eased: number = easeOutCubic(t);

      // Інтерполюємо кути обертання
      mesh.rotation.x = startRotation.x + (endRotation.x - startRotation.x) * eased;
      mesh.rotation.y = startRotation.y + (endRotation.y - startRotation.y) * eased;
      mesh.rotation.z = startRotation.z + (endRotation.z - startRotation.z) * eased;

      // Продовжуємо анімацію
      requestAnimationFrame(animateFrame);
    };

    // Запускаємо анімацію
    animateFrame();
  };

  const updateScale = (mode: ScaleMode): void => {
    scaleMode = mode;
    const scaledVertices: number[] = buildVertices(mode);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(scaledVertices, 3));
    geometry.computeVertexNormals();
  };

  const updateFrequencyBins = (factor: number): void => {
    frequencySamples = Math.max(64, frequencySamples * factor);
    ySegments = frequencySamples;
    nVertices = (frequencySamples + 1) * (timeSamples + 1);

    const newVertices: number[] = buildVertices(scaleMode);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
    geometry.computeVertexNormals();

    heights = new Uint8Array(nVertices);
    mesh.geometry.setAttribute('displacement', new THREE.Uint8BufferAttribute(heights, 1));

    setInfoBlock();
    console.log(`Frequency bins changed to: ${frequencySamples}`);
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

  fileInput?.addEventListener('change', async (event: Event): Promise<void> => {
    const target = event.target as HTMLInputElement;
    const file: File | undefined = target.files?.[0];
    if (!file) {
      return;
    }
    await playFile(file);
    enablePlayPauseBtn();
    setMicActive(false);
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

  demoButton?.addEventListener('click', () => {
    void playFromUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/MKRL019-04_Irukanji_-_Percentage_Of_Yes-ness_(149bpm)-Reel_v2.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9NS1JMMDE5LTA0X0lydWthbmppXy1fUGVyY2VudGFnZV9PZl9ZZXMtbmVzc18oMTQ5YnBtKS1SZWVsX3YyLm1wMyIsImlhdCI6MTc2ODA3MTkwMCwiZXhwIjoxNzk5NjA3OTAwfQ.lqJwqNqbc--WJMiswXXJYFI2OpaumpNrEw7tgwpNw2o', 'Irukanji - Percentage Of Yes-ness');
    setMicActive(false);
    enablePlayPauseBtn();
  });

  demoGazMaskButton?.addEventListener('click', () => {
    void playFromUrl('/098-04 Gaz Mask - The Breath Of The Elder (138bpm)_v1.mp3', 'Gaz Mask - Sic Mundus Creatus Est');
    setMicActive(false);
    enablePlayPauseBtn();
  });

  stopButton?.addEventListener('click', () => {
    disconnectSources();
    heights = new Uint8Array(nVertices);
    mesh.geometry.setAttribute('displacement', new THREE.Uint8BufferAttribute(heights, 1));
    setStatus("Stopped");
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

  freqBinsIncreaseButton?.addEventListener('click', () => {
    updateFrequencyBins(2);
  });
  freqBinsDecreaseButton?.addEventListener('click', () => {
    updateFrequencyBins(0.5);
  });

  // Функція для переходу на предустановлені кути
  const setRotationToPreset = (targetX: number, targetY: number, targetZ: number): void => {
    const startRot = getRotationInDegrees();
    const targetRot = { xRot: targetX, yRot: targetY, zRot: targetZ };

    console.log(`Rotating to preset: from`, startRot, `to`, targetRot);

    const startRotation = {
      x: mesh.rotation.x,
      y: mesh.rotation.y,
      z: mesh.rotation.z
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
        mesh.rotation.x = endRotation.x;
        mesh.rotation.y = endRotation.y;
        mesh.rotation.z = endRotation.z;
        return;
      }

      // Нормалізуємо час (0 до 1)
      const t: number = elapsed / duration;
      // Застосовуємо ease-out кубічну криву
      const eased: number = easeOutCubic(t);

      // Інтерполюємо кути обертання
      mesh.rotation.x = startRotation.x + (endRotation.x - startRotation.x) * eased;
      mesh.rotation.y = startRotation.y + (endRotation.y - startRotation.y) * eased;
      mesh.rotation.z = startRotation.z + (endRotation.z - startRotation.z) * eased;

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

  // Функція для дзеркального відображення (flip)
  const flipMesh = (axis: 'x' | 'y' | 'z'): void => {
    const currentRot = getRotationInDegrees();
    console.log(`Flipping ${axis.toUpperCase()}: before`, currentRot);

    if (axis === 'x') {
      mesh.scale.x *= -1;
    } else if (axis === 'y') {
      mesh.scale.y *= -1;
    } else if (axis === 'z') {
      mesh.scale.z *= -1;
    }

    const afterRot = getRotationInDegrees();
    console.log(`Flipping ${axis.toUpperCase()}: after`, afterRot);
  };

  // Preset buttons
  preset000Button?.addEventListener('click', () => setRotationToPreset(0, 0, 0));
  preset90_90Button?.addEventListener('click', () => setRotationToPreset(90, 90, 0));
  preset45_45Button?.addEventListener('click', () => setRotationToPreset(45, 45, 0));
  preset45_180Button?.addEventListener('click', () => setRotationToPreset(45, 180, 0));
  preset90_180Button?.addEventListener('click', () => setRotationToPreset(90, 180, 0));

  // Flip buttons
  flipXButton?.addEventListener('click', () => flipMesh('x'));
  flipYButton?.addEventListener('click', () => flipMesh('y'));
  flipZButton?.addEventListener('click', () => flipMesh('z'));

  // Control panel toggle
  closePanelButton?.addEventListener('click', () => {
    if (controlPanel) {
      controlPanel.style.display = 'none';
    }
    if (menuButton) {
      menuButton.style.display = 'block';
    }
  });

  menuButton?.addEventListener('click', () => {
    if (controlPanel) {
      controlPanel.style.display = 'block';
    }
    if (menuButton) {
      menuButton.style.display = 'none';
    }
  });

  const setArtworkVisibility = (visible: boolean): void => {
    if (artworkBlock) {
      artworkBlock.style.display = 'none';
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
    if (overlayMesh) {
      overlayMesh.visible = visible;
    }
  };

  // Initialize artwork as disabled
  setArtworkVisibility(false);

  // Artwork visibility toggle
  artworkToggle?.addEventListener('click', () => {
    const isVisible = overlayMesh?.visible ?? false;
    setArtworkVisibility(!isVisible);
  });

  // Create axes helper with labels
  let cameraAxesGroup: THREE.Group | null = null;
  let spectrogramAxesGroup: THREE.Group | null = null;

  const createTextLabel = (text: string, color: number): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 120px Arial';
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

  const createAxesWithLabels = (axisLength: number = 30): THREE.Group => {
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
    const xLabel = createTextLabel('X', 0xff0000);
    xLabel.position.set(axisLength + 4, 0, 0);
    group.add(xLabel);

    // Y label (green)
    const yLabel = createTextLabel('Y', 0x00ff00);
    yLabel.position.set(0, axisLength + 4, 0);
    group.add(yLabel);

    // Z label (blue)
    const zLabel = createTextLabel('Z', 0x0000ff);
    zLabel.position.set(0, 0, axisLength + 4);
    group.add(zLabel);

    return group;
  };

  const setCameraAxesVisibility = (visible: boolean): void => {
    if (visible && !cameraAxesGroup) {
      cameraAxesGroup = createAxesWithLabels(12);
      scene.add(cameraAxesGroup);
      if (cameraAxesToggle) {
        cameraAxesToggle.classList.add('btn-active');
      }
    } else if (!visible && cameraAxesGroup) {
      scene.remove(cameraAxesGroup);
      cameraAxesGroup = null;
      if (cameraAxesToggle) {
        cameraAxesToggle.classList.remove('btn-active');
      }
    }
  };

  const setSpectrogramAxesVisibility = (visible: boolean): void => {
    if (visible && !spectrogramAxesGroup) {
      spectrogramAxesGroup = createAxesWithLabels(8);
      spectrogramAxesGroup.position.set(0, 0, 0);
      mesh.add(spectrogramAxesGroup);
      if (spectrogramAxesToggle) {
        spectrogramAxesToggle.classList.add('btn-active');
      }
    } else if (!visible && spectrogramAxesGroup) {
      mesh.remove(spectrogramAxesGroup);
      spectrogramAxesGroup = null;
      if (spectrogramAxesToggle) {
        spectrogramAxesToggle.classList.remove('btn-active');
      }
    }
  };

  // Camera axes toggle
  cameraAxesToggle?.addEventListener('click', () => {
    setCameraAxesVisibility(cameraAxesGroup === null);
  });

  // Spectrogram axes toggle
  spectrogramAxesToggle?.addEventListener('click', () => {
    setSpectrogramAxesVisibility(spectrogramAxesGroup === null);
  });

  // Update camera info display
  const updateCameraInfo = (): void => {
    const quaternion = camera.quaternion;
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');

    if (infoCameraX) {
      infoCameraX.textContent = `${camera.position.x.toFixed(2)}`;
    }
    if (infoCameraY) {
      infoCameraY.textContent = `${camera.position.y.toFixed(2)}`;
    }
    if (infoCameraZ) {
      infoCameraZ.textContent = `${camera.position.z.toFixed(2)}`;
    }
    if (infoRotationX) {
      infoRotationX.textContent = `${(euler.x * RAD_TO_DEG).toFixed(1)}°`;
    }
    if (infoRotationY) {
      infoRotationY.textContent = `${(euler.y * RAD_TO_DEG).toFixed(1)}°`;
    }
    if (infoRotationZ) {
      infoRotationZ.textContent = `${(euler.z * RAD_TO_DEG).toFixed(1)}°`;
    }
  };

  // Animation loop
  const animate = function (): void {
    requestAnimationFrame(animate);
    controls.update();
    render();
  };

  const render = function (): void {
    if (!paused) {
      updateGeometry();
    }
    updateCameraInfo();
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(overlayScene, overlayCamera);
  };

  // Update geometry with new audio data
  const updateGeometry = function (): void {
    const audioData = new Uint8Array(frequencySamples);
    ANALYSER.getByteFrequencyData(audioData);
    const startVal: number = frequencySamples + 1;
    const endVal: number = nVertices - startVal;

    heights.copyWithin(0, startVal, nVertices + 1);
    heights.set(audioData, endVal - startVal);

    const attr = mesh.geometry.getAttribute('displacement') as THREE.BufferAttribute;
    attr.array = heights;
    attr.needsUpdate = true;
  };

  // Start animation
  animate();
};

// Initialize the application
init();
