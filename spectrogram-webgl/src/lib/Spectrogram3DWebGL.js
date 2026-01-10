/**
 * Spectrogram3DWebGL - WebGL-based 3D full spectrogram visualizer
 * Renders pre-analyzed offline FFT data as a 3D WebGL spectrogram
 * with playhead indicator and interactive controls
 */

import { Matrix4x4 } from './Matrix4x4.js';
import { createShader } from './ShaderLoader.js';

// Import shaders
import sonogramVertexShader from '../shaders/sonogram-vertex.glsl?raw';
import sonogramFragmentShader from '../shaders/sonogram-fragment-full.glsl?raw';

export class Spectrogram3DWebGL {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.player = null;
    this.analyserNode = null;

    console.log('[Spectrogram3DWebGL] Constructor called, initializing 3D spectrogram canvas');

    // Spectrogram settings
    this.spectrogramData = []; // Array of frequency data arrays (pre-analyzed)
    this.maxFreqBins = 256;
    this.spectrogramMin = 0;
    this.spectrogramMax = 255;
    this.colorMode = 2; // 0 = Rainbow, 1 = Gray, 2 = Inferno, 3 = Forest, 5 = Mountains
    this.scaleMode = 0; // 0 = Log, 1 = Linear, 2 = Mel
    this.currentPlayPosition = 0; // Current playhead position (0-1)
    this.audioBuffer = null;
    this.currentFFTSize = 1024;

    // WebGL properties
    this.sonogram3DShader = null;
    this.texture = null;
    this.vbo = null;
    this.ibo = null;
    this.numIndices = 0;
    this.vboTexCoordOffset = 0;
    this.indexType = null;
    this.uint32IndexExt = null;

    // Mesh and camera
    this.mesh = {
      rotation: {
        x: -60 * Math.PI / 180,
        y: 30 * Math.PI / 180,
        z: 0 * Math.PI / 180
      },
      position: {
        x: 0,
        y: 0,
        z: 0
      }
    };

    // Camera and rendering state
    this.cameraController = null;
    this.backgroundColor = [0.05, 0.05, 0.05, 1];
    this.flipY = false;
    this.flipX = false;
    this.flipZ = false;

    // Playhead line rendering
    this.playheadVBO = null;
    this.playheadNumVertices = 0;

    // Spectrogram texture dimensions (will be updated when data loads)
    this.textureWidth = 512; // Time frames (will be updated)
    this.textureHeight = 512; // Frequency bins (will be updated)
    this.isFullSpectrogram = false;

    // Initialize GL (which defers certain operations)
    this.initGL();

