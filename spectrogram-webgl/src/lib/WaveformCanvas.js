/**
 * WaveformCanvas - 2D Canvas-based waveform visualization
 * Renders waveform with min/max amplitude envelope and playhead position
 */

export class WaveformCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.player = null;
    this.waveformData = null;
    this.waveformWidth = 0;
    this.animationId = null;
    this.isRendering = false;

    // Colors (match waveform shader colors from AnalyserView.js:767-770)
    this.waveColor = '#404040';        // Gray for unplayed (0.5, 0.5, 0.5)
    this.progressColor = '#a3a3a3';    // Cyan for played (0.0, 0.7, 1.0)
    this.playheadColor = '#ffffff';    // White for cursor (1.0, 1.0, 1.0)
    this.backgroundColor = '#171717';  // Dark gray background (matches spectrogram)

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

  loadWaveformData(waveformData) {
    this.waveformData = waveformData;
    this.waveformWidth = waveformData.length / 2;
  }

  getPlayheadPosition() {
    if (!this.player) return 0.0;
    return this.player.getCurrentPlaybackPosition();
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

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    // Draw waveform
    if (this.waveformData && this.waveformWidth > 0) {
      this.drawWaveform(width, height);
    }

    // Draw playhead
    this.drawPlayhead(width, height);
  }

  drawWaveform(canvasWidth, canvasHeight) {
    if (!this.waveformData || this.waveformWidth === 0) return;

    const ctx = this.ctx;

    // Get current playhead position (normalized 0-1)
    const playheadPos = this.getPlayheadPosition();
    const playheadWidth = 0.001; // Slightly wider to match shader appearance

    // Create imageData for pixel-by-pixel drawing (much faster than fillRect)
    const imageData = ctx.createImageData(canvasWidth, canvasHeight);
    const data = imageData.data;

    // Parse colors to RGB
    const progressRGB = this.hexToRGB(this.progressColor);
    const waveRGB = this.hexToRGB(this.waveColor);
    const playheadRGB = this.hexToRGB(this.playheadColor);
    const bgRGB = this.hexToRGB(this.backgroundColor);

    // Fill entire canvas with background
    for (let i = 0; i < data.length; i += 4) {
      data[i] = bgRGB.r;
      data[i + 1] = bgRGB.g;
      data[i + 2] = bgRGB.b;
      data[i + 3] = 255;
    }

    // Draw waveform: iterate through each pixel
    for (let pixelX = 0; pixelX < canvasWidth; pixelX++) {
      // Normalize X coordinate [0, canvasWidth] -> [0, 1]
      const normX = pixelX / canvasWidth;

      // Get waveform data at this X position with linear interpolation
      const dataPos = normX * (this.waveformWidth - 1);
      const dataIndex = Math.floor(dataPos);
      const dataIndexNext = Math.min(dataIndex + 1, this.waveformWidth - 1);
      const fracPart = dataPos - dataIndex;

      if (dataIndex < 0 || dataIndex >= this.waveformWidth) continue;

      // Linear interpolation between two data points
      const minAmp1 = this.waveformData[dataIndex * 2];
      const maxAmp1 = this.waveformData[dataIndex * 2 + 1];
      const minAmp2 = this.waveformData[dataIndexNext * 2];
      const maxAmp2 = this.waveformData[dataIndexNext * 2 + 1];

      const minAmp = minAmp1 + (minAmp2 - minAmp1) * fracPart;
      const maxAmp = maxAmp1 + (maxAmp2 - maxAmp1) * fracPart;

      // Draw vertical line for this X position
      for (let pixelY = 0; pixelY < canvasHeight; pixelY++) {
        // Normalize Y coordinate [0, canvasHeight] -> [-1, 1]
        const normY = (pixelY / canvasHeight) * 2.0 - 1.0;

        // Check if pixel is within waveform envelope
        const inWaveform = (normY >= minAmp && normY <= maxAmp) ? 1.0 : 0.0;

        if (inWaveform > 0) {
          // Determine color based on playhead
          const isPlayhead = Math.abs(normX - playheadPos) <= playheadWidth ? 1.0 : 0.0;
          const isPlayed = normX <= playheadPos ? 1.0 : 0.0;

          let r, g, b, a;

          if (isPlayhead > 0) {
            // Playhead color (alpha 1.0)
            r = playheadRGB.r;
            g = playheadRGB.g;
            b = playheadRGB.b;
            a = 255; // 1.0 alpha
          } else if (isPlayed > 0) {
            // Progress color (alpha 0.9) - already played
            r = progressRGB.r;
            g = progressRGB.g;
            b = progressRGB.b;
            a = Math.round(255 * 0.9); // 0.9 alpha
          } else {
            // Wave color (alpha 0.7) - not yet played
            r = waveRGB.r;
            g = waveRGB.g;
            b = waveRGB.b;
            a = Math.round(255 * 0.7); // 0.7 alpha
          }

          const pixelIndex = (pixelY * canvasWidth + pixelX) * 4;
          data[pixelIndex] = r;
          data[pixelIndex + 1] = g;
          data[pixelIndex + 2] = b;
          data[pixelIndex + 3] = a;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  hexToRGB(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  drawPlayhead() {
    // Playhead is already drawn as part of drawWaveform
    // This method is kept for compatibility but does nothing
  }

  setColors(waveColor, progressColor, playheadColor, backgroundColor) {
    this.waveColor = waveColor;
    this.progressColor = progressColor;
    this.playheadColor = playheadColor;
    this.backgroundColor = backgroundColor;
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
