// The MIT License
// Copyright © 2013 Inigo Quilez
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// https://www.youtube.com/c/InigoQuilez
// https://iquilezles.org/

// This shader shows one way to fix the texturing
// discontinuities created by fetching textures with
// atan(), which you can see if you set IMPLEMENTATION
// to 0, depending on your screen resolution. More info
// here:  https://iquilezles.org/articles/tunnel


// 0 naive
// 1 explicit derivatives
#define IMPLEMENTATION 1

// 0 : circular
// 1 : squareish
#define SHAPE 0

const float kPi = 3.1415927;

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y;  // normalized coordinates - 归一化坐标

    float a = atan(p.y,p.x);                                // angle of each pixel to the center of the screen - 每个像素到屏幕中心的角度 返回值为弧度，多少多少pi

    #if SHAPE==0
    float r = length(p);                                    // cylindrical tunnel - 圆柱隧道
    #else
    vec2 p2 = p*p, p4 = p2*p2, p8 = p4*p4;                  // square tunnel - 正方形隧道
    float r = pow(p8.x+p8.y, 1.0/8.0);
    #endif

    vec2 uv = vec2( 0.3/r + 0.2*iTime, a/kPi );             // index texture by radious and angle - 索引纹理的 半径和角度

    #if IMPLEMENTATION==0
    vec3 col = texture(iChannel0, uv).xyz;                  // naive fetch color - 传统的采样
	#else
    vec2 uv2 = vec2(uv.x, atan(p.y,abs(p.x))/kPi);          // fetch color with correct texture gradients to prevent discontinutity - 用正确的纹理梯度取颜色，以防止不连续性
    vec3 col = textureGrad(iChannel0, uv, dFdx(uv2),
                                          dFdy(uv2)).xyz;
	#endif

    col = col*r;                                            // darken at the center - 使中间变暗

    fragColor = vec4( col, 1.0 );
}
