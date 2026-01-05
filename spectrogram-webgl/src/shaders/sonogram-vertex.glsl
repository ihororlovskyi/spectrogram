// The vertex shader used for the 3D sonogram visualization
attribute vec3 gPosition;
attribute vec2 gTexCoord0;
uniform sampler2D vertexFrequencyData;
uniform float vertexYOffset;
uniform mat4 worldViewProjection;
uniform float verticalScale;
uniform lowp int colorMode; // 0 = Rainbow, 1 = Gray, 2 = Inferno, 3 = Forest, 4 = White→Black, 5 = Mountains
uniform lowp int scaleMode; // 0 = Log, 1 = Linear, 2 = Mel

varying vec2 texCoord;
varying vec3 color;

/**
 * Inferno colormap from matplotlib/colormap
 * Goes from black → purple → red → orange → yellow
 */
vec3 infernoColormap(float t) {
    // Key colors for Inferno colormap
    const vec3 c0 = vec3(0.0, 0.0, 0.015);      // almost black
    const vec3 c1 = vec3(0.258, 0.039, 0.406);  // dark purple
    const vec3 c2 = vec3(0.578, 0.148, 0.404);  // magenta
    const vec3 c3 = vec3(0.865, 0.316, 0.226);  // red-orange
    const vec3 c4 = vec3(0.988, 0.645, 0.039);  // orange-yellow
    const vec3 c5 = vec3(0.988, 1.0, 0.644);    // light yellow

    t = clamp(t, 0.0, 1.0);

    if (t < 0.2) {
        return mix(c0, c1, t / 0.2);
    } else if (t < 0.4) {
        return mix(c1, c2, (t - 0.2) / 0.2);
    } else if (t < 0.6) {
        return mix(c2, c3, (t - 0.4) / 0.2);
    } else if (t < 0.8) {
        return mix(c3, c4, (t - 0.6) / 0.2);
    } else {
        return mix(c4, c5, (t - 0.8) / 0.2);
    }
}

/**
 * Sentimony Forest colormap
 * Inspired by coniferous forest - dark greens at bottom, lighter greens at top
 */
vec3 forestColormap(float t) {
    const vec3 c0 = vec3(0.05, 0.15, 0.05);   // very dark forest green
    const vec3 c1 = vec3(0.1, 0.25, 0.1);     // dark green
    const vec3 c2 = vec3(0.15, 0.4, 0.15);    // forest green
    const vec3 c3 = vec3(0.2, 0.55, 0.2);     // medium green
    const vec3 c4 = vec3(0.4, 0.7, 0.3);      // light green
    const vec3 c5 = vec3(0.6, 0.85, 0.5);     // bright light green

    t = clamp(t, 0.0, 1.0);

    if (t < 0.2) {
        return mix(c0, c1, t / 0.2);
    } else if (t < 0.4) {
        return mix(c1, c2, (t - 0.2) / 0.2);
    } else if (t < 0.6) {
        return mix(c2, c3, (t - 0.4) / 0.2);
    } else if (t < 0.8) {
        return mix(c3, c4, (t - 0.6) / 0.2);
    } else {
        return mix(c4, c5, (t - 0.8) / 0.2);
    }
}

/**
 * Mountains colormap
 * Gray rocks at top (loud), green fields/trees in middle, yellow/brown at bottom (quiet)
 */
vec3 mountainsColormap(float t) {
    const vec3 c0 = vec3(0.6, 0.5, 0.3);      // brown/tan (quiet - bottom)
    const vec3 c1 = vec3(0.7, 0.65, 0.4);     // light brown/yellow
    const vec3 c2 = vec3(0.3, 0.5, 0.2);      // dark green fields
    const vec3 c3 = vec3(0.2, 0.4, 0.15);     // forest green
    const vec3 c4 = vec3(0.5, 0.5, 0.5);      // gray rocks
    const vec3 c5 = vec3(0.85, 0.85, 0.9);    // snow/light gray peaks (loud - top)

    t = clamp(t, 0.0, 1.0);

    if (t < 0.2) {
        return mix(c0, c1, t / 0.2);
    } else if (t < 0.4) {
        return mix(c1, c2, (t - 0.2) / 0.2);
    } else if (t < 0.6) {
        return mix(c2, c3, (t - 0.4) / 0.2);
    } else if (t < 0.8) {
        return mix(c3, c4, (t - 0.6) / 0.2);
    } else {
        return mix(c4, c5, (t - 0.8) / 0.2);
    }
}

