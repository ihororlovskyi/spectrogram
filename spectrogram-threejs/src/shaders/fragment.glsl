varying vec3 vColor;
varying float vAmplitude;
varying vec2 vUv;
uniform vec3 uBackground;
void main(){
  float fade = pow(cos((1.0 - vUv.y) * 0.5 * 3.1415926535), 0.9);
  float k = vAmplitude * fade;
  vec3 color = uBackground + (k * vColor);
  gl_FragColor = vec4(color,1.0);
}
