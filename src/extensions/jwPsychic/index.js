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
        if (!vm.jwVector) vm.extensionManager.loadExtensionIdSync('jwVector')
        Vector = vm.jwVector

        this.engine = Matter.Engine.create()
        /** @type {Array.<Matter.Body>} */
        this.bodies = {}
        
        vm.runtime.on("PROJECT_START", this.reset.bind(this));

        vm.PsychicDebug = this;
    }

    getInfo() {
        return {
            id: "jwPsychic",
            name: "Psychic",
            blocks: [
                {
                    opcode: 'tick',
                    text: 'tick',
                    blockType: BlockType.COMMAND
                },
                "---",
                {
                    opcode: 'enablePhysics',
                    text: 'setup physics as [OPTION]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        OPTION: {
                            type: ArgumentType.STRING,
                            menu: 'enablePhysicsOption'
                        }
                    }
                }
            ],
            menus: {
                enablePhysicsOption: [
                    'precise',
                    'box',
                    'circle'
                ]
            }
        };
    }

    reset() {
        this.engine = Matter.Engine.create()
    }

    correctBody(id) {
        /** @type {Matter.Body} */
        let body = this.bodies[id]
        let target = vm.runtime.getTargetById(id)

        if (target == undefined) {
            Matter.Composite.remove(this.engine.world, body)
            delete this.bodies[id]
            return
        }

        Matter.Body.setPosition(body, Matter.Vector.create(target.x, target.y))
        Matter.Body.setAngle(body, target.direction * Math.PI / 180)
    }

    correctTarget(id) {
        /** @type {Matter.Body} */
        let body = this.bodies[id]
        let target = vm.runtime.getTargetById(id)

        target.x = body.position.x
        target.y = body.position.y
        target.direction = body.angle * 180 / Math.PI
    }

    tick() {
        let fps = vm.runtime.frameLoop.framerate
        if (fps == 0) fps = 60

        for (let id of Object.keys(this.bodies)) {
            this.correctBody(id)
        }

        Matter.Engine.update(this.engine, 1000 / fps)

        for (let id of Object.keys(this.bodies)) {
            this.correctTarget(id)
        }
    }

    enablePhysics({OPTION}, util) {
        let target = util.target
        let size = {
            x: target.getCostumes()[target.currentCostume].size[0] * (target.size / 100) * (target.stretch[0] / 100),
            y: target.getCostumes()[target.currentCostume].size[1] * (target.size / 100) * (target.stretch[1] / 100)
        }

        let body = null
        switch (OPTION) {
            case 'precise':
                throw "i need to finish precise mb"
                break
            case 'box':
                body = Matter.Bodies.rectangle(target.x, target.y, size.x, size.y)
                break
            case 'circle':
                body = Matter.Bodies.circle(target.x, target.y, Math.max(size.x, size.y) / 2)
                break
            default:
                throw "Invalid physics option"
        }

        this.bodies[target.id] = body
        Matter.Composite.add(this.engine.world, body)

        this.correctBody(target.id)
    }
}

module.exports = Extension