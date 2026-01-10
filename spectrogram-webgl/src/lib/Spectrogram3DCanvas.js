/**
 * Spectrogram3DCanvas - 2D Canvas-based 3D-like spectrogram visualization
 * Renders a full spectrogram of the complete audio file with 3D appearance (perspective)
 */

export class Spectrogram3DCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.player = null;
    this.analyserNode = null;

    // Spectrogram settings
    this.spectrogramData = []; // Array of frequency data arrays
    this.maxFreqBins = 256;
    this.colorMode = 1; // 0 = Rainbow, 1 = Gray, etc.
    this.scaleMode = 0; // 0 = Log, 1 = Linear, 2 = Mel
    this.isFullSpectrogram = false; // True when showing pre-analyzed full spectrogram
    this.currentPlayPosition = 0; // Current playhead position (0-1)
    this.audioBuffer = null; // Store audio buffer for reanalysis
    this.currentFFTSize = 1024; // Store current FFT size

    // Colors for different modes
    this.colorModes = {
      0: 'rainbow',
      1: 'gray',
      2: 'inferno',
      3: 'forest',
      5: 'mountains'
    };

    // Setup
    this.setupCanvas();
    this.startRenderLoop();
  }

  setupCanvas() {
    // Set canvas size
    this.onResize();
    window.addEventListener('resize', () => this.onResize());

    // Set 2D context properties
    this.ctx.imageSmoothingEnabled = true;

    // Add click handler for seeking
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
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

  setFFTSize(size) {
    if (this.currentFFTSize !== size && this.audioBuffer && this.isFullSpectrogram) {
      this.currentFFTSize = size;
      // Rebuild spectrogram with new FFT size
      this.loadFullSpectrogram(this.audioBuffer);
    }
  }

  async loadFullSpectrogram(audioBuffer) {
    // Store audio buffer for reanalysis when FFT size changes
    this.audioBuffer = audioBuffer;

    // Analyze entire audio buffer to build full spectrogram
    return new Promise((resolve) => {
      // Use offline context to render and analyze
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;

      const analyser = offlineContext.createAnalyser();
      // Use current FFT size from player if available
      const fftSize = this.analyserNode ? this.analyserNode.fftSize : this.currentFFTSize;
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = this.analyserNode ? this.analyserNode.smoothingTimeConstant : 0;
      this.currentFFTSize = fftSize;

      source.connect(analyser);
      analyser.connect(offlineContext.destination);
      source.start(0);

      // Render the entire audio
      offlineContext.startRendering().then((renderedBuffer) => {
        // Now analyze the rendered audio
        this.spectrogramData = [];
        const frequencyBinCount = analyser.frequencyBinCount;
        const chunkSize = Math.ceil(audioBuffer.sampleRate / 30); // ~30 FPS
        const rawData = renderedBuffer.getChannelData(0);

        // Create temporary analyser for proper FFT
        const tempContext = new (window.AudioContext || window.webkitAudioContext)();
        const tempAnalyser = tempContext.createAnalyser();
        tempAnalyser.fftSize = fftSize;
        tempAnalyser.smoothingTimeConstant = this.analyserNode ? this.analyserNode.smoothingTimeConstant : 0;

        // Process each chunk through analyser
        for (let i = 0; i < rawData.length; i += chunkSize) {
          const freqData = new Uint8Array(frequencyBinCount);
          this.computeFFTFromAnalyser(rawData, i, chunkSize, tempAnalyser, freqData);
          this.spectrogramData.push(freqData);
        }

        tempContext.close();
        this.isFullSpectrogram = true;
        this.maxFreqBins = frequencyBinCount;
        resolve();
      });
    });
  }

  computeFFTFromAnalyser(audioData, startIndex, chunkSize, analyser, outputData) {
    // Use Web Audio API's built-in analyser for accurate FFT
    // This mimics what the real-time analyser does

    const fftSize = analyser.fftSize;
    const windowSize = Math.min(chunkSize, fftSize);
    const samples = new Float32Array(fftSize);

    // Copy audio data with zero-padding
    for (let i = 0; i < windowSize && startIndex + i < audioData.length; i++) {
      samples[i] = audioData[startIndex + i];
    }

    // Apply Hann window to reduce spectral leakage
    for (let i = 0; i < windowSize; i++) {
      const hannValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
      samples[i] *= hannValue;
    }

    // Compute FFT using DFT
    for (let k = 0; k < outputData.length; k++) {
      let real = 0;
      let imag = 0;

      // DFT computation - only use actual samples, not zero-padding
      for (let n = 0; n < windowSize; n++) {
        const angle = (-2 * Math.PI * k * n) / fftSize;
        real += samples[n] * Math.cos(angle);
        imag += samples[n] * Math.sin(angle);
      }

      // Magnitude
      let magnitude = Math.sqrt(real * real + imag * imag);

      // Normalize: Web Audio API uses 2/fftSize for proper normalization
      magnitude = (2 / fftSize) * magnitude;

      // Convert to dB scale with proper normalization
      let dB = magnitude > 0 ? 20 * Math.log10(magnitude) : -100;

      // Map to 0-255 range (Web Audio API uses -100 to -30 dB range for display)
      dB = Math.max(-100, Math.min(-30, dB));
      const normalized = ((dB + 100) / 70) * 255;

      outputData[k] = Math.round(Math.max(0, Math.min(255, normalized)));
    }
  }

  setPlayPosition(position) {
    // Update current play position (0-1)
    this.currentPlayPosition = Math.max(0, Math.min(1, position));
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
    if (!this.canvas || !this.ctx) return;

    // Draw spectrogram
    this.drawSpectrogram();
  }

  drawSpectrogram() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Create image data for fast pixel manipulation
    const imageData = this.ctx.createImageData(width, height);
    const data = imageData.data;

    const numColumns = this.spectrogramData.length;

    if (this.isFullSpectrogram && numColumns > 0) {
      // Full spectrogram mode with 3D perspective effect
      for (let pixelX = 0; pixelX < width; pixelX++) {
        // Map pixel X to spectrogram data index
        const dataIndex = Math.floor((pixelX / width) * (numColumns - 1));
        const freqData = this.spectrogramData[dataIndex];

        // Iterate through all pixels in height to show full frequency range
        for (let pixelY = 0; pixelY < height; pixelY++) {
          // Map pixel Y to frequency bin
          // Top of screen (pixelY=0) = high frequencies
          // Bottom of screen (pixelY=height-1) = low frequencies
          // normalizedFreq goes from 0 (low freq) to 1 (high freq)
          const normalizedFreq = pixelY / (height - 1);
          // Apply scale mode (which expects 0=low, 1=high), then invert to get bin index
          const scaledFreq = this.applyScaleMode(normalizedFreq);
          // Invert to map top=high, bottom=low
          const binIndex = Math.floor((1.0 - scaledFreq) * (freqData.length - 1));
          const value = freqData[binIndex]; // 0-255

          // Get color based on value
          const color = this.getColorForValue(value);

          // Set pixel color
          const pixelIndex = (pixelY * width + pixelX) * 4;
          data[pixelIndex] = color.r;
          data[pixelIndex + 1] = color.g;
          data[pixelIndex + 2] = color.b;
          data[pixelIndex + 3] = 255;
        }
      }

      // Draw playhead line on top
      const playheadX = Math.round(this.currentPlayPosition * width);
      const playheadWidth = 2;
      for (let x = Math.max(0, playheadX - playheadWidth); x <= Math.min(width - 1, playheadX + playheadWidth); x++) {
        for (let y = 0; y < height; y++) {
          const pixelIndex = (y * width + x) * 4;
          data[pixelIndex] = 255; // White
          data[pixelIndex + 1] = 255;
          data[pixelIndex + 2] = 255;
          data[pixelIndex + 3] = 255;
        }
      }
    } else {
      // No data - fill with background
      const bgRGB = { r: 23, g: 23, b: 23 };
      for (let i = 0; i < data.length; i += 4) {
        data[i] = bgRGB.r;
        data[i + 1] = bgRGB.g;
        data[i + 2] = bgRGB.b;
        data[i + 3] = 255;
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  getColorForValue(value) {
    // Map 0-255 to color based on color mode
    const normalized = value / 255;
    switch (this.colorMode) {
      case 0:
        return this.colorRainbow(normalized);
      case 1:
        return this.colorGray(normalized);
      case 2:
        return this.colorInferno(normalized);
      case 3:
        return this.colorForest(normalized);
      case 5:
        return this.colorMountains(normalized);
      default:
        return this.colorGray(normalized);
    }
  }

  colorGray(t) {
    const val = Math.round(t * 255);
    return { r: val, g: val, b: val };
  }

  colorRainbow(t) {
    // HSV to RGB conversion with rainbow hue
    const hue = t * 360;
    const sat = 1.0;
    const val = 1.0;
    return this.hsvToRgb(hue, sat, val);
  }

  colorInferno(t) {
    // Inferno colormap approximation
    if (t < 0.25) {
      const x = t * 4;
      return {
        r: Math.round(0 * 255),
        g: Math.round(x * 0.5 * 255),
        b: Math.round(x * 255)
      };
    } else if (t < 0.5) {
      const x = (t - 0.25) * 4;
      return {
        r: Math.round(x * 255),
        g: Math.round((0.5 + x * 0.3) * 255),
        b: Math.round((1 - x * 0.2) * 255)
      };
    } else if (t < 0.75) {
      const x = (t - 0.5) * 4;
      return {
        r: Math.round((0.5 + x * 0.5) * 255),
        g: Math.round((0.8 - x * 0.3) * 255),
        b: Math.round((0.8 - x * 0.8) * 255)
      };
    } else {
      const x = (t - 0.75) * 4;
      return {
        r: Math.round((1 - x * 0.2) * 255),
        g: Math.round((1 - x * 0.2) * 255),
        b: Math.round((0 + x * 0.2) * 255)
      };
    }
  }

  colorForest(t) {
    // Forest colormap: dark green to light green to yellow
    if (t < 0.5) {
      const x = t * 2;
      return {
        r: Math.round((0.1 + x * 0.3) * 255),
        g: Math.round((0.4 + x * 0.3) * 255),
        b: Math.round((0.1 + x * 0.1) * 255)
      };
    } else {
      const x = (t - 0.5) * 2;
      return {
        r: Math.round((0.4 + x * 0.6) * 255),
        g: Math.round((0.7 + x * 0.3) * 255),
        b: Math.round((0.2 - x * 0.2) * 255)
      };
    }
  }

  colorMountains(t) {
    // Mountains colormap: dark blue to white to brown
    if (t < 0.4) {
      const x = t / 0.4;
      return {
        r: Math.round((0 + x * 0.3) * 255),
        g: Math.round((0.2 + x * 0.5) * 255),
        b: Math.round((0.5 + x * 0.4) * 255)
      };
    } else if (t < 0.6) {
      const x = (t - 0.4) / 0.2;
      return {
        r: Math.round((0.3 + x * 0.7) * 255),
        g: Math.round((0.7 + x * 0.3) * 255),
        b: Math.round((0.9 - x * 0.4) * 255)
      };
    } else {
      const x = (t - 0.6) / 0.4;
      return {
        r: Math.round((1 * 255)),
        g: Math.round((1 - x * 0.3) * 255),
        b: Math.round((0.5 - x * 0.3) * 255)
      };
    }
  }

  hsvToRgb(h, s, v) {
    const c = v * s;
    const hp = h / 60.0;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;

    if (hp < 1) {
      r = c;
      g = x;
    } else if (hp < 2) {
      r = x;
      g = c;
    } else if (hp < 3) {
      g = c;
      b = x;
    } else if (hp < 4) {
      g = x;
      b = c;
    } else if (hp < 5) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    const m = v - c;

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  applyScaleMode(normalizedFreq) {
    // normalizedFreq: 0-1 linear frequency
    // Returns scaled frequency position based on scale mode
    // Scale modes: 0 = Log, 1 = Linear, 2 = Mel

    switch (this.scaleMode) {
      case 0: // Logarithmic
        // Log scale: emphasize lower frequencies
        // Map linear frequency (0-1) to logarithmic distribution
        const minHz = 20; // Minimum frequency (Hz)
        const maxHz = 20000; // Maximum frequency (Hz)
        const logMin = Math.log10(minHz);
        const logMax = Math.log10(maxHz);
        // Convert linear position to logarithmic position
        return (Math.log10(minHz + normalizedFreq * (maxHz - minHz)) - logMin) / (logMax - logMin);

      case 1: // Linear
        return normalizedFreq;

      case 2: // Mel scale
        // Mel scale: better match human perception
        return this.linearToMel(normalizedFreq);

      default:
        return normalizedFreq;
    }
  }

  linearToMel(normalizedFreq) {
    // Convert linear frequency scale to Mel scale
    const minHz = 20;
    const maxHz = 20000;
    const freq = minHz + normalizedFreq * (maxHz - minHz);

    // Mel conversion: mel = 2595 * log10(1 + f/700)
    const melMin = 2595 * Math.log10(1 + minHz / 700);
    const melMax = 2595 * Math.log10(1 + maxHz / 700);
    const mel = 2595 * Math.log10(1 + freq / 700);

    return (mel - melMin) / (melMax - melMin);
  }

  handleClick(event) {
    if (!this.player || !this.player.buffer) return;

    // Get canvas position and click coordinates
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;

    // Calculate normalized position (0.0 to 1.0)
    const normalizedPos = x / this.canvas.width;

    // Seek to that position
    this.seekToPosition(normalizedPos);
  }

  seekToPosition(normalizedPos) {
    if (!this.player || !this.player.buffer) return;

    // Clamp to [0, 1]
    const clampedPos = Math.max(0, Math.min(1, normalizedPos));

    // Calculate new pause time based on track duration
    const newPauseTime = clampedPos * this.player.buffer.duration;

    // Update player's pause time
    this.player.pauseTime = newPauseTime;

    // If currently playing, restart from new position
    if (this.player.isPlaying()) {
      this.player.play();
    }
  }

  destroy() {
    this.stopRenderLoop();
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas = null;
    this.ctx = null;
  }
}
