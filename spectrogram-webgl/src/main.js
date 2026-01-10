/**
 * Spectrogram 3D - Minimal Vite Version
 * A 3D audio spectrum visualizer using Web Audio API and WebGL
 */

import { Player } from './lib/Player.js';
import { AnalyserView } from './lib/AnalyserView.js';
import { WaveformCanvas } from './lib/WaveformCanvas.js';

class SpectrogramApp {
  constructor() {
    this.canvas = document.getElementById('spectrogram');
    this.fileInput = document.getElementById('audioFile');
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.toggleControlBtn = document.getElementById('toggleControlBtn');
    this.menuButton = document.getElementById('menu-button');
    this.controlPanel = document.getElementById('controlPanel');
    this.controlPanelVisible = true;
    this.statusMessage = document.getElementById('statusMessage');
    this.playIrukanji001Btn = document.getElementById('playIrukanji001Btn');
    this.playIrukanjiBtn = document.getElementById('playIrukanjiBtn');
    this.playGazMaskBtn = document.getElementById('playGazMaskBtn');
    this.playGazMask04Btn = document.getElementById('playGazMask04Btn');
    this.themeRainbowBtn = document.getElementById('themeRainbowBtn');
    this.themeBlackWhiteBtn = document.getElementById('themeBlackWhiteBtn');
    this.themeInfernoBtn = document.getElementById('themeInfernoBtn');
    this.themeForestBtn = document.getElementById('themeForestBtn');
    this.themeWhiteBlackBtn = document.getElementById('themeWhiteBlackBtn');
    this.themeMountainsBtn = document.getElementById('themeMountainsBtn');
    this.scaleLogBtn = document.getElementById('scaleLogBtn');
    this.scaleLinearBtn = document.getElementById('scaleLinearBtn');
    this.scaleMelBtn = document.getElementById('scaleMelBtn');
    this.resetCameraBtn = document.getElementById('resetCameraBtn');
    this.rotateXMinus90Btn = document.getElementById('rotateXMinus90Btn');
    this.rotateXPlus90Btn = document.getElementById('rotateXPlus90Btn');
    this.rotateYMinus45Btn = document.getElementById('rotateYMinus45Btn');
    this.rotateYPlus45Btn = document.getElementById('rotateYPlus45Btn');
    this.rotateZMinus90Btn = document.getElementById('rotateZMinus90Btn');
    this.rotateZPlus90Btn = document.getElementById('rotateZPlus90Btn');
    this.flipYBtn = document.getElementById('flipYBtn');
    this.toggleAxesBtn = document.getElementById('toggleAxesBtn');
    this.toggleWaveformBtn = document.getElementById('toggleWaveformBtn');
    this.camera180270Btn = document.getElementById('camera180270Btn');
    this.camera135270Btn = document.getElementById('camera135270Btn');
    this.camera000Btn = document.getElementById('camera000Btn');
    this.camera45900Btn = document.getElementById('camera45900Btn');
    this.camera451800Btn = document.getElementById('camera451800Btn');
    this.flipXBtn = document.getElementById('flipXBtn');
    this.flipZBtn = document.getElementById('flipZBtn');
    this.toggleGridBtn = document.getElementById('toggleGridBtn');
    this.toggleYGridBtn = document.getElementById('toggleYGridBtn');
    this.toggleZGridBtn = document.getElementById('toggleZGridBtn');
    this.zoomX1Btn = document.getElementById('zoomX1Btn');
    this.zoomX2Btn = document.getElementById('zoomX2Btn');
    this.zoomX3Btn = document.getElementById('zoomX3Btn');
    this.zoomX4Btn = document.getElementById('zoomX4Btn');
    this.zoomX5Btn = document.getElementById('zoomX5Btn');
    this.zoomX6Btn = document.getElementById('zoomX6Btn');
    this.increaseFreqBinsBtn = document.getElementById('increaseFreqBinsBtn');
    this.decreaseFreqBinsBtn = document.getElementById('decreaseFreqBinsBtn');
    this.dragDropZone = document.getElementById('drag-drop-zone');
    this.player = null;
    this.analyserView = null;
    this.waveformCanvas = null;
    this.isRendering = false;
    this.currentTrackName = '';
    this.currentZoom = 1;
    this.flipYActive = false;
    this.flipXActive = false;
    this.flipZActive = false;
    this.axesVisible = false;
    this.gridVisible = false;
    this.yGridVisible = false;
    this.zGridVisible = false;
    this.animationInProgress = false;
    this.animationStartTime = 0;
    this.animationDuration = 1024;
    this.animationStartValues = { xRot: 0, yRot: 0, zRot: 0 };
    this.animationTargetValues = { xRot: 0, yRot: 0, zRot: 0 };

    this.init();
  }

