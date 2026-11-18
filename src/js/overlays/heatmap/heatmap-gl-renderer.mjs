/**
 * WebGL additive-splat heatmap renderer (density FBO + LUT colorize).
 */

import {
    attribLocation,
    createProgram,
    uniformLocation,
} from '../../webgl/gl-utils.mjs';
import { colorToRgbaString } from './heatmap-style.mjs';
import { colorizeFragmentShader, colorizeVertexShader } from './programs/colorize.mjs';
import { splatFragmentShader, splatVertexShader } from './programs/splat.mjs';

/**
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @returns {boolean}
 */
function isWebGL2(gl) {
    return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} colorStops
 * @returns {Uint8ClampedArray}
 */
function buildLutPixels(ctx, colorStops) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const gctx = canvas.getContext('2d');
    const gradient = gctx.createLinearGradient(0, 0, 256, 0);
    Object.keys(colorStops).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach((stop) => {
        gradient.addColorStop(parseFloat(stop), colorToRgbaString(colorStops[stop]));
    });
    gctx.fillStyle = gradient;
    gctx.fillRect(0, 0, 256, 1);
    return gctx.getImageData(0, 0, 256, 1).data;
}

/**
 * @param {number} size
 * @returns {Float32Array} luminance 0..1
 */
function buildGaussianKernel(size) {
    const data = new Float32Array(size * size);
    const center = (size - 1) / 2;
    const sigma = size / 6;
    const inv = 1 / (2 * sigma * sigma);
    let max = 0;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const dx = x - center;
            const dy = y - center;
            const v = Math.exp(-(dx * dx + dy * dy) * inv);
            data[y * size + x] = v;
            if (v > max) {
                max = v;
            }
        }
    }
    if (max > 0) {
        for (let i = 0; i < data.length; i += 1) {
            data[i] /= max;
        }
    }
    return data;
}

/**
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @param {boolean} webgl2
 * @returns {{ drawArraysInstanced: Function, vertexAttribDivisor: Function }|null}
 */
function getInstancing(gl, webgl2) {
    if (webgl2) {
        return {
            drawArraysInstanced: gl.drawArraysInstanced.bind(gl),
            vertexAttribDivisor: gl.vertexAttribDivisor.bind(gl),
        };
    }
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    if (!ext) {
        return null;
    }
    return {
        drawArraysInstanced: ext.drawArraysInstancedANGLE.bind(ext),
        vertexAttribDivisor: ext.vertexAttribDivisorANGLE.bind(ext),
    };
}

