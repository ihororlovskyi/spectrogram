/**
 * A simple 4x4 Matrix utility class
 * Based on sample code from the OpenGL(R) ES 2.0 Programming Guide
 */

export class Matrix4x4 {
  constructor() {
    this.elements = new Array(16);
    this.loadIdentity();
  }

  scale(sx, sy, sz) {
    this.elements[0 * 4 + 0] *= sx;
    this.elements[0 * 4 + 1] *= sx;
    this.elements[0 * 4 + 2] *= sx;
    this.elements[0 * 4 + 3] *= sx;

    this.elements[1 * 4 + 0] *= sy;
    this.elements[1 * 4 + 1] *= sy;
    this.elements[1 * 4 + 2] *= sy;
    this.elements[1 * 4 + 3] *= sy;

    this.elements[2 * 4 + 0] *= sz;
    this.elements[2 * 4 + 1] *= sz;
    this.elements[2 * 4 + 2] *= sz;
    this.elements[2 * 4 + 3] *= sz;

    return this;
  }

  translate(tx, ty, tz) {
    this.elements[3 * 4 + 0] += this.elements[0 * 4 + 0] * tx + this.elements[1 * 4 + 0] * ty + this.elements[2 * 4 + 0] * tz;
    this.elements[3 * 4 + 1] += this.elements[0 * 4 + 1] * tx + this.elements[1 * 4 + 1] * ty + this.elements[2 * 4 + 1] * tz;
    this.elements[3 * 4 + 2] += this.elements[0 * 4 + 2] * tx + this.elements[1 * 4 + 2] * ty + this.elements[2 * 4 + 2] * tz;
    this.elements[3 * 4 + 3] += this.elements[0 * 4 + 3] * tx + this.elements[1 * 4 + 3] * ty + this.elements[2 * 4 + 3] * tz;

    return this;
  }

  rotate(angle, x, y, z) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    const sinAngle = Math.sin(angle * Math.PI / 180.0);
    const cosAngle = Math.cos(angle * Math.PI / 180.0);

    if (mag > 0) {
      x /= mag;
      y /= mag;
      z /= mag;

      const xx = x * x;
      const yy = y * y;
      const zz = z * z;
      const xy = x * y;
      const yz = y * z;
      const zx = z * x;
      const xs = x * sinAngle;
      const ys = y * sinAngle;
      const zs = z * sinAngle;
      const oneMinusCos = 1.0 - cosAngle;

      const rotMat = new Matrix4x4();

      rotMat.elements[0 * 4 + 0] = (oneMinusCos * xx) + cosAngle;
      rotMat.elements[0 * 4 + 1] = (oneMinusCos * xy) - zs;
      rotMat.elements[0 * 4 + 2] = (oneMinusCos * zx) + ys;
      rotMat.elements[0 * 4 + 3] = 0.0;

      rotMat.elements[1 * 4 + 0] = (oneMinusCos * xy) + zs;
      rotMat.elements[1 * 4 + 1] = (oneMinusCos * yy) + cosAngle;
      rotMat.elements[1 * 4 + 2] = (oneMinusCos * yz) - xs;
      rotMat.elements[1 * 4 + 3] = 0.0;

      rotMat.elements[2 * 4 + 0] = (oneMinusCos * zx) - ys;
      rotMat.elements[2 * 4 + 1] = (oneMinusCos * yz) + xs;
      rotMat.elements[2 * 4 + 2] = (oneMinusCos * zz) + cosAngle;
      rotMat.elements[2 * 4 + 3] = 0.0;

      rotMat.elements[3 * 4 + 0] = 0.0;
      rotMat.elements[3 * 4 + 1] = 0.0;
      rotMat.elements[3 * 4 + 2] = 0.0;
      rotMat.elements[3 * 4 + 3] = 1.0;

      const result = rotMat.multiply(this);
      this.elements = result.elements;
    }

