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

    jwArrayHandler() {
        return 'Target'
    }

    toString() {
        return this.targetId
    }
    toMonitorContent = () => span(this.toString())

    toReporterContent() {
        try {
            let target = vm.runtime.getTargetById(this.targetId)
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

class Extension {
    constructor() {
        vm.jwTargets = Target
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
                    blockType: BlockType.XML,
                    xml: `<block type="control_run_as_sprite" />`
                }
            ]
        };
    }

    this({}, util) {
        return new Target.Type(util.target.id)
    }

    stage() {
        return new Target.Type(vm.runtime._stageTarget.id)
    }
}

module.exports = Extension