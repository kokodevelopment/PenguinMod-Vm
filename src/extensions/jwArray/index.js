const BlockType = require('../../extension-support/block-type')
const BlockShape = require('../../extension-support/block-shape')
const ArgumentType = require('../../extension-support/argument-type')
const Cast = require('../../util/cast')

let arrayLimit = 2 ** 32

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

function clampIndex(x) {
    return Math.min(Math.max(x, 1), arrayLimit)
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

class ArrayType {
    customId = "jwArray"

    array = []

    constructor(array = []) {
        this.array = array
    }

    static toArray(x) {
        if (x instanceof ArrayType) return x
        if (x instanceof Array) return new ArrayType(x)
        if (x === "" || x === null || x === undefined) return new ArrayType()
        return new ArrayType([x])
    }

    static display(x) {
        try {
            switch (typeof x) {
                case "object":
                    if (typeof x.jwArrayHandler == "function") {
                        return x.jwArrayHandler()
                    }
                    return "Object"
                case "undefined":
                    return "null"
                case "number":
                    return formatNumber(x)
                case "boolean":
                    return x ? "true" : "false"
                case "string":
                    return `"${Cast.toString(x)}"`
            }
        } catch {}
        return "?"
    }

    jwArrayHandler() {
        return `Array[${formatNumber(this.array.length)}]`
    }

    toString() {
        return JSON.stringify(this.array)
    }
    toMonitorContent = () => span(this.toString())

    toReporterContent() {
        let root = document.createElement('div')
        root.style.display = 'flex'
        root.style.flexDirection = 'column'
        root.style.justifyContent = 'center'

        let arrayDisplay = span(`[${this.array.slice(0, 50).map(v => ArrayType.display(v)).join(', ')}]`)
        arrayDisplay.style.overflow = "hidden"
        arrayDisplay.style.whiteSpace = "nowrap"
        arrayDisplay.style.textOverflow = "ellipsis"
        arrayDisplay.style.maxWidth = "256px"
        root.appendChild(arrayDisplay)

        root.appendChild(span(`Length: ${this.array.length}`))

        return root
    }
}

const jwArray = {
    Type: ArrayType,
    Block: {
        blockType: BlockType.REPORTER,
        blockShape: BlockShape.SQUARE,
        forceOutputType: "Array",
        disableMonitor: true
    },
    Argument: {
        shape: BlockShape.SQUARE,
        check: ["Array"]
    }
}

class Extension {
    constructor() {
        vm.jwArray = jwArray

        //patch square shape
        if (ScratchBlocks !== undefined) {
            ScratchBlocks.BlockSvg.INPUT_SHAPE_SQUARE =
                ScratchBlocks.BlockSvg.TOP_LEFT_CORNER_START +
                ScratchBlocks.BlockSvg.TOP_LEFT_CORNER +
                ' h ' + (4 * ScratchBlocks.BlockSvg.GRID_UNIT - 2 * ScratchBlocks.BlockSvg.CORNER_RADIUS) +
                ScratchBlocks.BlockSvg.TOP_RIGHT_CORNER +
                ' v ' + (8 * ScratchBlocks.BlockSvg.GRID_UNIT - 2 * ScratchBlocks.BlockSvg.CORNER_RADIUS) +
                ScratchBlocks.BlockSvg.BOTTOM_RIGHT_CORNER +
                ' h ' + (-4 * ScratchBlocks.BlockSvg.GRID_UNIT + 2 * ScratchBlocks.BlockSvg.CORNER_RADIUS) +
                ScratchBlocks.BlockSvg.BOTTOM_LEFT_CORNER +
                ' z';
        }
    }

    getInfo() {
        return {
            id: "jwArray",
            name: "Arrays",
            color1: "#ff513d",
            blocks: [
                {
                    opcode: 'blank',
                    text: 'blank array',
                    ...jwArray.Block
                },
                {
                    opcode: 'blankLength',
                    text: 'blank array of length [LENGTH]',
                    arguments: {
                        LENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    },
                    ...jwArray.Block
                },
                {
                    opcode: 'fromList',
                    text: 'array from list [LIST]',
                    arguments: {
                        LIST: {
                            menu: "list"
                        }
                    },
                    ...jwArray.Block
                },
                "---",
                {
                    opcode: 'get',
                    text: 'get [ARRAY] at [INDEX]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        ARRAY: jwArray.Argument,
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                "---",
                {
                    opcode: 'set',
                    text: 'set [ARRAY] at [INDEX] to [VALUE]',
                    arguments: {
                        ARRAY: jwArray.Argument,
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: "foo"
                        }
                    },
                    ...jwArray.Block
                }
            ],
            lists: {
                list: {
                    acceptReporters: false,
                    items: "getLists",
                },
            }
        };
    }
    
    getLists() {
        const globalLists = Object.values(this.runtime.getTargetForStage().variables)
            .filter((x) => x.type == "list");
        const localLists = Object.values(this.runtime.vm.editingTarget.variables)
            .filter((x) => x.type == "list");
        const uniqueLists = [...new Set([...globalLists, ...localLists])];
        if (uniqueLists.length === 0) return [{ text: "", value: "" }];
        return uniqueLists.map((v) => ({ text: v.name, value: new jwArray.Type(v.value) }));
    }

    blank() {
        return new jwArray.Type()
    }

    blankLength({LENGTH}) {
        LENGTH = clampIndex(Cast.toNumber(LENGTH))

        return new jwArray.Type(Array(LENGTH))
    }

    fromList({LIST}) {
        return jwArray.Type.toArray(LIST)
    }

    get({ARRAY, INDEX}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        return ARRAY.array[Cast.toNumber(INDEX)-1] || ""
    }

    set({ARRAY, INDEX, VALUE}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        ARRAY.array[clampIndex(Cast.toNumber(INDEX))-1] = VALUE
        return ARRAY
    }
}

module.exports = Extension