const BlockType = require('../../extension-support/block-type');
const BlockShape = require('../../extension-support/block-shape');
const ArgumentType = require('../../extension-support/argument-type');
const ArgumentAlignment = require('../../extension-support/argument-alignment');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const test_indicator = require('./test_indicator.png');

const pathToMedia = 'static/blocks-media';

/**
 * Class for Dev blocks
 * @constructor
 */
class JgDevBlocks {
    constructor(runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
        // register compiled blocks
        this.runtime.registerCompiledExtensionBlocks('jgDev', this.getCompileInfo());
    }

    // util


    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: 'jgDev',
            name: 'Test Extension',
            color1: '#4275f5',
            color2: '#425df5',
            blocks: [
                {
                    opcode: 'stopSound',
                    text: 'stop sound [ID]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        ID: { type: ArgumentType.STRING, defaultValue: "id" }
                    }
                },
                {
                    opcode: 'starttimeSound',
                    text: 'start sound [ID] at seconds [SEX]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        ID: { type: ArgumentType.SOUND, defaultValue: "name or index" },
                        SEX: { type: ArgumentType.NUMBER, defaultValue: 0 }
                    }
                },
                {
                    opcode: 'transitionSound',
                    text: 'set sound [ID] volume transition to seconds [SEX]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        ID: { type: ArgumentType.SOUND, defaultValue: "sound to set fade out effect on" },
                        SEX: { type: ArgumentType.NUMBER, defaultValue: 1 }
                    }
                },
                {
                    opcode: 'logArgs1',
                    text: 'costume input [INPUT] sound input [INPUT2]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        INPUT: { type: ArgumentType.COSTUME },
                        INPUT2: { type: ArgumentType.SOUND }
                    }
                },
                {
                    opcode: 'logArgs2',
                    text: 'variable input [INPUT] list input [INPUT2]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        INPUT: { type: ArgumentType.VARIABLE },
                        INPUT2: { type: ArgumentType.LIST }
                    }
                },
                {
                    opcode: 'logArgs3',
                    text: 'broadcast input [INPUT]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        INPUT: { type: ArgumentType.BROADCAST }
                    }
                },
                {
                    opcode: 'logArgs4',
                    text: 'color input [INPUT]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        INPUT: { type: ArgumentType.COLOR }
                    }
                },
                {
                    opcode: 'setEffectName',
                    text: 'set [EFFECT] to [VALUE]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        EFFECT: { type: ArgumentType.STRING, defaultValue: "color" },
                        VALUE: { type: ArgumentType.NUMBER, defaultValue: 0 }
                    }
                },
                {
                    opcode: 'setBlurEffect',
                    text: 'set blur [PX]px',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PX: { type: ArgumentType.NUMBER, defaultValue: 0 }
                    }
                },
                {
                    opcode: 'restartFromTheTop',
                    text: 'restart from the top [ICON]',
                    blockType: BlockType.COMMAND,
                    isTerminal: true,
                    arguments: {
                        ICON: {
                            type: ArgumentType.IMAGE,
                            dataURI: pathToMedia + "/repeat.svg"
                        }
                    }
                },
                {
                    opcode: 'doodooBlockLolol',
                    text: 'ignore blocks inside [INPUT]',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL,
                    arguments: {
                        INPUT: { type: ArgumentType.BOOLEAN }
                    }
                },
                {
                    opcode: 'ifFalse',
                    text: 'if [INPUT] is false',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL,
                    arguments: {
                        INPUT: { type: ArgumentType.BOOLEAN }
                    }
                },
                {
                    opcode: 'multiplyTest',
                    text: 'multiply [VAR] by [MULT] then',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL,
                    arguments: {
                        VAR: { type: ArgumentType.STRING, menu: "variable" },
                        MULT: { type: ArgumentType.NUMBER, defaultValue: 4 }
                    }
                },
                {
                    opcode: 'compiledIfNot',
                    text: 'if not [CONDITION] then (compiled)',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL,
                    arguments: {
                        CONDITION: { type: ArgumentType.BOOLEAN }
                    }
                },
                {
                    opcode: 'compiledReturn',
                    text: 'return [RETURN]',
                    blockType: BlockType.COMMAND,
                    isTerminal: true,
                    arguments: {
                        RETURN: { type: ArgumentType.STRING, defaultValue: '1' }
                    }
                },
                {
                    opcode: 'compiledOutput',
                    text: 'compiled code',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true
                },
                {
                    opcode: 'branchNewThread',
                    text: 'new thread',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL
                },
                {
                    opcode: 'whatthescallop',
                    text: 'bruh [numtypeableDropdown] [typeableDropdown] overriden: [overridennumtypeableDropdown] [overridentypeableDropdown]',
                    arguments: {
                        numtypeableDropdown: {
                            menu: 'numericTypeableTest'
                        },
                        typeableDropdown: {
                            menu: 'typeableTest'
                        },
                        overridennumtypeableDropdown: {
                            menu: 'numericTypeableTest',
                            defaultValue: 5
                        },
                        overridentypeableDropdown: {
                            menu: 'typeableTest',
                            defaultValue: 'your mom'
                        }
                    },
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'booleanMonitor',
                    text: 'boolean monitor',
                    blockType: BlockType.BOOLEAN
                },
                {
                    opcode: 'ifFalseReturned',
                    text: 'if [INPUT] is false (return)',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL,
                    arguments: {
                        INPUT: { type: ArgumentType.BOOLEAN }
                    }
                },
                {
                    opcode: 'turbrowaorploop',
                    blockType: BlockType.LOOP,
                    text: 'my repeat [TIMES]',
                    arguments: {
                        TIMES: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'alignmentTestate',
                    blockType: BlockType.CONDITIONAL,
                    text: [
                        'this block tests alignments',
                        'left',
                        'middle',
                        'right'
                    ],
                    alignments: [
                        null,
                        null,
                        ArgumentAlignment.LEFT,
                        null,
                        ArgumentAlignment.CENTER,
                        null,
                        ArgumentAlignment.RIGHT
                    ],
                    branchCount: 3
                },
                {
                    opcode: 'squareReporter',
                    text: 'square boy',
                    blockType: BlockType.REPORTER,
                    blockShape: BlockShape.SQUARE
                },
                {
                    opcode: 'branchIndicatorTest',
                    text: 'this has a custom branchIndicator',
                    branchCount: 1,
                    blockType: BlockType.CONDITIONAL,
                    branchIndicator: test_indicator
                },
                {
                    opcode: 'givesAnError',
                    text: 'throw an error',
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'hiddenBoolean',
                    text: 'im actually a boolean output',
                    blockType: BlockType.REPORTER,
                    forceOutputType: 'Boolean',
                    disableMonitor: true
                },
                {
                    opcode: 'varvarvavvarvarvar',
                    text: 'varibles!?!?!??!?!?!?!?!!!?!?! [variable]',
                    arguments: {
                        variable: {
                            menu: 'variableInternal'
                        }
                    },
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'green',
                    text: 'im literally just green',
                    blockType: BlockType.REPORTER,
                    color1: '#00ff00',
                    color2: '#000000',
                    color3: '#000000',
                    disableMonitor: true
                },
                {
                    opcode: 'duplicato',
                    text: 'duplicato',
                    blockType: BlockType.REPORTER,
                    canDragDuplicate: true,
                    disableMonitor: true,
                    hideFromPalette: true
                },
                {
                    opcode: 'theheheuoihew9h9',
                    blockType: BlockType.COMMAND,
                    text: 'This block will appear in the penguinmod wiki [SEP] [DUPLIC]',
                    arguments: {
                        SEP: {
                            type: ArgumentType.SEPERATOR,
                        },
                        DUPLIC: {
                            type: ArgumentType.STRING,
                            fillIn: 'duplicato',
                        }
                    }
                },
            ],
            menus: {
                variableInternal: {
                    variableType: 'scalar'
                },
                variable: "getVariablesMenu",
                numericTypeableTest: {
                    items: [
                        'item1',
                        'item2',
                        'item3'
                    ],
                    isTypeable: true,
                    isNumeric: true
                },
                typeableTest: {
                    items: [
                        'item1',
                        'item2',
                        'item3'
                    ],
                    isTypeable: true,
                    isNumeric: false
                }
            }
        };
    }
    /**
     * This function is used for any compiled blocks in the extension if they exist.
     * Data in this function is given to the IR & JS generators.
     * Data must be valid otherwise errors may occur.
     * @returns {object} functions that create data for compiled blocks.
     */
    getCompileInfo() {
        return {
            ir: {
                compiledIfNot: (generator, block) => ({
                    kind: 'stack', /* this gets replaced but we still need to say what type of block this is */
                    condition: generator.descendInputOfBlock(block, 'CONDITION'),
                    whenTrue: generator.descendSubstack(block, 'SUBSTACK'),
                    whenFalse: []
                }),
                compiledReturn: (generator, block) => ({
                    kind: 'stack',
                    return: generator.descendInputOfBlock(block, 'RETURN')
                }),
                restartFromTheTop: () => ({
                    kind: 'stack'
                }),
                compiledOutput: () => ({
                    kind: 'input' /* input is output :troll: (it makes sense in the ir & jsgen implementation ok) */
                })
            },
            js: {
                compiledIfNot: (node, compiler, imports) => {
                    compiler.source += `if (!(${compiler.descendInput(node.condition).asBoolean()})) {\n`;
                    compiler.descendStack(node.whenTrue, new imports.Frame(false));
                    // only add the else branch if it won't be empty
                    // this makes scripts have a bit less useless noise in them
                    if (node.whenFalse.length) {
                        compiler.source += `} else {\n`;
                        compiler.descendStack(node.whenFalse, new imports.Frame(false));
                    }
                    compiler.source += `}\n`;
                },
                compiledReturn: (node, compiler) => {
                    compiler.source += `return ${compiler.descendInput(node.return).asString()};`;
                },
                restartFromTheTop: (_, compiler) => {
                    compiler.source += `runtime._restartThread(thread);`;
                    compiler.source += `return;`;
                },
                compiledOutput: (_, compiler, imports) => {
                    const code = Cast.toString(compiler.source);
                    return new imports.TypedInput(JSON.stringify(code), imports.TYPE_STRING);
                }
            }
        };
    }

    varvarvavvarvarvar(args) {
        return JSON.stringify(args);
    }

    // menu
    getVariablesMenu() {
        // menus can only be opened in the editor so use editingTarget
        const target = vm.editingTarget;
        const emptyMenu = [{ text: "", value: "" }];
        if (!target) return emptyMenu;
        if (!target.variables) return emptyMenu;
        const menu = Object.getOwnPropertyNames(target.variables).map(variableId => {
            const variable = target.variables[variableId];
            return {
                text: variable.name,
                value: variable.name
            };
        });
        // check if menu has 0 items because pm throws an error if theres no items
        return (menu.length > 0) ? menu : emptyMenu;
    }

    branchIndicatorTest() {
        return; // dude logs wont shut up because i didnt define this func
    }

    // util
    _getSoundIndex(soundName, util) {
        // if the sprite has no sounds, return -1
        const len = util.target.sprite.sounds.length;
        if (len === 0) {
            return -1;
        }

        // look up by name first
        const index = this._getSoundIndexByName(soundName, util);
        if (index !== -1) {
            return index;
        }

        // then try using the sound name as a 1-indexed index
        const oneIndexedIndex = parseInt(soundName, 10);
        if (!isNaN(oneIndexedIndex)) {
            return MathUtil.wrapClamp(oneIndexedIndex - 1, 0, len - 1);
        }

        // could not be found as a name or converted to index, return -1
        return -1;
    }


    _getSoundIndexByName(soundName, util) {
        const sounds = util.target.sprite.sounds;
        for (let i = 0; i < sounds.length; i++) {
            if (sounds[i].name === soundName) {
                return i;
            }
        }
        // if there is no sound by that name, return -1
        return -1;
    }

    // blocks

    branchNewThread(_, util) {
        // CubesterYT probably
        if (util.thread.target.blocks.getBranch(util.thread.peekStack(), 0)) {
            util.sequencer.runtime._pushThread(
                util.thread.target.blocks.getBranch(util.thread.peekStack(), 0),
                util.target,
                {}
            );
        }
    }

    booleanMonitor() {
        return Math.round(Math.random()) == 1;
    }

    stopSound(args, util) {
        const target = util.target;
        const sprite = target.sprite;
        if (!sprite) return;

        const soundBank = sprite.soundBank;
        if (!soundBank) return;

        const id = Cast.toString(args.ID);
        soundBank.stop(target, id);
    }
    starttimeSound(args, util) {
        const id = Cast.toString(args.ID);
        const index = this._getSoundIndex(id, util);
        if (index < 0) return;

        const target = util.target;
        const sprite = target.sprite;
        if (!sprite) return;
        if (!sprite.sounds) return;

        const { soundId } = sprite.sounds[index];

        const soundBank = sprite.soundBank;
        if (!soundBank) return;

        soundBank.playSound(target, soundId, Cast.toNumber(args.SEX));
    }
    transitionSound(args, util) {
        const id = Cast.toString(args.ID);
        const index = this._getSoundIndex(id, util);
        if (index < 0) return;

        const target = util.target;
        const sprite = target.sprite;
        if (!sprite) return;
        if (!sprite.sounds) return;

        const { soundId } = sprite.sounds[index];

        const soundBank = sprite.soundBank;
        if (!soundBank) return;

        soundBank.soundPlayers[soundId].stopFadeDecay = Cast.toNumber(args.SEX);
    }

    green() {
        return 'g';
    }

    logArgs1(args) {
        console.log(args);
        return JSON.stringify(args);
    }
    logArgs2(args) {
        console.log(args);
        return JSON.stringify(args);
    }
    logArgs3(args) {
        console.log(args);
        return JSON.stringify(args);
    }
    logArgs4(args) {
        console.log(args);
        return JSON.stringify(args);
    }

    setEffectName(args, util) {
        const PX = Cast.toNumber(args.VALUE);
        util.target.setEffect(args.EFFECT, PX);
    }
    setBlurEffect(args, util) {
        const PX = Cast.toNumber(args.PX);
        util.target.setEffect("blur", PX);
    }

    doodooBlockLolol(args, util) {
        if (args.INPUT === true) return;
        console.log(args, util);
        util.startBranch(1, false);
        console.log(util.target.getCurrentCostume());
    }

    ifFalse(args, util) {
        console.log(args, util);
        if (!args.INPUT) {
            util.startBranch(1, false);
        }
    }
    ifFalseReturned(args) {
        if (!args.INPUT) {
            return 1;
        }
    }
    turbrowaorploop ({TIMES}, util) {
        const times = Math.round(Cast.toNumber(TIMES));
        if (typeof util.stackFrame.loopCounter === 'undefined') {
            util.stackFrame.loopCounter = times;
        }
        util.stackFrame.loopCounter--;
        if (util.stackFrame.loopCounter >= 0) {
            return true;
        }
    }
    // compiled blocks should have interpreter versions
    compiledIfNot(args, util) {
        const condition = Cast.toBoolean(args.CONDITION);
        if (!condition) {
            util.startBranch(1, false);
        }
    }
    compiledReturn() {
        return 'noop';
    }
    restartFromTheTop() {
        return 'noop';
    }
    compiledOutput() {
        return '<unavailable without compiler>';
    }

    hiddenBoolean() {
        return true;
    }

    multiplyTest(args, util) {
        const target = util.target;
        Object.getOwnPropertyNames(target.variables).forEach(variableId => {
            const variable = target.variables[variableId];
            if (variable.name !== Cast.toString(args.VAR)) return;
            console.log(variable);
            if (typeof variable.value !== 'number') {
                variable.value = 0;
            }
            variable.value *= Cast.toNumber(args.MULT);
        });
    }

    whatthescallop(args) {
        return JSON.stringify(args);
    }

    squareReporter() {
        return 0;
    }
    alignmentTestate() {
        return;
    }
    givesAnError() {
        throw new Error('woah an error');
    }
}

module.exports = JgDevBlocks;
