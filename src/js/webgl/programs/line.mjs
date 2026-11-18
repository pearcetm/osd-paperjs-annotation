/**
 * Simple line stroke shaders (screen-space width via expansion in vertex shader).
 * Straight RGBA attributes; premultiplied output for canvas compositing.
 */

export const lineVertexShader = `
attribute vec2 a_position;
attribute vec2 a_normal;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_lineWidth;
uniform float u_opacity;
varying vec4 v_color;

void main(void) {
  vec4 clip = u_matrix * vec4(a_position, 0.0, 1.0);
  vec2 offset = a_normal * (u_lineWidth / clip.w * 0.5);
  gl_Position = vec4(clip.xy + offset * clip.w, clip.z, clip.w);
  float a = a_color.a * u_opacity;
  v_color = vec4(a_color.rgb * a, a);
}
`;

export const lineFragmentShader = `
#ifdef GL_ES
  precision highp float;
#endif
varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;
