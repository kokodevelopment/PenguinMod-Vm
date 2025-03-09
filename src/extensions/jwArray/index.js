const BlockType = require('../../extension-support/block-type')
const BlockShape = require('../../extension-support/block-shape')
const ArgumentType = require('../../extension-support/argument-type')
const Cast = require('../../util/cast')

let arrayLimit = 2 ** 32

// credit to sharpool because i stole the for each code from his extension haha im soo evil

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
                    if (x === null) return "null"
                    if (typeof x.jwArrayHandler == "function") {
                        return x.jwArrayHandler()
                    }
                    return Cast.toString(x)
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

    get length() {
        return this.array.length
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
        vm.runtime.registerSerializer( //this basically copies variable serialization
            "jwArray",
            v => v.array.map(w => {
                if (typeof w == "object" && w != null && w.customId) {
                    return {
                        customType: true,
                        typeId: w.customId,
                        serialized: vm.runtime.serializers[w.customId].serialize(w)
                    };
                }
                return w
            }), 
            v => new jwArray.Type(v.map(w => {
                if (typeof w == "object" && w != null && w.customType) {
                    return vm.runtime.serializers[w.typeId].deserialize(w.serialized)
                }
                return w
            }))
        );
    }

    getInfo() {
        return {
            id: "jwArray",
            name: "Arrays",
            color1: "#ff513d",
            menuIconURI: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM6Yng9Imh0dHBzOi8vYm94eS1zdmcuY29tIj4KICA8Y2lyY2xlIHN0eWxlPSJzdHJva2Utd2lkdGg6IDJweDsgcGFpbnQtb3JkZXI6IHN0cm9rZTsgZmlsbDogcmdiKDI1NSwgODEsIDYxKTsgc3Ryb2tlOiByZ2IoMjA1LCA1OSwgNDQpOyIgY3g9IjEwIiBjeT0iMTAiIHI9IjkiPjwvY2lyY2xlPgogIDxwYXRoIGQ9Ik0gOC4wNzMgNC4yMiBMIDYuMTQ3IDQuMjIgQyA1LjA4MyA0LjIyIDQuMjIgNS4wODMgNC4yMiA2LjE0NyBMIDQuMjIgMTMuODUzIEMgNC4yMiAxNC45MTkgNS4wODMgMTUuNzggNi4xNDcgMTUuNzggTCA4LjA3MyAxNS43OCBMIDguMDczIDEzLjg1MyBMIDYuMTQ3IDEzLjg1MyBMIDYuMTQ3IDYuMTQ3IEwgOC4wNzMgNi4xNDcgTCA4LjA3MyA0LjIyIFogTSAxMS45MjcgMTMuODUzIEwgMTMuODUzIDEzLjg1MyBMIDEzLjg1MyA2LjE0NyBMIDExLjkyNyA2LjE0NyBMIDExLjkyNyA0LjIyIEwgMTMuODUzIDQuMjIgQyAxNC45MTcgNC4yMiAxNS43OCA1LjA4MyAxNS43OCA2LjE0NyBMIDE1Ljc4IDEzLjg1MyBDIDE1Ljc4IDE0LjkxOSAxNC45MTcgMTUuNzggMTMuODUzIDE1Ljc4IEwgMTEuOTI3IDE1Ljc4IEwgMTEuOTI3IDEzLjg1MyBaIiBmaWxsPSIjZmZmIiBzdHlsZT0iIj48L3BhdGg+Cjwvc3ZnPg==",
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
                    hideFromPalette: true, //doesn't work for some reason
                    ...jwArray.Block
                },
                "---",
                {
                    opcode: 'get',
                    text: 'get [INDEX] in [ARRAY]',
                    blockType: BlockType.REPORTER,
                    allowDropAnywhere: true,
                    arguments: {
                        ARRAY: jwArray.Argument,
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'has',
                    text: '[ARRAY] has [VALUE]',
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        ARRAY: jwArray.Argument,
                        VALUE: {
                            type: ArgumentType.STRING,
                            exemptFromNormalization: true
                        }
                    }
                },
                {
                    opcode: 'length',
                    text: 'length of [ARRAY]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        ARRAY: jwArray.Argument
                    }
                },
                "---",
                {
                    opcode: 'set',
                    text: 'set [INDEX] in [ARRAY] to [VALUE]',
                    arguments: {
                        ARRAY: jwArray.Argument,
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: "foo",
                            exemptFromNormalization: true
                        }
                    },
                    ...jwArray.Block
                },
                {
                    opcode: 'append',
                    text: 'append [VALUE] to [ARRAY]',
                    arguments: {
                        ARRAY: jwArray.Argument,
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: "foo",
                            exemptFromNormalization: true
                        }
                    },
                    ...jwArray.Block
                },
                {
                    opcode: 'concat',
                    text: 'merge [ONE] with [TWO]',
                    arguments: {
                        ONE: jwArray.Argument,
                        TWO: jwArray.Argument
                    },
                    ...jwArray.Block
                },
                "---",
                {
                    opcode: 'forEachI',
                    text: 'index',
                    blockType: BlockType.REPORTER,
                    hideFromPalette: true,
                    allowDropAnywhere: true,
                    canDragDuplicate: true
                },
                {
                    opcode: 'forEachV',
                    text: 'value',
                    blockType: BlockType.REPORTER,
                    hideFromPalette: true,
                    allowDropAnywhere: true,
                    canDragDuplicate: true
                },
                {
                    opcode: 'forEach',
                    text: 'for [I] [V] of [ARRAY]',
                    blockType: BlockType.LOOP,
                    arguments: {
                        ARRAY: jwArray.Argument,
                        I: {
                            fillIn: 'forEachI'
                        },
                        V: {
                            fillIn: 'forEachV'
                        }
                    }
                }
            ],
            menus: {
                list: {
                    acceptReporters: false,
                    items: "getLists",
                },
            }
        };
    }
    
    getLists() {
        const globalLists = Object.values(vm.runtime.getTargetForStage().variables)
            .filter((x) => x.type == "list");
        const localLists = Object.values(vm.editingTarget.variables)
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

        return new jwArray.Type(Array(LENGTH).fill(undefined))
    }

    fromList({LIST}) {
        return jwArray.Type.toArray(LIST)
    }

    get({ARRAY, INDEX}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        return ARRAY.array[Cast.toNumber(INDEX)-1] || ""
    }

    has({ARRAY, VALUE}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        return ARRAY.array.includes(VALUE)
    }

    length({ARRAY}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        return ARRAY.length
    }

    set({ARRAY, INDEX, VALUE}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        ARRAY.array[clampIndex(Cast.toNumber(INDEX))-1] = VALUE
        return ARRAY
    }

    append({ARRAY, VALUE}) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        ARRAY.array.push(VALUE)
        return ARRAY
    }

    concat({ONE, TWO}) {
        ONE = jwArray.Type.toArray(ONE)
        TWO = jwArray.Type.toArray(TWO)

        return new jwArray.Type(ONE.array.concat(TWO.array))
    }

    forEachI({}, util) {
        let arr = util.thread.stackFrames[0].jwArray
        return arr ? Cast.toNumber(arr[0]) + 1 : 0
    }

    forEachV({}, util) {
        let arr = util.thread.stackFrames[0].jwArray
        return arr ? arr[1] : ""
    }

    forEach({ARRAY}, util) {
        ARRAY = jwArray.Type.toArray(ARRAY)

        if (util.stackFrame.execute) {
            util.stackFrame.index++;
            const { index, entry } = util.stackFrame;
            if (index > entry.length - 1) return;
            util.thread.stackFrames[0].jwArray = entry[index];
        } else {
            const entry = Object.entries(ARRAY.array);
            if (entry.length === 0) return;
            util.stackFrame.entry = entry;
            util.stackFrame.execute = true;
            util.stackFrame.index = 0;
            util.thread.stackFrames[0].jwArray = entry[0];
        }
        util.startBranch(1, true);
    }
}

module.exports = Extension