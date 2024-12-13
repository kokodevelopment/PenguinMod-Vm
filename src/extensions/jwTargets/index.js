const BlockType = require('../../extension-support/block-type')
const BlockShape = require('../../extension-support/block-shape')
const ArgumentType = require('../../extension-support/argument-type')
const TargetType = require('../../extension-support/target-type')
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

class jwTargetType {
    customId = "jwTargets"

    targetId = ""

    constructor(targetId) {
        this.targetId = targetId
    }

    static toTarget(x) {
        if (x instanceof jwTargetType) return x
        if (typeof x == "string") return new jwTargetType(x)
        return new jwTargetType("")
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
    Type: jwTargetType,
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
                    hideFromPalette: true,
                    ...Target.Block
                },
                {
                    opcode: 'stage',
                    text: 'stage target',
                    hideFromPalette: true,
                    ...Target.Block
                },
                {
                    opcode: 'fromName',
                    text: '[SPRITE] target',
                    arguments: {
                        SPRITE: {
                            menu: "sprite"
                        }
                    },
                    ...Target.Block
                },
                {
                    opcode: 'cloneOrigin',
                    text: 'origin of [TARGET]',
                    arguments: {
                        TARGET: Target.Argument
                    },
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
                            menu: "targetProperty",
                            defaultValue: "this"
                        }
                    }
                },
                {
                    opcode: 'isClone',
                    text: 'is [TARGET] a clone',
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        TARGET: Target.Argument
                    }
                },
                {
                    opcode: 'getVar',
                    text: 'var [NAME] of [TARGET]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        TARGET: Target.Argument,
                        NAME: {
                            type: ArgumentType.STRING
                        }
                    }
                },
                {
                    opcode: 'setVar',
                    text: 'set var [NAME] of [TARGET] to [VALUE]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TARGET: Target.Argument,
                        NAME: {
                            type: ArgumentType.STRING
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            exemptFromNormalization: true
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
                    opcode: 'touching',
                    text: 'targets touching [TARGET]',
                    arguments: {
                        TARGET: Target.Argument
                    },
                    filter: [TargetType.SPRITE],
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
                {
                    opcode: 'arrayHasTarget',
                    text: '[ARRAY] has clone of [TARGET]',
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        ARRAY: jwArray.Argument,
                        TARGET: Target.Argument
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    blockType: BlockType.XML,
                    xml: `<block type="control_run_as_sprite" />`
                }
            ],
            menus: {
                sprite: {
                    acceptReporters: true,
                    items: 'getSpriteMenu'
                },
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

    getSpriteMenu({}) {
        let sprites = ["this", "stage"]
        for (let target of vm.runtime.targets.filter(v => v !== vm.runtime._stageTarget)) {
            if (!sprites.includes(target.sprite.name)) sprites.push(target.sprite.name)
        }
        return sprites
    }

    this({}, util) {
        return new Target.Type(util.target.id)
    }

    stage() {
        return new Target.Type(vm.runtime._stageTarget.id)
    }

    fromName({SPRITE}, util) {
        SPRITE = Cast.toString(SPRITE)
        if (SPRITE == "this") return this.this({}, util)
        if (SPRITE == "stage") return this.stage()
        let target = vm.runtime.getSpriteTargetByName(SPRITE)
        return new Target.Type(target ? target.id : "")
    }

    cloneOrigin({TARGET}, util) {
        TARGET = Target.Type.toTarget(TARGET)
        if (!TARGET.target) return ""

        return this.fromName({SPRITE: TARGET.target.sprite.name}, util)
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

    isClone({TARGET}) {
        TARGET = Target.Type.toTarget(TARGET)
        if (!TARGET.target) return false

        return !TARGET.target.isOriginal
    }

    getVar({TARGET, NAME}) {
        TARGET = Target.Type.toTarget(TARGET)
        NAME = Cast.toString(NAME)
        if (!TARGET.target) return ""

        let variable = Object.values(TARGET.target.variables).find(v => v.name == NAME)
        if (!variable) return ""

        return variable.value
    }

    setVar({TARGET, NAME, VALUE}) {
        TARGET = Target.Type.toTarget(TARGET)
        NAME = Cast.toString(NAME)
        if (!TARGET.target) return

        let variable = Object.values(TARGET.target.variables).find(v => v.name == NAME)
        if (!variable) return

        variable.value = VALUE
    }

    all() {
        return new jwArray.Type(vm.runtime.targets.map(v => new Target.Type(v.id)))
    }

    touching({TARGET}) {
        let targets = vm.runtime.targets
        targets.filter(v => v !== TARGET && !v.isStage)
        targets.filter(v => TARGET.isTouchingTarget(v))
        return new jwArray.Type(targets.map(v => new Target.Type(v.id)))
    }

    clones({TARGET}) {
        TARGET = Target.Type.toTarget(TARGET)
        if (TARGET.target) {
            return new jwArray.Type(TARGET.target.sprite.clones.filter(v => !v.isOriginal).map(v => new Target.Type(v.id)))
        }
        return new jwArray.Type()
    }

    arrayHasTarget({ARRAY, TARGET}) {
        ARRAY = jwArray.Type.toArray(ARRAY)
        TARGET = Target.Type.toTarget(TARGET)
        if (!TARGET.target) return false

        return ARRAY.array.find(v => {
            let target = Target.Type.toTarget(v)
            if (!target.target) return false
            return target.target.sprite == TARGET.target.sprite
        }) !== undefined
    }
}

module.exports = Extension