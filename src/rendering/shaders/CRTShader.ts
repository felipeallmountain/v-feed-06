export const crtVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Barrel distortion, scanlines, phosphor mask, vignette. */
export const crtFragmentChunk = /* glsl */ `
vec2 crtCurve(vec2 uv, float amount) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(6.0 - amount * 4.0, 4.0 - amount * 2.5);
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;
  return uv;
}

float scanlines(vec2 uv, float intensity, float time, vec2 resolution) {
  float line = sin(uv.y * resolution.y * 0.5 + time * 8.0) * 0.5 + 0.5;
  return mix(1.0, 0.65 + 0.35 * line, intensity);
}

vec3 phosphor(vec3 color, vec2 uv, float amount, vec2 resolution) {
  float mask = fract(uv.x * resolution.x * 0.5);
  vec3 triad = mask < 0.33 ? vec3(1.0, 0.15, 0.15)
             : mask < 0.66 ? vec3(0.15, 1.0, 0.15)
                           : vec3(0.15, 0.15, 1.0);
  return mix(color, color * triad, amount);
}

float vignette(vec2 uv, float amount) {
  float d = distance(uv, vec2(0.5));
  return smoothstep(0.95, 0.35, d * (0.6 + amount));
}
`;

export const CRTShader = {
  vertexShader: crtVertexShader,
  fragmentChunk: crtFragmentChunk,
};
