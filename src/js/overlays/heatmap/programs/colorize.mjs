/**
 * Heatmap density → colormap fullscreen pass.
 */

export const colorizeVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;

void main(void) {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const colorizeFragmentShader = `
#ifdef GL_ES
  precision highp float;
#endif
uniform sampler2D u_density;
uniform sampler2D u_lut;
uniform float u_densityScale;
varying vec2 v_uv;

void main(void) {
  float d = texture2D(u_density, v_uv).r * u_densityScale;
  d = clamp(d, 0.0, 1.0);
  vec4 c = texture2D(u_lut, vec2(d, 0.5));
  gl_FragColor = vec4(c.rgb * c.a, c.a);
}
`;
