const MathUtil = require('../util/math-util');
const StringUtil = require('../util/string-util');
const Cast = require('../util/cast');
const Clone = require('../util/clone');
const { translateForCamera } = require('../util/pos-math');
const Target = require('../engine/target');
const StageLayering = require('../engine/stage-layering');

/**
 * Rendered target: instance of a sprite (clone), or the stage.
 */
class RenderedTarget extends Target {
    /**
     * @param {!Sprite} sprite Reference to the parent sprite.
     * @param {Runtime} runtime Reference to the runtime.
     * @constructor
     */
    constructor (sprite, runtime) {
        super(runtime, sprite.blocks);

        /**
         * Reference to the sprite that this is a render of.
         * @type {!Sprite}
         */
        this.sprite = sprite;
        /**
         * Reference to the global renderer for this VM, if one exists.
         * @type {?RenderWebGL}
         */
        this.renderer = null;
        if (this.runtime) {
            this.renderer = this.runtime.renderer;
        }
        /**
         * ID of the drawable for this rendered target,
         * returned by the renderer, if rendered.
         * @type {?Number}
         */
        this.drawableID = null;

        /**
         * Drag state of this rendered target. If true, x/y position can't be
         * changed by blocks.
         * @type {boolean}
         */
        this.dragging = false;

        /**
         * Map of current graphic effect values.
         * @type {!Object.<string, number>}
         */
        this.effects = {
            color: 0,
            fisheye: 0,
            whirl: 0,
            pixelate: 0,
            mosaic: 0,
            brightness: 0,
            ghost: 0,
            red: 0,
            green: 0,
            blue: 0,
            opaque: 0,
            saturation: 0,
            // we add 1 since 0x000000 = 0, effects set to 0 will not even be enabled in the shader 
            // (so we can never tint to black if we didnt add 1)
            tintColor: 0xffffff + 1 
        };

        /**
         * Whether this represents an "original" non-clone rendered-target for a sprite,
         * i.e., created by the editor and not clone blocks.
         * @type {boolean}
         */
        this.isOriginal = true;

        /**
         * Whether this rendered target represents the Scratch stage.
         * @type {boolean}
         */
        this.isStage = false;

        /**
         * Whether this rendered target has been disposed.
         * @type {boolean}
         */
        this.isDisposed = false;

        /**
         * Scratch X coordinate. Currently should range from -240 to 240.
         * @type {Number}
         */
        this.x = 0;

        /**
         * Scratch Y coordinate. Currently should range from -180 to 180.
         * @type {number}
         */
        this.y = 0;

        /**
         * the transform for this sprite.
         * @type {Array}
         */
        this.transform = [0, 0];

        /**
         * Scratch direction. Currently should range from -179 to 180.
         * @type {number}
         */
        this.direction = 90;

        /**
         * Whether the rendered target is draggable on the stage
         * @type {boolean}
         */
        this.draggable = false;

        /**
         * Whether the rendered target is currently visible.
         * @type {boolean}
         */
        this.visible = true;

        /**
         * Size of rendered target as a percent of costume size.
         * @type {number}
         */
        this.size = 100;

        /**
         * The stretch percent on each axis
         * @type {array}
         */
        this.stretch = [100, 100];

        /**
         * Currently selected costume index.
         * @type {number}
         */
        this.currentCostume = 0;

        /**
         * Current rotation style.
         * @type {!string}
         */
        this.rotationStyle = RenderedTarget.ROTATION_STYLE_ALL_AROUND;

        /**
         * Loudness for sound playback for this target, as a percentage.
         * @type {number}
         */
        this.volume = 100;

        /**
         * Current tempo (used by the music extension).
         * This property is global to the project and stored in the stage.
         * @type {number}
         */
        this.tempo = 60;

        /**
         * The transparency of the video (used by extensions with camera input).
         * This property is global to the project and stored in the stage.
         * @type {number}
         */
        this.videoTransparency = 50;

        /**
         * The state of the video input (used by extensions with camera input).
         * This property is global to the project and stored in the stage.
         *
         * Defaults to ON. This setting does not turn the video by itself. A
         * video extension once loaded will set the video device to this
         * setting. Set to ON when a video extension is added in the editor the
         * video will start ON. If the extension is loaded as part of loading a
         * saved project the extension will see the value set when the stage
         * was loaded from the saved values including the video state.
         *
         * @type {string}
         */
        this.videoState = RenderedTarget.VIDEO_STATE.ON;

        /**
         * The language to use for speech synthesis, in the text2speech extension.
         * It is initialized to null so that on extension load, we can check for
         * this and try setting it using the editor locale.
         * @type {string}
         */
        this.textToSpeechLanguage = null;

        // Node-style event emitters have non-zero performance overhead compared to function calls, so we
        // replace some very high frequency events with these specific methods that are overridden elsewhere.
        this.onTargetMoved = null;
        this.onTargetVisualChange = null;

        this.interpolationData = null;

        this.cameraBound = 'default';
    }
    cameraUpdateEvent() {
        const {direction, scale} = this._getRenderedDirectionAndScale();
        const translatedPos = this._translatePossitionToCamera();
        this.renderer.updateDrawablePosition(this.drawableID, translatedPos);
        this.renderer.updateDrawableDirectionScale(this.drawableID, direction, scale, this.transform);
        this.renderer.updateDrawableVisible(this.drawableID, this.visible);
    }

