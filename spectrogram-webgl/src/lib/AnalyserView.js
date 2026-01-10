/**
 * WebGL-based audio spectrum visualizer
 */

import { Matrix4x4 } from './Matrix4x4.js';
import { CameraController } from './CameraController.js';
import { createShader } from './ShaderLoader.js';
import { AxisRenderer } from './AxisRenderer.js';
import { GridRenderer } from './GridRenderer.js';
import { YGridRenderer } from './YGridRenderer.js';
import { ZGridRenderer } from './ZGridRenderer.js';

// Import shaders as raw text
import commonVertexShader from '../shaders/common-vertex.glsl?raw';
import sonogramVertexShader from '../shaders/sonogram-vertex.glsl?raw';
import frequencyFragmentShader from '../shaders/frequency-fragment.glsl?raw';
import sonogramFragmentShader from '../shaders/sonogram-fragment.glsl?raw';
import imageVertexShader from '../shaders/image-vertex.glsl?raw';
import imageFragmentShader from '../shaders/image-fragment.glsl?raw';
import waveformVertexShader from '../shaders/waveform-vertex.glsl?raw';
import waveformFragmentShader from '../shaders/waveform-fragment.glsl?raw';

const ANALYSISTYPE_FREQUENCY = 0;
const ANALYSISTYPE_SONOGRAM = 1;
const ANALYSISTYPE_3D_SONOGRAM = 2;

let model = null;
let view = null;
let projection = null;

export class AnalyserView {
  constructor(canvas) {
    this.analysisType = ANALYSISTYPE_3D_SONOGRAM;

    this.sonogram3DWidth = 256;
    this.sonogram3DHeight = 256;
    this.sonogram3DGeometrySize = 11;

    this.freqByteData = null;
    this.texture = null;
    this.TEXTURE_HEIGHT = 256;
    this.yoffset = 0;

    this.frequencyShader = null;
    this.sonogramShader = null;
    this.sonogram3DShader = null;
    this.imageShader = null;
    this.waveformShader = null;
    this.axisRenderer = null;
    this.gridRenderer = null;
    this.yGridRenderer = null;
    this.zGridRenderer = null;

    // Waveform visualization properties
    this.waveformTexture = null;
    this.waveformVBO = null;
    this.waveformIBO = null;
    this.waveformVBOTexCoordOffset = 0;
    this.waveformData = null;
    this.waveformWidth = 0;
    this.player = null;
    this.waveformVisible = false; // Hide waveform in 3D scene by default

    // Image rendering properties
    this.showImage = false;
    this.imageTexture = null;
    this.imageVBO = null;
    this.imageVBOTexCoordOffset = 0;

    // Background color
    this.backgroundColor = [0.09, 0.09, 0.09, 1];
    this.foregroundColor = [0, 0.7, 0, 1];

    // Color mode: 0 = Rainbow, 1 = Gray, 2 = Inferno, 3 = Forest, 4 = White→Black, 5 = Mountains
    this.colorMode = 0;

    // Scale mode: 0 = Log, 1 = Linear, 2 = Mel
    this.scaleMode = 0;

    // Flip Y: inverts Y axis
    this.flipY = false;

    // Flip X: inverts X axis
    this.flipX = false;

    // Flip Z: inverts Z axis
    this.flipZ = false;

    this.canvas = canvas;
    this.initGL();
  }

  setColorMode(mode) {
    this.colorMode = mode;
  }

  setScaleMode(mode) {
    this.scaleMode = mode;
  }

  setFlipY(flipY) {
    this.flipY = flipY;
  }

  setFlipX(flipX) {
    this.flipX = flipX;
  }

  setFlipZ(flipZ) {
    this.flipZ = flipZ;
  }

  setPlayer(player) {
    this.player = player;
  }

