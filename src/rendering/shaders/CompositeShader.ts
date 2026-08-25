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
uniform float uMatrixSplit;
uniform float uBezelWidthX;
uniform float uBezelWidthY;
uniform float uBezelOuter;
uniform float uBezelComp;
uniform float uCornerRounding;
uniform float uBezelChassis;
uniform float uPerScreenVariance;
uniform float uGlobalFlipH;
uniform float uGlobalFlipV;
uniform float uGlobalRotation;
uniform vec2 uScreenFlips[6];
uniform float uScreenRotations[6];
uniform vec2 uCorners[24];
uniform float uShowCornerHandles;
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

float cross2d(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

/**
 * Inverse bilinear interpolation mapping a quad's 4 corners (p0=BL, p1=BR, p2=TR, p3=TL)
 * into normalized local coordinates (u, v) in [0, 1]^2. Returns vec2(-1.0) if outside.
 */
vec2 invBilinear(vec2 p, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
  vec2 e = p1 - p0;
  vec2 f = p3 - p0;
  vec2 g = p2 - p3 - p1 + p0;
  vec2 q = p - p0;

  float k2 = cross2d(g, f);
  float k1 = cross2d(e, f) + cross2d(q, g);
  float k0 = cross2d(q, e);

  float v = -1.0;
  if (abs(k2) < 0.00001) {
    if (abs(k1) > 0.00001) {
      v = -k0 / k1;
    }
  } else {
    float d = k1 * k1 - 4.0 * k2 * k0;
    if (d >= 0.0) {
      float sqrtD = sqrt(d);
      float v1 = (-k1 - sqrtD) / (2.0 * k2);
      float v2 = (-k1 + sqrtD) / (2.0 * k2);
      if (v1 >= -0.001 && v1 <= 1.001) v = v1;
      else if (v2 >= -0.001 && v2 <= 1.001) v = v2;
    }
  }

  if (v < -0.001 || v > 1.001) return vec2(-1.0);
  v = clamp(v, 0.0, 1.0);

  vec2 denom = e + v * g;
  vec2 num = q - v * f;
  float u = -1.0;
  if (abs(denom.x) > abs(denom.y)) {
    if (abs(denom.x) > 0.00001) u = num.x / denom.x;
  } else {
    if (abs(denom.y) > 0.00001) u = num.y / denom.y;
  }

  if (u < -0.001 || u > 1.001) return vec2(-1.0);
  return vec2(clamp(u, 0.0, 1.0), v);
}

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

  // Single Screen Mode (uMatrixSplit < 0.5)
  if (uMatrixSplit < 0.5) {
    if (abs(uGlobalRotation) > 0.0001) {
      float cosR = cos(uGlobalRotation);
      float sinR = sin(uGlobalRotation);
      vec2 p = uv - 0.5;
      uv = vec2(
        p.x * cosR - p.y * sinR,
        p.x * sinR + p.y * cosR
      ) + 0.5;
    }

    if (uGlobalFlipH > 0.5) uv.x = 1.0 - uv.x;
    if (uGlobalFlipV > 0.5) uv.y = 1.0 - uv.y;

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
    return;
  }

  // 2x3 Matrix Mode with 4-Corner Pinning (6 Individual Screen Surfaces)
  int matchedScreen = -1;
  vec2 localUv = vec2(-1.0);

  for (int i = 0; i < 6; i++) {
    int base = i * 4;
    vec2 p0 = uCorners[base + 0]; // BL
    vec2 p1 = uCorners[base + 1]; // BR
    vec2 p2 = uCorners[base + 2]; // TR
    vec2 p3 = uCorners[base + 3]; // TL

    vec2 uvInQuad = invBilinear(uv, p0, p1, p2, p3);
    if (uvInQuad.x >= 0.0) {
      matchedScreen = i;
      localUv = uvInQuad;
      break;
    }
  }

  // Render Bezel / Chassis if fragment is outside all 6 CRT screens
  if (matchedScreen < 0) {
    if (uBezelChassis > 0.5) {
      float grain = hash21(uv * uResolution * 0.25) * 0.02;
      // 3D beveled horizontal and vertical center divider seams
      float seamX = smoothstep(0.0005, 0.0035, abs(uv.x - 0.5));
      float seamY1 = smoothstep(0.0005, 0.0035, abs(uv.y - 1.0 / 3.0));
      float seamY2 = smoothstep(0.0005, 0.0035, abs(uv.y - 2.0 / 3.0));
      float seam = min(seamX, min(seamY1, seamY2));
      vec3 casing = (vec3(0.052, 0.054, 0.060) + vec3(grain)) * (0.55 + 0.45 * seam);
      gl_FragColor = vec4(casing, 1.0);
      return;
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  float col = float(matchedScreen - (matchedScreen / 2) * 2); // 0 or 1
  float row = 2.0 - float(matchedScreen / 2); // 2 (Top), 1 (Mid), 0 (Bot)
  float screenIndex = float(matchedScreen);

  // Apply Per-Piece and Global Rotation & Flips
  vec2 flip = vec2(0.0);
  float screenRot = 0.0;
  for (int s = 0; s < 6; s++) {
    if (s == matchedScreen) {
      flip = uScreenFlips[s];
      screenRot = uScreenRotations[s];
    }
  }

  float totalRot = screenRot + uGlobalRotation;
  vec2 effLocalUv = localUv;

  if (abs(totalRot) > 0.0001) {
    float cosR = cos(totalRot);
    float sinR = sin(totalRot);
    vec2 p = effLocalUv - 0.5;
    effLocalUv = vec2(
      p.x * cosR - p.y * sinR,
      p.x * sinR + p.y * cosR
    ) + 0.5;
  }

  bool doFlipH = (flip.x > 0.5) != (uGlobalFlipH > 0.5);
  bool doFlipV = (flip.y > 0.5) != (uGlobalFlipV > 0.5);

  if (doFlipH) effLocalUv.x = 1.0 - effLocalUv.x;
  if (doFlipV) effLocalUv.y = 1.0 - effLocalUv.y;

  vec2 curvedLocalUv = effLocalUv;
  if (uTubeCurve > 0.5) {
    curvedLocalUv = crtCurve(effLocalUv, uCurvature);
  }

  bool outsideTube = (curvedLocalUv.x < 0.0 || curvedLocalUv.x > 1.0 || curvedLocalUv.y < 0.0 || curvedLocalUv.y > 1.0);
  float cornerFactor = 1.0;
  if (!outsideTube && uCornerRounding > 0.001) {
    vec2 cornerD = abs(curvedLocalUv - 0.5) * 2.0;
    vec2 rad = vec2(1.0 - uCornerRounding * 2.0);
    vec2 delta = max(cornerD - rad, vec2(0.0));
    float dist = length(delta) / (uCornerRounding * 2.0);
    if (dist > 1.0) {
      outsideTube = true;
    } else {
      cornerFactor = 1.0 - smoothstep(0.82, 1.0, dist) * 0.75;
    }
  }

  if (outsideTube) {
    if (uBezelChassis > 0.5) {
      float grain = hash21(uv * uResolution * 0.25) * 0.018;
      vec3 casing = vec3(0.028, 0.030, 0.035) + vec3(grain);
      gl_FragColor = vec4(casing, 1.0);
      return;
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  // Per-screen analog sync & timing variance
  float screenSeed = screenIndex + 1.0;
  float screenRand = fract(sin(screenSeed * 78.233) * 43758.5453);
  float screenTimeOffset = screenRand * 8.0 * uPerScreenVariance;
  float screenVHold = uVHold * (1.0 + (screenRand - 0.5) * 0.3 * uPerScreenVariance);
  float screenHJitter = uHJitter * (1.0 + (screenRand - 0.5) * 0.4 * uPerScreenVariance);

  vec2 sampleUv = vec2(
    (col + curvedLocalUv.x) * 0.5,
    (row + curvedLocalUv.y) * (1.0 / 3.0)
  );

  sampleUv = applyVHold(sampleUv, screenVHold, uTime + screenTimeOffset);
  sampleUv = applyHJitter(sampleUv, screenHJitter, uTime + screenTimeOffset);
  sampleUv = rippleDistort(sampleUv, uRippleCenter, uRippleStrength);

  if (uCoverSample > 0.5) {
    sampleUv = coverUv(sampleUv, uVideoAspect, uViewportAspect);
  }

  vec3 color;
  if (uGridMode > 0.5) {
    color = texture2D(tDiffuse, sampleUv).rgb;
  } else {
    color = sampleRgbSplit(tDiffuse, sampleUv, uRgbSplit);
  }

  // Per-screen scanlines & phosphor & vignette
  vec2 cellRes = uResolution * vec2(0.5, 1.0 / 3.0);
  color *= scanlines(curvedLocalUv, uScanline, uTime + screenTimeOffset, cellRes);
  color = phosphor(color, curvedLocalUv, uPhosphor, cellRes);
  color *= vignette(curvedLocalUv, uVignette);
  color *= cornerFactor;

  // Inner glass rim bevel and bezel shadow around each CRT tube
  float edgeDistX = min(curvedLocalUv.x, 1.0 - curvedLocalUv.x);
  float edgeDistY = min(curvedLocalUv.y, 1.0 - curvedLocalUv.y);
  float edgeDist = min(edgeDistX, edgeDistY);
  float glassRim = smoothstep(0.0, 0.022, edgeDist);
  color *= 0.72 + 0.28 * glassRim;

  // Glass specular highlight on each CRT tube
  if (uTubeCurve > 0.5) {
    float spec = smoothstep(0.72, 0.98, 1.0 - distance(curvedLocalUv, vec2(0.28, 0.76))) * 0.12;
    color += vec3(spec);
  }

  // RF noise
  color = mixSnow(color, sampleUv, uNoiseGain, uSignalLock, uTime + screenTimeOffset, uResolution);
  color += color * color * 0.08 * uSignalLock;

  // Corner handle target markers when calibration mode is active
  if (uShowCornerHandles > 0.5) {
    float dCorner = min(
      min(distance(localUv, vec2(0.0, 0.0)), distance(localUv, vec2(1.0, 0.0))),
      min(distance(localUv, vec2(1.0, 1.0)), distance(localUv, vec2(0.0, 1.0)))
    );
    if (dCorner < 0.045) {
      color = mix(color, vec3(1.0, 0.75, 0.0), 0.85);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export const compositeVertexShader = crtVertexShader;
