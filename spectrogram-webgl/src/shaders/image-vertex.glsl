// Image vertex shader for displaying textured quad in 3D space
attribute vec3 gPosition;
attribute vec2 gTexCoord0;
uniform mat4 worldViewProjection;

varying vec2 texCoord;

void main()
{
    gl_Position = worldViewProjection * vec4(gPosition, 1.0);
    texCoord = gTexCoord0;
}
