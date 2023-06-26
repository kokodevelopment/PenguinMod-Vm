const formatMessage = require('format-message');
const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
/**
 * Class for perlin noise extension.
 * @constructor
 */

// noise generation code from p5.js

class iygPerlin {
    constructor(runtime) {
        console.log("perlin noise extension loading oh ma gah");
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
        this.noise;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: 'iygPerlin',
            name: 'Perlin Noise',
            color1: '#525252',
            color2: '#636363',
            blocks: [
                {
                    opcode: 'GetNoise',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iygPerlin.GetNoise',
                        default: 'Get noise with seed [SEED] and octave [OCTAVE] at x [X], y [Y], and z [Z]',
                        description: 'Get seeded noise at a specified x and y and z.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
                        },
                        OCTAVE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 4
                        },
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        Z: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                }
            ]
        };
    }

    dumbSeedRandom(seed) {
        x = (171 * seed) % 30269
        y = (172 * seed) % 30307
        z = (170 * seed) % 30323
        return (x/30269.0 + y/30307.0 + z/30323.0) % 1.0
    }

    GetNoise(args, util) {
        let seed = args.SEED;
        let perlin_octaves = args.OCTAVE;
        let x = args.X;
        let y = args.Y;
        let z = args.Z;

        let perlin_amp_falloff = 0.5;
        const scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));
        const PERLIN_SIZE = 4095;
        const PERLIN_YWRAPB = 4;
        const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
        const PERLIN_ZWRAPB = 8;
        const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;

        let perlin = new Array(PERLIN_SIZE + 1);
        for (let i = 0; i < PERLIN_SIZE + 1; i++) {
            seed = this.dumbSeedRandom(seed);
            perlin[i] = seed
        }
    
        if (x < 0) {
            x = -x;
        }
        if (y < 0) {
            y = -y;
        }
        if (z < 0) {
            z = -z;
        }
    
        let xi = Math.floor(x),
        yi = Math.floor(y),
        zi = Math.floor(z);
        let xf = x - xi;
        let yf = y - yi;
        let zf = z - zi;
        let rxf, ryf;
    
        let r = 0;
        let ampl = 0.5;
    
        let n1, n2, n3;
    
        for (let o = 0; o < perlin_octaves; o++) {
        let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);
    
        rxf = scaled_cosine(xf);
        ryf = scaled_cosine(yf);
    
        n1 = perlin[of & PERLIN_SIZE];
        n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
        n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
        n1 += ryf * (n2 - n1);
    
        of += PERLIN_ZWRAP;
        n2 = perlin[of & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
        n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
        n2 += ryf * (n3 - n2);
    
        n1 += scaled_cosine(zf) * (n2 - n1);
    
        r += n1 * ampl;
        ampl *= perlin_amp_falloff;
        xi <<= 1;
        xf *= 2;
        yi <<= 1;
        yf *= 2;
        zi <<= 1;
        zf *= 2;
    
        if (xf >= 1.0) {
            xi++;
            xf--;
        }
        if (yf >= 1.0) {
            yi++;
            yf--;
        }
        if (zf >= 1.0) {
            zi++;
            zf--;
        }
        }
        return r;

    }
}

module.exports = iygPerlin;