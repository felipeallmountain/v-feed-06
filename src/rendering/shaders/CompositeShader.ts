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
uniform float uTubeCurve;
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
uniform float uGridMode;
uniform vec2 uResolution;
uniform float uVideoAspect;
uniform float uViewportAspect;
uniform float uCoverSample;

varying vec2 vUv;

${crtFragmentChunk}
${glitchFragmentChunk}
${noiseFragmentChunk}

vec2 coverUv(vec2 uv, float videoAspect, float viewportAspect) {
  vec2 scale = vec2(1.0);
  if (viewportAspect > videoAspect) {
    scale.y = videoAspect / viewportAspect;
  } else {
    scale.x = viewportAspect / videoAspect;
  }
  return (uv - 0.5) / scale + 0.5;
}

void main() {
  vec2 uv = vUv;

  uv = applyVHold(uv, uVHold, uTime);
  uv = applyHJitter(uv, uHJitter, uTime);
  uv = rippleDistort(uv, uRippleCenter, uRippleStrength);
  if (uTubeCurve > 0.5) {
    uv = crtCurve(uv, uCurvature);
  }

  if (uTubeCurve > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 sampleUv = uCoverSample > 0.5
    ? coverUv(uv, uVideoAspect, uViewportAspect)
    : uv;
  vec3 color = sampleRgbSplit(tDiffuse, sampleUv, uRgbSplit);

  if (uGridMode > 0.5) {
    color = texture2D(tDiffuse, sampleUv).rgb;
  }

  color *= scanlines(uv, uScanline, uTime, uResolution);
  color = phosphor(color, uv, uPhosphor, uResolution);
  color *= vignette(uv, uVignette);
  color = mixSnow(color, uv, uNoiseGain, uSignalLock, uTime, uResolution);

  color += color * color * 0.08 * uSignalLock;

  gl_FragColor = vec4(color, 1.0);
}
`;

export const compositeVertexShader = crtVertexShader;