  init() {
    // Initialize player and visualizer
    this.player = new Player();
    this.analyserView = new AnalyserView(this.canvas);
    this.analyserView.setAnalyserNode(this.player.getAnalyserNode());
    this.analyserView.setPlayer(this.player);
    this.analyserView.initByteBuffer();

    // Initialize waveform canvas
    const waveformCanvasElement = document.getElementById('waveform');
    if (waveformCanvasElement) {
      this.waveformCanvas = new WaveformCanvas(waveformCanvasElement);
      this.waveformCanvas.setPlayer(this.player);
    }

    // Set up canvas sizing FIRST (before creating visualizers that depend on dimensions)
    // But only resize the main canvas now
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.analyserView.axisRenderer.updateLabelCanvasSize();

    window.addEventListener('resize', () => this.onResize());

    // Set Gray (mode 1) as default color mode (Gray: white for loud, black for quiet)
    this.analyserView.setColorMode(1);

    // Set Mel (mode 2) as default scale mode
    this.currentScaleMode = 2;
    const scaleModeNames = ['Log', 'Linear', 'Mel'];
    console.log(`FFT Scale: ${scaleModeNames[this.currentScaleMode]}`);
    this.analyserView.setScaleMode(2);
    this.setScaleMode(2);

    // Set up control panel toggle button handler
    this.toggleControlBtn.addEventListener('click', () => this.closeControlPanel());

    // Set up menu button handler
    if (this.menuButton) {
      this.menuButton.addEventListener('click', () => this.openControlPanel());
    }

    // Set up outside click handler to close control panel
    document.addEventListener('click', (e) => this.handleOutsideClick(e));

    // Set up file input handler
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // Set up drag & drop handlers
    if (this.dragDropZone) {
      this.dragDropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
      this.dragDropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      this.dragDropZone.addEventListener('drop', (e) => this.handleDrop(e));
      this.dragDropZone.addEventListener('click', () => this.fileInput.click());
    }

    // Set up play/pause button handler
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());

