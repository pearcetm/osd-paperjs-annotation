/**
 * Polygon fill shaders adapted from geojs webgl/polygonFeature (Apache-2.0).
 * See NOTICE in the repository root.
 *
 * Vertex colors stay straight RGBA (Paper-aligned). Output is premultiplied for
 * canvas compositing with blendFunc(ONE, ONE_MINUS_SRC_ALPHA).
 */

export const polygonVertexShader = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_opacity;
varying vec4 v_color;

void main(void) {
  gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
  float a = a_color.a * u_opacity;
  v_color = vec4(a_color.rgb * a, a);
}
`;

export const polygonFragmentShader = `
#ifdef GL_ES
  precision highp float;
#endif
varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;
