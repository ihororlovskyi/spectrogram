import * as THREE from 'three';
import deformSquareTunnelShader from './shadertoy/DeformSquareTunnel.glsl?raw';

// Shadertoy wrapper - adds standard uniforms and mainImage wrapper
const createShadertoyFragmentShader = (shaderCode: string): string => {
  return `
    precision highp float;

    uniform vec3 iResolution;
    uniform float iTime;
    uniform float iTimeDelta;
    uniform int iFrame;
    uniform vec4 iMouse;
    uniform sampler2D iChannel0;
    uniform sampler2D iChannel1;
    uniform sampler2D iChannel2;
    uniform sampler2D iChannel3;

    ${shaderCode}

    void main() {
      mainImage(gl_FragColor, gl_FragCoord.xy);
    }
  `;
};

// Simple vertex shader for fullscreen quad
const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

type ShadertoyRenderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  material: THREE.ShaderMaterial;
  resize: () => void;
  render: (time: number) => void;
  dispose: () => void;
};

const createShadertoyRenderer = (
  container: HTMLElement,
  fragmentShaderCode: string,
  texture?: THREE.Texture
): ShadertoyRenderer => {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Create fullscreen quad geometry
  const geometry = new THREE.PlaneGeometry(2, 2);

  // Create default texture if none provided
  const defaultTexture = texture || createDefaultTexture();

  // Create shader material with Shadertoy uniforms
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: createShadertoyFragmentShader(fragmentShaderCode),
    uniforms: {
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      iTime: { value: 0 },
      iTimeDelta: { value: 0 },
      iFrame: { value: 0 },
      iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
      iChannel0: { value: defaultTexture },
      iChannel1: { value: defaultTexture },
      iChannel2: { value: defaultTexture },
      iChannel3: { value: defaultTexture },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let frameCount = 0;
  let lastTime = 0;

  const resize = (): void => {
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    renderer.setSize(width, height);
    material.uniforms.iResolution.value.set(
      width * window.devicePixelRatio,
      height * window.devicePixelRatio,
      1
    );
  };

  const render = (time: number): void => {
    const timeInSeconds = time * 0.001;
    material.uniforms.iTime.value = timeInSeconds;
    material.uniforms.iTimeDelta.value = timeInSeconds - lastTime;
    material.uniforms.iFrame.value = frameCount;
    lastTime = timeInSeconds;
    frameCount++;

    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    renderer.dispose();
    geometry.dispose();
    material.dispose();
    if (!texture && defaultTexture) {
      defaultTexture.dispose();
    }
    container.removeChild(renderer.domElement);
  };

  // Initial resize
  resize();

  return { renderer, scene, camera, material, resize, render, dispose };
};

// Create a simple procedural texture for iChannel0
const createDefaultTexture = (): THREE.DataTexture => {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Create a simple noise-like pattern
      const value = Math.floor(
        ((Math.sin(x * 0.1) + Math.sin(y * 0.1) + 2) / 4) * 255 +
        Math.random() * 50
      );
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
};

// Main initialization
const init = (): void => {
  // Control panel elements
  const controlPanel = document.getElementById('controlPanel');
  const openControlPanelBtn = document.getElementById('OpenControlPanel');
  const closeControlPanelBtn = document.getElementById('CloseControlPanel');

  const openControlPanel = (): void => {
    if (controlPanel) controlPanel.style.display = 'block';
    if (openControlPanelBtn) openControlPanelBtn.style.display = 'none';
  };

  const closeControlPanel = (): void => {
    if (controlPanel) controlPanel.style.display = 'none';
    if (openControlPanelBtn) openControlPanelBtn.style.display = 'block';
  };

  openControlPanelBtn?.addEventListener('click', openControlPanel);
  closeControlPanelBtn?.addEventListener('click', closeControlPanel);

  const deformSquareTunnelGlslContainer = document.getElementById('DeformSquareTunnelGlsl');
  const deformSquareTunnelGlslBtn = document.getElementById('DeformSquareTunnelGlslBtn');

  let deformSquareTunnelRenderer: ShadertoyRenderer | null = null;
  let animationId: number | null = null;

  const startDeformSquareTunnelGlsl = (): void => {
    if (!deformSquareTunnelGlslContainer) return;
    if (deformSquareTunnelRenderer) return; // Already running

    deformSquareTunnelRenderer = createShadertoyRenderer(
      deformSquareTunnelGlslContainer,
      deformSquareTunnelShader
    );

    const animate = (time: number): void => {
      if (!deformSquareTunnelRenderer) return;
      deformSquareTunnelRenderer.render(time);
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    deformSquareTunnelGlslBtn?.classList.add('btn-active');
  };

  const stopDeformSquareTunnelGlsl = (): void => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (deformSquareTunnelRenderer) {
      deformSquareTunnelRenderer.dispose();
      deformSquareTunnelRenderer = null;
    }
    deformSquareTunnelGlslBtn?.classList.remove('btn-active');
  };

  // Toggle button handler
  deformSquareTunnelGlslBtn?.addEventListener('click', () => {
    if (deformSquareTunnelRenderer) {
      stopDeformSquareTunnelGlsl();
    } else {
      startDeformSquareTunnelGlsl();
    }
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    deformSquareTunnelRenderer?.resize();
  });

  // Start by default
  startDeformSquareTunnelGlsl();
};

init();
