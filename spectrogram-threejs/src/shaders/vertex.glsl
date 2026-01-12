attribute float displacement;
uniform vec3 vLut[256];
uniform float uHeightScale;
varying vec3 vColor;
varying float vAmplitude;
varying vec2 vUv;
void main(){
  float amplitude = clamp(displacement / 255.0, 0.0, 1.0);
  float idx = amplitude * 255.0;
  int index0 = int(floor(idx));
  int index1 = min(index0 + 1, 255);
  float mixT = idx - float(index0);
  vColor = mix(vLut[index0], vLut[index1], mixT);
  vAmplitude = amplitude;
  vUv = uv;
  vec3 newPosition = vec3(position.x, position.y + (amplitude * uHeightScale), position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition,1.0);
}
