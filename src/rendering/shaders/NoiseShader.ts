/** RF static and analog grain. */
export const noiseFragmentChunk = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float analogNoise(vec2 uv, float time, vec2 resolution) {
  return hash21(uv * resolution + fract(time) * 100.0);
}

vec3 mixSnow(vec3 color, vec2 uv, float gain, float lock, float time, vec2 resolution) {
  float n = analogNoise(uv, time, resolution);
  vec3 snow = vec3(n);
  float snowMix = clamp(gain * (1.0 - lock), 0.0, 1.0);
  return mix(color, snow, snowMix);
}

vec2 rippleDistort(vec2 uv, vec2 center, float strength) {
  vec2 d = uv - center;
  float dist = length(d);
  float wave = sin(dist * 48.0 - strength * 12.0) * strength * 0.02;
  float falloff = exp(-dist * 6.0);
  return uv + normalize(d + 1e-5) * wave * falloff;
}
`;

export const NoiseShader = {
  fragmentChunk: noiseFragmentChunk,
};
