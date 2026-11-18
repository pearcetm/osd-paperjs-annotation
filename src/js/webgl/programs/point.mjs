/**
 * Point sprite shaders.
 * Straight RGBA attributes; premultiplied output for canvas compositing.
 */

export const pointVertexShader = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_pointSize;
uniform float u_opacity;
varying vec4 v_color;

void main(void) {
  gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  float a = a_color.a * u_opacity;
  v_color = vec4(a_color.rgb * a, a);
}
`;

export const pointFragmentShader = `
#ifdef GL_ES
  precision highp float;
#endif
varying vec4 v_color;

void main(void) {
  vec2 c = gl_PointCoord - vec2(0.5);
  if (dot(c, c) > 0.25) {
    discard;
  }
  gl_FragColor = v_color;
}
`;
