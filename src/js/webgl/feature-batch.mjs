/**
 * WebGL buffer batch for a single FeatureCollection.
 * Indexed drawElements: Uint32 when needed/supported, else remapped Uint16 chunks.
 */

import { createProgram, attribLocation, uniformLocation, supportsUint32Indices } from './gl-utils.mjs';
import { chunkIndexedMesh, needsUint32Indices } from './index-buffers.mjs';
import { screenToImagePixel } from './camera-from-osd.mjs';
import { polygonVertexShader, polygonFragmentShader } from './programs/polygon.mjs';
import { lineVertexShader, lineFragmentShader } from './programs/line.mjs';
import { pointVertexShader, pointFragmentShader } from './programs/point.mjs';

/**
 * @param {WebGLRenderingContext} gl
 * @param {number[]} data
 * @param {number} size
 * @returns {WebGLBuffer}
 */
function createBuffer(gl, data, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    buf._size = size;
    return buf;
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {number[]} indices
 * @param {boolean} useUint32
 * @returns {{ buffer: WebGLBuffer, count: number, type: number }}
 */
function createIndexBuffer(gl, indices, useUint32) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    const array = useUint32 ? new Uint32Array(indices) : new Uint16Array(indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, array, gl.STATIC_DRAW);
    return {
        buffer: buf,
        count: indices.length,
        type: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {object} mesh
 * @param {number} primSize
 * @param {boolean} allowUint32
 * @param {boolean} withNormals
 * @returns {object[]}
 */
function buildDrawParts(gl, mesh, primSize, allowUint32, withNormals) {
    const indices = mesh.indices;
    if (!indices?.length) {
        return [];
    }
    const useUint32 = allowUint32 && needsUint32Indices(indices);
    if (useUint32 || !needsUint32Indices(indices)) {
        const part = {
            position: createBuffer(gl, mesh.positions, 2),
            color: createBuffer(gl, mesh.colors, 4),
            index: createIndexBuffer(gl, indices, useUint32),
        };
        if (withNormals) {
            part.normal = createBuffer(gl, mesh.normals, 2);
        }
        return [part];
    }

    const chunks = chunkIndexedMesh(
        mesh.positions,
        mesh.colors,
        indices,
        primSize,
        withNormals ? mesh.normals : null
    );
    return chunks.map((chunk) => {
        const part = {
            position: createBuffer(gl, chunk.positions, 2),
            color: createBuffer(gl, chunk.colors, 4),
            index: createIndexBuffer(gl, chunk.indices, false),
        };
        if (withNormals) {
            part.normal = createBuffer(gl, chunk.normals, 2);
        }
        return part;
    });
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {object|null} group
 */
function destroyDrawParts(gl, group) {
    if (!group?.parts) {
        return;
    }
    group.parts.forEach((part) => {
        if (part.position) {
            gl.deleteBuffer(part.position);
        }
        if (part.color) {
            gl.deleteBuffer(part.color);
        }
        if (part.normal) {
            gl.deleteBuffer(part.normal);
        }
        if (part.index?.buffer) {
            gl.deleteBuffer(part.index.buffer);
        }
    });
}

export class FeatureBatch {
    /**
     * @param {WebGLRenderingContext} gl
     */
    constructor(gl) {
        this.gl = gl;
        this._uint32Indices = supportsUint32Indices(gl);
        this.polygonProgram = createProgram(gl, polygonVertexShader, polygonFragmentShader);
        this.lineProgram = createProgram(gl, lineVertexShader, lineFragmentShader);
        this.pointProgram = createProgram(gl, pointVertexShader, pointFragmentShader);
        this.polygon = null;
        this.line = null;
        this.point = null;
        this.features = [];
        this.opacity = 1;
        this.visible = true;
        this.strokeWidth = 2;
    }

    /**
     * @param {{ polygon: object, line: object, point: object, features: object[] }} meshes
     */
    setMeshes(meshes) {
        const gl = this.gl;
        destroyDrawParts(gl, this.polygon);
        destroyDrawParts(gl, this.line);
        if (this.point) {
            if (this.point.position) {
                gl.deleteBuffer(this.point.position);
            }
            if (this.point.color) {
                gl.deleteBuffer(this.point.color);
            }
        }

        this.features = meshes.features || [];

        if (meshes.polygon?.indices?.length) {
            this.polygon = {
                parts: buildDrawParts(gl, meshes.polygon, 3, this._uint32Indices, false),
            };
        } else {
            this.polygon = null;
        }

        if (meshes.line?.indices?.length) {
            this.line = {
                parts: buildDrawParts(gl, meshes.line, 2, this._uint32Indices, true),
            };
        } else {
            this.line = null;
        }

        if (meshes.point?.positions?.length) {
            this.point = {
                position: createBuffer(gl, meshes.point.positions, 2),
                color: createBuffer(gl, meshes.point.colors, 4),
                count: meshes.point.positions.length / 2,
            };
        } else {
            this.point = null;
        }
    }

    /**
     * @param {Float32Array} matrix
     * @param {number} globalOpacity
     */
    draw(matrix, globalOpacity = 1) {
        if (!this.visible) {
            return;
        }
        const gl = this.gl;
        const opacity = this.opacity * globalOpacity;

        if (this.polygon?.parts?.length) {
            const program = this.polygonProgram;
            gl.useProgram(program);
            gl.uniformMatrix4fv(uniformLocation(gl, program, 'u_matrix'), false, matrix);
            gl.uniform1f(uniformLocation(gl, program, 'u_opacity'), opacity);
            const posLoc = attribLocation(gl, program, 'a_position');
            const colLoc = attribLocation(gl, program, 'a_color');

            this.polygon.parts.forEach((part) => {
                gl.bindBuffer(gl.ARRAY_BUFFER, part.position);
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ARRAY_BUFFER, part.color);
                gl.enableVertexAttribArray(colLoc);
                gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.index.buffer);
                gl.drawElements(gl.TRIANGLES, part.index.count, part.index.type, 0);
            });
        }

        if (this.line?.parts?.length) {
            const program = this.lineProgram;
            gl.useProgram(program);
            gl.uniformMatrix4fv(uniformLocation(gl, program, 'u_matrix'), false, matrix);
            gl.uniform1f(uniformLocation(gl, program, 'u_lineWidth'), this.strokeWidth);
            gl.uniform1f(uniformLocation(gl, program, 'u_opacity'), opacity);
            const posLoc = attribLocation(gl, program, 'a_position');
            const normLoc = attribLocation(gl, program, 'a_normal');
            const colLoc = attribLocation(gl, program, 'a_color');

            this.line.parts.forEach((part) => {
                gl.bindBuffer(gl.ARRAY_BUFFER, part.position);
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ARRAY_BUFFER, part.normal);
                gl.enableVertexAttribArray(normLoc);
                gl.vertexAttribPointer(normLoc, 2, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ARRAY_BUFFER, part.color);
                gl.enableVertexAttribArray(colLoc);
                gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.index.buffer);
                gl.drawElements(gl.LINES, part.index.count, part.index.type, 0);
            });
        }

        if (this.point) {
            const program = this.pointProgram;
            gl.useProgram(program);
            gl.uniformMatrix4fv(uniformLocation(gl, program, 'u_matrix'), false, matrix);
            gl.uniform1f(uniformLocation(gl, program, 'u_pointSize'), 8);
            gl.uniform1f(uniformLocation(gl, program, 'u_opacity'), opacity);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.point.position);
            const posLoc = attribLocation(gl, program, 'a_position');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.point.color);
            const colLoc = attribLocation(gl, program, 'a_color');
            gl.enableVertexAttribArray(colLoc);
            gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.POINTS, 0, this.point.count);
        }
    }

    /**
     * @param {number} screenX
     * @param {number} screenY
     * @param {OpenSeadragon.Viewer} viewer
     * @param {OpenSeadragon.TiledImage} tiledImage
     * @returns {object|null}
     */
    hitTest(screenX, screenY, viewer, tiledImage) {
        const image = screenToImagePixel(viewer, tiledImage, screenX, screenY);
        const ix = image.x;
        const iy = image.y;
        for (let i = this.features.length - 1; i >= 0; i -= 1) {
            const f = this.features[i];
            const [minX, minY, maxX, maxY] = f.bbox;
            if (ix >= minX && ix <= maxX && iy >= minY && iy <= maxY) {
                return f.feature;
            }
        }
        return null;
    }

    destroy() {
        const gl = this.gl;
        destroyDrawParts(gl, this.polygon);
        destroyDrawParts(gl, this.line);
        if (this.point) {
            if (this.point.position) {
                gl.deleteBuffer(this.point.position);
            }
            if (this.point.color) {
                gl.deleteBuffer(this.point.color);
            }
        }
        this.polygon = null;
        this.line = null;
        this.point = null;
        gl.deleteProgram(this.polygonProgram);
        gl.deleteProgram(this.lineProgram);
        gl.deleteProgram(this.pointProgram);
    }
}