/**
 * Convert normalized position to frequency texture coordinate based on scale mode
 * @param t - normalized position [0, 1]
 * @return frequency texture coordinate [0, 1]
 */
float applyFrequencyScale(float t) {
    if (scaleMode == 1) {
        // Linear scale: direct mapping
        return t;
    } else if (scaleMode == 2) {
        // Mel scale: more resolution at lower frequencies
        // mel = 2595 * log10(1 + f/700), inverse: f = 700 * (10^(mel/2595) - 1)
        // Map visual position t [0,1] to mel [0, melMax], then to frequency
        float maxFreq = 22050.0; // Nyquist frequency for 44.1kHz
        float melMax = 2595.0 * log(1.0 + maxFreq / 700.0) / log(10.0); // ~3816 mel
        float mel = t * melMax;
        float freq = 700.0 * (pow(10.0, mel / 2595.0) - 1.0);
        return clamp(freq / maxFreq, 0.0, 1.0);
    } else {
        // Log scale (default): more resolution at lower frequencies
        return pow(256.0, t - 1.0);
    }
}

/**
 * Conversion based on Wikipedia article
 * @see http://en.wikipedia.org/wiki/HSL_and_HSV#Converting_to_RGB
 */
vec3 convertHSVToRGB(in float hue, in float saturation, in float lightness) {
  float chroma = lightness * saturation;
  float hueDash = hue / 60.0;
  float x = chroma * (1.0 - abs(mod(hueDash, 2.0) - 1.0));
  vec3 hsv = vec3(0.0);

  if(hueDash < 1.0) {
    hsv.r = chroma;
    hsv.g = x;
  } else if (hueDash < 2.0) {
    hsv.r = x;
    hsv.g = chroma;
  } else if (hueDash < 3.0) {
    hsv.g = chroma;
    hsv.b = x;
  } else if (hueDash < 4.0) {
    hsv.g = x;
    hsv.b = chroma;
  } else if (hueDash < 5.0) {
    hsv.r = x;
    hsv.b = chroma;
  } else if (hueDash < 6.0) {
    hsv.r = chroma;
    hsv.b = x;
  }

  return hsv;
}

void main()
{
    float x = applyFrequencyScale(gTexCoord0.x);
    vec4 sample = texture2D(vertexFrequencyData, vec2(x, gTexCoord0.y + vertexYOffset));
    vec4 newPosition = vec4(gPosition.x, gPosition.y + verticalScale * sample.a, gPosition.z, 1.0);
    gl_Position = worldViewProjection * newPosition;
    texCoord = gTexCoord0;

    float amplitude = newPosition.y / verticalScale;

    if (colorMode == 1) {
        // Gray mode: white for loud, black for quiet
        color = vec3(amplitude);
    } else if (colorMode == 2) {
        // Inferno mode: black → purple → red → orange → yellow
        color = infernoColormap(amplitude);
    } else if (colorMode == 3) {
        // Sentimony Forest mode: dark green → light green
        color = forestColormap(amplitude);
    } else if (colorMode == 4) {
        // White → Black mode: black for loud, white for quiet
        color = vec3(1.0 - amplitude);
    } else if (colorMode == 5) {
        // Mountains mode: brown/yellow → green → gray/snow
        color = mountainsColormap(amplitude);
    } else {
        // Rainbow mode: HSV color based on amplitude
        float hue = 360.0 - (amplitude * 360.0);
        color = convertHSVToRGB(hue, 1.0, 1.0);
    }
}
