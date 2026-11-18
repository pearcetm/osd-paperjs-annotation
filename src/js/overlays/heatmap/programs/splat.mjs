/**
 * Heatmap splat shaders: image-space centers, screen-space (NDC) radius offsets.
 */

export const splatVertexShader = `
attribute vec2 a_corner;
attribute vec2 a_position;
attribute float a_intensity;
uniform mat4 u_matrix;
uniform vec2 u_origin;
uniform vec2 u_radiusNDC;
uniform float u_scaleWithZoom;
uniform float u_radiusImage;
varying vec2 v_uv;
varying float v_intensity;

void main(void) {
  v_uv = a_corner * 0.5 + 0.5;
  v_intensity = a_intensity;
  vec2 imagePos = a_position - u_origin;
  if (u_scaleWithZoom > 0.5) {
    vec2 pos = imagePos + a_corner * u_radiusImage;
    gl_Position = u_matrix * vec4(pos, 0.0, 1.0);
  } else {
    vec4 clip = u_matrix * vec4(imagePos, 0.0, 1.0);
    float invW = clip.w != 0.0 ? 1.0 / clip.w : 1.0;
    vec2 ndc = clip.xy * invW;
    ndc += a_corner * u_radiusNDC;
    gl_Position = vec4(ndc * clip.w, clip.z, clip.w);
  }
}
`;

export const splatFragmentShader = `
#ifdef GL_ES
  precision highp float;
#endif
uniform sampler2D u_kernel;
varying vec2 v_uv;
varying float v_intensity;

void main(void) {
  float k = texture2D(u_kernel, v_uv).r;
  float d = v_intensity * k;
  gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
}
`;