  loadWaveformData(waveformData) {
    if (!this.gl) {
      console.error('GL context not initialized when loadWaveformData called');
      return;
    }

    const gl = this.gl;
    const width = waveformData.length / 2;

    // Create texture
    if (this.waveformTexture) {
      gl.deleteTexture(this.waveformTexture);
    }

    this.waveformTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.waveformTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Prepare data as RGBA with min/max in R and G channels
    // Row 0: min amplitudes, Row 1: max amplitudes
    // Use Uint8Array and convert [-1,1] range to [0,255]
    const textureData = new Uint8Array(width * 2 * 4); // RGBA = 4 channels
    for (let i = 0; i < width; i++) {
      // Row 0 (min): convert from [-1,1] to [0,255]
      const minValue = Math.floor((waveformData[i * 2] + 1.0) * 127.5);
      textureData[i * 4] = Math.max(0, Math.min(255, minValue));     // R
      textureData[i * 4 + 1] = 0;                 // G
      textureData[i * 4 + 2] = 0;                 // B
      textureData[i * 4 + 3] = 255;               // A

      // Row 1 (max): convert from [-1,1] to [0,255]
      const maxValue = Math.floor((waveformData[i * 2 + 1] + 1.0) * 127.5);
      textureData[(width + i) * 4] = Math.max(0, Math.min(255, maxValue)); // R
      textureData[(width + i) * 4 + 1] = 0;                 // G
      textureData[(width + i) * 4 + 2] = 0;                 // B
      textureData[(width + i) * 4 + 3] = 255;               // A
    }

    // Use RGBA format with UNSIGNED_BYTE type (standard for WebGL)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                   width, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureData);

    this.waveformData = waveformData;
    this.waveformWidth = width;
  }

  getAvailableContext(canvas, contextList) {
    if (canvas.getContext) {
      for (let i = 0; i < contextList.length; ++i) {
        try {
          const context = canvas.getContext(contextList[i], { antialias: true });
          if (context !== null)
            return context;
        } catch (ex) { }
      }
    }
    return null;
  }

