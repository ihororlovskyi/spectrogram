/**
 * Web Audio API Player for audio analysis
 */

export class Player {
  constructor() {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();

    const analyser = this.context.createAnalyser();
    // const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // analyser.fftSize = isMobile ? 1024 : 2048;
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;

    // Log FFT configuration
    console.log(`FFT Size: ${analyser.fftSize}`);

    const mix = this.context.createGain();
    const filterGain = this.context.createGain();
    filterGain.gain.value = 1;

    // Connect audio processing graph
    mix.connect(analyser);
    analyser.connect(filterGain);
    filterGain.connect(this.context.destination);

    this.mix = mix;
    this.filterGain = filterGain;
    this.analyser = analyser;
    this.source = null;
    this.buffer = null;
    this.startTime = 0;
    this.pauseTime = 0;
    this._isPlaying = false;
  }

  async loadAudioBuffer(file) {
    // Resume context on user interaction (required by browsers)
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // Reset position for new track
    this.pauseTime = 0;

    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(arrayBuffer);
    return this.buffer;
  }

  async loadAudioUrl(url) {
    // Resume context on user interaction (required by browsers)
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // Reset position for new track
    this.pauseTime = 0;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(arrayBuffer);
    return this.buffer;
  }

  async play() {
    if (!this.buffer) return;

    // Ensure context is running
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // Stop any currently playing source without resetting pause time
    this._stopSource();

    // Create new source
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.mix);

    // Start from paused position
    const offset = this.pauseTime % this.buffer.duration;
    this.source.start(0, offset);
    this.startTime = this.context.currentTime - offset;
    this._isPlaying = true;
  }

  pause() {
    if (!this._isPlaying || !this.source) return;

    // Save current position
    this.pauseTime = this.context.currentTime - this.startTime;
    this._stopSource();
    this._isPlaying = false;
  }

  _stopSource() {
    if (this.source) {
      try {
        this.source.stop(0);
      } catch (e) {
        // Source may already be stopped
      }
      this.source = null;
    }
  }

  stop() {
    this._stopSource();
    this.pauseTime = 0;
    this._isPlaying = false;
  }

  isPlaying() {
    return this._isPlaying;
  }

  getAnalyserNode() {
    return this.analyser;
  }

  setFFTSize(size) {
    const oldSize = this.analyser.fftSize;
    this.analyser.fftSize = size;
    console.log(`FFT Size changed: from ${oldSize} to ${size}`);
  }

  getFFTSize() {
    return this.analyser.fftSize;
  }

  increaseFrequencyBins() {
    const currentSize = this.analyser.fftSize;
    const newSize = currentSize * 2;
    if (newSize <= 32768) {
      this.setFFTSize(newSize);
      return true;
    }
    console.warn('Cannot increase FFT Size further (max is 32768)');
    return false;
  }

  decreaseFrequencyBins() {
    const currentSize = this.analyser.fftSize;
    const newSize = currentSize / 2;
    if (newSize >= 32) {
      this.setFFTSize(newSize);
      return true;
    }
    console.warn('Cannot decrease FFT Size further (min is 32)');
    return false;
  }

  getWaveformData(targetWidth = 2048) {
    if (!this.buffer) return new Float32Array(0);

    const channelData = this.buffer.getChannelData(0); // mono or left channel
    const samplesPerPixel = Math.floor(channelData.length / targetWidth);
    const waveformData = new Float32Array(targetWidth * 2); // min/max pairs

    for (let i = 0; i < targetWidth; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * samplesPerPixel;
      const end = start + samplesPerPixel;

      for (let j = start; j < end && j < channelData.length; j++) {
        const sample = channelData[j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      waveformData[i * 2] = min;
      waveformData[i * 2 + 1] = max;
    }

    return waveformData;
  }

  getCurrentPlaybackPosition() {
    if (!this.buffer) return 0.0;
    const duration = this.buffer.duration;
    // Use pauseTime if paused, otherwise calculate from currentTime
    const currentTime = this._isPlaying ? (this.context.currentTime - this.startTime) : this.pauseTime;
    return (currentTime % duration) / duration; // 0.0 to 1.0
  }
}

export default Player;