    return this;
  }

  rotateRad(angleInRadians, x, y, z) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    const sinAngle = Math.sin(angleInRadians);
    const cosAngle = Math.cos(angleInRadians);

    if (mag > 0) {
      x /= mag;
      y /= mag;
      z /= mag;

      const xx = x * x;
      const yy = y * y;
      const zz = z * z;
      const xy = x * y;
      const yz = y * z;
      const zx = z * x;
      const xs = x * sinAngle;
      const ys = y * sinAngle;
      const zs = z * sinAngle;
      const oneMinusCos = 1.0 - cosAngle;

      const rotMat = new Matrix4x4();

      rotMat.elements[0 * 4 + 0] = (oneMinusCos * xx) + cosAngle;
      rotMat.elements[0 * 4 + 1] = (oneMinusCos * xy) - zs;
      rotMat.elements[0 * 4 + 2] = (oneMinusCos * zx) + ys;
      rotMat.elements[0 * 4 + 3] = 0.0;

      rotMat.elements[1 * 4 + 0] = (oneMinusCos * xy) + zs;
      rotMat.elements[1 * 4 + 1] = (oneMinusCos * yy) + cosAngle;
      rotMat.elements[1 * 4 + 2] = (oneMinusCos * yz) - xs;
      rotMat.elements[1 * 4 + 3] = 0.0;

      rotMat.elements[2 * 4 + 0] = (oneMinusCos * zx) - ys;
      rotMat.elements[2 * 4 + 1] = (oneMinusCos * yz) + xs;
      rotMat.elements[2 * 4 + 2] = (oneMinusCos * zz) + cosAngle;
      rotMat.elements[2 * 4 + 3] = 0.0;

      rotMat.elements[3 * 4 + 0] = 0.0;
      rotMat.elements[3 * 4 + 1] = 0.0;
      rotMat.elements[3 * 4 + 2] = 0.0;
      rotMat.elements[3 * 4 + 3] = 1.0;

      const result = rotMat.multiply(this);
      this.elements = result.elements;
    }

    return this;
  }

  frustum(left, right, bottom, top, nearZ, farZ) {
    const deltaX = right - left;
    const deltaY = top - bottom;
    const deltaZ = farZ - nearZ;

    if ((nearZ <= 0.0) || (farZ <= 0.0) ||
        (deltaX <= 0.0) || (deltaY <= 0.0) || (deltaZ <= 0.0))
      return this;

    const frust = new Matrix4x4();

    frust.elements[0 * 4 + 0] = 2.0 * nearZ / deltaX;
    frust.elements[0 * 4 + 1] = frust.elements[0 * 4 + 2] = frust.elements[0 * 4 + 3] = 0.0;

    frust.elements[1 * 4 + 1] = 2.0 * nearZ / deltaY;
    frust.elements[1 * 4 + 0] = frust.elements[1 * 4 + 2] = frust.elements[1 * 4 + 3] = 0.0;

    frust.elements[2 * 4 + 0] = (right + left) / deltaX;
    frust.elements[2 * 4 + 1] = (top + bottom) / deltaY;
    frust.elements[2 * 4 + 2] = -(nearZ + farZ) / deltaZ;
    frust.elements[2 * 4 + 3] = -1.0;

    frust.elements[3 * 4 + 2] = -2.0 * nearZ * farZ / deltaZ;
    frust.elements[3 * 4 + 0] = frust.elements[3 * 4 + 1] = frust.elements[3 * 4 + 3] = 0.0;

    const result = frust.multiply(this);
    this.elements = result.elements;

    return this;
  }

  perspective(fovy, aspect, nearZ, farZ) {
    const frustumH = Math.tan(fovy / 360.0 * Math.PI) * nearZ;
    const frustumW = frustumH * aspect;

    return this.frustum(-frustumW, frustumW, -frustumH, frustumH, nearZ, farZ);
  }

  ortho(left, right, bottom, top, nearZ, farZ) {
    const deltaX = right - left;
    const deltaY = top - bottom;
    const deltaZ = farZ - nearZ;

    if ((deltaX === 0.0) || (deltaY === 0.0) || (deltaZ === 0.0))
      return this;

    const ortho = new Matrix4x4();

    ortho.elements[0 * 4 + 0] = 2.0 / deltaX;
    ortho.elements[1 * 4 + 1] = 2.0 / deltaY;
    ortho.elements[2 * 4 + 2] = -2.0 / deltaZ;
    ortho.elements[3 * 4 + 0] = -(right + left) / deltaX;
    ortho.elements[3 * 4 + 1] = -(top + bottom) / deltaY;
    ortho.elements[3 * 4 + 2] = -(nearZ + farZ) / deltaZ;
    ortho.elements[3 * 4 + 3] = 1.0;

    const result = ortho.multiply(this);
    this.elements = result.elements;

    return this;
  }

  multiply(right) {
    const tmp = new Matrix4x4();

    for (let i = 0; i < 4; i++) {
      tmp.elements[i * 4 + 0] =
        (this.elements[i * 4 + 0] * right.elements[0 * 4 + 0]) +
        (this.elements[i * 4 + 1] * right.elements[1 * 4 + 0]) +
        (this.elements[i * 4 + 2] * right.elements[2 * 4 + 0]) +
        (this.elements[i * 4 + 3] * right.elements[3 * 4 + 0]);

      tmp.elements[i * 4 + 1] =
        (this.elements[i * 4 + 0] * right.elements[0 * 4 + 1]) +
        (this.elements[i * 4 + 1] * right.elements[1 * 4 + 1]) +
        (this.elements[i * 4 + 2] * right.elements[2 * 4 + 1]) +
        (this.elements[i * 4 + 3] * right.elements[3 * 4 + 1]);

      tmp.elements[i * 4 + 2] =
        (this.elements[i * 4 + 0] * right.elements[0 * 4 + 2]) +
        (this.elements[i * 4 + 1] * right.elements[1 * 4 + 2]) +
        (this.elements[i * 4 + 2] * right.elements[2 * 4 + 2]) +
        (this.elements[i * 4 + 3] * right.elements[3 * 4 + 2]);

      tmp.elements[i * 4 + 3] =
        (this.elements[i * 4 + 0] * right.elements[0 * 4 + 3]) +
        (this.elements[i * 4 + 1] * right.elements[1 * 4 + 3]) +
        (this.elements[i * 4 + 2] * right.elements[2 * 4 + 3]) +
        (this.elements[i * 4 + 3] * right.elements[3 * 4 + 3]);
    }

    this.elements = tmp.elements;
    return this;
  }

  loadIdentity() {
    for (let i = 0; i < 16; i++)
      this.elements[i] = 0;
    this.elements[0 * 4 + 0] = 1.0;
    this.elements[1 * 4 + 1] = 1.0;
    this.elements[2 * 4 + 2] = 1.0;
    this.elements[3 * 4 + 3] = 1.0;
    return this;
  }
}

export default Matrix4x4;
