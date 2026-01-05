/**
 * Shader utility for loading and compiling WebGL shaders
 */

function glslNameToJs(name) {
  return name.replace(/_(.)/g, (_, p1) => p1.toUpperCase());
}

class Shader {
  constructor(gl, vertexSrc, fragmentSrc) {
    this.gl = gl;
    this.program = gl.createProgram();

    const vs = this.loadShader(gl.VERTEX_SHADER, vertexSrc);
    if (!vs) return;
    gl.attachShader(this.program, vs);
    gl.deleteShader(vs);

    const fs = this.loadShader(gl.FRAGMENT_SHADER, fragmentSrc);
    if (!fs) return;
    gl.attachShader(this.program, fs);
    gl.deleteShader(fs);

    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    const linked = gl.getProgramParameter(this.program, gl.LINK_STATUS);
    if (!linked) {
      console.error('Error linking program:', gl.getProgramInfoLog(this.program));
      gl.deleteProgram(this.program);
      this.program = null;
      return;
    }

    // Find uniforms and attributes (supports optional precision qualifiers like lowp, mediump, highp)
    const re = /(uniform|attribute)\s+(?:(?:lowp|mediump|highp)\s+)?\S+\s+(\S+)\s*;/g;
    let match;
    const combined = vertexSrc + '\n' + fragmentSrc;
    while ((match = re.exec(combined)) !== null) {
      const glslName = match[2];
      const jsName = glslNameToJs(glslName);
      if (match[1] === 'uniform') {
        this[jsName + 'Loc'] = this.getUniform(glslName);
      } else if (match[1] === 'attribute') {
        this[jsName + 'Loc'] = this.getAttribute(glslName);
      }
    }
  }

  bind() {
    this.gl.useProgram(this.program);
  }

  loadShader(type, src) {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  getAttribute(name) {
    return this.gl.getAttribLocation(this.program, name);
  }

  getUniform(name) {
    return this.gl.getUniformLocation(this.program, name);
  }
}

export function createShader(gl, vertexSrc, fragmentSrc) {
  return new Shader(gl, vertexSrc, fragmentSrc);
}

export { Shader };
