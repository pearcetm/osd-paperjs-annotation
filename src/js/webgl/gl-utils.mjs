/**
 * Minimal WebGL helpers for WebglFeatureOverlay.
 */

/**
 * Prefer WebGL2; fall back to WebGL1 with OES_element_index_uint when available.
 * Sets `gl._osdUint32Indices` so FeatureBatch can pick UNSIGNED_INT vs chunked Uint16.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {WebGLContextAttributes} [attrs]
 * @returns {WebGLRenderingContext|WebGL2RenderingContext}
 */
export function createWebGLContext(canvas, attrs = {}) {
    const options = {
        alpha: true,
        antialias: true,
        // Framebuffer content is premultiplied by SRC_ALPHA blending / shader output.
        premultipliedAlpha: true,
        ...attrs,
    };
    let gl = canvas.getContext('webgl2', options);
    if (gl) {
        gl._osdUint32Indices = true;
        return gl;
    }
    gl = canvas.getContext('webgl', options)
        || canvas.getContext('experimental-webgl', options);
    if (!gl) {
        throw new Error('WebGL is not available for WebglFeatureOverlay.');
    }
    const ext = gl.getExtension('OES_element_index_uint');
    gl._osdUint32Indices = Boolean(ext);
    return gl;
}

/**
 * @param {WebGLRenderingContext} gl
 * @returns {boolean}
 */
export function supportsUint32Indices(gl) {
    if (gl._osdUint32Indices !== undefined) {
        return gl._osdUint32Indices;
    }
    if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
        return true;
    }
    return Boolean(gl.getExtension('OES_element_index_uint'));
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {number} type
 * @param {string} source
 * @returns {WebGLShader}
 */
export function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const msg = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile failed: ${msg}`);
    }
    return shader;
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {string} vertSource
 * @param {string} fragSource
 * @returns {WebGLProgram}
 */
export function createProgram(gl, vertSource, fragSource) {
    const program = gl.createProgram();
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const msg = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link failed: ${msg}`);
    }
    return program;
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} program
 * @param {string} name
 * @returns {WebGLUniformLocation|null}
 */
export function uniformLocation(gl, program, name) {
    return gl.getUniformLocation(program, name);
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} program
 * @param {string} name
 * @returns {number}
 */
export function attribLocation(gl, program, name) {
    return gl.getAttribLocation(program, name);
}

/**
 * Column-major 4x4 identity.
 * @returns {Float32Array}
 */
export function identityMat4() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
}

/**
 * Multiply two column-major 4x4 matrices: out = a * b
 * @param {Float32Array} out
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {Float32Array}
 */
export function multiplyMat4(out, a, b) {
    for (let col = 0; col < 4; col += 1) {
        for (let row = 0; row < 4; row += 1) {
            out[col * 4 + row] =
                a[row] * b[col * 4] +
                a[4 + row] * b[col * 4 + 1] +
                a[8 + row] * b[col * 4 + 2] +
                a[12 + row] * b[col * 4 + 3];
        }
    }
    return out;
}

/**
 * @param {string|object} color
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function parseColor(color) {
    if (!color) {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    if (typeof color === 'object' && color.r !== undefined) {
        return {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a !== undefined ? color.a : 1,
        };
    }
    const str = String(color).trim();
    const canvas = parseColor._canvas || (parseColor._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillStyle = str;
    const computed = ctx.fillStyle;
    if (computed.startsWith('#')) {
        const hex = computed.slice(1);
        const full = hex.length === 3
            ? hex.split('').map((c) => c + c).join('')
            : hex;
        const n = parseInt(full, 16);
        return {
            r: ((n >> 16) & 255) / 255,
            g: ((n >> 8) & 255) / 255,
            b: (n & 255) / 255,
            a: 1,
        };
    }
    const m = computed.match(/rgba?\(([^)]+)\)/);
    if (m) {
        const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
        return {
            r: parts[0] / 255,
            g: parts[1] / 255,
            b: parts[2] / 255,
            a: parts[3] !== undefined ? parts[3] : 1,
        };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
}
