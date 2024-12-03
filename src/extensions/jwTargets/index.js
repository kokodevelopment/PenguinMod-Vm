const BlockType = require('../../extension-support/block-type')
const BlockShape = require('../../extension-support/block-shape')
const ArgumentType = require('../../extension-support/argument-type')
const Cast = require('../../util/cast')

function span(text) {
    let el = document.createElement('span')
    el.innerHTML = text
    el.style.display = 'hidden'
    el.style.whiteSpace = 'nowrap'
    el.style.width = '100%'
    el.style.textAlign = 'center'
    return el
}

class TargetType {
    customId = "jwTargets"

    targetId = ""

    constructor(targetId) {
        this.targetId = targetId
    }

    static toTarget(x) {
        if (x instanceof TargetType) return x
        if (typeof x == "string") return new TargetType(x)
        return new TargetType("")
    }

    jwArrayHandler() {
        return 'Target'
    }

    toString() {
        return this.targetId
    }
    toMonitorContent = () => span(this.toString())

    toReporterContent() {
        try {
            let target = this.target
            let name = target.sprite.name
            let isClone = !target.isOriginal
            let costumeURI = target.getCostumes()[target.currentCostume].asset.encodeDataURI()

            let root = document.createElement('div')
            root.style.display = 'flex'
            root.style.flexDirection = 'column'
            root.style.justifyContent = 'center'

            let img = document.createElement('img')
            img.src = costumeURI
            img.style.maxWidth = '150px'
            img.style.maxHeight = '150px'
            root.appendChild(img)
            
            root.appendChild(span(`${name}${isClone ? ' (clone)' : ''}`))

            return root
        } catch {
            return span("Unknown")
        }
    }

    get target() {
        return vm.runtime.getTargetById(this.targetId)
    }
}

const Target = {
    Type: TargetType,
    Block: {
        blockType: BlockType.REPORTER,
        forceOutputType: "Target",
        disableMonitor: true
    },
    Argument: {
        check: ["Target"]
    }
}

let jwArray = {
    Type: class {},
    Block: {},
    Argument: {}
}

class Extension {
    constructor() {
        vm.jwTargets = Target
        vm.runtime.registerSerializer(
            "jwTargets", 
            v => v.targetId, 
            v => new Target.Type(v)
        );

        if (!vm.jwArray) vm.extensionManager.loadExtensionIdSync('jwArray')
        jwArray = vm.jwArray
    }

    getInfo() {
        return {
            id: "jwTargets",
            name: "Targets",
            color1: "#4254f5",
            blocks: [
                {
                    opcode: 'this',
                    text: 'this target',
                    ...Target.Block
                },
                {
                    opcode: 'stage',
                    text: 'stage target',
                    ...Target.Block
                },
                '---',
                {
                    opcode: 'get',
                    text: '[MENU] [TARGET]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        TARGET: Target.Argument,
                        MENU: {
                            menu: "targetProperty"
                        }
                    }
                },
                '---',
                {
                    opcode: 'all',
                    text: 'all targets',
                    ...jwArray.Block
                },
                {
                    opcode: 'clones',
                    text: 'clones of [TARGET]',
                    arguments: {
                        TARGET: Target.Argument
                    },
                    filter: [TargetType.SPRITE],
                    ...jwArray.Block
                },
                '---',
                {
                    blockType: BlockType.XML,
                    xml: `<block type="control_run_as_sprite" />`
                }
            ],
            menus: {
                targetProperty: {
                    acceptReporters: true,
                    items: [
                        "x",
                        "y",
                        "direction",
                        "size",
                        "name"
                    ]
                }
            }
        };
    }

    this({}, util) {
        return new Target.Type(util.target.id)
    }

    stage() {
        return new Target.Type(vm.runtime._stageTarget.id)
    }

    get({TARGET, MENU}) {
        TARGET = Target.Type.toTarget(TARGET)
        MENU = Cast.toString(MENU)

        if (!TARGET.target) return ""

        switch(MENU) {
            case "x": return TARGET.target.x
            case "y": return TARGET.target.y
            case "direction": return TARGET.target.direction
            case "size": return TARGET.target.size
            case "name": return TARGET.target.sprite.name
        }

        return ""
    }

    all() {
        return new jwArray.Type(vm.runtime.targets.map(v => new Target.Type(v.id)))
    }

    clones({TARGET}) {
        TARGET = Target.Type.toTarget(TARGET)
        if (TARGET.target) {
            return new jwArray.Type(TARGET.target.sprite.clones.filter(v => !v.isOriginal).map(v => new Target.Type(v.id)))
        }
        return new jwArray.Type()
    }
}

module.exports = Extension