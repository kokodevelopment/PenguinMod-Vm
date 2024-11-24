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

    /** @returns {number} */
    get magnitude() { return Math.hypot(this.x, this.y) }

    /** @returns {number} */
    get angle() {return Math.atan2(this.x, this.y) * (180 / Math.PI)}
}

const Target = {
    Type: TargetType,
    Block: {
        blockType: BlockType.REPORTER,
        forceOutputType: "Target"
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
                    disableMonitor: true,
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
}

module.exports = Extension