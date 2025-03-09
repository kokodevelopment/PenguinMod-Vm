const log = require('../util/log');
const Cast = require('../util/cast');
const BlockType = require('../extension-support/block-type');
const VariablePool = require('./variable-pool');
const jsexecute = require('./jsexecute');
const environment = require('./environment');

// Imported for JSDoc types, not to actually use
// eslint-disable-next-line no-unused-vars
const {IntermediateScript, IntermediateRepresentation} = require('./intermediate');

/**
 * @fileoverview Convert intermediate representations to JavaScript functions.
 */

/* eslint-disable max-len */
/* eslint-disable prefer-template */

const sanitize = string => {
    if (typeof string !== 'string') {
        log.warn(`sanitize got unexpected type: ${typeof string}`);
        string = '' + string;
    }
    return JSON.stringify(string).slice(1, -1);
};

const TYPE_NUMBER = 1;
const TYPE_STRING = 2;
const TYPE_BOOLEAN = 3;
const TYPE_UNKNOWN = 4;
const TYPE_NUMBER_NAN = 5;


// Pen-related constants
const PEN_EXT = 'runtime.ext_pen';
const PEN_STATE = `${PEN_EXT}._getPenState(target)`;

/**
 * Variable pool used for factory function names.
 */
const factoryNameVariablePool = new VariablePool('factory');

/**
 * Variable pool used for generated functions (non-generator)
 */
const functionNameVariablePool = new VariablePool('fun');

/**
 * Variable pool used for generated generator functions.
 */
const generatorNameVariablePool = new VariablePool('gen');

/**
 * @typedef Input
 * @property {() => string} asNumber
 * @property {() => string} asNumberOrNaN
 * @property {() => string} asString
 * @property {() => string} asBoolean
 * @property {() => string} asColor
 * @property {() => string} asUnknown
 * @property {() => string} asSafe
 * @property {() => boolean} isAlwaysNumber
 * @property {() => boolean} isAlwaysNumberOrNaN
 * @property {() => boolean} isNeverNumber
 */

/**
 * @implements {Input}
 */
class TypedInput {
    constructor (source, type) {
        this.source = source;
        this.type = type;
    }

    asNumber () {
        if (this.type === TYPE_NUMBER) return this.source;
        if (this.type === TYPE_NUMBER_NAN) return `(${this.source} || 0)`;
        return `(+${this.source} || 0)`;
    }

    asNumberOrNaN () {
        if (this.type === TYPE_NUMBER || this.type === TYPE_NUMBER_NAN) return this.source;
        return `(+${this.source})`;
    }

    asString () {
        if (this.type === TYPE_STRING) return this.source;
        return `("" + ${this.source})`;
    }

    asBoolean () {
        if (this.type === TYPE_UNKNOWN) return `toBoolean(${this.source})`;
        if (this.type === TYPE_STRING) return `${this.source} === 'false' || ${this.source} === '0' ? false : true`;
        if (this.type === TYPE_NUMBER) return `${this.source} !== 0`;
        if (this.type === TYPE_NUMBER_NAN) return `(${this.source} || 0) !== 0`;
        
        return this.source;
    }

    asColor () {
        return this.asUnknown();
    }

    asUnknown () {
        return this.source;
    }

    asSafe () {
        return this.asUnknown();
    }

    isAlwaysNumber () {
        return this.type === TYPE_NUMBER;
    }

    isAlwaysNumberOrNaN () {
        return this.type === TYPE_NUMBER || this.type === TYPE_NUMBER_NAN;
    }

    isNeverNumber () {
        return false;
    }
}

/**
 * @implements {Input}
 */
class ConstantInput {
    constructor (constantValue, safe) {
        this.constantValue = constantValue;
        this.safe = safe;
    }

    asNumber () {
        // Compute at compilation time
        const numberValue = +this.constantValue;
        if (numberValue) {
            // It's important that we use the number's stringified value and not the constant value
            // Using the constant value allows numbers such as "010" to be interpreted as 8 (or SyntaxError in strict mode) instead of 10.
            return numberValue.toString();
        }
        // numberValue is one of 0, -0, or NaN
        if (Object.is(numberValue, -0)) {
            return '-0';
        }
        return '0';
    }

    asNumberOrNaN () {
        return this.asNumber();
    }

    asString () {
        return `"${sanitize('' + this.constantValue)}"`;
    }

    asBoolean () {
        // Compute at compilation time
        return Cast.toBoolean(this.constantValue).toString();
    }

    asColor () {
        // Attempt to parse hex code at compilation time
        if (/^#[0-9a-f]{6,8}$/i.test(this.constantValue)) {
            const hex = this.constantValue.slice(1);
            return Number.parseInt(hex, 16).toString();
        }
        return this.asUnknown();
    }

    asUnknown () {
        // Attempt to convert strings to numbers if it is unlikely to break things
        if (typeof this.constantValue === 'number') {
            // todo: handle NaN?
            return this.constantValue;
        }
        const numberValue = +this.constantValue;
        if (numberValue.toString() === this.constantValue) {
            return this.constantValue;
        }
        return this.asString();
    }

    asSafe () {
        if (this.safe) {
            return this.asUnknown();
        }
        return this.asString();
    }

    isAlwaysNumber () {
        const value = +this.constantValue;
        if (Number.isNaN(value)) {
            return false;
        }
        // Empty strings evaluate to 0 but should not be considered a number.
        if (value === 0) {
            return this.constantValue.toString().trim() !== '';
        }
        return true;
    }

    isAlwaysNumberOrNaN () {
        return this.isAlwaysNumber();
    }

    isNeverNumber () {
        return Number.isNaN(+this.constantValue);
    }
}

/**
 * @implements {Input}
 */
class VariableInput {
    constructor (source) {
        this.source = source;
        this.type = TYPE_UNKNOWN;
        /**
         * The value this variable was most recently set to, if any.
         * @type {Input}
         * @private
         */
        this._value = null;
    }

    /**
     * @param {Input} input The input this variable was most recently set to.
     */
    setInput (input) {
        if (input instanceof VariableInput) {
            // When being set to another variable, extract the value it was set to.
            // Otherwise, you may end up with infinite recursion in analysis methods when a variable is set to itself.
            if (input._value) {
                input = input._value;
            } else {
                this.type = TYPE_UNKNOWN;
                this._value = null;
                return;
            }
        }
        this._value = input;
        if (input instanceof TypedInput) {
            this.type = input.type;
        } else {
            this.type = TYPE_UNKNOWN;
        }
    }

    asNumber () {
        if (this.type === TYPE_NUMBER) return this.source;
        if (this.type === TYPE_NUMBER_NAN) return `(${this.source} || 0)`;
        return `(+${this.source} || 0)`;
    }

    asNumberOrNaN () {
        if (this.type === TYPE_NUMBER || this.type === TYPE_NUMBER_NAN) return this.source;
        return `(+${this.source})`;
    }

    asString () {
        if (this.type === TYPE_STRING) return this.source;
        return `("" + ${this.source})`;
    }

    asBoolean () {
        if (this.type === TYPE_BOOLEAN) return this.source;
        return `toBoolean(${this.source})`;
    }

    asColor () {
        return this.asUnknown();
    }

    asUnknown () {
        return this.source;
    }

    asSafe () {
        return this.asUnknown();
    }

    isAlwaysNumber () {
        if (this._value) {
            return this._value.isAlwaysNumber();
        }
        return false;
    }

    isAlwaysNumberOrNaN () {
        if (this._value) {
            return this._value.isAlwaysNumberOrNaN();
        }
        return false;
    }

    isNeverNumber () {
        if (this._value) {
            return this._value.isNeverNumber();
        }
        return false;
    }
}

const getNamesOfCostumesAndSounds = runtime => {
    const result = new Set();
    for (const target of runtime.targets) {
        if (target.isOriginal) {
            const sprite = target.sprite;
            for (const costume of sprite.costumes) {
                result.add(costume.name);
            }
            for (const sound of sprite.sounds) {
                result.add(sound.name);
            }
        }
    }
    return result;
};

const isSafeConstantForEqualsOptimization = input => {
    const numberValue = +input.constantValue;
    // Do not optimize 0
    if (!numberValue) {
        return false;
    }
    // Do not optimize numbers when the original form does not match
    return numberValue.toString() === input.constantValue.toString();
};

/**
 * A frame contains some information about the current substack being compiled.
 */
class Frame {
    constructor (isLoop, parentKind) {
        /**
         * Whether the current stack runs in a loop (while, for)
         * @type {boolean}
         * @readonly
         */
        this.isLoop = isLoop;

        /**
         * Whether the current block is the last block in the stack.
         * @type {boolean}
         */
        this.isLastBlock = false;

        /**
         * General important data that needs to be carried down from other threads.
         * @type {boolean}
         */
        this.importantData = {
            parents: [parentKind]
        };
        if (isLoop)
            this.importantData.containedByLoop = isLoop;

        /**
         * the block who created this frame
         * @type {string}
         * @readonly
         */
        this.parent = parentKind;
    }

    assignData(obj) {
        if (obj instanceof Frame) {
            obj = obj.importantData;
            obj.parents = obj.parents.concat(this.importantData.parents);
        }
        Object.assign(this.importantData, obj);
    }
}

class JSGenerator {
    /**
     * @param {IntermediateScript} script
     * @param {IntermediateRepresentation} ir
     * @param {Target} target
     */
    constructor (script, ir, target) {
        this.script = script;
        this.ir = ir;
        this.target = target;
        this.source = '';

        /**
         * @type {Object.<string, VariableInput>}
         */
        this.variableInputs = {};

        this.isWarp = script.isWarp;
        this.isOptimized = script.isOptimized;
        this.optimizationUtil = script.optimizationUtil;
        this.isProcedure = script.isProcedure;
        this.warpTimer = script.warpTimer;

        /**
         * Stack of frames, most recent is last item.
         * @type {Frame[]}
         */
        this.frames = [];

        /**
         * The current Frame.
         * @type {Frame}
         */
        this.currentFrame = null;

        this.namesOfCostumesAndSounds = getNamesOfCostumesAndSounds(target.runtime);

        this.localVariables = new VariablePool('a');
        this._setupVariablesPool = new VariablePool('b');
        this._setupVariables = {};

        this.descendedIntoModulo = false;
        this.isInHat = false;

        this.debug = this.target.runtime.debug;
    }

