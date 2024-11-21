const BlockType = require('../../extension-support/block-type')
const BlockShape = require('../../extension-support/block-shape')
const ArgumentType = require('../../extension-support/argument-type')
const Cast = require('../../util/cast')

const Matter = require('matter-js')

let Vector = {
    Type: class {},
    Block: {},
    Argument: {}
}

class Extension {
    constructor() {
        vm.extensionManager.loadExtensionIdSync('jwVector')
        Vector = vm.jwVector

        this.engine = Matter.Engine.create()
        
        vm.runtime.on("PROJECT_START", this.reset.bind(this));

        vm.PsychicDebug = this;
    }

    getInfo() {
        return {
            id: "jwPsychic",
            name: "Psychic",
            blocks: [
                {
                    opcode: 'reset',
                    text: 'reset engine',
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'tick',
                    text: 'tick',
                    blockType: BlockType.COMMAND
                }
            ]
        };
    }

    reset() {
        this.engine = Matter.Engine.create()
    }

    tick() {
        let fps = vm.runtime.frameLoop.framerate
        if (fps == 0) fps = 60
        Matter.Engine.update(this.engine, 1000 / fps)
    }
}

module.exports = Extension