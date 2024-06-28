const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const Clone = require('../../util/clone');

/**
 * @typedef {object} cameraState - the camera state associated with a particular target.
 * @property {[number, number]} pos - the xy offset of the camera.
 * @property {number} size - the zoom of the camera (percentage).
 * @property {number} dir - the camera rotation offset.
 * @property {string} camera - the camera id this object is representing
 * @property {boolean} silent - passed down to the runtime when assigning the camera state
 */

// eslint-disable-next-line no-undef
const pathToMedia = 'static/blocks-media'; // ScratchBlocks.mainWorkspace.options.pathToMedia
const stateKey = 'CAMERA_INFO';
/** @type {cameraState} */
const defaultState = {
    pos: [0, 0],
    size: 100,
    dir: 90,
    camera: 'default',
    silent: false
};

class PenguinModCamera {
    constructor(runtime) {
        this.runtime = runtime;

        runtime.setRuntimeOptions({
            fencing: false
        });
        runtime.ioDevices.mouse.bindToCamera(0);
    }
    /**
     * @param {Target} target - collect pen state for this target. Probably, but not necessarily, a RenderedTarget.
     * @returns {cameraState} the mutable pen state associated with that target. This will be created if necessary.
     * @private
     */
    _getCameraState (target) {
        let cameraState = target._customState[stateKey];
        if (!cameraState) {
            cameraState = Clone.simple(defaultState);
            if (target.cameraBound) cameraState.camera = target.cameraBound;
            target.setCustomState(stateKey, cameraState);
        }
        return cameraState;
    }
    _loadCameraState(target) {
        const state = this._getCameraState(target);
        const {pos, dir, scale} = this.runtime.getCamera(state.camera);
        state.pos = pos;
        state.dir = dir + 90;
        state.size = scale * 100;
    }
    _updateRender(target) {
        const state = this._getCameraState(target);
        // console.log(state);
        this.runtime.updateCamera(state.camera, {
            pos: state.pos,
            dir: 90 - state.dir,
            scale: state.size / 100
        }, state.silent);
    }
    _fixDirection(target) {
        const state = this._getCameraState(target);
        state.dir = MathUtil.wrapClamp(state.dir, -179, 180);
    }
    getInfo() {
        return {
            id: 'pmCamera',
            name: 'Camera',
            color1: '#0586FF',
            blocks: [
                {
                    opcode: 'moveSteps',
                    blockType: BlockType.COMMAND,
                    text: 'move camera [STEPS] steps',
                    arguments: {
                        STEPS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '10'
                        }
                    }
                },
                {
                    opcode: 'turnRight',
                    blockType: BlockType.COMMAND,
                    text: 'turn camera [DIRECTION] [DEGREES] degrees',
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.IMAGE,
                            dataURI: `${pathToMedia}/rotate-right.svg`
                        },
                        DEGREES: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '15'
                        }
                    }
                },
                {
                    opcode: 'turnLeft',
                    blockType: BlockType.COMMAND,
                    text: 'turn camera [DIRECTION] [DEGREES] degrees',
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.IMAGE,
                            dataURI: `${pathToMedia}/rotate-left.svg`
                        },
                        DEGREES: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '15'
                        }
                    }
                },
                {
                    opcode: 'bindTarget',
                    blockType: BlockType.COMMAND,
                    text: 'bind [TARGET] to camera [SCREEN]',
                    arguments: {
                        TARGET: {
                            type: ArgumentType.STRING,
                            menu: 'BINDABLE_TARGETS'
                        },
                        SCREEN: {
                            type: ArgumentType.STRING,
                            defaultValue: 'default'
                        }
                    }
                },
                {
                    opcode: 'unbindTarget',
                    blockType: BlockType.COMMAND,
                    text: 'unbind [TARGET] from the camera',
                    arguments: {
                        TARGET: {
                            type: ArgumentType.STRING,
                            menu: 'BINDABLE_TARGETS'
                        }
                    }
                },
                {
                    opcode: 'setCurrentCamera',
                    blockType: BlockType.COMMAND,
                    text: 'set current camera to [SCREEN]',
                    arguments: {
                        SCREEN: {
                            type: ArgumentType.STRING,
                            defaultValue: 'default'
                        }
                    }
                },
                {
                    opcode: 'setRenderImediat',
                    blockType: BlockType.COMMAND,
                    text: 'set render mode to [RENDER_MODE]',
                    arguments: {
                        RENDER_MODE: {
                            type: ArgumentType.STRING,
                            menu: 'RENDER_MODES'
                        }
                    }
                },
                {
                    opcode: 'manualRender',
                    blockType: BlockType.COMMAND,
                    text: 'render camera'
                },
                '---',
                {
                    opcode: 'gotoXY',
                    blockType: BlockType.COMMAND,
                    text: 'set camera x: [X] y: [Y]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'setSize',
                    blockType: BlockType.COMMAND,
                    text: 'set camera zoom to [ZOOM]%',
                    arguments: {
                        ZOOM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '100'
                        }
                    }
                },
                {
                    opcode: 'changeSize',
                    blockType: BlockType.COMMAND,
                    text: 'change camera zoom by [ZOOM]%',
                    arguments: {
                        ZOOM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '10'
                        }
                    }
                },
                '---',
                {
                    opcode: 'pointTowards',
                    blockType: BlockType.COMMAND,
                    text: 'point camera in direction [DIRECTION]',
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.ANGLE,
                            defaultValue: '90'
                        }
                    }
                },
                {
                    opcode: 'pointTowardsPoint',
                    blockType: BlockType.COMMAND,
                    text: 'point camera towards x: [X] y: [Y]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        }
                    }
                },
                '---',
                {
                    opcode: 'changeXpos',
                    blockType: BlockType.COMMAND,
                    text: 'change camera x by [X]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '10'
                        }
                    }
                },
                {
                    opcode: 'setXpos',
                    blockType: BlockType.COMMAND,
                    text: 'set camera x to [X]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'changeYpos',
                    blockType: BlockType.COMMAND,
                    text: 'change camera y by [Y]',
                    arguments: {
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '10'
                        }
                    }
                },
                {
                    opcode: 'setYpos',
                    blockType: BlockType.COMMAND,
                    text: 'set camera y to [Y]',
                    arguments: {
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        }
                    }
                },
                '---',
                {
                    opcode: 'xPosition',
                    blockType: BlockType.REPORTER,
                    text: 'camera x'
                },
                {
                    opcode: 'yPosition',
                    blockType: BlockType.REPORTER,
                    text: 'camera y'
                },
                {
                    opcode: 'direction',
                    blockType: BlockType.REPORTER,
                    text: 'camera direction'
                },
                {
                    // theres also a property named "size" so this one is special
                    opcode: 'getSize',
                    blockType: BlockType.REPORTER,
                    text: 'camera zoom'
                },
                {
                    opcode: 'getCurrentCamera',
                    blockType: BlockType.REPORTER,
                    text: 'current camera'
                }
            ],
            menus: {
                BINDABLE_TARGETS: {
                    items: 'getBindableTargets',
                    acceptReports: true
                },
                RENDER_MODES: {
                    items: [
                        'immediate',
                        'manual'
                    ]
                }
            }
        };
    }
    getBindableTargets() {
        const targets = this.runtime.targets
            .filter(target => !target.isStage && target.isOriginal && target.id !== this.runtime.vm.editingTarget)
            .map(target => target.getName());
        return [].concat([
            { text: 'this sprite', value: '__MYSELF__' },
            { text: 'mouse-pointer', value: '__MOUSEPOINTER__' },
            { text: 'backdrop', value: '__STAGE__' },
            { text: 'all sprites', value: '__ALL__' }
        ], targets);
    }
    moveSteps(args, util) {
        const state = this._getCameraState(util.target);
        const steps = Cast.toNumber(args.STEPS);
        const radians = MathUtil.degToRad(90 - state.dir);
        const dx = steps * Math.cos(radians);
        const dy = steps * Math.sin(radians);
        state.pos[0] += dx;
        state.pos[1] += dy;
        this._updateRender(util.target);
    }
    turnRight(args, util) {
        const state = this._getCameraState(util.target);
        const deg = Cast.toNumber(args.DEGREES);
        state.dir -= deg;
        this._fixDirection(util.target);
        this._updateRender(util.target);
    }
    turnLeft(args, util) {
        const state = this._getCameraState(util.target);
        const deg = Cast.toNumber(args.DEGREES);
        state.dir += deg;
        this._fixDirection(util.target);
        this._updateRender(util.target);
    }
    bindTarget(args, util) {
        const target = Cast.toString(args.TARGET);
        const screen = Cast.toString(args.SCREEN);
        if (!screen) throw new Error('target screen MUST not be blank');
        switch (target) {
        case '__MYSELF__':
            const myself = util.target;
            const state = this._getCameraState(myself);
            myself.bindToCamera(screen);
            state.camera = screen;
            this._loadCameraState(myself);
            break;
        case '__MOUSEPOINTER__':
            util.ioQuery('mouse', 'bindToCamera', [screen]);
            break;
        /*
        case '__PEN__':
            const pen = this.runtime.ext_pen;
            if (!pen) break;
            pen.bindToCamera(screen);
            break;
            */
        case '__STAGE__':
            const stage = this.runtime.getTargetForStage();
            stage.bindToCamera(screen);
            break;
        case '__ALL__':
            for (const target of this.runtime.targets) {
                target.bindToCamera(screen);
            }
            break;
        default:
            const sprite = this.runtime.getSpriteTargetByName(target);
            if (!sprite) throw `unkown target ${target}`;
            sprite.bindToCamera(screen);
            break;
        }
    }
    unbindTarget(args, util) {
        const target = Cast.toString(args.TARGET);
        switch (target) {
        case '__MYSELF__': {
            const myself = util.target;
            myself.removeCameraBinding();
            break;
        }
        case '__MOUSEPOINTER__':
            util.ioQuery('mouse', 'removeCameraBinding');
            break;
        /*
        case '__PEN__': {
            const pen = this.runtime.ext_pen;
            if (!pen) break;
            pen.removeCameraBinding();
            break;
        }
        */
        case '__STAGE__': {
            const stage = this.runtime.getTargetForStage();
            stage.removeCameraBinding();
            break;
        }
        case '__ALL__':
            for (const target of this.runtime.targets) {
                target.removeCameraBinding();
            }
            break;
        default: {
            const sprite = this.runtime.getSpriteTargetByName(target);
            if (!sprite) throw `unkown target ${target}`;
            sprite.removeCameraBinding();
            break;
        }
        }
    }
    setCurrentCamera(args, util) {
        const state = this._getCameraState(util.target);
        const screen = Cast.toString(args.SCREEN);
        if (!screen) throw new Error('target screen MUST not be blank');
        state.camera = screen;
        this._loadCameraState(util.target);
    }
    setRenderImediat(args, util) {
        const state = this._getCameraState(util.target);
        const renderMode = Cast.toString(args.RENDER_MODE);
        // possibly add more render modes?
        switch (renderMode) {
        case 'immediate':
            state.silent = false;
            break;
        case 'manual':
            state.silent = true;
            break;
        }
    }
    manualRender(_, util) {
        const state = this._getCameraState(util.target);
        this._updateRender(util.target);
        this.runtime.emit('CAMERA_CHANGED', state.camera);
    }

    gotoXY(args, util) {
        const state = this._getCameraState(util.target);
        const x = Cast.toNumber(args.X);
        const y = Cast.toNumber(args.Y);
        state.pos = [x, y];
        this._updateRender(util.target);
    }
    setSize(args, util) {
        const state = this._getCameraState(util.target);
        const size = Cast.toNumber(args.ZOOM);
        state.size = size;
        this._updateRender(util.target);
    }
    changeSize(args, util) {
        const state = this._getCameraState(util.target);
        const size = Cast.toNumber(args.ZOOM);
        state.size += size;
        this._updateRender(util.target);
    }

    pointTowards(args, util) {
        const state = this._getCameraState(util.target);
        const direction = Cast.toNumber(args.DIRECTION);
        state.dir = direction;
        this._fixDirection(util.target);
        this._updateRender(util.target);
    }
    pointTowardsPoint(args, util) {
        const state = this._getCameraState(util.target);
        const targetX = Cast.toNumber(args.X);
        const targetY = Cast.toNumber(args.Y);

        const dx = targetX - state.pos[0];
        const dy = targetY - state.pos[1];
        const direction = 90 - MathUtil.radToDeg(Math.atan2(dy, dx));
        state.dir = direction;
        // might not need to do this here but its prob better if we do
        this._fixDirection(util.target);
        this._updateRender(util.target);
    }

    changeXpos(args, util) {
        const state = this._getCameraState(util.target);
        const nx = Cast.toNumber(args.X);
        state.pos[0] += nx;
        this._updateRender(util.target);
    }
    setXpos(args, util) {
        const state = this._getCameraState(util.target);
        const nx = Cast.toNumber(args.X);
        state.pos[0] = nx;
        this._updateRender(util.target);
    }
    changeYpos(args, util) {
        const state = this._getCameraState(util.target);
        const ny = Cast.toNumber(args.Y);
        state.pos[1] += ny;
        this._updateRender(util.target);
    }
    setYpos(args, util) {
        const state = this._getCameraState(util.target);
        const ny = Cast.toNumber(args.Y);
        state.pos[1] = ny;
        this._updateRender(util.target);
    }

    xPosition(_, util) {
        const state = this._getCameraState(util.target);
        return state.pos[0];
    }
    yPosition(_, util) {
        const state = this._getCameraState(util.target);
        return state.pos[1];
    }
    direction(_, util) {
        const state = this._getCameraState(util.target);
        return state.dir;
    }
    getSize(_, util) {
        const state = this._getCameraState(util.target);
        return state.size;
    }
    getCurrentCamera(_, util) {
        const state = this._getCameraState(util.target);
        return state.camera;
    }
}

module.exports = PenguinModCamera;