export class HeatmapGlRenderer {
    /**
     * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
     */
    constructor(gl) {
        this.gl = gl;
        this._webgl2 = isWebGL2(gl);
        this._instancing = getInstancing(gl, this._webgl2);
        if (!this._instancing) {
            throw new Error('Instanced arrays are required for WebglHeatmapOverlay.');
        }

        this._splatProgram = createProgram(gl, splatVertexShader, splatFragmentShader);
        this._colorizeProgram = createProgram(gl, colorizeVertexShader, colorizeFragmentShader);

        this._quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1,
        ]), gl.STATIC_DRAW);

        this._fullscreenBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._fullscreenBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            3, -1,
            -1, 3,
        ]), gl.STATIC_DRAW);

        this._instanceBuffer = gl.createBuffer();
        this._pointCount = 0;
        this._densityScale = 1;

        this._kernelTex = null;
        this._kernelKey = '';
        this._lutTex = null;
        this._lutKey = '';

        this._fbo = null;
        this._densityTex = null;
        this._useFloatDensity = false;
        this._fboWidth = 0;
        this._fboHeight = 0;

        this._scratchCtx = document.createElement('canvas').getContext('2d');
    }

    /**
     * @param {Array<{x:number,y:number,intensity?:number}>} points
     * @param {number|null} minOpt
     * @param {number|null} maxOpt
     */
    setPoints(points, minOpt = null, maxOpt = null) {
        const gl = this.gl;
        let minIntensity = minOpt;
        let maxIntensity = maxOpt;
        if (minIntensity === null || maxIntensity === null) {
            (points || []).forEach((d) => {
                const v = d.intensity !== undefined ? d.intensity : 1;
                if (maxIntensity === null || v > maxIntensity) {
                    maxIntensity = v;
                }
                if (minIntensity === null || v < minIntensity) {
                    minIntensity = v;
                }
            });
        }
        if (minIntensity === maxIntensity) {
            minIntensity -= 1;
        }
        const range = (maxIntensity - minIntensity) || 1;

        const count = points?.length || 0;
        const data = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
            const d = points[i];
            let w = ((d.intensity !== undefined ? d.intensity : 1) - minIntensity) / range;
            if (w < 0) {
                w = 0;
            }
            if (w > 1) {
                w = 1;
            }
            data[i * 3] = d.x;
            data[i * 3 + 1] = d.y;
            data[i * 3 + 2] = w;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        this._pointCount = count;
        // Single full-weight splat peaks near 1 in density space before colorize scale.
        this._densityScale = 1;
    }

    clearPoints() {
        this._pointCount = 0;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    }

    /**
     * @param {object} style
     */
    setStyle(style) {
        this._ensureKernel(style);
        this._ensureLut(style.color);
    }

    /**
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        const w = Math.max(1, Math.floor(width));
        const h = Math.max(1, Math.floor(height));
        if (w === this._fboWidth && h === this._fboHeight && this._fbo) {
            return;
        }
        this._fboWidth = w;
        this._fboHeight = h;
        this._rebuildFbo(w, h);
    }

    /**
     * @param {Float32Array} matrix column-major image→clip (relative to origin)
     * @param {{ x: number, y: number }} origin
     * @param {object} style
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     * @param {number} zoom current viewport zoom
     * @param {number} homeZoom
     * @param {number} [opacity=1]
     */
    draw(matrix, origin, style, canvasWidth, canvasHeight, zoom, homeZoom, opacity = 1) {
        const gl = this.gl;
        if (!this._fbo || this._pointCount === 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return;
        }

        this._ensureKernel(style);
        this._ensureLut(style.color);

        const radiusPxBase = (style.radius || 0) + (style.blurRadius || 0);
        let radiusPx = radiusPxBase;
        const scaleWithZoom = Boolean(style.scaleWithZoom);
        if (!scaleWithZoom && homeZoom > 0 && zoom < homeZoom) {
            radiusPx *= zoom / homeZoom;
        }

        // --- splat into density FBO ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.viewport(0, 0, this._fboWidth, this._fboHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.BLEND);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.blendEquation(gl.FUNC_ADD);

        const sp = this._splatProgram;
        gl.useProgram(sp);
        gl.uniformMatrix4fv(uniformLocation(gl, sp, 'u_matrix'), false, matrix);
        gl.uniform2f(uniformLocation(gl, sp, 'u_origin'), origin.x || 0, origin.y || 0);
        gl.uniform1f(uniformLocation(gl, sp, 'u_scaleWithZoom'), scaleWithZoom ? 1 : 0);

        if (scaleWithZoom) {
            // Image-space radius: convert screen px at current zoom via approx pixels-per-image from matrix.
            const pixPerImage = Math.hypot(matrix[0], matrix[1]) * (canvasWidth / 2);
            const radiusImage = pixPerImage > 0 ? radiusPx / pixPerImage : radiusPx;
            gl.uniform2f(uniformLocation(gl, sp, 'u_radiusNDC'), 0, 0);
            gl.uniform1f(uniformLocation(gl, sp, 'u_radiusImage'), radiusImage);
        } else {
            const ndcX = (radiusPx * 2) / canvasWidth;
            const ndcY = (radiusPx * 2) / canvasHeight;
            gl.uniform2f(uniformLocation(gl, sp, 'u_radiusNDC'), ndcX, ndcY);
            gl.uniform1f(uniformLocation(gl, sp, 'u_radiusImage'), 0);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._kernelTex);
        gl.uniform1i(uniformLocation(gl, sp, 'u_kernel'), 0);

        const cornerLoc = attribLocation(gl, sp, 'a_corner');
        const posLoc = attribLocation(gl, sp, 'a_position');
        const intenLoc = attribLocation(gl, sp, 'a_intensity');

        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
        gl.enableVertexAttribArray(cornerLoc);
        gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
        this._instancing.vertexAttribDivisor(cornerLoc, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 12, 0);
        this._instancing.vertexAttribDivisor(posLoc, 1);
        gl.enableVertexAttribArray(intenLoc);
        gl.vertexAttribPointer(intenLoc, 1, gl.FLOAT, false, 12, 8);
        this._instancing.vertexAttribDivisor(intenLoc, 1);

        this._instancing.drawArraysInstanced(gl.TRIANGLES, 0, 6, this._pointCount);

        this._instancing.vertexAttribDivisor(posLoc, 0);
        this._instancing.vertexAttribDivisor(intenLoc, 0);
        gl.disableVertexAttribArray(cornerLoc);
        gl.disableVertexAttribArray(posLoc);
        gl.disableVertexAttribArray(intenLoc);

        // --- colorize to default framebuffer ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvasWidth, canvasHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const cp = this._colorizeProgram;
        gl.useProgram(cp);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._densityTex);
        gl.uniform1i(uniformLocation(gl, cp, 'u_density'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._lutTex);
        gl.uniform1i(uniformLocation(gl, cp, 'u_lut'), 1);
        gl.uniform1f(uniformLocation(gl, cp, 'u_densityScale'), this._densityScale * opacity);

        const fsLoc = attribLocation(gl, cp, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._fullscreenBuffer);
        gl.enableVertexAttribArray(fsLoc);
        gl.vertexAttribPointer(fsLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(fsLoc);
    }

    destroy() {
        const gl = this.gl;
        if (this._splatProgram) {
            gl.deleteProgram(this._splatProgram);
        }
        if (this._colorizeProgram) {
            gl.deleteProgram(this._colorizeProgram);
        }
        if (this._quadBuffer) {
            gl.deleteBuffer(this._quadBuffer);
        }
        if (this._fullscreenBuffer) {
            gl.deleteBuffer(this._fullscreenBuffer);
        }
        if (this._instanceBuffer) {
            gl.deleteBuffer(this._instanceBuffer);
        }
        this._deleteFbo();
        if (this._kernelTex) {
            gl.deleteTexture(this._kernelTex);
        }
        if (this._lutTex) {
            gl.deleteTexture(this._lutTex);
        }
    }

    /**
     * @param {object} style
     * @private
     */
    _ensureKernel(style) {
        const key = JSON.stringify([style.radius, style.blurRadius, style.gaussian]);
        if (this._kernelTex && this._kernelKey === key) {
            return;
        }
        const gl = this.gl;
        if (this._kernelTex) {
            gl.deleteTexture(this._kernelTex);
        }
        const size = 64;
        const kernel = buildGaussianKernel(size);
        // Upload as RGBA8 luminance in .r for broad support.
        const rgba = new Uint8Array(size * size * 4);
        for (let i = 0; i < kernel.length; i += 1) {
            const v = Math.round(Math.max(0, Math.min(1, kernel[i])) * 255);
            rgba[i * 4] = v;
            rgba[i * 4 + 1] = 0;
            rgba[i * 4 + 2] = 0;
            rgba[i * 4 + 3] = 255;
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        this._kernelTex = tex;
        this._kernelKey = key;
    }

    /**
     * @param {object} colorStops
     * @private
     */
    _ensureLut(colorStops) {
        const key = JSON.stringify(colorStops);
        if (this._lutTex && this._lutKey === key) {
            return;
        }
        const gl = this.gl;
        if (this._lutTex) {
            gl.deleteTexture(this._lutTex);
        }
        const pixels = buildLutPixels(this._scratchCtx, colorStops || {});
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        this._lutTex = tex;
        this._lutKey = key;
    }

    _deleteFbo() {
        const gl = this.gl;
        if (this._fbo) {
            gl.deleteFramebuffer(this._fbo);
            this._fbo = null;
        }
        if (this._densityTex) {
            gl.deleteTexture(this._densityTex);
            this._densityTex = null;
        }
    }

    /**
     * @param {number} width
     * @param {number} height
     * @private
     */
    _rebuildFbo(width, height) {
        const gl = this.gl;
        this._deleteFbo();

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        let useFloat = false;
        if (this._webgl2) {
            const ext = gl.getExtension('EXT_color_buffer_float');
            if (ext) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, width, height, 0, gl.RED, gl.HALF_FLOAT, null);
                useFloat = true;
            }
        }
        if (!useFloat) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE && useFloat) {
            // Fall back to RGBA8.
            gl.deleteFramebuffer(fbo);
            gl.deleteTexture(tex);
            const tex8 = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex8);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            const fbo8 = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo8);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex8, 0);
            this._fbo = fbo8;
            this._densityTex = tex8;
            this._useFloatDensity = false;
        } else {
            this._fbo = fbo;
            this._densityTex = tex;
            this._useFloatDensity = useFloat;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}
