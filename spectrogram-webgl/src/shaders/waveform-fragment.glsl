precision mediump float;
varying vec2 texCoord;
uniform sampler2D waveformData;
uniform float playheadPosition;
uniform vec4 waveColor;
uniform vec4 progressColor;
uniform vec4 playheadColor;
uniform vec4 backgroundColor;

void main() {
    // Read min/max from texture (row 0 and row 1)
    // Row 0 (y=0.25): min amplitudes in R channel
    // Row 1 (y=0.75): max amplitudes in R channel
    // Denormalize from [0,1] (stored as [0,255] in uint8) back to [-1,1]
    float minAmp = texture2D(waveformData, vec2(texCoord.x, 0.25)).r * 2.0 - 1.0;
    float maxAmp = texture2D(waveformData, vec2(texCoord.x, 0.75)).r * 2.0 - 1.0;

    // Normalize Y: [0,1] -> [-1,1]
    float y = texCoord.y * 2.0 - 1.0;

    // Check if fragment is within waveform envelope
    float inWaveform = step(minAmp, y) * step(y, maxAmp);

    // Determine if this X position is before or after playhead
    float isPlayed = step(texCoord.x, playheadPosition);

    // Color based on playhead position - if X is before playhead, use progressColor
    vec4 color = mix(waveColor, progressColor, isPlayed);

    // Playhead cursor (vertical line) - only show on waveform
    float playheadWidth = 0.032;
    float isPlayhead = step(abs(texCoord.x - playheadPosition), playheadWidth);
    color = mix(color, playheadColor, isPlayhead);

    // Background - fade to background if not in waveform
    vec4 finalColor = mix(backgroundColor, color, inWaveform);

    gl_FragColor = finalColor;
}
