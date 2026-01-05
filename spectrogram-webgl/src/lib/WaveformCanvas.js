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

    // Colors
    this.waveColor = '#808080';        // Gray for unplayed
    this.progressColor = '#00b3ff';    // Cyan for played
    this.playheadColor = '#ffffff';    // White for cursor
    this.backgroundColor = '#000000';  // Black background

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
    const centerY = canvasHeight / 2;
    const pixelWidth = canvasWidth / this.waveformWidth;

    // Get current playhead position
    const playheadPos = this.getPlayheadPosition();

    // Draw waveform envelope
    ctx.strokeStyle = this.waveColor;
    ctx.fillStyle = this.waveColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    // Draw min/max envelope lines
    ctx.beginPath();
    for (let i = 0; i < this.waveformWidth; i++) {
      const minAmp = this.waveformData[i * 2];      // [-1, 1]
      const maxAmp = this.waveformData[i * 2 + 1];  // [-1, 1]

      const x = i * pixelWidth;
      const minY = centerY + minAmp * (canvasHeight / 2 - 2);
      const maxY = centerY + maxAmp * (canvasHeight / 2 - 2);

      if (i === 0) {
        ctx.moveTo(x, minY);
      }
      ctx.lineTo(x, minY);
    }
    ctx.stroke();

    // Draw max envelope
    ctx.beginPath();
    for (let i = 0; i < this.waveformWidth; i++) {
      const maxAmp = this.waveformData[i * 2 + 1];

      const x = i * pixelWidth;
      const maxY = centerY + maxAmp * (canvasHeight / 2 - 2);

      if (i === 0) {
        ctx.moveTo(x, maxY);
      }
      ctx.lineTo(x, maxY);
    }
    ctx.stroke();

    // Fill waveform area with progress color up to playhead (full envelope)
    ctx.fillStyle = this.progressColor;
    ctx.globalAlpha = 0.5;

    const playheadX = playheadPos * canvasWidth;

    // Draw filled area from min to max for played portion
    ctx.beginPath();

    // Top line: max envelope from start to playhead
    for (let i = 0; i < this.waveformWidth; i++) {
      const maxAmp = this.waveformData[i * 2 + 1];
      const x = i * pixelWidth;

      if (x > playheadX) break;

      const maxY = centerY + maxAmp * (canvasHeight / 2 - 2);
      if (i === 0) {
        ctx.moveTo(x, maxY);
      } else {
        ctx.lineTo(x, maxY);
      }
    }

    // Line to playhead at center
    ctx.lineTo(playheadX, centerY);

    // Bottom line: min envelope from playhead back to start
    for (let i = this.waveformWidth - 1; i >= 0; i--) {
      const minAmp = this.waveformData[i * 2];
      const x = i * pixelWidth;

      if (x > playheadX) continue;

      const minY = centerY + minAmp * (canvasHeight / 2 - 2);
      ctx.lineTo(x, minY);
    }

    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1.0;
  }

  drawPlayhead(canvasWidth, canvasHeight) {
    const playheadPos = this.getPlayheadPosition();
    const playheadX = playheadPos * canvasWidth;

    // Draw playhead vertical line
    this.ctx.strokeStyle = this.playheadColor;
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 0.9;

    this.ctx.beginPath();
    this.ctx.moveTo(playheadX, 0);
    this.ctx.lineTo(playheadX, canvasHeight);
    this.ctx.stroke();

    this.ctx.globalAlpha = 1.0;
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
