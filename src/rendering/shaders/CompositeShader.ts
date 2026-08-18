import { crtFragmentChunk, crtVertexShader } from './CRTShader';
import { glitchFragmentChunk } from './GlitchShader';
import { noiseFragmentChunk } from './NoiseShader';

/**
 * Single-pass composite for 60 FPS stability while keeping shader modules modular.
 */
export const compositeFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tNoise;
uniform float uTime;
uniform float uCurvature;
uniform float uScanline;
uniform float uPhosphor;
uniform float uVignette;
uniform float uRgbSplit;
uniform float uVHold;
uniform float uHJitter;
uniform float uNoiseGain;
uniform float uSignalLock;
uniform float uRippleStrength;
uniform vec2 uRippleCenter;
uniform vec2 uBezelOffset;
uniform vec2 uBezelGap;
uniform float uGridMode;
uniform vec2 uResolution;

varying vec2 vUv;

${crtFragmentChunk}
${glitchFragmentChunk}
${noiseFragmentChunk}

vec2 applyBezelCompensation(vec2 uv) {
  // Expand UV slightly per 2x3 cell so motion bridges physical CRT bezels.
  float col = floor(uv.x * 2.0);
  float row = floor(uv.y * 3.0);
  vec2 cellUv = vec2(fract(uv.x * 2.0), fract(uv.y * 3.0));
  vec2 pad = uBezelOffset / uResolution;
  vec2 gap = uBezelGap / uResolution;
  cellUv = (cellUv - 0.5) * (1.0 + pad * 2.0 + gap) + 0.5;
  return vec2((col + cellUv.x) / 2.0, (row + cellUv.y) / 3.0);
}

void main() {
  vec2 uv = vUv;

  uv = applyBezelCompensation(uv);
  uv = applyVHold(uv, uVHold, uTime);
  uv = applyHJitter(uv, uHJitter, uTime);
  uv = rippleDistort(uv, uRippleCenter, uRippleStrength);
  uv = crtCurve(uv, uCurvature);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 color = sampleRgbSplit(tDiffuse, uv, uRgbSplit);

  if (uGridMode > 0.5) {
    // Keep test grid readable under mild CRT treatment.
    color = texture2D(tDiffuse, uv).rgb;
  }

  color *= scanlines(uv, uScanline, uTime);
  color = phosphor(color, uv, uPhosphor);
  color *= vignette(uv, uVignette);
  color = mixSnow(color, uv, uNoiseGain, uSignalLock, uTime);

  // Soft phosphor bloom lift
  color += color * color * 0.08 * uSignalLock;

  gl_FragColor = vec4(color, 1.0);
}
`;

export const compositeVertexShader = crtVertexShader;