    /**
     * Create a drawable with the this.renderer.
     * @param {boolean} layerGroup The layer group this drawable should be added to
     */
    initDrawable (layerGroup) {
        if (this.renderer) {
            this.drawableID = this.renderer.createDrawable(layerGroup);
        }
        // If we're a clone, start the hats.
        if (!this.isOriginal) {
            this.runtime.startHats(
                'control_start_as_clone', null, this
            );
        }
    }

    get audioPlayer () {
        /* eslint-disable no-console */
        console.warn('get audioPlayer deprecated, please update to use .sprite.soundBank methods');
        console.warn(new Error('stack for debug').stack);
        /* eslint-enable no-console */
        const bank = this.sprite.soundBank;
        const audioPlayerProxy = {
            playSound: soundId => bank.play(this, soundId)
        };

        Object.defineProperty(this, 'audioPlayer', {
            configurable: false,
            enumerable: true,
            writable: false,
            value: audioPlayerProxy
        });

        return audioPlayerProxy;
    }

    /**
     * Initialize the audio player for this sprite or clone.
     */
    initAudio () {
    }

    /**
     * Rotation style for "all around"/spinning.
     * @type {string}
     */
    static get ROTATION_STYLE_ALL_AROUND () {
        return 'all around';
    }

    /**
     * pm: Rotation style for "look at"/flipping & spinning.
     * @type {string}
     */
    static get ROTATION_STYLE_LOOK_AT () {
        return 'look at';
    }

    /**
     * Rotation style for "left-right"/flipping.
     * @type {string}
     */
    static get ROTATION_STYLE_LEFT_RIGHT () {
        return 'left-right';
    }

    /**
     * pm: Rotation style for "up-down"/flipping.
     * @type {string}
     */
    static get ROTATION_STYLE_UP_DOWN () {
        return 'up-down';
    }

    /**
     * Rotation style for "no rotation."
     * @type {string}
     */
    static get ROTATION_STYLE_NONE () {
        return "don't rotate";
    }

    /**
     * Available states for video input.
     * @enum {string}
     */
    static get VIDEO_STATE () {
        return {
            OFF: 'off',
            ON: 'on',
            ON_FLIPPED: 'on-flipped'
        };
    }

    emitVisualChange () {
        if (this.onTargetVisualChange) {
            this.onTargetVisualChange(this);
        }
    }

    bindToCamera(screen) {
        this.cameraBound = screen;
        this.updateAllDrawableProperties();
    }

    removeCameraBinding() {
        this.cameraBound = null;
        this.updateAllDrawableProperties();
    }

    _translatePossitionToCamera() {
        if (!this.cameraBound) return [this.x, this.y];
        return translateForCamera(this.runtime, this.cameraBound, this.x, this.y);
    }

    /**
     * Set the X and Y coordinates.
     * @param {!number} x New X coordinate, in Scratch coordinates.
     * @param {!number} y New Y coordinate, in Scratch coordinates.
     * @param {?boolean} force Force setting X/Y, in case of dragging
     * @param {?boolean} ignoreFencing ignores fencing
     */
    setXY (x, y, force, ignoreFencing) { // used by compiler
        if (this.isStage) return;
        if (this.dragging && !force) return;
        const oldX = this.x;
        const oldY = this.y;
        if (this.renderer) {
            const position = this.runtime.runtimeOptions.fencing && !ignoreFencing ?
                this.renderer.getFencedPositionOfDrawable(this.drawableID, [x, y]) :
                [x, y];
            this.x = position[0];
            this.y = position[1];

            this.renderer.updateDrawablePosition(this.drawableID, this._translatePossitionToCamera());
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        } else {
            this.x = x;
            this.y = y;
        }
        if (this.onTargetMoved) {
            this.onTargetMoved(this, oldX, oldY, force);
        }
        this.runtime.requestTargetsUpdate(this);
    }