    static exports = {
        TypedInput,
        ConstantInput,
        VariableInput,
        Frame,
        VariablePool,
        TYPE_NUMBER,
        TYPE_STRING,
        TYPE_BOOLEAN,
        TYPE_UNKNOWN,
        TYPE_NUMBER_NAN,
        PEN_EXT,
        PEN_STATE,
        factoryNameVariablePool,
        functionNameVariablePool,
        generatorNameVariablePool
    }

    static _extensionJSInfo = {};
    static setExtensionJs(id, data) {
        JSGenerator._extensionJSInfo[id] = data;
    }
    static hasExtensionJs(id) {
        return Boolean(JSGenerator._extensionJSInfo[id]);
    }
    static getExtensionJs(id) {
        return JSGenerator._extensionJSInfo[id];
    }

    static getExtensionImports() {
        // used so extensions have things like the Frame class
        return {
            Frame: Frame,
            TypedInput: TypedInput,
            VariableInput: VariableInput,
            ConstantInput: ConstantInput,
            VariablePool: VariablePool,

            TYPE_NUMBER: TYPE_NUMBER,
            TYPE_STRING: TYPE_STRING,
            TYPE_BOOLEAN: TYPE_BOOLEAN,
            TYPE_UNKNOWN: TYPE_UNKNOWN,
            TYPE_NUMBER_NAN: TYPE_NUMBER_NAN
        };
    }

    /**
     * Enter a new frame
     * @param {Frame} frame New frame.
     */
    pushFrame (frame) {
        this.frames.push(frame);
        this.currentFrame = frame;
    }

    /**
     * Exit the current frame
     */
    popFrame () {
        this.frames.pop();
        this.currentFrame = this.frames[this.frames.length - 1];
    }

