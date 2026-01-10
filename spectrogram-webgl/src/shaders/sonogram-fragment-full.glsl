// Fragment shader for full spectrogram rendering (simple grayscale sample).
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 texCoord;
uniform sampler2D frequencyData;

void main()
{
    vec4 sample = texture2D(frequencyData, texCoord);
    gl_FragColor = vec4(sample.r, sample.r, sample.r, 1.0);
}