    setTransform (transform) {
        if (!Array.isArray(transform) || transform.length !== 2) 
            throw new TypeError('Expected an Array of length 2 for the transform input');
        if (this.isStage) {
            return;
        }
        this.transform = [transform[0], transform[1]];
        if (this.renderer) {
            const {direction: renderedDirection, scale} = this._getRenderedDirectionAndScale();
            this.renderer.updateDrawableDirectionScale(this.drawableID, renderedDirection, scale, this.transform);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Get the rendered direction and scale, after applying rotation style.
     * @return {object<string, number>} Direction and scale to render.
     */
    _getRenderedDirectionAndScale () {
        const cameraState = this.runtime.getCamera(this.cameraBound);
        // Default: no changes to `this.direction` or `this.scale`.
        let finalDirection = this.direction;
        let finalScale = [this.size, this.size];
        if (this.rotationStyle === RenderedTarget.ROTATION_STYLE_NONE) {
            // Force rendered direction to be 90.
            finalDirection = 90;
        } else if (this.rotationStyle === RenderedTarget.ROTATION_STYLE_LEFT_RIGHT) {
            // Force rendered direction to be 90, and flip drawable if needed.
            finalDirection = 90;
            const scaleFlip = (this.direction < 0) ? -1 : 1;
            finalScale = [scaleFlip * this.size, this.size];
        } else if (this.rotationStyle === RenderedTarget.ROTATION_STYLE_UP_DOWN) {
            // pm: Force rendered direction to be 90, and flip drawable if needed.
            finalDirection = 90;
            const scaleFlip = ((this.direction > 90) || (this.direction < -90)) ? -1 : 1;
            finalScale = [this.size, scaleFlip * this.size];
        } else if (this.rotationStyle === RenderedTarget.ROTATION_STYLE_LOOK_AT) {
            // pm: Flip drawable if we are looking left.
            const scaleFlip = (this.direction < 0) ? -1 : 1;
            finalScale = [this.size, scaleFlip * this.size];
        }
        finalScale[0] *= this.stretch[0] / 100;
        finalScale[1] *= this.stretch[1] / 100;

        if (this.cameraBound) {
            finalScale[0] *= cameraState.scale;
            finalScale[1] *= cameraState.scale;
            finalDirection -= cameraState.dir;
        }
        return {direction: finalDirection, scale: finalScale, stretch: this.stretch};
    }

    /**
     * set the stretch of this sprite
     * @param {number} x the stretch percentage on the x axis
     * @param {number} y the stretch percentage on the y axis
     */
    setStretch (x, y) {
        if (this.isStage) {
            return;
        }

        this.stretch = [x, y];
        if (this.renderer) {
            const {direction: renderedDirection, scale} = this._getRenderedDirectionAndScale();
            this.renderer.updateDrawableDirectionScale(this.drawableID, renderedDirection, scale, this.transform);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Set the direction.
     * @param {!number} direction New direction.
     */
    setDirection (direction) { // used by compiler
        if (this.isStage) {
            return;
        }
        if (!isFinite(direction)) {
            return;
        }
        // Keep direction between -179 and +180.
        this.direction = MathUtil.wrapClamp(direction, -179, 180);
        if (this.renderer) {
            const {direction: renderedDirection, scale} = this._getRenderedDirectionAndScale();
            this.renderer.updateDrawableDirectionScale(this.drawableID, renderedDirection, scale, this.transform);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Set draggability; i.e., whether it's able to be dragged in the player
     * @param {!boolean} draggable True if should be draggable.
     */
    setDraggable (draggable) {
        if (this.isStage) return;
        this.draggable = !!draggable;
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Set visibility; i.e., whether it's shown or hidden.
     * @param {!boolean} visible True if should be shown.
     */
    setVisible (visible) { // used by compiler
        if (this.isStage) {
            return;
        }
        this.visible = !!visible;
        if (this.renderer) {
            this.renderer.updateDrawableVisible(this.drawableID, this.visible);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Set size, as a percentage of the costume size.
     * @param {!number} size Size of rendered target, as % of costume size.
     */
    setSize (size) { // used by compiler
        if (this.isStage) {
            return;
        }
        if (this.renderer) {
            this.size = Math.max(0, size);
            const {direction, scale} = this._getRenderedDirectionAndScale();
            this.renderer.updateDrawableDirectionScale(this.drawableID, direction, scale, this.transform);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        } else {
            // tw: setSize should update size even without a renderer
            // needed by tw-change-size-does-not-use-rounded-size.sb3 test
            this.size = size;
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Set a particular graphic effect value.
     * @param {!string} effectName Name of effect (see `RenderedTarget.prototype.effects`).
     * @param {!number} value Numerical magnitude of effect.
     */
    setEffect (effectName, value) { // used by compiler
        if (!this.effects.hasOwnProperty(effectName)) return;
        this.effects[effectName] = value;
        if (this.renderer) {
            this.renderer.updateDrawableEffect(this.drawableID, effectName, value);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
    }

    /**
     * Clear all graphic effects on this rendered target.
     */
    clearEffects () { // used by compiler
        for (const effectName in this.effects) {
            if (!this.effects.hasOwnProperty(effectName)) continue;
            this.effects[effectName] = 0;
        }
        if (this.renderer) {
            for (const effectName in this.effects) {
                if (!this.effects.hasOwnProperty(effectName)) continue;
                this.renderer.updateDrawableEffect(this.drawableID, effectName, 0);
            }
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
    }

    /**
     * Set the current costume.
     * @param {number} index New index of costume.
     */
    setCostume (index) {
        // Keep the costume index within possible values.
        index = Math.round(index);
        if (index === Infinity || index === -Infinity || !index) {
            index = 0;
        }

        this.currentCostume = MathUtil.wrapClamp(
            index, 0, this.sprite.costumes.length - 1
        );
        if (this.renderer) {
            const costume = this.sprite.costumes[this.currentCostume];
            this.renderer.updateDrawableSkinId(this.drawableID, costume.skinId);

            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Add a costume, taking care to avoid duplicate names.
     * @param {!object} costumeObject Object representing the costume.
     * @param {?int} index Index at which to add costume
     */
    addCostume (costumeObject, index) {
        if (typeof index === 'number' && !isNaN(index)) {
            this.sprite.addCostumeAt(costumeObject, index);
        } else {
            this.sprite.addCostumeAt(costumeObject, this.sprite.costumes.length);
        }
    }

    /**
     * Rename a costume, taking care to avoid duplicate names.
     * @param {int} costumeIndex - the index of the costume to be renamed.
     * @param {string} newName - the desired new name of the costume (will be modified if already in use).
     */
    renameCostume (costumeIndex, newName) {
        const usedNames = this.sprite.costumes
            .filter((costume, index) => costumeIndex !== index)
            .map(costume => costume.name);
        const oldName = this.getCostumes()[costumeIndex].name;
        const newUnusedName = StringUtil.unusedName(newName, usedNames);
        this.getCostumes()[costumeIndex].name = newUnusedName;

        if (this.isStage) {
            // Since this is a backdrop, go through all targets and
            // update any blocks referencing the old backdrop name
            const targets = this.runtime.targets;
            for (let i = 0; i < targets.length; i++) {
                const currTarget = targets[i];
                currTarget.blocks.updateAssetName(oldName, newUnusedName, 'backdrop');
            }
        } else {
            this.blocks.updateAssetName(oldName, newUnusedName, 'costume');
        }

    }

    /**
     * Delete a costume by index.
     * @param {number} index Costume index to be deleted
     * @return {?object} The costume that was deleted or null
     * if the index was out of bounds of the costumes list or
     * this target only has one costume.
     */
    deleteCostume (index) {
        const originalCostumeCount = this.sprite.costumes.length;
        if (originalCostumeCount === 1) return null;

        if (index < 0 || index >= originalCostumeCount) {
            return null;
        }

        const deletedCostume = this.sprite.deleteCostumeAt(index);

        if (index === this.currentCostume && index === originalCostumeCount - 1) {
            this.setCostume(index - 1);
        } else if (index < this.currentCostume) {
            this.setCostume(this.currentCostume - 1);
        } else {
            this.setCostume(this.currentCostume);
        }

        this.runtime.requestTargetsUpdate(this);
        return deletedCostume;
    }

    /**
     * Add a sound, taking care to avoid duplicate names.
     * @param {!object} soundObject Object representing the sound.
     * @param {?int} index Index at which to add costume
     */
    addSound (soundObject, index) {
        const usedNames = this.sprite.sounds.map(sound => sound.name);
        soundObject.name = StringUtil.unusedName(soundObject.name, usedNames);
        if (typeof index === 'number' && !isNaN(index)) {
            this.sprite.sounds.splice(index, 0, soundObject);
        } else {
            this.sprite.sounds.push(soundObject);
        }
    }

    /**
     * Rename a sound, taking care to avoid duplicate names.
     * @param {int} soundIndex - the index of the sound to be renamed.
     * @param {string} newName - the desired new name of the sound (will be modified if already in use).
     */
    renameSound (soundIndex, newName) {
        const usedNames = this.sprite.sounds
            .filter((sound, index) => soundIndex !== index)
            .map(sound => sound.name);
        const oldName = this.sprite.sounds[soundIndex].name;
        const newUnusedName = StringUtil.unusedName(newName, usedNames);
        this.sprite.sounds[soundIndex].name = newUnusedName;
        this.blocks.updateAssetName(oldName, newUnusedName, 'sound');
    }

    /**
     * Delete a sound by index.
     * @param {number} index Sound index to be deleted
     * @return {object} The deleted sound object, or null if no sound was deleted.
     */
    deleteSound (index) {
        // Make sure the sound index is not out of bounds
        if (index < 0 || index >= this.sprite.sounds.length) {
            return null;
        }
        // Delete the sound at the given index
        const deletedSound = this.sprite.sounds.splice(index, 1)[0];
        this.runtime.requestTargetsUpdate(this);
        return deletedSound;
    }

    /**
     * Update the rotation style.
     * @param {!string} rotationStyle New rotation style.
     */
    setRotationStyle (rotationStyle) { // used by compiler
        if (rotationStyle === RenderedTarget.ROTATION_STYLE_NONE) {
            this.rotationStyle = RenderedTarget.ROTATION_STYLE_NONE;
        } else if (rotationStyle === RenderedTarget.ROTATION_STYLE_ALL_AROUND) {
            this.rotationStyle = RenderedTarget.ROTATION_STYLE_ALL_AROUND;
        } else if (rotationStyle === RenderedTarget.ROTATION_STYLE_LEFT_RIGHT) {
            this.rotationStyle = RenderedTarget.ROTATION_STYLE_LEFT_RIGHT;
        } else if (rotationStyle === RenderedTarget.ROTATION_STYLE_UP_DOWN) {
            this.rotationStyle = RenderedTarget.ROTATION_STYLE_UP_DOWN;
        } else if (rotationStyle === RenderedTarget.ROTATION_STYLE_LOOK_AT) {
            this.rotationStyle = RenderedTarget.ROTATION_STYLE_LOOK_AT;
        }
        if (this.renderer) {
            const {direction, scale} = this._getRenderedDirectionAndScale();
            this.renderer.updateDrawableDirectionScale(this.drawableID, direction, scale, this.transform);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Get a costume index of this rendered target, by name of the costume.
     * @param {?string} costumeName Name of a costume.
     * @return {number} Index of the named costume, or -1 if not present.
     */
    getCostumeIndexByName (costumeName) {
        const costumes = this.getCostumes();
        for (let i = 0; i < costumes.length; i++) {
            if (costumes[i].name === costumeName) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Get a costume of this rendered target by id.
     * @return {object} current costume
     */
    getCurrentCostume () {
        return this.getCostumes()[this.currentCostume];
    }

    /**
     * Get full costume list
     * @return {object[]} list of costumes
     */
    getCostumes () { // used by compiler
        return this.sprite.costumes;
    }

    /**
     * Reorder costume list by moving costume at costumeIndex to newIndex.
     * @param {!number} costumeIndex Index of the costume to move.
     * @param {!number} newIndex New index for that costume.
     * @returns {boolean} If a change occurred (i.e. if the indices do not match)
     */
    reorderCostume (costumeIndex, newIndex) {
        newIndex = MathUtil.clamp(newIndex, 0, this.sprite.costumes.length - 1);
        costumeIndex = MathUtil.clamp(costumeIndex, 0, this.sprite.costumes.length - 1);

        if (newIndex === costumeIndex) return false;

        const currentCostume = this.getCurrentCostume();
        const costume = this.sprite.costumes[costumeIndex];

        // Use the sprite method for deleting costumes because setCostume is handled manually
        this.sprite.deleteCostumeAt(costumeIndex);

        this.addCostume(costume, newIndex);
        this.currentCostume = this.getCostumeIndexByName(currentCostume.name);
        return true;
    }

    /**
     * Reorder sound list by moving sound at soundIndex to newIndex.
     * @param {!number} soundIndex Index of the sound to move.
     * @param {!number} newIndex New index for that sound.
     * @returns {boolean} If a change occurred (i.e. if the indices do not match)
     */
    reorderSound (soundIndex, newIndex) {
        newIndex = MathUtil.clamp(newIndex, 0, this.sprite.sounds.length - 1);
        soundIndex = MathUtil.clamp(soundIndex, 0, this.sprite.sounds.length - 1);

        if (newIndex === soundIndex) return false;

        const sound = this.sprite.sounds[soundIndex];
        this.deleteSound(soundIndex);
        this.addSound(sound, newIndex);
        return true;
    }

    /**
     * Get full sound list
     * @return {object[]} list of sounds
     */
    getSounds () {
        return this.sprite.sounds;
    }

    /**
     * Update all drawable properties for this rendered target.
     * Use when a batch has changed, e.g., when the drawable is first created.
     */
    updateAllDrawableProperties () {
        if (this.renderer) {
            const {direction, scale} = this._getRenderedDirectionAndScale();
            const translatedPos = this._translatePossitionToCamera();
            this.renderer.updateDrawablePosition(this.drawableID, translatedPos);
            this.renderer.updateDrawableDirectionScale(this.drawableID, direction, scale, this.transform);
            this.renderer.updateDrawableVisible(this.drawableID, this.visible);

            const costume = this.getCostumes()[this.currentCostume];
            this.renderer.updateDrawableSkinId(this.drawableID, costume.skinId);

            for (const effectName in this.effects) {
                if (!this.effects.hasOwnProperty(effectName)) continue;
                this.renderer.updateDrawableEffect(this.drawableID, effectName, this.effects[effectName]);
            }

            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
        this.runtime.requestTargetsUpdate(this);
    }

    /**
     * Return the human-readable name for this rendered target, e.g., the sprite's name.
     * @override
     * @returns {string} Human-readable name.
     */
    getName () {
        return this.sprite.name;
    }

    /**
     * Return whether this rendered target is a sprite (not a clone, not the stage).
     * @return {boolean} True if not a clone and not the stage.
     */
    isSprite () {
        return !this.isStage && this.isOriginal;
    }

    /**
     * Return the rendered target's tight bounding box.
     * Includes top, left, bottom, right attributes in Scratch coordinates.
     * @return {?object} Tight bounding box, or null.
     */
    getBounds () {
        if (this.renderer) {
            return this.runtime.renderer.getBounds(this.drawableID);
        }
        return null;
    }

    /**
     * Return the bounding box around a slice of the top 8px of the rendered target.
     * Includes top, left, bottom, right attributes in Scratch coordinates.
     * @return {?object} Tight bounding box, or null.
     */
    getBoundsForBubble () {
        if (this.renderer) {
            return this.runtime.renderer.getBoundsForBubble(this.drawableID);
        }
        return null;
    }

    /**
     * Return whether this target is touching the mouse, an edge, or a sprite.
     * @param {string} requestedObject an id for mouse or edge, or a sprite name.
     * @param {boolean?} unoriginalOnly if true, will use isTouchingSpriteUnoriginals when checking sprites.
     * @return {boolean} True if the sprite is touching the object.
     */
    isTouchingObject (requestedObject, unoriginalOnly) { // used by compiler
        if (requestedObject === '_mouse_') {
            if (!this.runtime.ioDevices.mouse) return false;
            const mouseX = this.runtime.ioDevices.mouse.getClientX();
            const mouseY = this.runtime.ioDevices.mouse.getClientY();
            return this.isTouchingPoint(mouseX, mouseY);
        } else if (requestedObject === '_edge_') {
            return this.isTouchingEdge();
        }

        if (unoriginalOnly) {
            return this.isTouchingSpriteUnoriginals(requestedObject);
        } else {
            return this.isTouchingSprite(requestedObject);
        }
    }

    /**
     * Return whether touching a point.
     * @param {number} x X coordinate of test point.
     * @param {number} y Y coordinate of test point.
     * @return {boolean} True iff the rendered target is touching the point.
     */
    isTouchingPoint (x, y) {
        if (this.renderer) {
            return this.renderer.drawableTouching(this.drawableID, x, y);
        }
        return false;
    }

    /**
     * Return whether touching a stage edge.
     * @return {boolean} True iff the rendered target is touching the stage edge.
     */
    isTouchingEdge () {
        if (this.renderer) {
            const stageWidth = this.runtime.stageWidth;
            const stageHeight = this.runtime.stageHeight;
            const bounds = this.getBounds();
            if (bounds.left < -stageWidth / 2 ||
                bounds.right > stageWidth / 2 ||
                bounds.top > stageHeight / 2 ||
                bounds.bottom < -stageHeight / 2) {
                return true;
            }
        }
        return false;
    }

    /**
     * Return whether touching any of a named sprite's clones.
     * @param {string} spriteName Name of the sprite.
     * @return {boolean} True if touching a clone of the sprite.
     */
    isTouchingSprite (spriteName) {
        spriteName = Cast.toString(spriteName);
        const firstClone = this.runtime.getSpriteTargetByName(spriteName);
        if (!firstClone || !this.renderer) {
            return false;
        }
        // Filter out dragging targets. This means a sprite that is being dragged
        // can detect other sprites using touching <sprite>, but cannot be detected
        // by other sprites while it is being dragged. This matches Scratch 2.0 behavior.
        const drawableCandidates = firstClone.sprite.clones.filter(clone => !clone.dragging)
            .map(clone => clone.drawableID);
        return this.renderer.isTouchingDrawables(
            this.drawableID, drawableCandidates);
    }

    /**
     * Return whether touching a target.
     * @param {string} targetId ID of the target
     * @return {boolean} True if touching the target
     */
    isTouchingTarget (targetId) {
        targetId = Cast.toString(targetId);
        const target = this.runtime.getTargetById(targetId);
        if (!target || !this.renderer || target.dragging) {
            return false;
        }
        return this.renderer.isTouchingDrawables(
            this.drawableID, [target.drawableID]);
    }

    /**
     * Return whether touching any of a named sprite's unoriginal clones.
     * @param {string} spriteName Name of the sprite.
     * @return {boolean} True if touching a clone of the sprite with isOriginal set to false.
     */
    isTouchingSpriteUnoriginals (spriteName) {
        spriteName = Cast.toString(spriteName);
        const firstClone = this.runtime.getSpriteTargetByName(spriteName);
        if (!firstClone || !this.renderer) {
            return false;
        }
        // Filter out dragging targets. This means a sprite that is being dragged
        // can detect other sprites using touching <sprite>, but cannot be detected
        // by other sprites while it is being dragged. This matches Scratch 2.0 behavior.
        const drawableCandidates = firstClone.sprite.clones.filter(clone => !clone.dragging && !clone.isOriginal)
            .map(clone => clone.drawableID);
        return this.renderer.isTouchingDrawables(
            this.drawableID, drawableCandidates);
    }

    /**
     * Return whether touching any of a named sprite's clones.
     * @param {string} spriteName Name of the sprite.
     * @return {boolean} True iff touching a clone of the sprite.
     */
    spriteTouchingPoint (spriteName) {
        spriteName = Cast.toString(spriteName);
        const firstClone = this.runtime.getSpriteTargetByName(spriteName);
        if (!firstClone || !this.renderer) {
            return null;
        }
        // Filter out dragging targets. This means a sprite that is being dragged
        // can detect other sprites using touching <sprite>, but cannot be detected
        // by other sprites while it is being dragged. This matches Scratch 2.0 behavior.
        const drawableCandidates = firstClone.sprite.clones.filter(clone => !clone.dragging)
            .map(clone => clone.drawableID);
        return this.renderer.getTouchingDrawablesPoint(
            this.drawableID, drawableCandidates);
    }

    /**
     * Return whether touching a color.
     * @param {Array.<number>} rgb [r,g,b], values between 0-255.
     * @return {Promise.<boolean>} True iff the rendered target is touching the color.
     */
    isTouchingColor (rgb) { // used by compiler
        if (this.renderer) {
            return this.renderer.isTouchingColor(this.drawableID, rgb);
        }
        return false;
    }

    /**
     * Return whether rendered target's color is touching a color.
     * @param {object} targetRgb {Array.<number>} [r,g,b], values between 0-255.
     * @param {object} maskRgb {Array.<number>} [r,g,b], values between 0-255.
     * @return {Promise.<boolean>} True iff the color is touching the color.
     */
    colorIsTouchingColor (targetRgb, maskRgb) { // used by compiler
        if (this.renderer) {
            return this.renderer.isTouchingColor(
                this.drawableID,
                targetRgb,
                maskRgb
            );
        }
        return false;
    }

    getLayerOrder () {
        if (this.renderer) {
            return this.renderer.getDrawableOrder(this.drawableID);
        }
        return null;
    }

    /**
     * Move to the front layer.
     */
    goToFront () { // This should only ever be used for sprites // used by compiler
        if (this.renderer) {
            // Let the renderer re-order the sprite based on its knowledge
            // of what layers are present
            this.renderer.setDrawableOrder(this.drawableID, Infinity, StageLayering.SPRITE_LAYER);
        }

        this.runtime.setExecutablePosition(this, Infinity);
    }

    /**
     * Move to the back layer.
     */
    goToBack () { // This should only ever be used for sprites // used by compiler
        if (this.renderer) {
            // Let the renderer re-order the sprite based on its knowledge
            // of what layers are present
            this.renderer.setDrawableOrder(this.drawableID, -Infinity, StageLayering.SPRITE_LAYER, false);
        }

        this.runtime.setExecutablePosition(this, -Infinity);
    }

    /**
     * Move forward a number of layers.
     * @param {number} nLayers How many layers to go forward.
     */
    goForwardLayers (nLayers) { // used by compiler
        if (this.renderer) {
            this.renderer.setDrawableOrder(this.drawableID, nLayers, StageLayering.SPRITE_LAYER, true);
        }

        this.runtime.moveExecutable(this, nLayers);
    }

    /**
     * Move backward a number of layers.
     * @param {number} nLayers How many layers to go backward.
     */
    goBackwardLayers (nLayers) { // used by compiler
        if (this.renderer) {
            this.renderer.setDrawableOrder(this.drawableID, -nLayers, StageLayering.SPRITE_LAYER, true);
        }

        this.runtime.moveExecutable(this, -nLayers);
    }

    /**
     * Move behind some other rendered target.
     * @param {!RenderedTarget} other Other rendered target to move behind.
     */
    goBehindOther (other) {
        if (this.renderer) {
            const otherLayer = this.renderer.setDrawableOrder(
                other.drawableID, 0, StageLayering.SPRITE_LAYER, true);
            this.renderer.setDrawableOrder(this.drawableID, otherLayer, StageLayering.SPRITE_LAYER);
        }

        const executionPosition = this.runtime.executableTargets.indexOf(other);
        this.runtime.setExecutablePosition(this, executionPosition);
    }

    /**
     * Keep a desired position within a fence.
     * @param {number} newX New desired X position.
     * @param {number} newY New desired Y position.
     * @param {object=} optFence Optional fence with left, right, top bottom.
     * @return {Array.<number>} Fenced X and Y coordinates.
     */
    keepInFence (newX, newY, optFence) {
        let fence = optFence;
        if (!fence) {
            fence = {
                left: -this.runtime.stageWidth / 2,
                right: this.runtime.stageWidth / 2,
                top: this.runtime.stageHeight / 2,
                bottom: -this.runtime.stageHeight / 2
            };
        }
        const bounds = this.getBounds();
        if (!bounds) return;
        // Adjust the known bounds to the target position.
        bounds.left += (newX - this.x);
        bounds.right += (newX - this.x);
        bounds.top += (newY - this.y);
        bounds.bottom += (newY - this.y);
        // Find how far we need to move the target position.
        let dx = 0;
        let dy = 0;
        if (bounds.left < fence.left) {
            dx += fence.left - bounds.left;
        }
        if (bounds.right > fence.right) {
            dx += fence.right - bounds.right;
        }
        if (bounds.top > fence.top) {
            dy += fence.top - bounds.top;
        }
        if (bounds.bottom < fence.bottom) {
            dy += fence.bottom - bounds.bottom;
        }
        return [newX + dx, newY + dy];
    }

    /**
     * Make a clone, copying any run-time properties.
     * If we've hit the global clone limit, returns null.
     * @return {RenderedTarget} New clone.
     */
    makeClone () {
        if (!this.runtime.clonesAvailable() || this.isStage) {
            return null; // Hit max clone limit, or this is the stage.
        }
        this.runtime.changeCloneCounter(1);
        const newClone = this.sprite.createClone();
        // Copy all properties.
        newClone.x = this.x;
        newClone.y = this.y;
        newClone.direction = this.direction;
        newClone.draggable = this.draggable;
        newClone.visible = this.visible;
        newClone.size = this.size;
        newClone.stretch = this.stretch;
        newClone.currentCostume = this.currentCostume;
        newClone.rotationStyle = this.rotationStyle;
        newClone.effects = Clone.simple(this.effects);
        newClone.variables = this.duplicateVariables();
        newClone.cameraBound = this.cameraBound;
        newClone._edgeActivatedHatValues = Clone.simple(this._edgeActivatedHatValues);
        newClone.initDrawable(StageLayering.SPRITE_LAYER);
        newClone.updateAllDrawableProperties();
        return newClone;
    }

    /**
     * Make a duplicate using a duplicate sprite.
     * @return {RenderedTarget} New clone.
     */
    duplicate () {
        return this.sprite.duplicate().then(newSprite => {
            const newTarget = newSprite.createClone();
            // Copy all properties.
            // @todo refactor with clone methods
            newTarget.x = (Math.random() - 0.5) * 400 / 2;
            newTarget.y = (Math.random() - 0.5) * 300 / 2;
            newTarget.direction = this.direction;
            newTarget.draggable = this.draggable;
            newTarget.visible = this.visible;
            newTarget.size = this.size;
            newTarget.stretch = this.stretch;
            newTarget.currentCostume = this.currentCostume;
            newTarget.rotationStyle = this.rotationStyle;
            newTarget.effects = JSON.parse(JSON.stringify(this.effects));
            newTarget.variables = this.duplicateVariables(newTarget.blocks);
            newTarget.cameraBound = this.cameraBound;
            newTarget.updateAllDrawableProperties();
            return newTarget;
        });
    }

    /**
     * Called when the project receives a "green flag."
     * For a rendered target, this clears graphic effects.
     */
    onGreenFlag () {
        this.clearEffects();
    }

    /**
     * Called when the project receives a "stop all"
     * Stop all sounds and clear graphic effects.
     */
    onStopAll () {
        this.clearEffects();
    }

    /**
     * Post/edit sprite info.
     * @param {object} data An object with sprite info data to set.
     */
    postSpriteInfo (data) {
        const force = data.hasOwnProperty('force') ? data.force : null;
        const isXChanged = data.hasOwnProperty('x');
        const isYChanged = data.hasOwnProperty('y');
        if (isXChanged || isYChanged) {
            this.setXY(isXChanged ? data.x : this.x, isYChanged ? data.y : this.y, force);
        }
        if (data.hasOwnProperty('direction')) {
            this.setDirection(data.direction);
        }
        if (data.hasOwnProperty('draggable')) {
            this.setDraggable(data.draggable);
        }
        if (data.hasOwnProperty('rotationStyle')) {
            this.setRotationStyle(data.rotationStyle);
        }
        if (data.hasOwnProperty('visible')) {
            this.setVisible(data.visible);
        }
        if (data.hasOwnProperty('size')) {
            this.setSize(data.size);
        }
    }

    /**
     * Put the sprite into the drag state. While in effect, setXY must be forced
     */
    startDrag () {
        this.dragging = true;
    }

    /**
     * Remove the sprite from the drag state.
     */
    stopDrag () {
        this.dragging = false;
    }


    /**
     * Serialize sprite info, used when emitting events about the sprite
     * @returns {object} Sprite data as a simple object
     */
    toJSON () {
        const costumes = this.getCostumes();
        return {
            id: this.id,
            name: this.getName(),
            isStage: this.isStage,
            isDisposed: this.isDisposed,
            x: this.x,
            y: this.y,
            size: this.size,
            direction: this.direction,
            draggable: this.draggable,
            currentCostume: this.currentCostume,
            costume: costumes[this.currentCostume],
            costumeCount: costumes.length,
            visible: this.visible,
            rotationStyle: this.rotationStyle,
            comments: this.comments,
            blocks: this.blocks._blocks,
            variables: this.variables,
            costumes: costumes,
            sounds: this.getSounds(),
            textToSpeechLanguage: this.textToSpeechLanguage,
            tempo: this.tempo,
            volume: this.volume,
            videoTransparency: this.videoTransparency,
            videoState: this.videoState

        };
    }

    /**
     * Dispose, destroying any run-time properties.
     */
    dispose () {
        // pm: remove this event
        this.runtime.removeListener('CAMERA_CHANGED', this.cameraUpdateEvent);

        if (!this.isOriginal) {
            this.runtime.changeCloneCounter(-1);
        }
        this.isDisposed = true;
        this.runtime.stopForTarget(this);
        this.runtime.removeExecutable(this);
        this.sprite.removeClone(this);
        if (this.renderer && this.drawableID !== null) {
            this.renderer.destroyDrawable(this.drawableID, this.isStage ?
                StageLayering.BACKGROUND_LAYER :
                StageLayering.SPRITE_LAYER);
            if (this.visible) {
                this.emitVisualChange();
                this.runtime.requestRedraw();
            }
        }
    }
}

module.exports = RenderedTarget;
