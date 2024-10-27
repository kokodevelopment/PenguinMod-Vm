const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');

// Object.create(null) prevents "variable [toString]" from returning a function
let runtimeVariables = Object.create(null);

// Credit to skyhigh173 for the idea of this
const label = (name, hidden) => ({
    blockType: BlockType.LABEL,
    text: name,
    hideFromPalette: hidden
});

function resetRuntimeVariables() {
    runtimeVariables = Object.create(null);
}

/**
 * Class
 * @constructor
 */
class lmsTempVars2 {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {runtime}
         */
        this.runtime = runtime;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: "lmsTempVars2",
            name: "Temporary Variables",
            color1: "#FF791A",
            color2: "#E15D00",
            blocks: [
                label("Thread Variables", false),
  
                {
                    opcode: "setThreadVariable",
                    blockType: BlockType.COMMAND,
                    text: "set thread var [VAR] to [STRING]",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        },
                        STRING: {
                            type: ArgumentType.STRING,
                            defaultValue: "0"
                        }
                    }
                },
                {
                    opcode: "changeThreadVariable",
                    blockType: BlockType.COMMAND,
                    text: "change thread var [VAR] by [NUM]",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        },
                        NUM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: "1"
                        }
                    }
                },
  
                "---",
  
                {
                    opcode: "getThreadVariable",
                    blockType: BlockType.REPORTER,
                    text: "thread var [VAR]",
                    disableMonitor: true,
                    allowDropAnywhere: true,
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        }
                    }
                },
                {
                    opcode: "threadVariableExists",
                    blockType: BlockType.BOOLEAN,
                    text: "thread var [VAR] exists?",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        }
                    }
                },
  
                "---",
  
                {
                    opcode: "forEachThreadVariable",
                    blockType: BlockType.LOOP,
                    text: "for [VAR] in [NUM]",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "thread variable"
                        },
                        NUM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: "10"
                        }
                    }
                },
                {
                    opcode: "listThreadVariables",
                    blockType: BlockType.REPORTER,
                    text: "active thread variables",
                    disableMonitor: true
                },
  
                "---",
  
                label("Runtime Variables", false),
  
                {
                    opcode: "setRuntimeVariable",
                    blockType: BlockType.COMMAND,
                    text: "set runtime var [VAR] to [STRING]",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        },
                        STRING: {
                            type: ArgumentType.STRING,
                            defaultValue: "0"
                        }
                    }
                },
                {
                    opcode: "changeRuntimeVariable",
                    blockType: BlockType.COMMAND,
                    text: "change runtime var [VAR] by [NUM]",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        },
                        NUM: {
                            type: ArgumentType.STRING,
                            defaultValue: "1"
                        }
                    }
                },
  
                "---",
  
                {
                    opcode: "getRuntimeVariable",
                    blockType: BlockType.REPORTER,
                    text: "runtime var [VAR]",
                    disableMonitor: true,
                    allowDropAnywhere: true,
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        }
                    }
                },
                {
                    opcode: "runtimeVariableExists",
                    blockType: BlockType.BOOLEAN,
                    text: "runtime var [VAR] exists?",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        }
                    }
                },
  
                "---",
  
                {
                    opcode: "deleteRuntimeVariable",
                    blockType: BlockType.COMMAND,
                    text: "delete runtime var [VAR]",
                    arguments: {
                        VAR: {
                            type: ArgumentType.STRING,
                            defaultValue: "variable"
                        }
                    }
                },
                {
                    opcode: "deleteAllRuntimeVariables",
                    blockType: BlockType.COMMAND,
                    text: "delete all runtime variables"
                },
                {
                    opcode: "listRuntimeVariables",
                    blockType: BlockType.REPORTER,
                    text: "active runtime variables"
                }
            ]
        };
    }

    /* THREAD VARIABLES */

    setThreadVariable(args, util) {
        const thread = util.thread;
        if (!thread.variables) thread.variables = Object.create(null);
        const vars = thread.variables;
        vars[args.VAR] = args.STRING;
    }
  
    changeThreadVariable(args, util) {
        const thread = util.thread;
        if (!thread.variables) thread.variables = Object.create(null);
        const vars = thread.variables;
        const prev = Cast.toNumber(vars[args.VAR]);
        const next = Cast.toNumber(args.NUM);
        vars[args.VAR] = prev + next;
    }
  
    getThreadVariable(args, util) {
        const thread = util.thread;
        if (!thread.variables) thread.variables = Object.create(null);
        const vars = thread.variables;
        const varValue = vars[args.VAR];
        if (typeof varValue === "undefined") return "";
        return varValue;
    }
  
    threadVariableExists(args, util) {
        const thread = util.thread;
        if (!thread.variables) thread.variables = Object.create(null);
        const vars = thread.variables;
        const varValue = vars[args.VAR];
        return !(typeof varValue === "undefined");
    }
  
    forEachThreadVariable(args, util) {
        const thread = util.thread;
        if (!thread.variables) thread.variables = Object.create(null);
        const vars = thread.variables;
        if (typeof util.stackFrame.index === "undefined") {
            util.stackFrame.index = 0;
        }
        if (util.stackFrame.index < Number(args.NUM)) {
            util.stackFrame.index++;
            vars[args.VAR] = util.stackFrame.index;
            return true;
        }
    }
  
    listThreadVariables(args, util) {
        const thread = util.thread;
        if (!thread.variables) thread.variables = Object.create(null);
        const vars = thread.variables;
        return Object.keys(vars).join(",");
    }
  
    /* RUNTIME VARIABLES */
  
    setRuntimeVariable(args) {
        runtimeVariables[args.VAR] = args.STRING;
    }
  
    changeRuntimeVariable(args) {
        const prev = Cast.toNumber(runtimeVariables[args.VAR]);
        const next = Cast.toNumber(args.NUM);
        runtimeVariables[args.VAR] = prev + next;
    }
  
    getRuntimeVariable(args) {
        if (!(args.VAR in runtimeVariables)) return "";
        return runtimeVariables[args.VAR];
    }
  
    runtimeVariableExists(args) {
        return args.VAR in runtimeVariables;
    }
  
    listRuntimeVariables(args, util) {
        return Object.keys(this.runtime.variables).join(",");
    }
  
    deleteRuntimeVariable(args) {
        Reflect.deleteProperty(runtimeVariables, args.VAR);
    }
  
    deleteAllRuntimeVariables() {
        runtimeVariables = Object.create(null);
    }
}

module.exports = lmsTempVars2;