    // Set up keyboard handler for spacebar
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Set up demo track buttons
    this.playIrukanji001Btn.addEventListener('click', () =>
      this.loadAndPlayUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/SENCD006-01_Irukanji_-_Onset_(In)_(72)-Reel_v1.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9TRU5DRDAwNi0wMV9JcnVrYW5qaV8tX09uc2V0XyhJbilfKDcyKS1SZWVsX3YxLm1wMyIsImlhdCI6MTc2ODA3MTk0NSwiZXhwIjoxNzk5NjA3OTQ1fQ.OgyQF8iUUYpAK3vK38H8CVltYGaskn7ecphcoRGPWa0', 'Irukanji - Onset (In) (72)')
    );
    this.playIrukanjiBtn.addEventListener('click', () =>
      this.loadAndPlayUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/MKRL019-04_Irukanji_-_Percentage_Of_Yes-ness_(149bpm)-Reel_v2.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9NS1JMMDE5LTA0X0lydWthbmppXy1fUGVyY2VudGFnZV9PZl9ZZXMtbmVzc18oMTQ5YnBtKS1SZWVsX3YyLm1wMyIsImlhdCI6MTc2ODA3MTkwMCwiZXhwIjoxNzk5NjA3OTAwfQ.lqJwqNqbc--WJMiswXXJYFI2OpaumpNrEw7tgwpNw2o', 'Irukanji - Percentage Of Yes-ness (149bpm)')
    );
    this.playGazMaskBtn.addEventListener('click', () =>
      this.loadAndPlayUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/sentimony/SENCD098-01_Gaz%20Mask_-_Sic_Mundus_Creatus_Est_(133bpm)-Reel_v1.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9zZW50aW1vbnkvU0VOQ0QwOTgtMDFfR2F6IE1hc2tfLV9TaWNfTXVuZHVzX0NyZWF0dXNfRXN0XygxMzNicG0pLVJlZWxfdjEubXAzIiwiaWF0IjoxNzY4MDcyMDIxLCJleHAiOjE3OTk2MDgwMjF9.PCioHd4Xz63dzj_ujm9DczOHrNFmfvms8ML0FlJK3hA', 'Gaz Mask - Sic Mundus Creatus Est (133bpm)')
    );
    this.playGazMask04Btn.addEventListener('click', () =>
      this.loadAndPlayUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/sentimony/SENCD098-04_Gaz_Mask_-_The_Breath_Of_The_Elder_(138bpm)-Reel_v1.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9zZW50aW1vbnkvU0VOQ0QwOTgtMDRfR2F6X01hc2tfLV9UaGVfQnJlYXRoX09mX1RoZV9FbGRlcl8oMTM4YnBtKS1SZWVsX3YxLm1wMyIsImlhdCI6MTc2ODA3MjA4NywiZXhwIjoxNzk5NjA4MDg3fQ.anbSAf5XrFtKZvM-dpxJIO_KDB31Tl9pyByLmJg29Nk', 'Gaz Mask - The Breath Of The Elder (138bpm)')
    );
    this.playMKRL01904Btn = document.getElementById('playMKRL01904Btn');
    if (this.playMKRL01904Btn) {
      this.playMKRL01904Btn.addEventListener('click', () =>
        this.loadAndPlayUrl('https://dugbgewuzowoogglccue.supabase.co/storage/v1/object/sign/spectrogram/irukanji/MKRL019-04_Irukanji_-_Percentage_Of_Yes-ness_(149bpm)-Reel_v2.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MjI0ZmMwZi0xZDI3LTQ0ZDItOWI3YS1lZTU2M2NjOGU4ZTAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzcGVjdHJvZ3JhbS9pcnVrYW5qaS9NS1JMMDE5LTA0X0lydWthbmppXy1fUGVyY2VudGFnZV9PZl9ZZXMtbmVzc18oMTQ5YnBtKS1SZWVsX3YyLm1wMyIsImlhdCI6MTc2ODA3MTkwMCwiZXhwIjoxNzk5NjA3OTAwfQ.lqJwqNqbc--WJMiswXXJYFI2OpaumpNrEw7tgwpNw2o', 'MKRL019-04 - 047')
      );
    }

    // Set up theme buttons
    this.themeRainbowBtn.addEventListener('click', () => this.setColorMode(0));
    this.themeBlackWhiteBtn.addEventListener('click', () => this.setColorMode(1));
    this.themeInfernoBtn.addEventListener('click', () => this.setColorMode(2));
    this.themeForestBtn.addEventListener('click', () => this.setColorMode(3));
    // this.themeWhiteBlackBtn.addEventListener('click', () => this.setColorMode(4));
    this.themeMountainsBtn.addEventListener('click', () => this.setColorMode(5));

    // Set up scale buttons
    this.scaleLogBtn.addEventListener('click', () => this.setScaleMode(0));
    this.scaleLinearBtn.addEventListener('click', () => this.setScaleMode(1));
    this.scaleMelBtn.addEventListener('click', () => this.setScaleMode(2));

    // Set up reset camera button
    this.resetCameraBtn.addEventListener('click', () => this.resetCamera());

    // Set up preset camera position buttons
    this.camera180270Btn.addEventListener('click', () => this.setCameraPosition(-180, 270, 90));
    this.camera135270Btn.addEventListener('click', () => this.setCameraPosition(-135, 270, 90));
    this.camera000Btn.addEventListener('click', () => this.setCameraPosition(0, 0, 0));
    this.camera45900Btn.addEventListener('click', () => this.setCameraPosition(-45, 90, 0));
    this.camera451800Btn.addEventListener('click', () => this.setCameraPosition(-45, 180, 0));

    // Set up rotation buttons
    this.rotateXMinus90Btn.addEventListener('click', () => this.rotateScene('x', -45));
    this.rotateXPlus90Btn.addEventListener('click', () => this.rotateScene('x', 45));
    this.rotateYMinus45Btn.addEventListener('click', () => this.rotateScene('y', -45));
    this.rotateYPlus45Btn.addEventListener('click', () => this.rotateScene('y', 45));
    this.rotateZMinus90Btn.addEventListener('click', () => this.rotateScene('z', -45));
    this.rotateZPlus90Btn.addEventListener('click', () => this.rotateScene('z', 45));

