// Vertex shader for full spectrogram rendering (flat surface).
attribute vec3 gPosition;
attribute vec2 gTexCoord0;

uniform mat4 worldViewProjection;

varying vec2 texCoord;
varying vec3 color;

void main()
{
    gl_Position = worldViewProjection * vec4(gPosition, 1.0);
    texCoord = gTexCoord0;
    color = vec3(1.0);
}