    /**
     * @returns {boolean} true if the current block is the last command of a loop
     */
    isLastBlockInLoop () {
        for (let i = this.frames.length - 1; i >= 0; i--) {
            const frame = this.frames[i];
            if (!frame.isLastBlock) {
                return false;
            }
            if (frame.isLoop) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param {object} node Input node to compile.
     * @param {boolean} visualReport if this is being called to get visual reporter content
     * @returns {Input} Compiled input.
     */
    descendInput (node, visualReport = false) {
        // check if we have extension js for this kind
        const extensionId = String(node.kind).split('.')[0];
        const blockId = String(node.kind).replace(extensionId + '.', '');
        if (JSGenerator.hasExtensionJs(extensionId) && JSGenerator.getExtensionJs(extensionId)[blockId]) {
            // this is an extension block that wants to be compiled
            const imports = JSGenerator.getExtensionImports();
            const jsFunc = JSGenerator.getExtensionJs(extensionId)[blockId];
            // return the input
            let input = null;
            try {
                input = jsFunc(node, this, imports);
            } catch (err) {
                log.warn(extensionId + '_' + blockId, 'failed to compile JavaScript;', err);
            }
            // log.log(input);
            return input;
        }

        switch (node.kind) {
        case 'args.boolean':
            return new TypedInput(`toBoolean(p${node.index})`, TYPE_BOOLEAN);
        case 'args.stringNumber':
            return new TypedInput(`p${node.index}`, TYPE_UNKNOWN);

        case 'compat':
            // Compatibility layer inputs never use flags.
            // log.log('compat')
            return new TypedInput(`(${this.generateCompatibilityLayerCall(node, false, null, visualReport)})`, TYPE_UNKNOWN);

        case 'constant':
            return this.safeConstantInput(node.value);
        case 'counter.get':
            return new TypedInput('runtime.ext_scratch3_control._counter', TYPE_NUMBER);
        case 'control.error':
            return new TypedInput('runtime.ext_scratch3_control._error', TYPE_STRING);
        case 'control.isclone':
            return new TypedInput('(!target.isOriginal)', TYPE_BOOLEAN);
        case 'math.polygon':
            let points = JSON.stringify(node.points.map((point, num) => ({x: `x${num}`, y: `y${num}`})));
            for (let num = 0; num < node.points.length; num++) {
                const point = node.points[num];
                const xn = `"x${num}"`;
                const yn = `"y${num}"`;
                points = points
                    .replace(xn, this.descendInput(point.x).asNumber())
                    .replace(yn, this.descendInput(point.y).asNumber());
            }
            return new TypedInput(points, TYPE_UNKNOWN);
            
        case 'control.inlineStackOutput': {
            // reset this.source but save it
            const originalSource = this.source;
            this.source = '(yield* (function*() {';
            // descend now since descendStack modifies source
            this.descendStack(node.code, new Frame(false, 'control.inlineStackOutput'));
            this.source += '})())';
            // save edited
            const stackSource = this.source;
            this.source = originalSource;
            return new TypedInput(stackSource, TYPE_UNKNOWN);
        }

        case 'keyboard.pressed':
            return new TypedInput(`runtime.ioDevices.keyboard.getKeyIsDown(${this.descendInput(node.key).asSafe()})`, TYPE_BOOLEAN);

        case 'list.contains':
            if (this.isOptimized) {
                // pm: we can use a better function here
                return new TypedInput(`listContainsFastest(${this.referenceVariable(node.list)}, ${this.descendInput(node.item).asUnknown()})`, TYPE_BOOLEAN);
            }
            return new TypedInput(`listContains(${this.referenceVariable(node.list)}, ${this.descendInput(node.item).asUnknown()})`, TYPE_BOOLEAN);
        case 'list.contents':
            if (this.isOptimized) {
                // pm: its more consistent to just return the list with spaces inbetween
                return new TypedInput(`(${this.referenceVariable(node.list)}.value.join(' '))`, TYPE_STRING);
            }
            return new TypedInput(`listContents(${this.referenceVariable(node.list)})`, TYPE_STRING);
        case 'list.get': {
            const index = this.descendInput(node.index);
            if (environment.supportsNullishCoalescing) {
                if (index.isAlwaysNumberOrNaN()) {
                    return new TypedInput(`(${this.referenceVariable(node.list)}.value[(${index.asNumber()} | 0) - 1] ?? "")`, TYPE_UNKNOWN);
                }
                if (index instanceof ConstantInput && index.constantValue === 'last') {
                    return new TypedInput(`(${this.referenceVariable(node.list)}.value[${this.referenceVariable(node.list)}.value.length - 1] ?? "")`, TYPE_UNKNOWN);
                }
            }
            if (this.isOptimized) {
                // pm: we can just use this as an index ignoring the string input, the nullish coalescing operator will just make sure we dont return undefined
                return new TypedInput(`(${this.referenceVariable(node.list)}.value[${index.asUnknown()} - 1] ?? "")`, TYPE_UNKNOWN);
            }
            return new TypedInput(`listGet(${this.referenceVariable(node.list)}.value, ${index.asUnknown()})`, TYPE_UNKNOWN);
        }
        case 'list.indexOf':
            return new TypedInput(`listIndexOf(${this.referenceVariable(node.list)}, ${this.descendInput(node.item).asUnknown()})`, TYPE_NUMBER);
        case 'list.amountOf':
            return new TypedInput(`${this.referenceVariable(node.list)}.value.filter((x) => x == ${this.descendInput(node.value).asUnknown()}).length`, TYPE_NUMBER);
        case 'list.length':
            return new TypedInput(`${this.referenceVariable(node.list)}.value.length`, TYPE_NUMBER);

        case 'list.filteritem':
            return new TypedInput('runtime.ext_scratch3_data._listFilterItem', TYPE_UNKNOWN);
        case 'list.filterindex':
            return new TypedInput('runtime.ext_scratch3_data._listFilterIndex', TYPE_UNKNOWN);

        case 'looks.size':
            return new TypedInput('target.size', TYPE_NUMBER);
        case 'looks.tintColor':
            return new TypedInput('runtime.ext_scratch3_looks.getTintColor(null, { target: target })', TYPE_NUMBER);
        case 'looks.backdropName':
            return new TypedInput('stage.getCostumes()[stage.currentCostume].name', TYPE_STRING);
        case 'looks.backdropNumber':
            return new TypedInput('(stage.currentCostume + 1)', TYPE_NUMBER);
        case 'looks.costumeName':
            return new TypedInput('target.getCostumes()[target.currentCostume].name', TYPE_STRING);
        case 'looks.costumeNumber':
            return new TypedInput('(target.currentCostume + 1)', TYPE_NUMBER);

        case 'motion.direction':
            return new TypedInput('target.direction', TYPE_NUMBER);

        case 'motion.x':
            if (this.isOptimized) {
                return new TypedInput('(target.x)', TYPE_NUMBER);
            }
            return new TypedInput('limitPrecision(target.x)', TYPE_NUMBER);
        case 'motion.y':
            if (this.isOptimized) {
                return new TypedInput('(target.y)', TYPE_NUMBER);
            }
            return new TypedInput('limitPrecision(target.y)', TYPE_NUMBER);

        case 'mouse.down':
            return new TypedInput('runtime.ioDevices.mouse.getIsDown()', TYPE_BOOLEAN);
        case 'mouse.x':
            return new TypedInput('runtime.ioDevices.mouse.getScratchX()', TYPE_NUMBER);
        case 'mouse.y':
            return new TypedInput('runtime.ioDevices.mouse.getScratchY()', TYPE_NUMBER);
            
        case 'op.true':
            return new TypedInput('(true)', TYPE_BOOLEAN);
        case 'op.false':
            return new TypedInput('(false)', TYPE_BOOLEAN);
        case 'op.randbool':
            return new TypedInput('(Boolean(Math.round(Math.random())))', TYPE_BOOLEAN);
            
        case 'pmEventsExpansion.broadcastFunction':
            // we need to do function otherwise this block would be stupidly long
            let source = '(yield* (function*() {';
            source += `var broadcastVar = runtime.getTargetForStage().lookupBroadcastMsg("", ${this.descendInput(node.broadcast).asString()} );`;
            source += `if (broadcastVar) broadcastVar.isSent = true;`;
            const threads = this.localVariables.next();
            source += `var ${threads} = startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: ${this.descendInput(node.broadcast).asString()} });`;
            const threadVar = this.localVariables.next();
            source += `for (const ${threadVar} of ${threads}) { ${threadVar}.__evex_recievedDataa = '' };`;
            source += `yield* waitThreads(${threads});`;
            // wait an extra frame so the thread has the new value
            if (this.isWarp) {
                source += 'if (isStuck()) yield;\n';
            } else {
                source += 'yield;\n';
            }
            // Control may have been yielded to another script -- all bets are off.
            this.resetVariableInputs();
            // get value
            const value = this.localVariables.next();
            const thread = this.localVariables.next();
            source += `var ${value} = undefined;`;
            source += `for (var ${thread} of ${threads}) {`;
            // if not undefined, return value
            source += `if (typeof ${thread}.__evex_returnDataa !== 'undefined') {`;
            source += `return ${thread}.__evex_returnDataa;`;
            source += `}`;
            source += `}`;
            // no value, return empty value
            source += `return '';`;
            source += '})())';
            return new TypedInput(source, TYPE_STRING);
        case 'pmEventsExpansion.broadcastFunctionArgs': {
            // we need to do function otherwise this block would be stupidly long
            let source = '(yield* (function*() {';
            const threads = this.localVariables.next();
            source += `var broadcastVar = runtime.getTargetForStage().lookupBroadcastMsg("", ${this.descendInput(node.broadcast).asString()} );`;
            source += `if (broadcastVar) broadcastVar.isSent = true;`;
            source += `var ${threads} = startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: ${this.descendInput(node.broadcast).asString()} });`;
            const threadVar = this.localVariables.next();
            source += `for (const ${threadVar} of ${threads}) { ${threadVar}.__evex_recievedDataa = ${this.descendInput(node.args).asString()} };`;
            source += `yield* waitThreads(${threads});`;
            // wait an extra frame so the thread has the new value
            if (this.isWarp) {
                source += 'if (isStuck()) yield;\n';
            } else {
                source += 'yield;\n';
            }
            // Control may have been yielded to another script -- all bets are off.
            this.resetVariableInputs();
            // get value
            const value = this.localVariables.next();
            const thread = this.localVariables.next();
            source += `var ${value} = undefined;`;
            source += `for (var ${thread} of ${threads}) {`;
            // if not undefined, return value
            source += `if (typeof ${thread}.__evex_returnDataa !== 'undefined') {`;
            source += `return ${thread}.__evex_returnDataa;`;
            source += `}`;
            source += `}`;
            // no value, return empty value
            source += `return '';`;
            source += '})())';
            return new TypedInput(source, TYPE_STRING);
        }
        case 'op.abs':
            return new TypedInput(`Math.abs(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER);
        case 'op.acos':
            // Needs to be marked as NaN because Math.acos(1.0001) === NaN
            return new TypedInput(`((Math.acos(${this.descendInput(node.value).asNumber()}) * 180) / Math.PI)`, TYPE_NUMBER_NAN);
        case 'op.add':
            // Needs to be marked as NaN because Infinity + -Infinity === NaN
            return new TypedInput(`(${this.descendInput(node.left).asNumber()} + ${this.descendInput(node.right).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.and':
            return new TypedInput(`(${this.descendInput(node.left).asBoolean()} && ${this.descendInput(node.right).asBoolean()})`, TYPE_BOOLEAN);
        case 'op.asin':
            // Needs to be marked as NaN because Math.asin(1.0001) === NaN
            return new TypedInput(`((Math.asin(${this.descendInput(node.value).asNumber()}) * 180) / Math.PI)`, TYPE_NUMBER_NAN);
        case 'op.atan':
            return new TypedInput(`((Math.atan(${this.descendInput(node.value).asNumber()}) * 180) / Math.PI)`, TYPE_NUMBER);
        case 'op.ceiling':
            return new TypedInput(`Math.ceil(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER);
        case 'op.contains':
            return new TypedInput(`(${this.descendInput(node.string).asString()}.toLowerCase().indexOf(${this.descendInput(node.contains).asString()}.toLowerCase()) !== -1)`, TYPE_BOOLEAN);
        case 'op.cos':
            // pm: optimizations allow us to use a premade list for sin values on integers
            if (this.isOptimized) {
                const value = `${this.descendInput(node.value).asNumber()}`;
                return new TypedInput(`(Number.isInteger(${value}) ? runtime.optimizationUtil.cos[${value} % 360] : (Math.round(Math.cos((Math.PI * ${value}) / 180) * 1e10) / 1e10))`, TYPE_NUMBER_NAN);
            }
            return new TypedInput(`(Math.round(Math.cos((Math.PI * ${this.descendInput(node.value).asNumber()}) / 180) * 1e10) / 1e10)`, TYPE_NUMBER_NAN);
        case 'op.divide':
            // Needs to be marked as NaN because 0 / 0 === NaN
            return new TypedInput(`(${this.descendInput(node.left).asNumber()} / ${this.descendInput(node.right).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.power':
            // Needs to be marked as NaN because -1 ** 0.5 === NaN
            return new TypedInput(`(Math.pow(${this.descendInput(node.left).asNumber()}, ${this.descendInput(node.right).asNumber()}))`, TYPE_NUMBER_NAN);
        case 'op.equals': {
            const left = this.descendInput(node.left);
            const right = this.descendInput(node.right);
            // When both operands are known to never be numbers, only use string comparison to avoid all number parsing.
            if (left.isNeverNumber() || right.isNeverNumber()) {
                return new TypedInput(`(${left.asString()}.toLowerCase() === ${right.asString()}.toLowerCase())`, TYPE_BOOLEAN);
            }
            const leftAlwaysNumber = left.isAlwaysNumber();
            const rightAlwaysNumber = right.isAlwaysNumber();
            // When both operands are known to be numbers, we can use ===
            if (leftAlwaysNumber && rightAlwaysNumber) {
                return new TypedInput(`(${left.asNumber()} === ${right.asNumber()})`, TYPE_BOOLEAN);
            }
            // In certain conditions, we can use === when one of the operands is known to be a safe number.
            if (leftAlwaysNumber && left instanceof ConstantInput && isSafeConstantForEqualsOptimization(left)) {
                return new TypedInput(`(${left.asNumber()} === ${right.asNumber()})`, TYPE_BOOLEAN);
            }
            if (rightAlwaysNumber && right instanceof ConstantInput && isSafeConstantForEqualsOptimization(right)) {
                return new TypedInput(`(${left.asNumber()} === ${right.asNumber()})`, TYPE_BOOLEAN);
            }
            // No compile-time optimizations possible - use fallback method.
            return new TypedInput(`compareEqual(${left.asUnknown()}, ${right.asUnknown()})`, TYPE_BOOLEAN);
        }
        case 'op.e^':
            return new TypedInput(`Math.exp(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER);
        case 'op.floor':
            return new TypedInput(`Math.floor(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER);
        case 'op.greater': {
            const left = this.descendInput(node.left);
            const right = this.descendInput(node.right);
            // When the left operand is a number and the right operand is a number or NaN, we can use >
            if (left.isAlwaysNumber() && right.isAlwaysNumberOrNaN()) {
                return new TypedInput(`(${left.asNumber()} > ${right.asNumberOrNaN()})`, TYPE_BOOLEAN);
            }
            // When the left operand is a number or NaN and the right operand is a number, we can negate <=
            if (left.isAlwaysNumberOrNaN() && right.isAlwaysNumber()) {
                return new TypedInput(`!(${left.asNumberOrNaN()} <= ${right.asNumber()})`, TYPE_BOOLEAN);
            }
            // When either operand is known to never be a number, avoid all number parsing.
            if (left.isNeverNumber() || right.isNeverNumber()) {
                return new TypedInput(`(${left.asString()}.toLowerCase() > ${right.asString()}.toLowerCase())`, TYPE_BOOLEAN);
            }
            // No compile-time optimizations possible - use fallback method.
            return new TypedInput(`compareGreaterThan(${left.asUnknown()}, ${right.asUnknown()})`, TYPE_BOOLEAN);
        }
        case 'op.join':
            return new TypedInput(`(${this.descendInput(node.left).asString()} + ${this.descendInput(node.right).asString()})`, TYPE_STRING);
        case 'op.length':
            return new TypedInput(`${this.descendInput(node.string).asString()}.length`, TYPE_NUMBER);
        case 'op.less': {
            const left = this.descendInput(node.left);
            const right = this.descendInput(node.right);
            // When the left operand is a number or NaN and the right operand is a number, we can use <
            if (left.isAlwaysNumberOrNaN() && right.isAlwaysNumber()) {
                return new TypedInput(`(${left.asNumberOrNaN()} < ${right.asNumber()})`, TYPE_BOOLEAN);
            }
            // When the left operand is a number and the right operand is a number or NaN, we can negate >=
            if (left.isAlwaysNumber() && right.isAlwaysNumberOrNaN()) {
                return new TypedInput(`!(${left.asNumber()} >= ${right.asNumberOrNaN()})`, TYPE_BOOLEAN);
            }
            // When either operand is known to never be a number, avoid all number parsing.
            if (left.isNeverNumber() || right.isNeverNumber()) {
                return new TypedInput(`(${left.asString()}.toLowerCase() < ${right.asString()}.toLowerCase())`, TYPE_BOOLEAN);
            }
            // No compile-time optimizations possible - use fallback method.
            return new TypedInput(`compareLessThan(${left.asUnknown()}, ${right.asUnknown()})`, TYPE_BOOLEAN);
        }
        case 'op.letterOf':
            return new TypedInput(`((${this.descendInput(node.string).asString()})[(${this.descendInput(node.letter).asNumber()} | 0) - 1] || "")`, TYPE_STRING);
        case 'op.ln':
            // Needs to be marked as NaN because Math.log(-1) == NaN
            return new TypedInput(`Math.log(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.log':
            // Needs to be marked as NaN because Math.log(-1) == NaN
            return new TypedInput(`(Math.log(${this.descendInput(node.value).asNumber()}) / Math.LN10)`, TYPE_NUMBER_NAN);
        case 'op.advlog':
            // Needs to be marked as NaN because Math.log(-1) == NaN
            return new TypedInput(`(Math.log(${this.descendInput(node.right).asNumber()}) / (Math.log(${this.descendInput(node.left).asNumber()}))`, TYPE_NUMBER_NAN);
        case 'op.mod':
            this.descendedIntoModulo = true;
            // Needs to be marked as NaN because mod(0, 0) (and others) == NaN
            return new TypedInput(`mod(${this.descendInput(node.left).asNumber()}, ${this.descendInput(node.right).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.multiply':
            // Needs to be marked as NaN because Infinity * 0 === NaN
            return new TypedInput(`(${this.descendInput(node.left).asNumber()} * ${this.descendInput(node.right).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.not':
            return new TypedInput(`!${this.descendInput(node.operand).asBoolean()}`, TYPE_BOOLEAN);
        case 'op.or':
            return new TypedInput(`(${this.descendInput(node.left).asBoolean()} || ${this.descendInput(node.right).asBoolean()})`, TYPE_BOOLEAN);
        case 'op.random':
            if (node.useInts) {
                // Both inputs are ints, so we know neither are NaN
                return new TypedInput(`randomInt(${this.descendInput(node.low).asNumber()}, ${this.descendInput(node.high).asNumber()})`, TYPE_NUMBER);
            }
            if (node.useFloats) {
                return new TypedInput(`randomFloat(${this.descendInput(node.low).asNumber()}, ${this.descendInput(node.high).asNumber()})`, TYPE_NUMBER_NAN);
            }
            return new TypedInput(`runtime.ext_scratch3_operators._random(${this.descendInput(node.low).asUnknown()}, ${this.descendInput(node.high).asUnknown()})`, TYPE_NUMBER_NAN);
        case 'op.round':
            return new TypedInput(`Math.round(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER);
        case 'op.sin':
            // pm: optimizations allow us to use a premade list for sin values on integers
            if (this.isOptimized) {
                const value = `${this.descendInput(node.value).asNumber()}`;
                return new TypedInput(`(Number.isInteger(${value}) ? runtime.optimizationUtil.sin[${value} % 360] : (Math.round(Math.sin((Math.PI * ${value}) / 180) * 1e10) / 1e10))`, TYPE_NUMBER_NAN);
            }
            return new TypedInput(`(Math.round(Math.sin((Math.PI * ${this.descendInput(node.value).asNumber()}) / 180) * 1e10) / 1e10)`, TYPE_NUMBER_NAN);
        case 'op.sqrt':
            // Needs to be marked as NaN because Math.sqrt(-1) === NaN
            return new TypedInput(`Math.sqrt(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.subtract':
            // Needs to be marked as NaN because Infinity - Infinity === NaN
            return new TypedInput(`(${this.descendInput(node.left).asNumber()} - ${this.descendInput(node.right).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.tan':
            return new TypedInput(`tan(${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER_NAN);
        case 'op.10^':
            return new TypedInput(`(10 ** ${this.descendInput(node.value).asNumber()})`, TYPE_NUMBER);

        case 'sensing.answer':
            return new TypedInput(`runtime.ext_scratch3_sensing._answer`, TYPE_STRING);
        case 'sensing.colorTouchingColor':
            return new TypedInput(`target.colorIsTouchingColor(colorToList(${this.descendInput(node.target).asColor()}), colorToList(${this.descendInput(node.mask).asColor()}))`, TYPE_BOOLEAN);
        case 'sensing.date':
            return new TypedInput(`(new Date().getDate())`, TYPE_NUMBER);
        case 'sensing.dayofweek':
            return new TypedInput(`(new Date().getDay() + 1)`, TYPE_NUMBER);
        case 'sensing.daysSince2000':
            return new TypedInput('daysSince2000()', TYPE_NUMBER);
        case 'sensing.distance':
            // TODO: on stages, this can be computed at compile time
            return new TypedInput(`distance(${this.descendInput(node.target).asString()})`, TYPE_NUMBER);
        case 'sensing.hour':
            return new TypedInput(`(new Date().getHours())`, TYPE_NUMBER);
        case 'sensing.minute':
            return new TypedInput(`(new Date().getMinutes())`, TYPE_NUMBER);
        case 'sensing.month':
            return new TypedInput(`(new Date().getMonth() + 1)`, TYPE_NUMBER);
        case 'sensing.of': {
            const object = this.descendInput(node.object).asString();
            const property = node.property;
            if (node.object.kind === 'constant') {
                const isStage = node.object.value === '_stage_';
                // Note that if target isn't a stage, we can't assume it exists
                const objectReference = isStage ? 'stage' : this.evaluateOnce(`runtime.getSpriteTargetByName(${object})`);
                if (property === 'volume') {
                    return new TypedInput(`(${objectReference} ? ${objectReference}.volume : 0)`, TYPE_NUMBER);
                }
                if (isStage) {
                    switch (property) {
                    case 'background #':
                        // fallthrough for scratch 1.0 compatibility
                    case 'backdrop #':
                        return new TypedInput(`(${objectReference}.currentCostume + 1)`, TYPE_NUMBER);
                    case 'backdrop name':
                        return new TypedInput(`${objectReference}.getCostumes()[${objectReference}.currentCostume].name`, TYPE_STRING);
                    }
                } else {
                    switch (property) {
                    case 'x position':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.x : 0)`, TYPE_NUMBER);
                    case 'y position':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.y : 0)`, TYPE_NUMBER);
                    case 'direction':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.direction : 0)`, TYPE_NUMBER);
                    case 'costume #':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.currentCostume + 1 : 0)`, TYPE_NUMBER);
                    case 'costume name':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.getCostumes()[${objectReference}.currentCostume].name : 0)`, TYPE_UNKNOWN);
                    case 'layer':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.getLayerOrder() : 0)`, TYPE_NUMBER);
                    case 'size':
                        return new TypedInput(`(${objectReference} ? ${objectReference}.size : 0)`, TYPE_NUMBER);
                    }
                }
                const variableReference = this.evaluateOnce(`${objectReference} && ${objectReference}.lookupVariableByNameAndType("${sanitize(property)}", "", true)`);
                return new TypedInput(`(${variableReference} ? ${variableReference}.value : 0)`, TYPE_UNKNOWN);
            }
            return new TypedInput(`runtime.ext_scratch3_sensing.getAttributeOf({OBJECT: ${object}, PROPERTY: "${sanitize(property)}" })`, TYPE_UNKNOWN);
        }
        case 'sensing.second':
            return new TypedInput(`(new Date().getSeconds())`, TYPE_NUMBER);
        case 'sensing.timestamp':
            return new TypedInput(`(Date.now())`, TYPE_NUMBER);
        case 'sensing.touching':
            return new TypedInput(`target.isTouchingObject(${this.descendInput(node.object).asUnknown()})`, TYPE_BOOLEAN);
        case 'sensing.touchingColor':
            return new TypedInput(`target.isTouchingColor(colorToList(${this.descendInput(node.color).asColor()}))`, TYPE_BOOLEAN);
        case 'sensing.username':
            return new TypedInput('runtime.ioDevices.userData.getUsername()', TYPE_STRING);
        case 'sensing.loggedin':
            return new TypedInput('runtime.ioDevices.userData.getLoggedIn()', TYPE_STRING);
        case 'sensing.year':
            return new TypedInput(`(new Date().getFullYear())`, TYPE_NUMBER);

        case 'timer.get':
            return new TypedInput('runtime.ioDevices.clock.projectTimer()', TYPE_NUMBER);

        case 'tw.lastKeyPressed':
            return new TypedInput('runtime.ioDevices.keyboard.getLastKeyPressed()', TYPE_STRING);

        case 'var.get':
            return this.descendVariable(node.variable);
                
        case 'procedures.call': {
            const procedureCode = node.code;
            const procedureVariant = node.variant;
            let source = '(';
            // Do not generate any code for empty procedures.
            const procedureData = this.ir.procedures[procedureVariant];
            if (procedureData.stack === null) return new TypedInput('""', TYPE_STRING);

            const yieldForRecursion = !this.isWarp && procedureCode === this.script.procedureCode;
            const yieldForHat = this.isInHat;
            if (yieldForRecursion || yieldForHat) {
                // Direct recursion yields.
                this.yieldNotWarp();
            }
            if (procedureData.yields) {
                source += 'yield* ';
                if (!this.script.yields) {
                    throw new Error('Script uses yielding procedure but is not marked as yielding.');
                }
            }
            source += `thread.procedures["${sanitize(procedureVariant)}"](`;
            // Only include arguments if the procedure accepts any.
            if (procedureData.arguments.length) {
                const args = [];
                for (const input of node.arguments) {
                    args.push(this.descendInput(input).asSafe());
                }
                source += args.join(',');
            }
            source += `))`;
            // Variable input types may have changes after a procedure call.
            this.resetVariableInputs();
            return new TypedInput(source, TYPE_UNKNOWN);
        }

        case 'noop':
            console.warn('unexpected noop');
            return new TypedInput('""', TYPE_UNKNOWN);

        case 'tempVars.get': {
            const name = this.descendInput(node.var);
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            const code = this.isOptimized 
                ? `${hostObj}[${name.asString()}]` 
                : `get(${hostObj}, ${name.asString()})`; 
            if (environment.supportsNullishCoalescing) {
                return new TypedInput(`(${code} ?? "")`, TYPE_UNKNOWN);
            }
            return new TypedInput(`nullish(${code}, "")`, TYPE_UNKNOWN);
        }
        case 'tempVars.exists': {
            const name = this.descendInput(node.var);
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            const code = this.isOptimized 
                ? `${name.asString()} in ${hostObj}` 
                : `includes(${hostObj}, ${name.asString()})`; 
            return new TypedInput(code, TYPE_BOOLEAN);
        }
        case 'tempVars.all':
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            if (node.runtime || node.thread) {
                return new TypedInput(`Object.keys(${hostObj}).join(',')`, TYPE_STRING);
            }
            return new TypedInput(`JSON.stringify(Object.keys(tempVars))`, TYPE_STRING);
        case 'control.dualBlock':
            return new TypedInput('"dual block works!"', TYPE_STRING);

        default:
            log.warn(`JS: Unknown input: ${node.kind}`, node);
            throw new Error(`JS: Unknown input: ${node.kind}`);
        }
    }

    /**
     * @param {*} node Stacked node to compile.
     */
    descendStackedBlock (node) {
        // check if we have extension js for this kind
        const extensionId = String(node.kind).split('.')[0];
        const blockId = String(node.kind).replace(extensionId + '.', '');
        if (JSGenerator.hasExtensionJs(extensionId) && JSGenerator.getExtensionJs(extensionId)[blockId]) {
            // this is an extension block that wants to be compiled
            const imports = JSGenerator.getExtensionImports();
            const jsFunc = JSGenerator.getExtensionJs(extensionId)[blockId];
            // add to source
            try {
                jsFunc(node, this, imports);
            } catch (err) {
                log.warn(extensionId + '_' + blockId, 'failed to compile JavaScript;', err);
            }
            return;
        }

        switch (node.kind) {
        case 'your mom':
            const urmom = 'https://penguinmod.com/dump/urmom-your-mom.mp4';
            const yaTried = 'https://penguinmod.com/dump/chips.mp4';
            const MISTERBEAST = 'https://penguinmod.com/dump/MISTER_BEAST.webm';
            const createVideo = url => `\`<video src="${url}" height="\${height}" autoplay loop style="alignment:center;"></video>\``;
            this.source += `
            const stage = document.getElementsByClassName('stage_stage_1fD7k box_box_2jjDp')[0].children[0]
            const height = stage.children[0].style.height
            stage.innerHTML = ${createVideo(urmom)}
            runtime.on('PROJECT_STOP_ALL', () => document.body.innerHTML = ${createVideo(yaTried)})
            stage.children[0].addEventListener('mousedown', () => stage.innerHTML = ${createVideo(MISTERBEAST)});
            `;
            break;
        case 'addons.call': {
            const inputs = this.descendInputRecord(node.arguments);
            const blockFunction = `runtime.getAddonBlock("${sanitize(node.code)}").callback`;
            const blockId = `"${sanitize(node.blockId)}"`;
            this.source += `yield* executeInCompatibilityLayer(${inputs}, ${blockFunction}, ${this.isWarp}, false, ${blockId});\n`;
            break;
        }
        case 'compat': {
            // If the last command in a loop returns a promise, immediately continue to the next iteration.
            // If you don't do this, the loop effectively yields twice per iteration and will run at half-speed.
            const isLastInLoop = this.isLastBlockInLoop();

            const blockType = node.blockType;
            if (blockType === BlockType.COMMAND || blockType === BlockType.HAT) {
                this.source += `${this.generateCompatibilityLayerCall(node, isLastInLoop)};\n`;
            } else if (blockType === BlockType.CONDITIONAL || blockType === BlockType.LOOP) {
                const branchVariable = this.localVariables.next();
                this.source += `const ${branchVariable} = createBranchInfo(${blockType === BlockType.LOOP});\n`;
                this.source += `while (${branchVariable}.branch = +(${this.generateCompatibilityLayerCall(node, false, branchVariable)})) {\n`;
                this.source += `switch (${branchVariable}.branch) {\n`;
                for (let i = 0; i < node.substacks.length; i++) {
                    this.source += `case ${i + 1}: {\n`;
                    this.descendStack(node.substacks[i], new Frame(false));
                    this.source += `break;\n`;
                    this.source += `}\n`; // close case
                }
                this.source += '}\n'; // close switch
                this.source += `if (${branchVariable}.onEnd[0]) yield ${branchVariable}.onEnd.shift()(${branchVariable});\n`;
                this.source += `if (!${branchVariable}.isLoop) break;\n`;
                this.yieldLoop();
                this.source += '}\n'; // close while
            } else {
                throw new Error(`Unknown block type: ${blockType}`);
            }

            if (isLastInLoop) {
                this.source += 'if (hasResumedFromPromise) {hasResumedFromPromise = false;continue;}\n';
            }
            break;
        }
        case 'procedures.set':
            const val = this.descendInput(node.val);
            const i = node.param.index;
            if (i !== undefined) this.source += `p${i} = ${val.asSafe()};\n`;
            break;
        case 'control.createClone':
            this.source += `runtime.ext_scratch3_control._createClone(${this.descendInput(node.target).asString()}, target);\n`;
            break;
        case 'control.deleteClone':
            this.source += 'if (!target.isOriginal) {\n';
            this.source += '  runtime.disposeTarget(target);\n';
            this.source += '  runtime.stopForTarget(target);\n';
            this.retire();
            this.source += '}\n';
            break;
        case 'control.for': {
            this.resetVariableInputs();
            const index = this.localVariables.next();
            this.source += `var ${index} = 0; `;
            this.source += `while (${index} < ${this.descendInput(node.count).asNumber()}) { `;
            this.source += `${index}++; `;
            this.source += `${this.referenceVariable(node.variable)}.value = ${index};\n`;
            this.descendStack(node.do, new Frame(true, 'control.for'));
            this.yieldLoop();
            this.source += '}\n';
            break;
        }
        case 'control.switch':
            this.source += `switch (${this.descendInput(node.test).asString()}) {\n`;
            this.descendStack(node.conditions, new Frame(false, 'control.switch'));
            // only add the else branch if it won't be empty
            // this makes scripts have a bit less useless noise in them
            if (node.default.length) {
                this.source += `default:\n`;
                this.descendStack(node.default, new Frame(false, 'control.switch'));
            }
            this.source += `}\n`;
            break;
        case 'control.case':
            if (this.currentFrame.parent !== 'control.switch') {
                this.source += `throw 'All "case" blocks must be inside of a "switch" block.';`;
                break;
            }
            this.source += `case ${this.descendInput(node.condition).asString()}:\n`;
            if (!node.runsNext){
                const frame = new Frame(false, 'control.case');
                frame.assignData({
                    containedByCase: true
                });
                this.descendStack(node.code, frame);
                this.source += `break;\n`;
            }
            break;
        case 'control.allAtOnce': {
            const ooldWarp = this.isWarp;
            this.isWarp = true;
            this.descendStack(node.code, new Frame(false, 'control.allAtOnce'));
            this.isWarp = ooldWarp;
            break;
        }
        case 'control.newScript': {
            const currentBlockId = this.localVariables.next();
            const branchBlock = this.localVariables.next();
            // get block id so we can get branch
            this.source += `var ${currentBlockId} = thread.peekStack();`;
            this.source += `var ${branchBlock} = thread.target.blocks.getBranch(${currentBlockId}, 0);`;
            // push new thread if we found a branch
            this.source += `if (${branchBlock}) {`;
            this.source += `runtime._pushThread(${branchBlock}, target, {});`;
            this.source += `}`;
            break;
        }
        case 'control.exitCase':
            if (!this.currentFrame.importantData.containedByCase) {
                this.source += `throw 'All "exit case" blocks must be inside of a "case" block.';`;
                break;
            }
            this.source += `break;\n`;
            break;
        case 'control.exitLoop':
            if (!this.currentFrame.importantData.containedByLoop) {
                this.source += `throw 'All "escape loop" blocks must be inside of a looping block.';`;
                break;
            }
            this.source += `break;\n`;
            break;
        case 'control.continueLoop':
            if (!this.currentFrame.importantData.containedByLoop) {
                this.source += `throw 'All "continue loop" blocks must be inside of a looping block.';`;
                break;
            }
            this.source += `continue;\n`;
            break;
        case 'control.if':
            this.source += `if (${this.descendInput(node.condition).asBoolean()}) {\n`;
            this.descendStack(node.whenTrue, new Frame(false, 'control.if'));
            // only add the else branch if it won't be empty
            // this makes scripts have a bit less useless noise in them
            if (node.whenFalse.length) {
                this.source += `} else {\n`;
                this.descendStack(node.whenFalse, new Frame(false, 'control.if'));
            }
            this.source += `}\n`;
            break;
        case 'control.trycatch':
            this.source += `try {\n`;
            this.descendStack(node.try, new Frame(false, 'control.trycatch'));
            const error = this.localVariables.next();
            this.source += `} catch (${error}) {\n`;
            this.source += `runtime.ext_scratch3_control._error = String(${error});\n`;
            this.descendStack(node.catch, new Frame(false, 'control.trycatch'));
            this.source += `}\n`;
            break;
        case 'control.throwError': {
            const error = this.descendInput(node.error).asString();
            this.source += `throw ${error};\n`;
            break;
        }
        case 'control.repeat': {
            const i = this.localVariables.next();
            this.source += `for (var ${i} = ${this.descendInput(node.times).asNumber()}; ${i} >= 0.5; ${i}--) {\n`;
            this.descendStack(node.do, new Frame(true, 'control.repeat'));
            this.yieldLoop();
            this.source += `}\n`;
            break;
        }
        case 'control.repeatForSeconds': {
            const duration = this.localVariables.next();
            this.source += `thread.timer2 = timer();\n`;
            this.source += `var ${duration} = Math.max(0, 1000 * ${this.descendInput(node.times).asNumber()});\n`;
            this.requestRedraw();
            this.source += `while (thread.timer2.timeElapsed() < ${duration}) {\n`;
            this.descendStack(node.do, new Frame(true, 'control.repeatForSeconds'));
            this.yieldLoop();
            this.source += `}\n`;
            this.source += 'thread.timer2 = null;\n';
            break;
        }
        case 'control.stopAll':
            this.source += 'runtime.stopAll();\n';
            this.retire();
            break;
        case 'control.stopOthers':
            this.source += 'runtime.stopForTarget(target, thread);\n';
            break;
        case 'control.stopScript':
            if (this.isProcedure) {
                this.source += 'return;\n';
            } else {
                this.retire();
            }
            break;
        case 'control.wait': {
            const duration = this.localVariables.next();
            this.source += `thread.timer = timer();\n`;
            this.source += `var ${duration} = Math.max(0, 1000 * ${this.descendInput(node.seconds).asNumber()});\n`;
            this.requestRedraw();
            // always yield at least once, even on 0 second durations
            this.yieldNotWarp();
            this.source += `while (thread.timer.timeElapsed() < ${duration}) {\n`;
            this.yieldStuckOrNotWarp();
            this.source += '}\n';
            this.source += 'thread.timer = null;\n';
            break;
        }
        case 'control.waitTick': {
            this.yieldNotWarp();
            break;
        }
        case 'control.waitUntil': {
            this.resetVariableInputs();
            this.source += `while (!${this.descendInput(node.condition).asBoolean()}) {\n`;
            this.yieldStuckOrNotWarp();
            this.source += `}\n`;
            break;
        }
        case 'control.waitOrUntil': {
            const duration = this.localVariables.next();
            const condition = this.descendInput(node.condition).asBoolean();
            this.source += `thread.timer = timer();\n`;
            this.source += `var ${duration} = Math.max(0, 1000 * ${this.descendInput(node.seconds).asNumber()});\n`;
            this.requestRedraw();
            // always yield at least once, even on 0 second durations
            this.yieldNotWarp();
            this.source += `while ((thread.timer.timeElapsed() < ${duration}) && (!(${condition}))) {\n`;
            this.yieldStuckOrNotWarp();
            this.source += '}\n';
            this.source += 'thread.timer = null;\n';
            break;
        }
        case 'control.while':
            this.resetVariableInputs();
            this.source += `while (${this.descendInput(node.condition).asBoolean()}) {\n`;
            this.descendStack(node.do, new Frame(true, 'control.while'));
            if (node.warpTimer) {
                this.yieldStuckOrNotWarp();
            } else {
                this.yieldLoop();
            }
            this.source += `}\n`;
            break;
        case 'control.runAsSprite':
            const stage = 'runtime.getTargetForStage()';
            const sprite = this.descendInput(node.sprite).asString();
            const isStage = sprite === '"_stage_"';
            
            // save the original target
            const originalTarget = this.localVariables.next();
            this.source += `const ${originalTarget} = target;\n`;
            // pm: unknown behavior may appear so lets use try catch
            this.source += `try {\n`;
            // set target
            const targetSprite = isStage ? stage : `runtime.getSpriteTargetByName(${sprite}) || runtime.getTargetById(${sprite})`;
            this.source += `const target = (${targetSprite});\n`;
            // only run if target is found
            this.source += `if (target) {\n`;
            // set thread target (for compat blocks)
            this.source += `thread.target = target;\n`;
            // tell thread we are spoofing (for custom blocks)
            // we could already be spoofing tho so save that first
            const alreadySpoofing = this.localVariables.next();
            const alreadySpoofTarget = this.localVariables.next();
            this.source += `var ${alreadySpoofing} = thread.spoofing;\n`;
            this.source += `var ${alreadySpoofTarget} = thread.spoofTarget;\n`;

            this.source += `thread.spoofing = true;\n`;
            this.source += `thread.spoofTarget = target;\n`;

            // descendle stackle
            this.descendStack(node.substack, new Frame(false, 'control.runAsSprite'));

            // undo thread target & spoofing change
            this.source += `thread.target = ${originalTarget};\n`;
            this.source += `thread.spoofing = ${alreadySpoofing};\n`;
            this.source += `thread.spoofTarget = ${alreadySpoofTarget};\n`;

            this.source += `}\n`;
            this.source += `} catch (e) {\nconsole.log('as sprite function failed;', e);\n`;

            // same as last undo
            this.source += `thread.target = ${originalTarget};\n`;
            this.source += `thread.spoofing = ${alreadySpoofing};\n`;
            this.source += `thread.spoofTarget = ${alreadySpoofTarget};\n`;

            this.source += `}\n`;
            break;
        case 'counter.clear':
            this.source += 'runtime.ext_scratch3_control._counter = 0;\n';
            break;
        case 'counter.increment':
            this.source += 'runtime.ext_scratch3_control._counter++;\n';
            break;
        case 'counter.decrement':
            this.source += 'runtime.ext_scratch3_control._counter--;\n';
            break;
        case 'counter.set':
            this.source += `runtime.ext_scratch3_control._counter = ${this.descendInput(node.value).asNumber()};\n`;
            break;
        case 'hat.edge':
            this.isInHat = true;
            this.source += '{\n';
            // For exact Scratch parity, evaluate the input before checking old edge state.
            // Can matter if the input is not instantly evaluated.
            this.source += `const resolvedValue = ${this.descendInput(node.condition).asBoolean()};\n`;
            this.source += `const id = "${sanitize(node.id)}";\n`;
            this.source += 'const hasOldEdgeValue = target.hasEdgeActivatedValue(id);\n';
            this.source += `const oldEdgeValue = target.updateEdgeActivatedValue(id, resolvedValue);\n`;
            this.source += `const edgeWasActivated = hasOldEdgeValue ? (!oldEdgeValue && resolvedValue) : resolvedValue;\n`;
            this.source += `if (!edgeWasActivated) {\n`;
            this.retire();
            this.source += '}\n';
            this.source += 'yield;\n';
            this.source += '}\n';
            this.isInHat = false;
            break;
        case 'hat.predicate':
            this.isInHat = true;
            this.source += `if (!${this.descendInput(node.condition).asBoolean()}) {\n`;
            this.retire();
            this.source += '}\n';
            this.source += 'yield;\n';
            this.isInHat = false;
            break;
        case 'event.broadcast':
            this.source += `var broadcastVar = runtime.getTargetForStage().lookupBroadcastMsg("", ${this.descendInput(node.broadcast).asString()} );`;
            this.source += `if (broadcastVar) broadcastVar.isSent = true;`;
            this.source += `startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: ${this.descendInput(node.broadcast).asString()} });\n`;
            this.resetVariableInputs();
            break;
        case 'event.broadcastAndWait':
            this.source += `var broadcastVar = runtime.getTargetForStage().lookupBroadcastMsg("", ${this.descendInput(node.broadcast).asString()} );`;
            this.source += `if (broadcastVar) broadcastVar.isSent = true;`;
            this.source += `yield* waitThreads(startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: ${this.descendInput(node.broadcast).asString()} }));\n`;
            this.yielded();
            break;
        case 'list.forEach': {
            const list = this.referenceVariable(node.list);
            const set = this.descendVariable(node.variable);
            const to = node.num ? 'index + 1' : 'value';
            this.source += 
            `for (let index = 0; index < ${list}.value.length; index++) {` + 
                `const value = ${list}.value[index];` + 
                `${set.source} = ${to};`;
            this.descendStack(node.do, new Frame(true, 'list.forEach'));
            this.source += `};\n`;
            break;
        }
        case 'list.add': {
            const list = this.referenceVariable(node.list);
            this.source += `${list}.value.push(${this.descendInput(node.item).asSafe()});\n`;
            this.source += `${list}._monitorUpToDate = false;\n`;
            break;
        }
        case 'list.delete': {
            const list = this.referenceVariable(node.list);
            const index = this.descendInput(node.index);
            if (index instanceof ConstantInput) {
                if (index.constantValue === 'last') {
                    this.source += `${list}.value.pop();\n`;
                    this.source += `${list}._monitorUpToDate = false;\n`;
                    break;
                }
                if (+index.constantValue === 1) {
                    this.source += `${list}.value.shift();\n`;
                    this.source += `${list}._monitorUpToDate = false;\n`;
                    break;
                }
                // do not need a special case for all as that is handled in IR generation (list.deleteAll)
            }
            this.source += `listDelete(${list}, ${index.asUnknown()});\n`;
            break;
        }
        case 'list.deleteAll':
            this.source += `${this.referenceVariable(node.list)}.value = [];\n`;
            break;
        case 'list.shift':
            const list = this.referenceVariable(node.list);
            const index = this.descendInput(node.index).asNumber();
            if (index <= 0) break;
            this.source += `${list}.value = ${list}.value.slice(${index});\n`
            this.source += `${list}._monitorUpToDate = false;\n`
            break
        case 'list.hide':
            this.source += `runtime.monitorBlocks.changeBlock({ id: "${sanitize(node.list.id)}", element: "checkbox", value: false }, runtime);\n`;
            break;
        case 'list.insert': {
            const list = this.referenceVariable(node.list);
            const index = this.descendInput(node.index);
            const item = this.descendInput(node.item);
            if (index instanceof ConstantInput && +index.constantValue === 1) {
                this.source += `${list}.value.unshift(${item.asSafe()});\n`;
                this.source += `${list}._monitorUpToDate = false;\n`;
                break;
            }
            this.source += `listInsert(${list}, ${index.asUnknown()}, ${item.asSafe()});\n`;
            break;
        }
        case 'list.replace':
            this.source += `listReplace(${this.referenceVariable(node.list)}, ${this.descendInput(node.index).asUnknown()}, ${this.descendInput(node.item).asSafe()});\n`;
            break;
        case 'list.show':
            this.source += `runtime.monitorBlocks.changeBlock({ id: "${sanitize(node.list.id)}", element: "checkbox", value: true }, runtime);\n`;
            break;
        
        case 'list.filter':
            this.source += `${this.referenceVariable(node.list)}.value = ${this.referenceVariable(node.list)}.value.filter(function (item, index) {`;
            this.source += `    runtime.ext_scratch3_data._listFilterItem = item;`;
            this.source += `    runtime.ext_scratch3_data._listFilterIndex = index + 1;`;
            this.source += `    return ${this.descendInput(node.bool).asBoolean()};`;
            this.source += `})`;
            this.source += `runtime.ext_scratch3_data._listFilterItem = "";`;
            this.source += `runtime.ext_scratch3_data._listFilterIndex = 0;`;
            break;

        case 'looks.backwardLayers':
            if (!this.target.isStage) {
                this.source += `target.goBackwardLayers(${this.descendInput(node.layers).asNumber()});\n`;
            }
            break;
        case 'looks.clearEffects':
            this.source += 'target.clearEffects();\nruntime.ext_scratch3_looks._resetBubbles(target)\n';
            break;
        case 'looks.changeEffect':
            if (this.target.effects.hasOwnProperty(node.effect)) {
                this.source += `target.setEffect("${sanitize(node.effect)}", runtime.ext_scratch3_looks.clampEffect("${sanitize(node.effect)}", ${this.descendInput(node.value).asNumber()} + target.effects["${sanitize(node.effect)}"]));\n`;
            }
            break;
        case 'looks.changeSize':
            this.source += `target.setSize(target.size + ${this.descendInput(node.size).asNumber()});\n`;
            break;
        case 'looks.forwardLayers':
            if (!this.target.isStage) {
                this.source += `target.goForwardLayers(${this.descendInput(node.layers).asNumber()});\n`;
            }
            break;
        case 'looks.goToBack':
            if (!this.target.isStage) {
                this.source += 'target.goToBack();\n';
            }
            break;
        case 'looks.goToFront':
            if (!this.target.isStage) {
                this.source += 'target.goToFront();\n';
            }
            break;
        case 'looks.targetFront':
            if (!this.target.isStage) {
                const reqTarget = this.target.runtime.getSpriteTargetByName(node.layers.value);
                if (reqTarget) {
                    this.source += `target.goBehindOther(${JSON.stringify(reqTarget)});\n`;
                    this.source += `target.goForwardLayers(1);\n`;
                }
            }
            break;
        case 'looks.targetBack':
            if (!this.target.isStage) {
                const reqTarget = this.target.runtime.getSpriteTargetByName(node.layers.value);
                if (reqTarget && reqTarget.getLayerOrder() < this.target.getLayerOrder()) {
                    this.source += `target.goBehindOther(${JSON.stringify(reqTarget)});\n`;
                }
            }
            break;
        case 'looks.hide':
            this.source += 'target.setVisible(false);\n';
            this.source += 'runtime.ext_scratch3_looks._renderBubble(target);\n';
            break;
        case 'looks.nextBackdrop':
            this.source += 'runtime.ext_scratch3_looks._setBackdrop(stage, stage.currentCostume + 1, true);\n';
            break;
        case 'looks.nextCostume':
            this.source += 'target.setCostume(target.currentCostume + 1);\n';
            break;
        case 'looks.setEffect':
            if (this.target.effects.hasOwnProperty(node.effect)) {
                this.source += `target.setEffect("${sanitize(node.effect)}", runtime.ext_scratch3_looks.clampEffect("${sanitize(node.effect)}", ${this.descendInput(node.value).asNumber()}));\n`;
            }
            break;
        case 'looks.setSize':
            this.source += `target.setSize(${this.descendInput(node.size).asNumber()});\n`;
            break;
        case 'looks.setFont':
            this.source += `runtime.ext_scratch3_looks.setFont({ font: ${this.descendInput(node.font).asString()}, size: ${this.descendInput(node.size).asNumber()} }, { target: target });\n`;
            break;
        case 'looks.setColor':
            this.source += `runtime.ext_scratch3_looks.setColor({ prop: "${sanitize(node.prop)}", color: ${this.descendInput(node.color).asColor()} }, { target: target });\n`;
            break;
        case 'looks.setTintColor':
            this.source += `runtime.ext_scratch3_looks.setTintColor({ color: ${this.descendInput(node.color).asColor()} }, { target: target });\n`;
            break;
        case 'looks.setShape':
            this.source += `runtime.ext_scratch3_looks.setShape({ prop: "${sanitize(node.prop)}", color: ${this.descendInput(node.value).asColor()} }, { target: target });\n`;
            break;
        case 'looks.show':
            this.source += 'target.setVisible(true);\n';
            this.source += 'runtime.ext_scratch3_looks._renderBubble(target);\n';
            break;
        case 'looks.switchBackdrop':
            this.source += `runtime.ext_scratch3_looks._setBackdrop(stage, ${this.descendInput(node.backdrop).asSafe()});\n`;
            break;
        case 'looks.switchCostume':
            this.source += `runtime.ext_scratch3_looks._setCostume(target, ${this.descendInput(node.costume).asSafe()});\n`;
            break;

        case 'motion.changeX':
            this.source += `target.setXY(target.x + ${this.descendInput(node.dx).asNumber()}, target.y);\n`;
            break;
        case 'motion.changeY':
            this.source += `target.setXY(target.x, target.y + ${this.descendInput(node.dy).asNumber()});\n`;
            break;
        case 'motion.ifOnEdgeBounce':
            this.source += `runtime.ext_scratch3_motion._ifOnEdgeBounce(target);\n`;
            break;
        case 'motion.setDirection':
            this.source += `target.setDirection(${this.descendInput(node.direction).asNumber()});\n`;
            break;
        case 'motion.setRotationStyle':
            this.source += `target.setRotationStyle("${sanitize(node.style)}");\n`;
            break;
        case 'motion.setX': // fallthrough
        case 'motion.setY': // fallthrough
        case 'motion.setXY': {
            this.descendedIntoModulo = false;
            const x = 'x' in node ? this.descendInput(node.x).asNumber() : 'target.x';
            const y = 'y' in node ? this.descendInput(node.y).asNumber() : 'target.y';
            this.source += `target.setXY(${x}, ${y});\n`;
            if (this.descendedIntoModulo) {
                this.source += `if (target.interpolationData) target.interpolationData = null;\n`;
            }
            break;
        }
        case 'motion.step':
            this.source += `runtime.ext_scratch3_motion._moveSteps(${this.descendInput(node.steps).asNumber()}, target);\n`;
            break;

        case 'noop':
            console.warn('unexpected noop');
            break;

        case 'pen.clear':
            this.source += `${PEN_EXT}.clear();\n`;
            break;
        case 'pen.down':
            this.source += `${PEN_EXT}._penDown(target);\n`;
            break;
        case 'pen.changeParam':
            this.source += `${PEN_EXT}._setOrChangeColorParam(${this.descendInput(node.param).asString()}, ${this.descendInput(node.value).asNumber()}, ${PEN_STATE}, true);\n`;
            break;
        case 'pen.changeSize':
            this.source += `${PEN_EXT}._changePenSizeBy(${this.descendInput(node.size).asNumber()}, target);\n`;
            break;
        case 'pen.legacyChangeHue':
            this.source += `${PEN_EXT}._changePenHueBy(${this.descendInput(node.hue).asNumber()}, target);\n`;
            break;
        case 'pen.legacyChangeShade':
            this.source += `${PEN_EXT}._changePenShadeBy(${this.descendInput(node.shade).asNumber()}, target);\n`;
            break;
        case 'pen.legacySetHue':
            this.source += `${PEN_EXT}._setPenHueToNumber(${this.descendInput(node.hue).asNumber()}, target);\n`;
            break;
        case 'pen.legacySetShade':
            this.source += `${PEN_EXT}._setPenShadeToNumber(${this.descendInput(node.shade).asNumber()}, target);\n`;
            break;
        case 'pen.setColor':
            this.source += `${PEN_EXT}._setPenColorToColor(${this.descendInput(node.color).asColor()}, target);\n`;
            break;
        case 'pen.setParam':
            this.source += `${PEN_EXT}._setOrChangeColorParam(${this.descendInput(node.param).asString()}, ${this.descendInput(node.value).asNumber()}, ${PEN_STATE}, false);\n`;
            break;
        case 'pen.setSize':
            this.source += `${PEN_EXT}._setPenSizeTo(${this.descendInput(node.size).asNumber()}, target);\n`;
            break;
        case 'pen.stamp':
            this.source += `${PEN_EXT}._stamp(target);\n`;
            break;
        case 'pen.up':
            this.source += `${PEN_EXT}._penUp(target);\n`;
            break;

        case 'procedures.return': 
            this.source += `return ${this.descendInput(node.return).asUnknown()};`;
            break;
        case 'procedures.call': {
            const procedureCode = node.code;
            const procedureVariant = node.variant;
            // Do not generate any code for empty procedures.
            const procedureData = this.ir.procedures[procedureVariant];
            if (procedureData.stack === null) {
                break;
            }
            if (!this.isWarp && procedureCode === this.script.procedureCode) {
                // Direct recursion yields.
                this.yieldNotWarp();
            }
            if (procedureData.yields) {
                this.source += 'yield* ';
                if (!this.script.yields) {
                    throw new Error('Script uses yielding procedure but is not marked as yielding.');
                }
            }
            this.source += `thread.procedures["${sanitize(procedureVariant)}"](`;
            // Only include arguments if the procedure accepts any.
            if (procedureData.arguments.length) {
                const args = [];
                for (const input of node.arguments) {
                    args.push(this.descendInput(input).asSafe());
                }
                this.source += args.join(',');
            }
            this.source += `);\n`;
            if (node.type === 'hat') {
                throw new Error('Custom hat blocks are not supported');
            }
            // Variable input types may have changes after a procedure call.
            this.resetVariableInputs();
            break;
        }

        case 'timer.reset':
            this.source += 'runtime.ioDevices.clock.resetProjectTimer();\n';
            break;

        case 'tw.debugger':
            this.source += 'debugger;\n';
            break;

        case 'var.hide':
            this.source += `runtime.monitorBlocks.changeBlock({ id: "${sanitize(node.variable.id)}", element: "checkbox", value: false }, runtime);\n`;
            break;
        case 'var.set': {
            const variable = this.descendVariable(node.variable);
            const value = this.descendInput(node.value);
            variable.setInput(value);
            this.source += `${variable.source} = ${value.asSafe()};\n`;
            if (node.variable.isCloud) {
                this.source += `runtime.ioDevices.cloud.requestUpdateVariable("${sanitize(node.variable.name)}", ${variable.source});\n`;
            }
            break;
        }
        case 'var.show':
            this.source += `runtime.monitorBlocks.changeBlock({ id: "${sanitize(node.variable.id)}", element: "checkbox", value: true }, runtime);\n`;
            break;

        case 'visualReport': {
            const value = this.localVariables.next();
            this.source += `const ${value} = ${this.descendInput(node.input, true).asUnknown()};`;
            // blocks like legacy no-ops can return a literal `undefined`
            this.source += `if (${value} !== undefined) runtime.visualReport("${sanitize(this.script.topBlockId)}", ${value});\n`;
            break;
        }        
        case 'sensing.set.of': {
            const object = this.descendInput(node.object).asString();
            const value = this.descendInput(node.value);
            const property = node.property;
            const isStage = node.object.value === '_stage_';
            const objectReference = isStage ? 'stage' : this.evaluateOnce(`runtime.getSpriteTargetByName(${object})`);

            this.source += `if (${objectReference})`;

            switch (property) {
            case 'volume':
                this.source += `runtime.ext_scratch3_sound._updateVolume(${value.asNumber()}, ${objectReference});`;
                break;
            case 'x position':
                // comment
                this.source += `${objectReference}.setXY(${value.asNumber()}, ${objectReference}.y);`;
                break;
            case 'y position':
                this.source += `${objectReference}.setXY(${objectReference}.x, ${value.asNumber()});`;
                break;
            case 'direction':
                this.source += `${objectReference}.setDirection(${value.asNumber()});`;
                break;
            case 'costume':
                const costume = value.type === TYPE_NUMBER 
                    ? value.asNumber() 
                    : value.asString();
                this.source += `runtime.ext_scratch3_looks._setCostume(${objectReference}, ${costume})`;
                break;
            case 'backdrop':
                const backdrop = value.type === TYPE_NUMBER 
                    ? value.asNumber() 
                    : value.asString();
                this.source += `runtime.ext_scratch3_looks._setBackdrop(${objectReference}, ${backdrop});`;
                break;
            case 'size':
                this.source += `${objectReference}.setSize(${value.asNumber()});`;
                break;
            default:
                const variableReference = this.evaluateOnce(`${objectReference} && ${objectReference}.lookupVariableByNameAndType("${sanitize(property)}", "", true)`);
                this.source += `if (${variableReference}) `;
                this.source += `${variableReference}.value = ${value.asString()};`;
                break;
            }
            break;
        }

        case 'tempVars.set': {
            const name = this.descendInput(node.var);
            const val = this.descendInput(node.val);
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            this.source += this.isOptimized  
                ? `${hostObj}[${name.asString()}] = ${val.asUnknown()};` 
                : `set(${hostObj}, ${name.asString()}, ${val.asUnknown()});`; 
            break;
        }
        case 'tempVars.delete': {
            const name = this.descendInput(node.var);
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            this.source += this.isOptimized  
                ? `delete ${hostObj}[${name.asString()}];` 
                : `remove(${hostObj}, ${name.asString()});`;  
            break;
        }
        case 'tempVars.deleteAll': {
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            this.source += `${hostObj} = Object.create(null);`;
            break;
        }
        case 'tempVars.forEach': {
            const name = this.descendInput(node.var);
            const loops = this.descendInput(node.loops);
            const hostObj = node.runtime 
                ? 'runtime.variables' 
                : node.thread 
                    ? 'thread.variables' 
                    : 'tempVars';
            const rootVar = this.localVariables.next(); 
            const keyVar = this.localVariables.next(); 
            const index = this.isOptimized  
                ? `${hostObj}[${name.asString()}]` 
                : `${rootVar}[${keyVar}]`; 
            if (!this.isOptimized)  
                this.source += `const [${rootVar},${keyVar}] = _resolveKeyPath(${hostObj}, ${name.asString()}); `; 
            this.source += `${index} = 0; `;
            this.source += `while (${index} < ${loops.asNumber()}) { `;
            this.source += `${index}++;\n`;
            this.descendStack(node.do, new Frame(true, 'tempVars.forEach'));
            this.yieldLoop();
            this.source += '}\n';
            break;
        }
        case 'control.dualBlock':
            this.source += `console.log("dual block works");`
            break

        default:
            log.warn(`JS: Unknown stacked block: ${node.kind}`, node);
            throw new Error(`JS: Unknown stacked block: ${node.kind}`);
        }
    }

    /**
     * Compile a Record of input objects into a safe JS string.
     * @param {Record<string, unknown>} inputs
     * @returns {string}
     */
    descendInputRecord (inputs) {
        let result = '{';
        for (const name of Object.keys(inputs)) {
            const node = inputs[name];
            result += `"${sanitize(name)}":${this.descendInput(node).asSafe()},`;
        }
        result += '}';
        return result;
    }

    resetVariableInputs () {
        this.variableInputs = {};
    }

    descendStack (nodes, frame) {
        // Entering a stack -- all bets are off.
        // TODO: allow if/else to inherit values
        this.resetVariableInputs();
        frame.assignData(this.currentFrame);
        this.pushFrame(frame);

        for (let i = 0; i < nodes.length; i++) {
            frame.isLastBlock = i === nodes.length - 1;
            this.descendStackedBlock(nodes[i]);
        }

        // Leaving a stack -- any assumptions made in the current stack do not apply outside of it
        // TODO: in if/else this might create an extra unused object
        this.resetVariableInputs();
        this.popFrame();
    }

    descendVariable (variable) {
        if (this.variableInputs.hasOwnProperty(variable.id)) {
            return this.variableInputs[variable.id];
        }
        const input = new VariableInput(`${this.referenceVariable(variable)}.value`);
        this.variableInputs[variable.id] = input;
        return input;
    }

    referenceVariable (variable) {
        if (variable.scope === 'target') {
            return this.evaluateOnce(`target.variables["${sanitize(variable.id)}"]`);
        }
        return this.evaluateOnce(`stage.variables["${sanitize(variable.id)}"]`);
    }

    evaluateOnce (source) {
        if (this._setupVariables.hasOwnProperty(source)) {
            return this._setupVariables[source];
        }
        const variable = this._setupVariablesPool.next();
        this._setupVariables[source] = variable;
        return variable;
    }

    retire () {
        // After running retire() (sets thread status and cleans up some unused data), we need to return to the event loop.
        // When in a procedure, return will only send us back to the previous procedure, so instead we yield back to the sequencer.
        // Outside of a procedure, return will correctly bring us back to the sequencer.
        if (this.isProcedure) {
            this.source += 'retire(); yield;\n';
        } else {
            this.source += 'retire(); return;\n';
        }
    }

    yieldLoop () {
        if (this.warpTimer) {
            this.yieldStuckOrNotWarp();
        } else {
            this.yieldNotWarp();
        }
    }

    /**
     * Write JS to yield the current thread if warp mode is disabled.
     */
    yieldNotWarp () {
        if (!this.isWarp) {
            this.source += 'yield;\n';
            this.yielded();
        }
    }

    /**
     * Write JS to yield the current thread if warp mode is disabled or if the script seems to be stuck.
     */
    yieldStuckOrNotWarp () {
        if (this.isWarp) {
            this.source += 'if (isStuck()) yield;\n';
        } else {
            this.source += 'yield;\n';
        }
        this.yielded();
    }

    yielded () {
        if (!this.script.yields) {
            throw new Error('Script yielded but is not marked as yielding.');
        }
        // Control may have been yielded to another script -- all bets are off.
        this.resetVariableInputs();
    }

    /**
     * Write JS to request a redraw.
     */
    requestRedraw () {
        this.source += 'runtime.requestRedraw();\n';
    }

    safeConstantInput (value) {
        const unsafe = typeof value === 'string' && this.namesOfCostumesAndSounds.has(value);
        return new ConstantInput(value, !unsafe);
    }

    /**
     * Generate a call into the compatibility layer.
     * @param {*} node The "compat" kind node to generate from.
     * @param {boolean} setFlags Whether flags should be set describing how this function was processed.
     * @param {string|null} [frameName] Name of the stack frame variable, if any
     * @param {boolean} visualReport if this is being called to get visual reporter content
     * @returns {string} The JS of the call.
     */
    generateCompatibilityLayerCall (node, setFlags, frameName = null, visualReport) {
        const opcode = node.opcode;

        let result = 'yield* executeInCompatibilityLayer({';

        for (const inputName of Object.keys(node.inputs)) {
            const input = node.inputs[inputName];
            if (inputName.startsWith('substack')) {
                result += `"${sanitize(inputName.toLowerCase())}":(function* () {\n`;
                this.descendStack(input, new Frame(true, opcode));
                result += '}),';
                continue;
            }
            const compiledInput = this.descendInput(input).asSafe();
            result += `"${sanitize(inputName)}":${compiledInput},`;
        }
        for (const fieldName of Object.keys(node.fields)) {
            const field = node.fields[fieldName];
            if (typeof field !== 'string') {
                result += `"${sanitize(fieldName)}":${JSON.stringify(field)},`;
                continue;
            }
            result += `"${sanitize(fieldName)}":"${sanitize(field)}",`;
        }
        result += `"mutation":${JSON.stringify(node.mutation)},`;
        const opcodeFunction = this.evaluateOnce(`runtime.getOpcodeFunction("${sanitize(opcode)}")`);
        result += `}, ${opcodeFunction}, ${this.isWarp}, ${setFlags}, "${sanitize(node.id)}", ${frameName}, ${visualReport})`;

        return result;
    }

    getScriptFactoryName () {
        return factoryNameVariablePool.next();
    }

    getScriptName (yields) {
        let name = yields ? generatorNameVariablePool.next() : functionNameVariablePool.next();
        if (this.isProcedure) {
            const simplifiedProcedureCode = this.script.procedureCode
                .replace(/%[\w]/g, '') // remove arguments
                .replace(/[^a-zA-Z0-9]/g, '_') // remove unsafe
                .substring(0, 20); // keep length reasonable
            name += `_${simplifiedProcedureCode}`;
        }
        return name;
    }

    /**
     * Generate the JS to pass into eval() based on the current state of the compiler.
     * @returns {string} JS to pass into eval()
     */
    createScriptFactory () {
        let script = '';

        // Setup the factory
        script += `(function ${this.getScriptFactoryName()}(thread) { `;
        script += 'let __target = thread.target; ';
        script += 'let target = __target; ';
        script += 'const runtime = __target.runtime; ';
        script += 'const stage = runtime.getTargetForStage();\n';
        for (const varValue of Object.keys(this._setupVariables)) {
            const varName = this._setupVariables[varValue];
            script += `const ${varName} = ${varValue};\n`;
        }

        // Generated script
        script += 'return ';
        if (this.script.yields) {
            script += `function* `;
        } else {
            script += `function `;
        }
        script += this.getScriptName(this.script.yields);
        script += ' (';
        if (this.script.arguments.length) {
            const args = [];
            for (let i = 0; i < this.script.arguments.length; i++) {
                args.push(`p${i}`);
            }
            script += args.join(',');
        }
        script += ') {\n';
        script += 'let tempVars = Object.create(null);';

        // pm: check if we are spoofing the target
        // ex: as (Sprite) {} block needs to replace the target
        // with a different one

        // create new var with target so we can define target as the current one
        script += `let target = __target;\n`;
        script += `if (thread.spoofing) {\n`;
        script += `target = thread.spoofTarget;\n`;
        script += `};\n`;
        script += 'try {\n';

        script += this.source;

        script += '} catch (err) {';
        script += `console.log("${sanitize(script)}");`;
        script += 'console.error(err);';
        script += `runtime.emit("BLOCK_STACK_ERROR", {`;
        script += `id:"${sanitize(this.script.topBlockId)}",`;
        script += `value:String(err)`;
        script += `});`;
        script += '}\n';
        if (!this.isProcedure) {
            script += 'retire();\n';
        }
        script += '}; })';
        return script;
    }

    /**
     * Compile this script.
     * @returns {Function} The factory function for the script.
     */
    compile () {
        if (this.script.stack) {
            this.descendStack(this.script.stack, new Frame(false));
        }

        const factory = this.createScriptFactory();
        const fn = jsexecute.scopedEval(factory);

        if (this.debug) {
            log.info(`JS: ${this.target.getName()}: compiled ${this.script.procedureCode || 'script'}`, factory);
        }

        if (JSGenerator.testingApparatus) {
            JSGenerator.testingApparatus.report(this, factory);
        }

        return fn;
    }
}

// Test hook used by automated snapshot testing.
JSGenerator.testingApparatus = null;

module.exports = JSGenerator;