  initGL() {
    model = new Matrix4x4();
    view = new Matrix4x4();
    projection = new Matrix4x4();

    const { sonogram3DWidth, sonogram3DHeight, sonogram3DGeometrySize, backgroundColor } = this;
    const canvas = this.canvas;
    const gl = this.getAvailableContext(canvas, ['webgl', 'experimental-webgl']);
    this.gl = gl;

    // Check if we can do 3D visualization
    this.has3DVisualizer = (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0);

    if (!this.has3DVisualizer && this.analysisType === ANALYSISTYPE_3D_SONOGRAM)
      this.analysisType = ANALYSISTYPE_FREQUENCY;

    const cameraController = new CameraController(canvas);
    this.cameraController = cameraController;

    cameraController.xRot = -180;
    cameraController.yRot = 270;
    cameraController.zRot = 90;

    console.log('now', { xRot: cameraController.xRot, yRot: cameraController.yRot, zRot: cameraController.zRot });

    cameraController.xT = 0;
    cameraController.yT = -2;
    cameraController.zT = -2;

    // Create mesh object to store rotation and position (like Three.js)
    this.mesh = {
      rotation: {
        x: -180 * Math.PI / 180,  // -π radians
        y: 270 * Math.PI / 180,   // 3π/2 radians
        z: 90 * Math.PI / 180     // π/2 radians
      },
      position: {
        x: 0.96,
        y: -6.80,
        z: 0
      }
    };

    gl.clearColor(backgroundColor[0], backgroundColor[1], backgroundColor[2], backgroundColor[3]);
    gl.enable(gl.DEPTH_TEST);

    // 2D visualization geometry
    const vertices = new Float32Array([
      1.0, 1.0, 0.0,
      -1.0, 1.0, 0.0,
      -1.0, -1.0, 0.0,
      1.0, 1.0, 0.0,
      -1.0, -1.0, 0.0,
      1.0, -1.0, 0.0
    ]);
    const texCoords = new Float32Array([
      1.0, 1.0,
      0.0, 1.0,
      0.0, 0.0,
      1.0, 1.0,
      0.0, 0.0,
      1.0, 0.0
    ]);

    const vboTexCoordOffset = vertices.byteLength;
    this.vboTexCoordOffset = vboTexCoordOffset;

    const vbo = gl.createBuffer();
    this.vbo = vbo;

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vboTexCoordOffset + texCoords.byteLength, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.bufferSubData(gl.ARRAY_BUFFER, vboTexCoordOffset, texCoords);

    // 3D visualization geometry
    const numVertices = sonogram3DWidth * sonogram3DHeight;
    if (numVertices > 65536) {
      throw new Error("Sonogram 3D resolution is too high: can only handle 65536 vertices max");
    }

    const vertices3D = new Float32Array(numVertices * 3);
    const texCoords3D = new Float32Array(numVertices * 2);

    for (let z = 0; z < sonogram3DHeight; z++) {
      for (let x = 0; x < sonogram3DWidth; x++) {
        vertices3D[3 * (sonogram3DWidth * z + x) + 0] =
          sonogram3DGeometrySize * (x - sonogram3DWidth / 2) / sonogram3DWidth;
        vertices3D[3 * (sonogram3DWidth * z + x) + 1] = 0;
        vertices3D[3 * (sonogram3DWidth * z + x) + 2] =
          sonogram3DGeometrySize * (z - sonogram3DHeight / 2) / sonogram3DHeight;

        texCoords3D[2 * (sonogram3DWidth * z + x) + 0] = x / sonogram3DWidth;
        texCoords3D[2 * (sonogram3DWidth * z + x) + 1] = z / sonogram3DHeight;
      }
    }

    const vbo3DTexCoordOffset = vertices3D.byteLength;
    this.vbo3DTexCoordOffset = vbo3DTexCoordOffset;

    const sonogram3DVBO = gl.createBuffer();
    this.sonogram3DVBO = sonogram3DVBO;

    gl.bindBuffer(gl.ARRAY_BUFFER, sonogram3DVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vbo3DTexCoordOffset + texCoords3D.byteLength, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices3D);
    gl.bufferSubData(gl.ARRAY_BUFFER, vbo3DTexCoordOffset, texCoords3D);

    // Generate indices
    const sonogram3DNumIndices = (sonogram3DWidth - 1) * (sonogram3DHeight - 1) * 6;
    this.sonogram3DNumIndices = sonogram3DNumIndices;

    const indices = new Uint16Array(sonogram3DNumIndices);
    let idx = 0;
    for (let z = 0; z < sonogram3DHeight - 1; z++) {
      for (let x = 0; x < sonogram3DWidth - 1; x++) {
        indices[idx++] = z * sonogram3DWidth + x;
        indices[idx++] = z * sonogram3DWidth + x + 1;
        indices[idx++] = (z + 1) * sonogram3DWidth + x + 1;
        indices[idx++] = z * sonogram3DWidth + x;
        indices[idx++] = (z + 1) * sonogram3DWidth + x + 1;
        indices[idx++] = (z + 1) * sonogram3DWidth + x;
      }
    }

    const sonogram3DIBO = gl.createBuffer();
    this.sonogram3DIBO = sonogram3DIBO;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sonogram3DIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Waveform visualization geometry
    const waveformVertices = new Float32Array([
      -6.0, -1.0, 0.0,  // lower left
      6.0,  -1.0, 0.0,  // lower right
      6.0,   1.0, 0.0,  // upper right
      -6.0,  1.0, 0.0   // upper left
    ]);

    const waveformTexCoords = new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      1.0, 1.0,
      0.0, 1.0
    ]);

    const waveformIndices = new Uint16Array([
      0, 1, 2,
      0, 2, 3
    ]);

    // Waveform VBO
    const waveformVBOTexCoordOffset = waveformVertices.byteLength;
    this.waveformVBOTexCoordOffset = waveformVBOTexCoordOffset;

    this.waveformVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waveformVBO);
    gl.bufferData(gl.ARRAY_BUFFER,
                  waveformVBOTexCoordOffset + waveformTexCoords.byteLength,
                  gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, waveformVertices);
    gl.bufferSubData(gl.ARRAY_BUFFER, waveformVBOTexCoordOffset, waveformTexCoords);

    // Waveform IBO
    this.waveformIBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.waveformIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, waveformIndices, gl.STATIC_DRAW);

    // Load shaders
    this.frequencyShader = createShader(gl, commonVertexShader, frequencyFragmentShader);
    this.sonogramShader = createShader(gl, commonVertexShader, sonogramFragmentShader);

    if (this.has3DVisualizer) {
      this.sonogram3DShader = createShader(gl, sonogramVertexShader, sonogramFragmentShader);
    }

    // Load waveform shader
    this.waveformShader = createShader(gl, waveformVertexShader, waveformFragmentShader);

    // Initialize axis renderer
    this.axisRenderer = new AxisRenderer(gl, canvas);

    // Initialize grid renderers
    this.gridRenderer = new GridRenderer(gl, canvas);
    this.yGridRenderer = new YGridRenderer(gl, canvas);
    this.zGridRenderer = new ZGridRenderer(gl, canvas);
  }

  initByteBuffer() {
    const gl = this.gl;
    const TEXTURE_HEIGHT = this.TEXTURE_HEIGHT;

    if (!this.freqByteData || this.freqByteData.length !== this.analyser.frequencyBinCount) {
      const freqByteData = new Uint8Array(this.analyser.frequencyBinCount);
      this.freqByteData = freqByteData;

      if (this.texture) {
        gl.deleteTexture(this.texture);
        this.texture = null;
      }

      const texture = gl.createTexture();
      this.texture = texture;

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const tmp = new Uint8Array(freqByteData.length * TEXTURE_HEIGHT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, freqByteData.length, TEXTURE_HEIGHT, 0, gl.ALPHA, gl.UNSIGNED_BYTE, tmp);
    }
  }

  setAnalysisType(type) {
    if (!this.has3DVisualizer && type === ANALYSISTYPE_3D_SONOGRAM)
      return;
    this.analysisType = type;
  }

  doFrequencyAnalysis() {
    const freqByteData = this.freqByteData;

    switch (this.analysisType) {
      case ANALYSISTYPE_FREQUENCY:
        this.analyser.smoothingTimeConstant = 0.75;
        this.analyser.getByteFrequencyData(freqByteData);
        break;

      case ANALYSISTYPE_SONOGRAM:
      case ANALYSISTYPE_3D_SONOGRAM:
        this.analyser.smoothingTimeConstant = 0;
        this.analyser.getByteFrequencyData(freqByteData);
        break;
    }

    this.drawGL();
  }

  drawGL() {
    const canvas = this.canvas;
    const gl = this.gl;
    const vbo = this.vbo;
    const vboTexCoordOffset = this.vboTexCoordOffset;
    const sonogram3DVBO = this.sonogram3DVBO;
    const vbo3DTexCoordOffset = this.vbo3DTexCoordOffset;
    const sonogram3DGeometrySize = this.sonogram3DGeometrySize;
    const sonogram3DNumIndices = this.sonogram3DNumIndices;
    const sonogram3DWidth = this.sonogram3DWidth;
    const sonogram3DHeight = this.sonogram3DHeight;
    const freqByteData = this.freqByteData;
    const texture = this.texture;
    const TEXTURE_HEIGHT = this.TEXTURE_HEIGHT;

    const frequencyShader = this.frequencyShader;
    const sonogramShader = this.sonogramShader;
    const sonogram3DShader = this.sonogram3DShader;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (this.analysisType !== ANALYSISTYPE_SONOGRAM && this.analysisType !== ANALYSISTYPE_3D_SONOGRAM) {
      this.yoffset = 0;
    }

    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.yoffset, freqByteData.length, 1, gl.ALPHA, gl.UNSIGNED_BYTE, freqByteData);

    if (this.analysisType === ANALYSISTYPE_SONOGRAM || this.analysisType === ANALYSISTYPE_3D_SONOGRAM) {
      this.yoffset = (this.yoffset + 1) % TEXTURE_HEIGHT;
    }

    const yoffset = this.yoffset;

    let vertexLoc;
    let texCoordLoc;
    let frequencyDataLoc;
    let foregroundColorLoc;
    let backgroundColorLoc;
    let texCoordOffset;
    let currentShader;

    switch (this.analysisType) {
      case ANALYSISTYPE_FREQUENCY:
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        currentShader = frequencyShader;
        currentShader.bind();
        vertexLoc = currentShader.gPositionLoc;
        texCoordLoc = currentShader.gTexCoord0Loc;
        frequencyDataLoc = currentShader.frequencyDataLoc;
        foregroundColorLoc = currentShader.foregroundColorLoc;
        backgroundColorLoc = currentShader.backgroundColorLoc;
        gl.uniform1f(currentShader.yoffsetLoc, 0.5 / (TEXTURE_HEIGHT - 1));
        gl.uniform1i(currentShader.colorModeLoc, this.colorMode);
        gl.uniform1i(currentShader.scaleModeLoc, this.scaleMode);
        texCoordOffset = vboTexCoordOffset;
        break;

      case ANALYSISTYPE_SONOGRAM:
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        sonogramShader.bind();
        vertexLoc = sonogramShader.gPositionLoc;
        texCoordLoc = sonogramShader.gTexCoord0Loc;
        frequencyDataLoc = sonogramShader.frequencyDataLoc;
        foregroundColorLoc = sonogramShader.foregroundColorLoc;
        backgroundColorLoc = sonogramShader.backgroundColorLoc;
        gl.uniform1f(sonogramShader.yoffsetLoc, yoffset / (TEXTURE_HEIGHT - 1));
        gl.uniform1i(sonogramShader.colorModeLoc, this.colorMode);
        gl.uniform1i(sonogramShader.scaleModeLoc, this.scaleMode);
        texCoordOffset = vboTexCoordOffset;
        break;

      case ANALYSISTYPE_3D_SONOGRAM:
        gl.bindBuffer(gl.ARRAY_BUFFER, sonogram3DVBO);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sonogram3DIBO);
        sonogram3DShader.bind();
        vertexLoc = sonogram3DShader.gPositionLoc;
        texCoordLoc = sonogram3DShader.gTexCoord0Loc;
        frequencyDataLoc = sonogram3DShader.frequencyDataLoc;
        foregroundColorLoc = sonogram3DShader.foregroundColorLoc;
        backgroundColorLoc = sonogram3DShader.backgroundColorLoc;

        gl.uniform1i(sonogram3DShader.vertexFrequencyDataLoc, 0);
        gl.uniform1i(sonogram3DShader.colorModeLoc, this.colorMode);
        gl.uniform1i(sonogram3DShader.scaleModeLoc, this.scaleMode);

        const normalizedYOffset = this.yoffset / TEXTURE_HEIGHT;
        gl.uniform1f(sonogram3DShader.yoffsetLoc, normalizedYOffset);

        const discretizedYOffset = Math.floor(normalizedYOffset * sonogram3DHeight) / sonogram3DHeight;
        gl.uniform1f(sonogram3DShader.vertexYOffsetLoc, discretizedYOffset);
        gl.uniform1f(sonogram3DShader.verticalScaleLoc, sonogram3DGeometrySize / 3.5);

        // Set up matrices
        projection.loadIdentity();
        projection.perspective(55, canvas.width / canvas.height, 1, 100);
        view.loadIdentity();
        view.translate(0, 0, -9.0);

        model.loadIdentity();
        model.rotateRad(this.mesh.rotation.x, 1, 0, 0);
        model.rotateRad(this.mesh.rotation.y, 0, 1, 0);
        model.rotateRad(this.mesh.rotation.z, 0, 0, 1);
        const scaleX = this.flipX ? -1 : 1;
        const scaleY = this.flipY ? -1 : 1;
        const scaleZ = this.flipZ ? -1 : 1;
        model.scale(scaleX, scaleY, scaleZ);
        model.translate(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);

        const mvp = new Matrix4x4();
        mvp.multiply(model);
        mvp.multiply(view);
        mvp.multiply(projection);
        gl.uniformMatrix4fv(sonogram3DShader.worldViewProjectionLoc, gl.FALSE, mvp.elements);
        texCoordOffset = vbo3DTexCoordOffset;
        break;
    }

    if (frequencyDataLoc) {
      gl.uniform1i(frequencyDataLoc, 0);
    }
    if (foregroundColorLoc) {
      gl.uniform4fv(foregroundColorLoc, this.foregroundColor);
    }
    if (backgroundColorLoc) {
      gl.uniform4fv(backgroundColorLoc, this.backgroundColor);
    }

    gl.enableVertexAttribArray(vertexLoc);
    gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, gl.FALSE, 0, texCoordOffset);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.analysisType === ANALYSISTYPE_FREQUENCY || this.analysisType === ANALYSISTYPE_SONOGRAM) {
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (this.analysisType === ANALYSISTYPE_3D_SONOGRAM) {
      gl.drawElements(gl.TRIANGLES, sonogram3DNumIndices, gl.UNSIGNED_SHORT, 0);

      // Render waveform if available
      if (this.waveformTexture && this.waveformShader) {
        this.renderWaveform();
      }

      // Render image if needed
      if (this.showImage) {
        const mvpForImage = new Matrix4x4();
        mvpForImage.multiply(model);
        mvpForImage.multiply(view);
        mvpForImage.multiply(projection);
        // Position at center (0, 5.12, -10.24), or (0, 5.12, 10.24) if Flip Z is active
        const imageZ = this.flipZ ? 10.24 : -10.24;
        mvpForImage.translate(0, 5.12, imageZ);
        this.renderImage(mvpForImage.elements);
      }

      // Render axes and grids after drawing the spectrogram
      const mvpForAxes = new Matrix4x4();
      mvpForAxes.multiply(model);
      mvpForAxes.multiply(view);
      mvpForAxes.multiply(projection);
      this.axisRenderer.render(mvpForAxes.elements);
      this.gridRenderer.render(mvpForAxes.elements);
      this.yGridRenderer.render(mvpForAxes.elements);
      this.zGridRenderer.render(mvpForAxes.elements);
    }

    gl.disableVertexAttribArray(vertexLoc);
    gl.disableVertexAttribArray(texCoordLoc);
  }

  setAnalyserNode(analyser) {
    this.analyser = analyser;
  }

  setShowImage(show, imageUrl) {
    if (show && imageUrl && !this.imageShader) {
      // Initialize image shader if not already done
      this.imageShader = createShader(this.gl, imageVertexShader, imageFragmentShader);
      this.loadImage(imageUrl);
    }
    this.showImage = show;
  }

  loadImage(imageUrl) {
    const gl = this.gl;
    const image = new Image();

    image.onload = () => {
      if (!this.imageTexture) {
        this.imageTexture = gl.createTexture();
      }

      gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

      // Create geometry for image quad
      this.createImageGeometry();
    };

    image.onerror = () => {
      console.error('Failed to load image:', imageUrl);
      this.showImage = false;
    };

    image.src = imageUrl;
  }

  createImageGeometry() {
    const gl = this.gl;
    const size = 10.24;
    const halfSize = size / 2;

    // Quad centered at origin with size 10.24
    const vertices = new Float32Array([
      halfSize, halfSize, 0,      // top-right
      -halfSize, halfSize, 0,     // top-left
      -halfSize, -halfSize, 0,    // bottom-left
      halfSize, halfSize, 0,      // top-right
      -halfSize, -halfSize, 0,    // bottom-left
      halfSize, -halfSize, 0      // bottom-right
    ]);

    const texCoords = new Float32Array([
      1.0, 0.0,    // top-right (flipped V)
      0.0, 0.0,    // top-left (flipped V)
      0.0, 1.0,    // bottom-left (flipped V)
      1.0, 0.0,    // top-right (flipped V)
      0.0, 1.0,    // bottom-left (flipped V)
      1.0, 1.0     // bottom-right (flipped V)
    ]);

    this.imageVBOTexCoordOffset = vertices.byteLength;

    if (!this.imageVBO) {
      this.imageVBO = gl.createBuffer();
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.imageVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.imageVBOTexCoordOffset + texCoords.byteLength, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.imageVBOTexCoordOffset, texCoords);
  }

  renderImage(mvpMatrix) {
    if (!this.showImage || !this.imageShader || !this.imageTexture || !this.imageVBO) {
      return;
    }

    const gl = this.gl;
    const shader = this.imageShader;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.imageVBO);
    shader.bind();

    const vertexLoc = shader.gPositionLoc;
    const texCoordLoc = shader.gTexCoord0Loc;

    gl.uniformMatrix4fv(shader.worldViewProjectionLoc, gl.FALSE, mvpMatrix);
    gl.uniform1i(shader.imageSamplerLoc, 0);

    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);

    gl.enableVertexAttribArray(vertexLoc);
    gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, gl.FALSE, 0, this.imageVBOTexCoordOffset);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.disableVertexAttribArray(vertexLoc);
    gl.disableVertexAttribArray(texCoordLoc);
  }

  getPlayheadPosition() {
    if (!this.player) return 0.0;
    return this.player.getCurrentPlaybackPosition();
  }

  toggleWaveformVisibility() {
    this.waveformVisible = !this.waveformVisible;
    return this.waveformVisible;
  }

  setWaveformVisibility(visible) {
    this.waveformVisible = visible;
  }

  renderWaveform() {
    const gl = this.gl;
    const shader = this.waveformShader;
    const canvas = this.canvas;

    // Check if waveform should be visible
    if (!this.waveformVisible) {
      return;
    }

    if (!shader || !shader.program) {
      console.warn('Waveform shader not initialized');
      return;
    }

    if (!this.waveformTexture) {
      console.warn('Waveform texture not loaded');
      return;
    }

    // Save current GL state
    const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);

    // Disable depth test so waveform renders on top
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Bind waveform geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waveformVBO);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.waveformIBO);

    shader.bind();

    // Simple MVP: scale and position the waveform quad
    // Vertices are (-6..6, -1..1), transform to NDC space
    const mvpWaveform = new Matrix4x4();

    // Scale X from [-6..6] to [-1..1]: divide by 6
    // Keep Y small and position at bottom
    mvpWaveform.scale(1.0/6.0, 0.08, 1.0);
    mvpWaveform.translate(0, -9.0, 0);

    // Uniforms
    gl.uniformMatrix4fv(shader.worldViewProjectionLoc, gl.FALSE, mvpWaveform.elements);
    gl.uniform1i(shader.waveformDataLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waveformTexture);

    // Playhead position
    const playheadPos = this.getPlayheadPosition();
    gl.uniform1f(shader.playheadPositionLoc, playheadPos);

    // Colors for waveform visualization
    gl.uniform4f(shader.waveColorLoc, 0.5, 0.5, 0.5, 0.7);        // gray - unplayed
    gl.uniform4f(shader.progressColorLoc, 0.0, 0.7, 1.0, 0.9);    // cyan - played
    gl.uniform4f(shader.playheadColorLoc, 1.0, 1.0, 1.0, 1.0);    // white - cursor
    gl.uniform4f(shader.backgroundColorLoc, 0.0, 0.0, 0.0, 0.0);  // transparent black

    // Vertex attributes
    gl.vertexAttribPointer(shader.gPositionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.gPositionLoc);

    gl.vertexAttribPointer(shader.gTexCoord0Loc, 2, gl.FLOAT, false, 0,
                            this.waveformVBOTexCoordOffset);
    gl.enableVertexAttribArray(shader.gTexCoord0Loc);

    // Draw waveform
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.disableVertexAttribArray(shader.gPositionLoc);
    gl.disableVertexAttribArray(shader.gTexCoord0Loc);

    // Restore GL state
    if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Unbind element array buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }
}

export default AnalyserView;
