const BlockType = require('../../extension-support/block-type')
const BlockShape = require('../../extension-support/block-shape')
const ArgumentType = require('../../extension-support/argument-type')
const Cast = require('../../util/cast')

/**
 * @param {number} x
 * @returns {string}
 */
function formatNumber(x) {
    if (x >= 1e6) {
        return x.toExponential(4)
    } else {
        x = Math.floor(x * 1000) / 1000
        return x.toFixed(Math.min(3, (String(x).split('.')[1] || '').length))
    }
}

function span(text) {
    let el = document.createElement('span')
    el.innerHTML = text
    el.style.display = 'hidden'
    el.style.whiteSpace = 'nowrap'
    el.style.width = '100%'
    el.style.textAlign = 'center'
    return el
}

class LambdaType {
    customId = "jwLambda"

    constructor(func) {
        this.func = typeof func == 'function' ? func : () => func
    }

    static toLambda(x) {
        if (x instanceof LambdaType) return x
        return new LambdaType(x)
    }

    jwArrayHandler() {
        return 'Lambda'
    }

    toString() {
        return `Lambda`
    }
    toMonitorContent = () => span(this.toString())
    toReporterContent = () => span(this.toString())
}

const Lambda = {
    Type: LambdaType,
    Block: {
        blockType: BlockType.REPORTER,
        blockShape: BlockShape.SQUARE,
        forceOutputType: "Lambda",
        disableMonitor: true
    },
    Argument: {
        shape: BlockShape.SQUARE,
        check: ["Lambda"]
    }
}

class Extension {
    constructor() {
        vm.jwLambda = Lambda
        vm.runtime.registerSerializer(
            "jwLambda", 
            v => null, 
            v => new Lambda.Type("")
        );
    }

    getInfo() {
        return {
            id: "jwLambda",
            name: "Lambda",
            color1: "#f04a87",
            blocks: [
                {
                    opcode: 'arg',
                    text: 'argument',
                    blockType: BlockType.REPORTER,
                    hideFromPalette: true,
                    allowDropAnywhere: true,
                    canDragDuplicate: true
                },
                {
                    opcode: 'newLambda',
                    text: 'new lambda [ARG]',
                    branchCount: 1,
                    arguments: {
                        ARG: {
                            fillIn: 'arg'
                        }
                    },
                    ...Lambda.Block
                },
                {
                    opcode: 'execute',
                    text: 'execute [LAMBDA] with [ARG]',
                    arguments: {
                        LAMBDA: Lambda.Argument,
                        ARG: {
                            type: ArgumentType.String,
                            defaultValue: "foo",
                            exemptFromNormalization: true
                        }
                    }
                }
            ]
        };
    }

    arg({}, util) {
        let lambda = util.thread.stackFrames[0].jwLambda
        return lambda ?? ""
    }

    newLambda({}, util) {
        return new Lambda.Type((arg) => {
            util.thread.stackFrames[0].jwLambda = arg;
            console.debug("Yes hello i am working")
            util.startBranch(1, false)
        })
    }

    execute({LAMBDA, ARG}, util) {
        LAMBDA = Lambda.Type.toLambda(LAMBDA)

        LAMBDA.func(ARG)
    }
}

module.exports = Extension