    // Set up flip buttons
    this.flipYBtn.addEventListener('click', () => this.toggleFlipY());
    this.flipXBtn.addEventListener('click', () => this.toggleFlipX());
    this.flipZBtn.addEventListener('click', () => this.toggleFlipZ());

    // Set up axes toggle button
    this.toggleAxesBtn.addEventListener('click', () => this.toggleAxes());

    // Set up waveform toggle button
    this.toggleWaveformBtn.addEventListener('click', () => this.toggleWaveform());

    // Set up grid toggle buttons
    this.toggleGridBtn.addEventListener('click', () => this.toggleGrid());
    this.toggleYGridBtn.addEventListener('click', () => this.toggleYGrid());
    this.toggleZGridBtn.addEventListener('click', () => this.toggleZGrid());

    // Set up zoom buttons
    this.zoomX1Btn.addEventListener('click', () => this.setZoomX1());
    this.zoomX2Btn.addEventListener('click', () => this.setZoomX2());
    this.zoomX3Btn.addEventListener('click', () => this.setZoomX3());
    this.zoomX4Btn.addEventListener('click', () => this.setZoomX4());
    this.zoomX5Btn.addEventListener('click', () => this.setZoomX5());
    this.zoomX6Btn.addEventListener('click', () => this.setZoomX6());

    // Set up frequency bins buttons
    this.increaseFreqBinsBtn.addEventListener('click', () => this.increaseFrequencyBins());
    this.decreaseFreqBinsBtn.addEventListener('click', () => this.decreaseFrequencyBins());

