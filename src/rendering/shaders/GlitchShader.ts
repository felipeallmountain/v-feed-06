/** RGB chromatic split, V-Hold roll, horizontal jitter. */
export const glitchFragmentChunk = /* glsl */ `
vec2 applyVHold(vec2 uv, float amount, float time) {
  uv.y = fract(uv.y + amount * time * 0.15);
  return uv;
}

vec2 applyHJitter(vec2 uv, float amount, float time) {
  float tear = step(0.97, fract(sin(floor(uv.y * 120.0) + time * 40.0) * 43758.5453));
  uv.x += tear * amount * 0.08 * sin(time * 30.0);
  return uv;
}

vec3 sampleRgbSplit(sampler2D tex, vec2 uv, float amount) {
  float off = amount * 0.012;
  float r = texture2D(tex, uv + vec2(off, 0.0)).r;
  float g = texture2D(tex, uv).g;
  float b = texture2D(tex, uv - vec2(off, 0.0)).b;
  return vec3(r, g, b);
}
`;

export const GlitchShader = {
  fragmentChunk: glitchFragmentChunk,
};