    // Start render loop after a small delay to ensure GL is initialized
    // (initGL uses setTimeout, so we need to wait for that)
    setTimeout(() => {
      this.startRenderLoop();
    }, 50);
  }

  setPlayer(player) {
    this.player = player;
  }

  setAnalyserNode(analyserNode) {
    this.analyserNode = analyserNode;
    this.maxFreqBins = analyserNode.frequencyBinCount;
  }

  setColorMode(mode) {
    this.colorMode = mode;
  }

  setScaleMode(mode) {
    this.scaleMode = mode;
  }

  setPlayPosition(position) {
    this.currentPlayPosition = Math.max(0, Math.min(1, position));
  }

  setFFTSize(size) {
    if (this.currentFFTSize !== size && this.audioBuffer && this.isFullSpectrogram) {
      this.currentFFTSize = size;
      this.loadFullSpectrogram(this.audioBuffer);
    }
  }

  // Camera and transform controls
  setFlipY(flip) {
    this.flipY = flip;
  }

  setFlipX(flip) {
    this.flipX = flip;
  }

  setFlipZ(flip) {
    this.flipZ = flip;
  }

  // Synchronized camera control (used by main.js for linked controls)
  setCameraRotation(xRot, yRot, zRot) {
    this.mesh.rotation.x = xRot * Math.PI / 180;
    this.mesh.rotation.y = yRot * Math.PI / 180;
    this.mesh.rotation.z = zRot * Math.PI / 180;
  }

  setCameraPosition(x, y, z) {
    this.mesh.position.x = x;
    this.mesh.position.y = y;
    this.mesh.position.z = z;
  }

  getAvailableContext(canvas, contextList) {
    if (canvas.getContext) {
      for (let i = 0; i < contextList.length; ++i) {
        try {
          const context = canvas.getContext(contextList[i], { antialias: true });
          if (context !== null) return context;
        } catch (ex) {}
      }
    }
    return null;
  }

  initGL() {
    const canvas = this.canvas;

    // Ensure canvas has initial dimensions
    const setCanvasDimensions = () => {
      // Always use clientWidth/clientHeight which reflects CSS sizing
      let width = canvas.clientWidth;
      let height = canvas.clientHeight;

      // If clientWidth/clientHeight are 0, try getBoundingClientRect
      if (width === 0 || height === 0) {
        const rect = canvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        console.log('[Spectrogram3DWebGL.initGL] clientWidth/Height were 0, using getBoundingClientRect:', width, 'x', height);
      }

      // If still 0, use fallback
      if (width === 0 || height === 0) {
        console.warn('[Spectrogram3DWebGL.initGL] Canvas dimensions are still 0! Using fallback 256x256');
        width = 256;
        height = 256;
      }

      // Set canvas drawing buffer size to match display size
      canvas.width = Math.max(1, Math.floor(width));
      canvas.height = Math.max(1, Math.floor(height));

      console.log('[Spectrogram3DWebGL.initGL] Canvas dimensions set to:', canvas.width, 'x', canvas.height);

      const gl = this.getAvailableContext(canvas, ['webgl', 'experimental-webgl']);
      this.gl = gl;

      if (!gl) {
        console.error('WebGL not supported on spectrogramCanvas3D');
        return;
      }

      this.uint32IndexExt = gl.getExtension('OES_element_index_uint');
      if (this.uint32IndexExt) {
        console.log('[Spectrogram3DWebGL.initGL] OES_element_index_uint enabled');
      }

      console.log('[Spectrogram3DWebGL.initGL] WebGL initialized, canvas:', canvas.width, 'x', canvas.height);

      gl.clearColor(...this.backgroundColor);
      gl.enable(gl.DEPTH_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Create shaders
      try {
        this.sonogram3DShader = createShader(gl, sonogramVertexShader, sonogramFragmentShader);
        console.log('[Spectrogram3DWebGL.initGL] Shaders created successfully');
      } catch (error) {
        console.error('[Spectrogram3DWebGL.initGL] Error creating shaders:', error);
      }

      // Create default geometry (will be replaced with full spectrogram data)
      try {
        this.createDefaultGeometry();
        console.log('[Spectrogram3DWebGL.initGL] Default geometry created');
      } catch (error) {
        console.error('[Spectrogram3DWebGL.initGL] Error creating default geometry:', error);
      }

      // Create placeholder texture to avoid rendering errors before data loads
      try {
        this.createPlaceholderTexture();
        console.log('[Spectrogram3DWebGL.initGL] Placeholder texture created');
      } catch (error) {
        console.error('[Spectrogram3DWebGL.initGL] Error creating placeholder texture:', error);
      }
    };

    // Defer initialization slightly to ensure layout is computed
    setTimeout(setCanvasDimensions, 10);
  }

  createDefaultGeometry() {
    const gl = this.gl;
    let width = this.textureWidth;
    let height = this.textureHeight;
    const maxUint16Vertices = 65535;
    let needsUint32 = width * height > maxUint16Vertices;

    if (needsUint32 && !this.uint32IndexExt) {
      const targetWidth = Math.min(width, Math.floor(Math.sqrt(maxUint16Vertices)));
      const targetHeight = Math.min(height, Math.floor(maxUint16Vertices / targetWidth));
      console.warn(
        '[Spectrogram3DWebGL.createDefaultGeometry] OES_element_index_uint not available; downsampling geometry to',
        targetWidth,
        'x',
        targetHeight
      );
      width = Math.max(2, targetWidth);
      height = Math.max(2, targetHeight);
      this.textureWidth = width;
      this.textureHeight = height;
      needsUint32 = width * height > maxUint16Vertices;
    }

    this.indexType = needsUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    const widthDenominator = Math.max(1, width - 1);
    const heightDenominator = Math.max(1, height - 1);

    // Create grid geometry
    const vertices = new Float32Array(width * height * 3);
    const texCoords = new Float32Array(width * height * 2);
    const indices = [];

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const idx = z * width + x;
        // X = frequency axis, Z = time axis, Y = amplitude (added in shader).
        vertices[idx * 3 + 0] = (x / widthDenominator) * 2 - 1;
        vertices[idx * 3 + 1] = 0;
        vertices[idx * 3 + 2] = (z / heightDenominator) * 2 - 1;

        // Normalize texture coordinates: x = frequency, y = time.
        texCoords[idx * 2 + 0] = x / widthDenominator;
        texCoords[idx * 2 + 1] = z / heightDenominator;
      }
    }

    // Create indices for triangle strips
    for (let z = 0; z < height - 1; z++) {
      for (let x = 0; x < width; x++) {
        indices.push(z * width + x);
        indices.push((z + 1) * width + x);
      }
      if (z < height - 2) {
        indices.push((z + 1) * width + (width - 1));
        indices.push((z + 1) * width);
      }
    }

    const vboTexCoordOffset = vertices.byteLength;
    this.vboTexCoordOffset = vboTexCoordOffset;
    this.numIndices = indices.length;

    console.log('[Spectrogram3DWebGL.createDefaultGeometry] Geometry created:', {
      vertexCount: width * height,
      indexCount: indices.length,
      verticesSize: vertices.byteLength,
      texCoordsSize: texCoords.byteLength,
      vboTexCoordOffset: vboTexCoordOffset
    });

    // Upload to GPU
    const vbo = gl.createBuffer();
    this.vbo = vbo;

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vboTexCoordOffset + texCoords.byteLength, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.bufferSubData(gl.ARRAY_BUFFER, vboTexCoordOffset, texCoords);

    const ibo = gl.createBuffer();
    this.ibo = ibo;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const indexArray = needsUint32 ? new Uint32Array(indices) : new Uint16Array(indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

    console.log('[Spectrogram3DWebGL.createDefaultGeometry] GPU buffers uploaded successfully');
  }

  async loadFullSpectrogram(audioBuffer) {
    this.audioBuffer = audioBuffer;
    console.log('[Spectrogram3DWebGL.loadFullSpectrogram] Starting offline FFT analysis...');

    return new Promise((resolve, reject) => {
      try {
        const offlineContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          audioBuffer.length,
          audioBuffer.sampleRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = offlineContext.createAnalyser();
        const fftSize = this.analyserNode ? this.analyserNode.fftSize : this.currentFFTSize;
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = this.analyserNode ? this.analyserNode.smoothingTimeConstant : 0;
        this.currentFFTSize = fftSize;

        console.log('[Spectrogram3DWebGL.loadFullSpectrogram] FFT Size:', fftSize, 'Audio length:', audioBuffer.length, 'Sample rate:', audioBuffer.sampleRate);

        source.connect(analyser);
        analyser.connect(offlineContext.destination);
        source.start(0);

        offlineContext.startRendering().then((renderedBuffer) => {
          try {
            this.spectrogramData = [];
            const frequencyBinCount = analyser.frequencyBinCount;
            const chunkSize = Math.ceil(audioBuffer.sampleRate / 30); // ~30 FPS
            const rawData = renderedBuffer.getChannelData(0);

            // Compute FFT for each chunk
            const tempContext = new (window.AudioContext || window.webkitAudioContext)();
            const tempAnalyser = tempContext.createAnalyser();
            tempAnalyser.fftSize = fftSize;
            tempAnalyser.smoothingTimeConstant = this.analyserNode ? this.analyserNode.smoothingTimeConstant : 0;

            for (let i = 0; i < rawData.length; i += chunkSize) {
              const freqData = new Uint8Array(frequencyBinCount);
              this.computeFFTFromAnalyser(rawData, i, chunkSize, tempAnalyser, freqData);
              this.spectrogramData.push(freqData);
            }

            tempContext.close();
            let minValue = 255;
            let maxValue = 0;
            for (const frameData of this.spectrogramData) {
              for (let i = 0; i < frameData.length; i++) {
                const value = frameData[i];
                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;
              }
            }
            this.spectrogramMin = minValue;
            this.spectrogramMax = maxValue;

            console.log('[Spectrogram3DWebGL.loadFullSpectrogram] FFT analysis completed, frames:', this.spectrogramData.length);
            console.log('[Spectrogram3DWebGL.loadFullSpectrogram] Value range:', {
              min: this.spectrogramMin,
              max: this.spectrogramMax
            });

            this.isFullSpectrogram = true;
            this.maxFreqBins = frequencyBinCount;

            // Update texture dimensions to match actual data
            // Use full resolution but cap at 1024x1024 for WebGL compatibility
            // Texture X = frequency bins, texture Y = time frames (matches shader expectations).
            const maxTextureSize = 1024;
            this.textureWidth = Math.max(256, Math.min(maxTextureSize, frequencyBinCount));
            this.textureHeight = Math.max(256, Math.min(maxTextureSize, this.spectrogramData.length));

            console.log('[Spectrogram3DWebGL.loadFullSpectrogram] Data dimensions:', {
              spectrogram_frames: this.spectrogramData.length,
              frequency_bins: frequencyBinCount,
              texture_width: this.textureWidth,
              texture_height: this.textureHeight
            });
            console.log('[Spectrogram3DWebGL.loadFullSpectrogram] Texture dimensions set to:', this.textureWidth, 'x', this.textureHeight);

            // Recreate geometry with correct dimensions
            try {
              this.createDefaultGeometry();
              console.log('[Spectrogram3DWebGL.loadFullSpectrogram] Geometry recreated with dimensions:', this.textureWidth, 'x', this.textureHeight);
            } catch (error) {
              console.error('[Spectrogram3DWebGL.loadFullSpectrogram] Error recreating geometry:', error);
            }

            // Create texture from spectrogram data
            this.createSpectrogramTexture();
            console.log('[Spectrogram3DWebGL.loadFullSpectrogram] Spectrogram texture created');
            resolve();
          } catch (error) {
            console.error('[Spectrogram3DWebGL.loadFullSpectrogram] Error processing offline buffer:', error);
            reject(error);
          }
        }).catch((error) => {
          console.error('[Spectrogram3DWebGL.loadFullSpectrogram] Offline rendering failed:', error);
          reject(error);
        });
      } catch (error) {
        console.error('[Spectrogram3DWebGL.loadFullSpectrogram] Error initializing offline context:', error);
        reject(error);
      }
    });
  }

  computeFFTFromAnalyser(audioData, startIndex, chunkSize, analyser, outputData) {
    const fftSize = analyser.fftSize;
    const windowSize = Math.min(chunkSize, fftSize);
    const samples = new Float32Array(fftSize);

    // Copy audio data
    for (let i = 0; i < windowSize && startIndex + i < audioData.length; i++) {
      samples[i] = audioData[startIndex + i];
    }

    // Apply Hann window
    for (let i = 0; i < windowSize; i++) {
      const hannValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
      samples[i] *= hannValue;
    }

    // Compute FFT using DFT
    for (let k = 0; k < outputData.length; k++) {
      let real = 0;
      let imag = 0;

      // Only use actual samples, not zero-padding
      for (let n = 0; n < windowSize; n++) {
        const angle = (-2 * Math.PI * k * n) / fftSize;
        real += samples[n] * Math.cos(angle);
        imag += samples[n] * Math.sin(angle);
      }

      let magnitude = Math.sqrt(real * real + imag * imag);

      // Normalize: Web Audio API uses 2/fftSize
      magnitude = (2 / fftSize) * magnitude;

      // Convert to dB scale
      let dB = magnitude > 0 ? 20 * Math.log10(magnitude) : -100;

      // Map to 0-255 range (Web Audio API uses -100 to -30 dB)
      dB = Math.max(-100, Math.min(-30, dB));
      const normalized = ((dB + 100) / 70) * 255;

      outputData[k] = Math.round(Math.max(0, Math.min(255, normalized)));
    }
  }

  createPlaceholderTexture() {
    const gl = this.gl;
    if (!gl) return;

    if (!this.texture) {
      this.texture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create a simple gray placeholder
    const placeholderData = new Uint8Array(this.textureWidth * this.textureHeight * 4);
    for (let i = 0; i < placeholderData.length; i += 4) {
      placeholderData[i + 0] = 64;     // R
      placeholderData[i + 1] = 64;     // G
      placeholderData[i + 2] = 64;     // B
      placeholderData[i + 3] = 128;    // A (alpha)
    }

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.textureWidth, this.textureHeight, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      placeholderData
    );
  }

  createSpectrogramTexture() {
    const gl = this.gl;
    if (!gl) {
      console.error('[Spectrogram3DWebGL.createSpectrogramTexture] WebGL context not available');
      return;
    }

    const frameCount = this.spectrogramData.length;
    if (frameCount === 0) {
      console.warn('[Spectrogram3DWebGL.createSpectrogramTexture] No spectrogram data to render');
      return;
    }
    const sourceBinCount = this.spectrogramData[0]?.length || this.maxFreqBins;

    console.log(
      '[Spectrogram3DWebGL.createSpectrogramTexture] Creating texture with',
      this.textureWidth,
      'bins and',
      this.textureHeight,
      'frames (source:',
      frameCount,
      'frames,',
      sourceBinCount,
      'bins)'
    );

    // Create texture data
    const textureData = new Uint8Array(this.textureWidth * this.textureHeight);
    textureData.fill(0);

    const frameIndexForY = new Uint32Array(this.textureHeight);
    const binIndexForX = new Uint32Array(this.textureWidth);
    const widthDenominator = Math.max(1, this.textureWidth - 1);
    const heightDenominator = Math.max(1, this.textureHeight - 1);
    const minValue = Number.isFinite(this.spectrogramMin) ? this.spectrogramMin : 0;
    const maxValue = Number.isFinite(this.spectrogramMax) ? this.spectrogramMax : 255;
    const valueRange = Math.max(1, maxValue - minValue);
    const frameDenominator = Math.max(1, frameCount - 1);
    const binDenominator = Math.max(1, sourceBinCount - 1);

    for (let x = 0; x < this.textureWidth; x++) {
      binIndexForX[x] = Math.min(sourceBinCount - 1, Math.floor((x / widthDenominator) * binDenominator));
    }

    for (let y = 0; y < this.textureHeight; y++) {
      frameIndexForY[y] = Math.min(frameCount - 1, Math.floor((y / heightDenominator) * frameDenominator));
    }

    // Fill texture with resampled spectrogram data to cover the full time and frequency range.
    for (let y = 0; y < this.textureHeight; y++) {
      const freqData = this.spectrogramData[frameIndexForY[y]];
      if (!freqData || freqData.length === 0) continue;
      for (let x = 0; x < this.textureWidth; x++) {
        const safeBinIndex = Math.min(freqData.length - 1, binIndexForX[x]);
        const rawValue = freqData[safeBinIndex];
        const normalized = Math.round(((rawValue - minValue) / valueRange) * 255);
        textureData[y * this.textureWidth + x] = Math.max(0, Math.min(255, normalized));
      }
    }

    // Create or update texture
    if (!this.texture) {
      this.texture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Convert luminance data to RGBA for better compatibility
    const rgbaData = new Uint8Array(this.textureWidth * this.textureHeight * 4);
    for (let i = 0; i < textureData.length; i++) {
      const value = textureData[i];
      rgbaData[i * 4 + 0] = value; // R
      rgbaData[i * 4 + 1] = value; // G
      rgbaData[i * 4 + 2] = value; // B
      rgbaData[i * 4 + 3] = value; // A
    }

    try {
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA,
        this.textureWidth, this.textureHeight, 0,
        gl.RGBA, gl.UNSIGNED_BYTE,
        rgbaData
      );
      console.log('[Spectrogram3DWebGL.createSpectrogramTexture] Texture created successfully');
    } catch (error) {
      console.error('[Spectrogram3DWebGL.createSpectrogramTexture] Error creating texture:', error);
    }
  }

  startRenderLoop() {
    const render = () => {
      this.render();
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  stopRenderLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  render() {
    if (!this.gl) return;

    const gl = this.gl;

    // Log viewport once to verify it's set correctly
    if (!this.hasLoggedViewport) {
      const viewport = gl.getParameter(gl.VIEWPORT);
      console.log('[Spectrogram3DWebGL.render] WebGL viewport:', {
        x: viewport[0],
        y: viewport[1],
        width: viewport[2],
        height: viewport[3]
      });
      this.hasLoggedViewport = true;
    }

    if (!this.isFullSpectrogram) {
      // While waiting, render a test pattern to verify canvas is working
      gl.clearColor(0.0, 0.3, 0.6, 1.0); // Bright blue
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      if (!this.testPatternRendered) {
        this.testPatternRendered = true;
        console.log('[Spectrogram3DWebGL.render] Rendering test pattern (bright blue) while waiting for spectrogram data to load');
      }
      return;
    }

    // Clear with configured background color once data is available
    gl.clearColor(...this.backgroundColor);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const shader = this.sonogram3DShader;
    if (!shader) {
      console.error('[Spectrogram3DWebGL.render] Shader is null!');
      return;
    }
    gl.useProgram(shader.program);

    // Setup matrices
    const model = new Matrix4x4();
    const view = new Matrix4x4();
    const projection = new Matrix4x4();

    // Apply mesh transforms - rotate around each axis separately
    model.rotateRad(this.mesh.rotation.x, 1, 0, 0);  // Rotate around X axis
    model.rotateRad(this.mesh.rotation.y, 0, 1, 0);  // Rotate around Y axis
    model.rotateRad(this.mesh.rotation.z, 0, 0, 1);  // Rotate around Z axis
    model.translate(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);

    // Apply flip transforms
    if (this.flipX) model.scale(-1, 1, 1);
    if (this.flipY) model.scale(1, -1, 1);
    if (this.flipZ) model.scale(1, 1, -1);

    // Position camera to view the geometry properly
    view.translate(0, 0, -3.5);

    // Fix aspect ratio calculation to handle extreme aspect ratios
    const canvasAspect = gl.canvas.width > 0 && gl.canvas.height > 0 ? gl.canvas.width / gl.canvas.height : 1;

    projection.perspective(55, canvasAspect, 0.1, 100);

    const mvp = new Matrix4x4();
    mvp.multiply(projection);
    mvp.multiply(view);
    mvp.multiply(model);

    // Log render info once on first successful render
    if (!this.hasLoggedFirstRender) {
      console.log('[Spectrogram3DWebGL.render] First render with data:', {
        canvasSize: `${gl.canvas.width}x${gl.canvas.height}`,
        aspectRatio: canvasAspect.toFixed(2),
        meshRotation: {
          x: (this.mesh.rotation.x * 180 / Math.PI).toFixed(1),
          y: (this.mesh.rotation.y * 180 / Math.PI).toFixed(1),
          z: (this.mesh.rotation.z * 180 / Math.PI).toFixed(1)
        },
        spectrogramFrames: this.spectrogramData.length,
        frequencyBins: this.maxFreqBins
      });
      this.hasLoggedFirstRender = true;
    }

    // Set uniforms (using shader properties created by ShaderLoader)
    if (shader.worldViewProjectionLoc !== undefined && shader.worldViewProjectionLoc !== null) {
      gl.uniformMatrix4fv(shader.worldViewProjectionLoc, false, mvp.elements);
    }

    if (shader.colorModeLoc !== undefined && shader.colorModeLoc !== null) {
      gl.uniform1i(shader.colorModeLoc, this.colorMode);
    }

    if (shader.scaleModeLoc !== undefined && shader.scaleModeLoc !== null) {
      gl.uniform1i(shader.scaleModeLoc, this.scaleMode);
    }

    if (shader.yoffsetLoc !== undefined && shader.yoffsetLoc !== null) {
      gl.uniform1f(shader.yoffsetLoc, 0.0);
    }

    if (shader.backgroundColorLoc !== undefined && shader.backgroundColorLoc !== null) {
      gl.uniform4f(
        shader.backgroundColorLoc,
        this.backgroundColor[0],
        this.backgroundColor[1],
        this.backgroundColor[2],
        this.backgroundColor[3]
      );
    }

    if (shader.foregroundColorLoc !== undefined && shader.foregroundColorLoc !== null) {
      gl.uniform4f(shader.foregroundColorLoc, 1.0, 1.0, 1.0, 1.0);
    }

    // vertexYOffset = 0 for full spectrogram (no scrolling)
    if (shader.vertexYOffsetLoc !== undefined && shader.vertexYOffsetLoc !== null) {
      gl.uniform1f(shader.vertexYOffsetLoc, 0.0);
    }

    if (shader.verticalScaleLoc !== undefined && shader.verticalScaleLoc !== null) {
      gl.uniform1f(shader.verticalScaleLoc, 1.5); // Vertical amplitude displacement scale
    }

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (shader.vertexFrequencyDataLoc !== undefined && shader.vertexFrequencyDataLoc !== null) {
      gl.uniform1i(shader.vertexFrequencyDataLoc, 0);
    }
    if (shader.frequencyDataLoc !== undefined && shader.frequencyDataLoc !== null) {
      gl.uniform1i(shader.frequencyDataLoc, 0);
    }

    // Bind geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    // Set vertex attributes
    if (shader.gPositionLoc !== undefined && shader.gPositionLoc !== null && shader.gPositionLoc >= 0) {
      gl.vertexAttribPointer(shader.gPositionLoc, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(shader.gPositionLoc);
    } else {
      console.warn('[Spectrogram3DWebGL.render] gPosition attribute location not found or invalid');
    }

    if (shader.gTexCoord0Loc !== undefined && shader.gTexCoord0Loc !== null && shader.gTexCoord0Loc >= 0) {
      gl.vertexAttribPointer(shader.gTexCoord0Loc, 2, gl.FLOAT, false, 0, this.vboTexCoordOffset);
      gl.enableVertexAttribArray(shader.gTexCoord0Loc);
    } else {
      console.warn('[Spectrogram3DWebGL.render] gTexCoord0 attribute location not found or invalid');
    }

    // Check for WebGL errors before drawing
    let error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('[Spectrogram3DWebGL.render] WebGL error detected before draw:', error);
    }

    // Draw
    if (this.numIndices > 0) {
      const indexType = this.indexType || gl.UNSIGNED_SHORT;
      gl.drawElements(gl.TRIANGLE_STRIP, this.numIndices, indexType, 0);

      // Check for errors after drawing
      error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.error('[Spectrogram3DWebGL.render] WebGL error after draw:', error);
      } else {
        // Log successful draw (but only first time to avoid spam)
        if (!this.hasLoggedDraw) {
          console.log('[Spectrogram3DWebGL.render] Draw call successful, rendered', this.numIndices, 'indices');
          this.hasLoggedDraw = true;
        }
      }
    } else {
      console.warn('[Spectrogram3DWebGL.render] No indices to draw, numIndices = 0');
    }
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    console.log('[Spectrogram3DWebGL.onResize]', {
      'ClientRect.width': rect.width,
      'ClientRect.height': rect.height,
      'Canvas.width': this.canvas.width,
      'Canvas.height': this.canvas.height
    });
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  destroy() {
    this.stopRenderLoop();
    if (this.gl) {
      this.gl.deleteBuffer(this.vbo);
      this.gl.deleteBuffer(this.ibo);
      this.gl.deleteTexture(this.texture);
      if (this.sonogram3DShader) {
        this.gl.deleteProgram(this.sonogram3DShader.program);
      }
    }
  }
}