    // Start render loop (will only render when playing)
    this.startRender();
  }

  setColorMode(mode) {
    this.analyserView.setColorMode(mode);

    // Update button styles
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';
    const buttons = [
      this.themeRainbowBtn,
      this.themeBlackWhiteBtn,
      this.themeInfernoBtn,
      this.themeForestBtn,
      this.themeWhiteBlackBtn,
      this.themeMountainsBtn
    ];

    buttons.forEach((btn, index) => {
      if (!btn) return; // Skip if button doesn't exist
      if (index === mode) {
        btn.className = btn.className
          .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
          .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
      } else {
        btn.className = btn.className
          .replace(/bg-orange-500\/80|border-white\/60/g, '')
          .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
      }
    });
  }

  setScaleMode(mode) {
    const scaleModeNames = ['Log', 'Linear', 'Mel'];
    if (this.currentScaleMode !== undefined && this.currentScaleMode !== mode) {
      console.log(`FFT Scale changed: from ${scaleModeNames[this.currentScaleMode]} to ${scaleModeNames[mode]}`);
    }
    this.currentScaleMode = mode;
    this.analyserView.setScaleMode(mode);

    // Update button styles
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';
    const buttons = [this.scaleLogBtn, this.scaleLinearBtn, this.scaleMelBtn];

    buttons.forEach((btn, index) => {
      if (index === mode) {
        btn.className = btn.className
          .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
          .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
      } else {
        btn.className = btn.className
          .replace(/bg-orange-500\/80|border-white\/60/g, '')
          .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
      }
    });
  }

  resetCamera() {
    const mesh = this.analyserView.mesh;

    // Store current values as animation start (in radians)
    this.animationStartValues = {
      xRot: mesh.rotation.x,
      yRot: mesh.rotation.y,
      zRot: mesh.rotation.z
    };

    // Standard 3D Cartesian coordinate system position
    // X pointing to lower left, Y horizontal, Z vertical
    // Target values: convert degrees to radians
    this.animationTargetValues = {
      xRot: -45 * Math.PI / 180,
      yRot: -45 * Math.PI / 180,
      zRot: 0
    };

    console.log('now', {
      xRot: this.animationTargetValues.xRot * 180 / Math.PI,
      yRot: this.animationTargetValues.yRot * 180 / Math.PI,
      zRot: this.animationTargetValues.zRot * 180 / Math.PI
    });

    // Start animation
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimation();
  }

  setCameraPosition(xRot, yRot, zRot) {
    const mesh = this.analyserView.mesh;

    // Store current values as animation start (in radians)
    this.animationStartValues = {
      xRot: mesh.rotation.x,
      yRot: mesh.rotation.y,
      zRot: mesh.rotation.z
    };

    // Set target camera position (convert input degrees to radians)
    this.animationTargetValues = {
      xRot: xRot * Math.PI / 180,
      yRot: yRot * Math.PI / 180,
      zRot: zRot * Math.PI / 180
    };

    console.log('now', { xRot, yRot, zRot });

    // Start animation
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimation();
  }

  rotateScene(axis, angle) {
    const mesh = this.analyserView.mesh;

    // Store current values as animation start (in radians)
    this.animationStartValues = {
      xRot: mesh.rotation.x,
      yRot: mesh.rotation.y,
      zRot: mesh.rotation.z
    };

    // Convert angle increment from degrees to radians
    const angleRad = angle * Math.PI / 180;

    // Calculate target values
    this.animationTargetValues = {
      xRot: mesh.rotation.x + (axis === 'x' ? angleRad : 0),
      yRot: mesh.rotation.y + (axis === 'y' ? angleRad : 0),
      zRot: mesh.rotation.z + (axis === 'z' ? angleRad : 0)
    };

    // Debug: log current and target values (convert to degrees for display)
    console.log(`Rotating ${axis}: from`,
      {
        xRot: this.animationStartValues.xRot * 180 / Math.PI,
        yRot: this.animationStartValues.yRot * 180 / Math.PI,
        zRot: this.animationStartValues.zRot * 180 / Math.PI
      },
      'to',
      {
        xRot: this.animationTargetValues.xRot * 180 / Math.PI,
        yRot: this.animationTargetValues.yRot * 180 / Math.PI,
        zRot: this.animationTargetValues.zRot * 180 / Math.PI
      }
    );

    // Start animation
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimation();
  }

  // Easing functions for animation
  easeLinear(t) {
    return t;
  }

  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  easeInOutCubic(t) {
    // Ease-in-out cubic function
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  easeInCubic(t) {
    return t * t * t;
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Current easing function (can be changed to any of the above)
  easeOut(t) {
    return this.easeOutCubic(t);
  }

  updateAnimation() {
    if (!this.animationInProgress) return;

    const mesh = this.analyserView.mesh;
    const elapsed = Date.now() - this.animationStartTime;
    const progress = Math.min(elapsed / this.animationDuration, 1);
    const easeProgress = this.easeOut(progress);

    // Interpolate rotation values (in radians)
    mesh.rotation.x = this.animationStartValues.xRot +
      (this.animationTargetValues.xRot - this.animationStartValues.xRot) * easeProgress;
    mesh.rotation.y = this.animationStartValues.yRot +
      (this.animationTargetValues.yRot - this.animationStartValues.yRot) * easeProgress;
    mesh.rotation.z = this.animationStartValues.zRot +
      (this.animationTargetValues.zRot - this.animationStartValues.zRot) * easeProgress;

    if (progress < 1) {
      requestAnimationFrame(() => this.updateAnimation());
    } else {
      this.animationInProgress = false;
    }
  }

  toggleFlipY() {
    this.flipYActive = !this.flipYActive;
    this.analyserView.setFlipY(this.flipYActive);

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (this.flipYActive) {
      this.flipYBtn.className = this.flipYBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.flipYBtn.className = this.flipYBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  toggleFlipX() {
    this.flipXActive = !this.flipXActive;
    this.analyserView.setFlipX(this.flipXActive);

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (this.flipXActive) {
      this.flipXBtn.className = this.flipXBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.flipXBtn.className = this.flipXBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  toggleFlipZ() {
    this.flipZActive = !this.flipZActive;
    this.analyserView.setFlipZ(this.flipZActive);

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (this.flipZActive) {
      this.flipZBtn.className = this.flipZBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.flipZBtn.className = this.flipZBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  updateUI() {
    const isPlaying = this.player.isPlaying();
    this.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
    const trackInfo = this.currentTrackName ? `: ${this.currentTrackName}` : '';
    this.statusMessage.textContent = (isPlaying ? 'Playing' : 'Paused') + trackInfo;
  }

  async togglePlayPause() {
    if (this.player.isPlaying()) {
      this.player.pause();
      this.stopRender();
    } else {
      await this.player.play();
      this.startRender();
    }
    this.updateUI();
  }

  toggleAxes() {
    this.axesVisible = !this.axesVisible;
    this.analyserView.axisRenderer.setVisible(this.axesVisible);

    // Update button text
    this.toggleAxesBtn.textContent = this.axesVisible ? 'Hide Axes' : 'Show Axes';

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (!this.axesVisible) {
      this.toggleAxesBtn.className = this.toggleAxesBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.toggleAxesBtn.className = this.toggleAxesBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  toggleWaveform() {
    const visible = this.analyserView.toggleWaveformVisibility();

    // Update button text
    this.toggleWaveformBtn.textContent = visible ? 'Hide Waveform' : 'Show Waveform';

    // Update button style based on visibility
    const activeClass = 'bg-green-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (visible) {
      // When visible, show active (green) style
      this.toggleWaveformBtn.className = this.toggleWaveformBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-green-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      // When hidden, show inactive style
      this.toggleWaveformBtn.className = this.toggleWaveformBtn.className
        .replace(/bg-green-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  toggleGrid() {
    this.gridVisible = !this.gridVisible;
    this.analyserView.gridRenderer.setVisible(this.gridVisible);

    // Update button text
    this.toggleGridBtn.textContent = this.gridVisible ? 'Hide X Grid' : 'Show X Grid';

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (this.gridVisible) {
      this.toggleGridBtn.className = this.toggleGridBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.toggleGridBtn.className = this.toggleGridBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  toggleYGrid() {
    this.yGridVisible = !this.yGridVisible;
    this.analyserView.yGridRenderer.setVisible(this.yGridVisible);

    // Update button text
    this.toggleYGridBtn.textContent = this.yGridVisible ? 'Hide Y Grid' : 'Show Y Grid';

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (this.yGridVisible) {
      this.toggleYGridBtn.className = this.toggleYGridBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.toggleYGridBtn.className = this.toggleYGridBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  toggleZGrid() {
    this.zGridVisible = !this.zGridVisible;
    this.analyserView.zGridRenderer.setVisible(this.zGridVisible);

    // Update button text
    this.toggleZGridBtn.textContent = this.zGridVisible ? 'Hide Z Grid' : 'Show Z Grid';

    // Update button style
    const activeClass = 'bg-orange-500/80 border-white/60';
    const inactiveClass = 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40';

    if (this.zGridVisible) {
      this.toggleZGridBtn.className = this.toggleZGridBtn.className
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '')
        .replace(/bg-orange-500\/80|border-white\/60/g, '') + ' ' + activeClass;
    } else {
      this.toggleZGridBtn.className = this.toggleZGridBtn.className
        .replace(/bg-orange-500\/80|border-white\/60/g, '')
        .replace(/bg-white\/10|border-white\/20|hover:bg-white\/20|hover:border-white\/40/g, '') + ' ' + inactiveClass;
    }
  }

  setZoomX1() {
    const mesh = this.analyserView.mesh;

    // Store current values as animation start
    this.animationStartValues = {
      xT: mesh.position.x,
      yT: mesh.position.y,
      zT: mesh.position.z
    };

    // Set target camera position - default zoom (closer)
    this.animationTargetValues = {
      xT: 0,
      yT: -2,
      zT: -2
    };

    this.currentZoom = 1;
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimationWithTranslation();
    this.updateZoomButtonStyles();
  }

  setZoomX2() {
    const mesh = this.analyserView.mesh;

    // Store current values as animation start
    this.animationStartValues = {
      xT: mesh.position.x,
      yT: mesh.position.y,
      zT: mesh.position.z
    };

    // Set target camera position - zoomed out (move camera further away)
    this.animationTargetValues = {
      xT: 0,
      yT: -4,
      zT: -4
    };

    this.currentZoom = 2;
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimationWithTranslation();
    this.updateZoomButtonStyles();
  }

  setZoomX3() {
    const mesh = this.analyserView.mesh;

    this.animationStartValues = {
      xT: mesh.position.x,
      yT: mesh.position.y,
      zT: mesh.position.z
    };

    this.animationTargetValues = {
      xT: 0,
      yT: -6,
      zT: -6
    };

    this.currentZoom = 3;
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimationWithTranslation();
    this.updateZoomButtonStyles();
  }

  setZoomX4() {
    const mesh = this.analyserView.mesh;

    this.animationStartValues = {
      xT: mesh.position.x,
      yT: mesh.position.y,
      zT: mesh.position.z
    };

    this.animationTargetValues = {
      xT: 0,
      yT: -8,
      zT: -8
    };

    this.currentZoom = 4;
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimationWithTranslation();
    this.updateZoomButtonStyles();
  }

  setZoomX5() {
    const mesh = this.analyserView.mesh;

    this.animationStartValues = {
      xT: mesh.position.x,
      yT: mesh.position.y,
      zT: mesh.position.z
    };

    this.animationTargetValues = {
      xT: 0,
      yT: -10,
      zT: -10
    };

    this.currentZoom = 5;
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimationWithTranslation();
    this.updateZoomButtonStyles();
  }

  setZoomX6() {
    const mesh = this.analyserView.mesh;

    this.animationStartValues = {
      xT: mesh.position.x,
      yT: mesh.position.y,
      zT: mesh.position.z
    };

    this.animationTargetValues = {
      xT: 0,
      yT: -12,
      zT: -12
    };

    this.currentZoom = 6;
    this.animationInProgress = true;
    this.animationStartTime = Date.now();
    this.updateAnimationWithTranslation();
    this.updateZoomButtonStyles();
  }

  updateAnimationWithTranslation() {
    if (!this.animationInProgress) return;

    const mesh = this.analyserView.mesh;
    const elapsed = Date.now() - this.animationStartTime;
    const progress = Math.min(elapsed / this.animationDuration, 1);
    const easeProgress = this.easeOut(progress);

    // Interpolate only translation values, keep rotation unchanged
    if (this.animationStartValues.xT !== undefined) {
      mesh.position.x = this.animationStartValues.xT +
        (this.animationTargetValues.xT - this.animationStartValues.xT) * easeProgress;
      mesh.position.y = this.animationStartValues.yT +
        (this.animationTargetValues.yT - this.animationStartValues.yT) * easeProgress;
      mesh.position.z = this.animationStartValues.zT +
        (this.animationTargetValues.zT - this.animationStartValues.zT) * easeProgress;
    } else {
      // Fallback for rotation-based animations
      mesh.rotation.x = this.animationStartValues.xRot +
        (this.animationTargetValues.xRot - this.animationStartValues.xRot) * easeProgress;
      mesh.rotation.y = this.animationStartValues.yRot +
        (this.animationTargetValues.yRot - this.animationStartValues.yRot) * easeProgress;
      mesh.rotation.z = this.animationStartValues.zRot +
        (this.animationTargetValues.zRot - this.animationStartValues.zRot) * easeProgress;
    }

    if (progress < 1) {
      requestAnimationFrame(() => this.updateAnimationWithTranslation());
    } else {
      this.animationInProgress = false;
    }
  }

  updateZoomButtonStyles() {
    const activeClass = 'bg-blue-500/80 border-white/60';
    const inactiveClass = 'bg-blue-500/60 border-white/40 hover:bg-blue-500/80 hover:border-white/60';
    const buttons = [this.zoomX1Btn, this.zoomX2Btn, this.zoomX3Btn, this.zoomX4Btn, this.zoomX5Btn, this.zoomX6Btn];

    buttons.forEach((btn, index) => {
      const zoomLevel = index + 1;
      if (this.currentZoom === zoomLevel) {
        btn.className = btn.className
          .replace(/bg-blue-500\/60|border-white\/40|hover:bg-blue-500\/80|hover:border-white\/60/g, '')
          .replace(/bg-blue-500\/80|border-white\/60/g, '') + ' ' + activeClass;
      } else {
        btn.className = btn.className
          .replace(/bg-blue-500\/80|border-white\/60/g, '')
          .replace(/bg-blue-500\/60|border-white\/40|hover:bg-blue-500\/80|hover:border-white\/60/g, '') + ' ' + inactiveClass;
      }
    });
  }

  handleKeyDown(event) {
    // Spacebar toggles play/pause (only if audio is loaded)
    if (event.code === 'Space' && !this.playPauseBtn.disabled) {
      event.preventDefault();
      this.togglePlayPause();
    }
  }

  handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragDropZone) {
      this.dragDropZone.classList.add('bg-white/10', 'border-gray-400');
      this.dragDropZone.classList.remove('border-gray-600');
    }
  }

  handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragDropZone) {
      this.dragDropZone.classList.remove('bg-white/10', 'border-gray-400');
      this.dragDropZone.classList.add('border-gray-600');
    }
  }

  handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragDropZone) {
      this.dragDropZone.classList.remove('bg-white/10', 'border-gray-400');
      this.dragDropZone.classList.add('border-gray-600');
    }

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Check if file is audio
      if (file.type.startsWith('audio/')) {
        this.handleFileSelect({ target: { files: files } });
      } else {
        this.statusMessage.textContent = 'Please drop an audio file';
      }
    }
  }

  async loadAndPlayUrl(url, trackName) {
    try {
      this.statusMessage.textContent = 'Loading audio...';
      this.playPauseBtn.disabled = true;

      await this.player.loadAudioUrl(url);

      // Generate and load waveform data
      const waveformData = this.player.getWaveformData(2048);
      this.analyserView.loadWaveformData(waveformData);
      if (this.waveformCanvas) {
        this.waveformCanvas.loadWaveformData(waveformData);
      }

      // Load full spectrogram
await this.player.play();
      this.startRender();

      this.currentTrackName = trackName;

      // Don't show image for any track
      this.analyserView.setShowImage(false);

      this.playPauseBtn.disabled = false;
      this.updateUI();
    } catch (error) {
      console.error('Error loading audio:', error);
      this.statusMessage.textContent = 'Error: ' + error.message;
    }
  }

  onResize() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.analyserView.axisRenderer.updateLabelCanvasSize();

    // Resize bottom spectrogram canvas
}

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const audioFileInput = document.getElementById('audioFile');
    const fileLabel = audioFileInput ? audioFileInput.nextElementSibling : null;

    try {
      if (fileLabel) fileLabel.textContent = 'Loading...';
      this.statusMessage.textContent = 'Loading audio...';
      this.playPauseBtn.disabled = true;

      await this.player.loadAudioBuffer(file);

      // Generate and load waveform data
      const waveformData = this.player.getWaveformData(2048);
      this.analyserView.loadWaveformData(waveformData);
      if (this.waveformCanvas) {
        this.waveformCanvas.loadWaveformData(waveformData);
      }

      // Load full spectrogram
      await this.player.play();
      this.startRender();

      this.currentTrackName = file.name;
      this.analyserView.setShowImage(false);

      if (fileLabel) fileLabel.textContent = file.name;
      this.playPauseBtn.disabled = false;
      this.updateUI();
    } catch (error) {
      console.error('Error loading audio file:', error);
      if (fileLabel) fileLabel.textContent = 'Select Audio File';
      this.statusMessage.textContent = 'Error: ' + error.message;
    }
  }

  startRender() {
    if (this.isRendering) return;
    this.isRendering = true;
    this.draw();
  }

  stopRender() {
    this.isRendering = false;
  }

  draw() {
    if (!this.isRendering) return;

    try {
      this.analyserView.doFrequencyAnalysis();

      // Update spectrogram playhead position
} catch (error) {
      console.error('Render error:', error);
    }
    requestAnimationFrame(() => this.draw());
  }

  increaseFrequencyBins() {
    this.player.increaseFrequencyBins();
}

  decreaseFrequencyBins() {
    this.player.decreaseFrequencyBins();
}

  closeControlPanel() {
    if (this.controlPanel) {
      this.controlPanel.style.display = 'none';
    }
    if (this.menuButton) {
      this.menuButton.style.display = 'block';
    }
  }

  openControlPanel() {
    if (this.controlPanel) {
      this.controlPanel.style.display = 'block';
    }
    if (this.menuButton) {
      this.menuButton.style.display = 'none';
    }
  }

  handleOutsideClick(event) {
    // Check if click is outside the control panel and menu button
    const isClickInsidePanel = this.controlPanel && this.controlPanel.contains(event.target);
    const isClickOnMenuButton = this.menuButton && this.menuButton.contains(event.target);
    const isPanelVisible = this.controlPanel && this.controlPanel.style.display !== 'none';

    if (!isClickInsidePanel && !isClickOnMenuButton && isPanelVisible) {
      this.closeControlPanel();
    }
  }

}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SpectrogramApp();
});
