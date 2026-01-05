// Image fragment shader for displaying textured quad
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 texCoord;
uniform sampler2D imageSampler;

void main()
{
    gl_FragColor = texture2D(imageSampler, texCoord);
}
