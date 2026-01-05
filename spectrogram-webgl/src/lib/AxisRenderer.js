/**
 * Renders 3D coordinate axes (X, Y, Z) using WebGL with labels
 */

export class AxisRenderer {
  constructor(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;
    this.vao = null;
    this.vbo = null;
    this.shader = null;
    this.vertexCount = 6; // 2 points per axis * 3 axes
    this.axisLength = 6.4;
    this.visible = false; // Toggle visibility of axes

    this.initShader();
    this.initGeometry();
    this.initLabels();
  }

  setVisible(visible) {
    this.visible = visible;
  }

  initLabels() {
    // Create canvas overlay for text labels
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.style.position = 'absolute';
    this.labelCanvas.style.pointerEvents = 'none';
    this.canvas.parentElement.appendChild(this.labelCanvas);

    this.labelCtx = this.labelCanvas.getContext('2d');

    // Initial sizing
    this.updateLabelCanvasSize();
  }

  updateLabelCanvasSize() {
    this.labelCanvas.width = this.canvas.clientWidth;
    this.labelCanvas.height = this.canvas.clientHeight;
    this.labelCanvas.style.left = this.canvas.offsetLeft + 'px';
    this.labelCanvas.style.top = this.canvas.offsetTop + 'px';
  }

  initShader() {
    const gl = this.gl;

    const vertexShader = `
      attribute vec3 aPosition;
      attribute vec3 aColor;

      uniform mat4 uWorldViewProj;

      varying vec3 vColor;

      void main() {
        gl_Position = uWorldViewProj * vec4(aPosition, 1.0);
        vColor = aColor;
      }
    `;

    const fragmentShader = `
      precision mediump float;

      varying vec3 vColor;

      void main() {
        gl_FragColor = vec4(vColor, 1.0);
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vertexShader);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragmentShader);
    gl.compileShader(fs);

    this.shader = gl.createProgram();
    gl.attachShader(this.shader, vs);
    gl.attachShader(this.shader, fs);
    gl.linkProgram(this.shader);
  }

  initGeometry() {
    const gl = this.gl;

    // X axis (red), Y axis (green), Z axis (blue)
    // Each axis: from origin to 3.2 units in that direction
    const axisLength = this.axisLength;

    const vertices = new Float32Array([
      // X axis - red
      0, 0, 0,  1, 0, 0,
      axisLength, 0, 0,  1, 0, 0,

      // Y axis - green
      0, 0, 0,  0, 1, 0,
      0, axisLength, 0,  0, 1, 0,

      // Z axis - blue
      0, 0, 0,  0, 0, 1,
      0, 0, axisLength,  0, 0, 1
    ]);

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  render(mvpMatrix) {
    if (!this.visible) {
      // Clear labels when not visible
      const ctx = this.labelCtx;
      const canvas = this.labelCanvas;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const gl = this.gl;

    gl.useProgram(this.shader);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    const posLoc = gl.getAttribLocation(this.shader, 'aPosition');
    const colorLoc = gl.getAttribLocation(this.shader, 'aColor');
    const mvpLoc = gl.getUniformLocation(this.shader, 'uWorldViewProj');

    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(colorLoc);

    // Position: 3 floats, Color: 3 floats = 24 bytes stride
    const stride = 24;
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 12);

    gl.uniformMatrix4fv(mvpLoc, false, mvpMatrix);

    gl.lineWidth(12.0);
    gl.drawArrays(gl.LINES, 0, this.vertexCount);
    gl.lineWidth(1.0);

    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(colorLoc);

    // Draw labels on 2D canvas overlay
    this.drawLabels(mvpMatrix);
  }

  drawLabels(mvpMatrix) {
    const ctx = this.labelCtx;
    const canvas = this.labelCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Project 3D axis endpoints to 2D screen space
    const projX = this.projectPoint([this.axisLength, 0, 0], mvpMatrix);
    const projY = this.projectPoint([0, this.axisLength, 0], mvpMatrix);
    const projZ = this.projectPoint([0, 0, this.axisLength], mvpMatrix);

    // Draw labels
    this.drawLabel(ctx, projX, 'X', '#FF0000');
    this.drawLabel(ctx, projY, 'Y', '#00FF00');
    this.drawLabel(ctx, projZ, 'Z', '#0000FF');
  }

  projectPoint(point3d, mvpMatrix) {
    // Convert 3D point to MVP space
    const mvp = mvpMatrix;
    const x = point3d[0];
    const y = point3d[1];
    const z = point3d[2];

    const clipX = mvp[0]*x + mvp[4]*y + mvp[8]*z + mvp[12];
    const clipY = mvp[1]*x + mvp[5]*y + mvp[9]*z + mvp[13];
    const clipZ = mvp[2]*x + mvp[6]*y + mvp[10]*z + mvp[14];
    const clipW = mvp[3]*x + mvp[7]*y + mvp[11]*z + mvp[15];

    // Perspective divide
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;

    // Convert NDC to screen space
    const screenX = (ndcX + 1) * 0.5 * this.labelCanvas.width;
    const screenY = (1 - ndcY) * 0.5 * this.labelCanvas.height;

    return { x: screenX, y: screenY };
  }

  drawLabel(ctx, screenPos, text, color) {
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;

    // Draw outline
    ctx.strokeText(text, screenPos.x + 5, screenPos.y + 5);
    // Draw text
    ctx.fillText(text, screenPos.x + 5, screenPos.y + 5);
  }
}

export default AxisRenderer;
