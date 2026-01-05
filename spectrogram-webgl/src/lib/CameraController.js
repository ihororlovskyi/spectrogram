/**
 * A simple camera controller for WebGL
 */

export class CameraController {
  constructor(element) {
    this.onchange = null;
    this.xRot = 0;
    this.yRot = 0;
    this.zRot = 0;
    this.xT = 0;
    this.yT = 0;
    this.zT = 0;
    this.scaleFactor = 3.0;
    this.dragging = false;
    this.curX = 0;
    this.curY = 0;
  }
}

export default CameraController;
