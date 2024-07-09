const formatMessage = require('format-message');
const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const MersenneTwister = require('mersenne-twister');
const { createNoise3D } = require('simplex-noise');
/**
 * Class for perlin noise extension.
 * @constructor
 */

// noise generation code from p5.js

class iygPerlin {
    constructor(runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
        this.noise;
        this.seed = 123;
        this.size = 50;
        this.generator = new MersenneTwister(this.seed);
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
                // Hidden
                {
                    opcode: 'GetNoise',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iygPerlin.GetNoise',
                        default: 'Get perlin noise with seed [SEED] and octave [OCTAVE] at x [X], y [Y], and z [Z]',
                        description: 'Get seeded perlin noise at a specified x and y and z.'
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
                    },
                    hideFromPalette: true
                },
                // Hidden
                {
                    opcode: 'GetRandomNoise',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iygPerlin.GetRandomNoise',
                        default: 'Get noise with seed [SEED] at x [X], y [Y], and z [Z]',
                        description: 'Get seeded noise with a specified seed at a specified x and y and z.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
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
                    },
                    hideFromPalette: true
                },
                // Hidden
                {
                    opcode: 'GeneratePerlinNoise',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iygPerlin.GeneratePerlinNoise',
                        default: 'Pre-generate perlin noise with seed [SEED] and octave [OCTAVE]',
                        description: 'Pre-generate seeded perlin noise.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
                        },
                        OCTAVE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 4
                        }
                    },
                    hideFromPalette: true
                },
                // Hidden
                {
                    opcode: 'GenerateRandomNoise',
                    blockType: BlockType.COMMAND,
                    hideFromPalette: true,
                    text: formatMessage({
                        id: 'iygPerlin.GenerateRandomNoise',
                        default: 'not needed [SEED] [SIZE]',
                        description: 'Pre-generate seeded noise.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
                        },
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    },
                },
                // Hidden
                {
                    opcode: 'getSimplexNoise',
                    blockType: BlockType.REPORTER,
                    hideFromPalette: true,
                    text: formatMessage({
                        id: 'iygPerlin.getSimplexNoise',
                        default: 'Get simplex noise with seed [SEED] at x [X], y [Y], and z [Z]',
                        description: 'Get simplex noise with a specified seed at a specified x and y and z.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
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
                },

                // End of hidden stuff

                {
                    opcode: 'GetNoiseV2',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iygPerlin.GetNoiseV2',
                        default: 'Get perlin noise with seed [SEED] and octave [OCTAVE] at x [X], y [Y], and z [Z]',
                        description: 'Get seeded perlin noise at a specified x and y and z.'
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
                    },
                },
                {
                    opcode: 'GetRandomNoiseV2',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iygPerlin.GetRandomNoiseV2',
                        default: 'Get random noise with seed [SEED] at x [X], y [Y], and z [Z]',
                        description: 'Get seeded random noise with a specified seed at a specified x and y and z.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
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
                },
                {
                    opcode: 'GeneratePerlinNoiseV2',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iygPerlin.GeneratePerlinNoiseV2',
                        default: 'Pre-generate perlin noise with seed [SEED] and octave [OCTAVE]',
                        description: 'Pre-generate seeded perlin noise.'
                    }),
                    arguments: {
                        SEED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 123
                        },
                        OCTAVE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 4
                        }
                    }
                },
            ]
        };
    }

    goodSeedRandom() {
        this.generator.init_seed(this.seed);
        let result = this.generator.random_incl();
        this.seed = result * 4294967296;
        return result;
    }

    dumbSeedRandom() {
        this.generator.init_seed(this.seed);
        let result = this.generator.random_incl();
        this.seed = (1664525*this.seed + 1013904223) % 4294967296;
        return result;
    }

    GeneratePerlinNoise(args, util) {
        args.X = 0;
        args.Y = 0;
        args.Z = 0;
        this.GetNoise(args, util);
    }

    GenerateRandomNoise(args, util) {
        let seed = args.SEED;
        let size = args.SIZE;

        if (this.noise == null || seed != this.seed) {
            this.noise = new Array(size);
            this.seed = seed;
            for (let i = 0; i < size; i++) {
                this.noise[i] = new Array(size);
                for (let j = 0; j < size; j++) {
                    this.noise[i][j] = new Array(size);
                    for (let k = 0; k < size; k++) {
                        this.noise[i][j][k] = this.dumbSeedRandom();
                    }
                }
            }
            this.seed = seed;
            this.prev_seed = seed;
            this.size = size;
        }

        if (size > this.size && seed == this.seed) {
            this.seed = this.prev_seed;
            for (let i = this.size; i < size+1; i++) {
                this.noise[i] = new Array(size);
                for (let j = this.size; j < size+1; j++) {
                    this.noise[i][j] = new Array(size);
                    for (let k = this.size; k < size+1; k++) {
                        this.noise[i][j][k] = this.dumbSeedRandom();
                    }
                }
            }
        }
    }

    GetRandomNoise(args, util) {
        let seed = args.SEED;
        let x = args.X;
        let y = args.Y;
        let z = args.Z;
        let pre_seed = this.seed;
        this.seed = seed+x+y*1000+z*10000;
        let result = this.dumbSeedRandom();
        this.seed = pre_seed;
        return result;
    }

    generatePerlin(seed, perlin_octaves, rand, x, y, z) {
        let perlin_amp_falloff = 0.5;
        const scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));
        const PERLIN_SIZE = 4095;
        const PERLIN_YWRAPB = 4;
        const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
        const PERLIN_ZWRAPB = 8;
        const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;

        if (this.perlin == null || seed != this.seed) {
            this.perlin = new Array(PERLIN_SIZE + 1);
            this.seed = seed;
            for (let i = 0; i < PERLIN_SIZE + 1; i++) {
                this.perlin[i] = rand();
            }
            this.seed = seed;
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
    
        n1 = this.perlin[of & PERLIN_SIZE];
        n1 += rxf * (this.perlin[(of + 1) & PERLIN_SIZE] - n1);
        n2 = this.perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n2 += rxf * (this.perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
        n1 += ryf * (n2 - n1);
    
        of += PERLIN_ZWRAP;
        n2 = this.perlin[of & PERLIN_SIZE];
        n2 += rxf * (this.perlin[(of + 1) & PERLIN_SIZE] - n2);
        n3 = this.perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n3 += rxf * (this.perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
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
        return r % 1.0;
    }

    GetNoise(args, util) {
        let seed = args.SEED;
        let perlin_octaves = ((args.OCTAVE === Infinity) ? 4 : args.OCTAVE);
        let x = args.X + .5;
        let y = args.Y + .5;
        let z = args.Z + .5;

        return this.generatePerlin(seed, perlin_octaves, this.dumbSeedRandom.bind(this), x, y, z);
    }

    // ----- V2 -----
    GetNoiseV2(args, util) {
        let seed = args.SEED;
        let perlin_octaves = ((args.OCTAVE === Infinity) ? 4 : args.OCTAVE);
        let x = args.X + .5;
        let y = args.Y + .5;
        let z = args.Z + .5;

        return this.generatePerlin(seed, perlin_octaves, this.goodSeedRandom.bind(this), x, y, z);
    }

    // ----- V2 -----
    GetRandomNoiseV2(args, util) {
        let seed = args.SEED;
        let x = args.X;
        let y = args.Y;
        let z = args.Z;
        let pre_seed = this.seed;
        this.seed = seed + (x * 743) + (y * 942 ) + (z * 645);
        let result = this.goodSeedRandom.bind(this)();
        this.seed = pre_seed;
        return result;
    }

    // ----- V2 -----
    GeneratePerlinNoiseV2(args, util) {
        args.X = 0;
        args.Y = 0;
        args.Z = 0;
        this.GetNoiseV2(args, util);
    }
        
    getSimplexNoise(args) {
        const seed = args.SEED;
        const x = args.X;
        const y = args.Y;
        const z = args.Z;
        this.generator.init_seed(seed);
        const noise = createNoise3D(this.generator.random_incl.bind(this.generator));
        return noise(x, y, z);
    }
}

module.exports = iygPerlin;
