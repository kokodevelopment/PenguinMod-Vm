const Cast = require("../../util/cast");

function MathOver(number, max) {
    let num = number;
    while (num > max) {
        num -= max;
    }
    return num;
}
function Clamp(number, min, max) {
    return Math.min(Math.max(number, min), max);
}

const AudioNodeStorage = [];

class AudioSource {
    constructor(audioContext, audioGroup, source, data, parent) {
        if (source == null) source = "";
        if (data == null) data = {};
        
        this.src = source;
        this.volume = data.volume != null ? data.volume : 1;
        this.speed = data.speed != null ? data.speed : 1;
        this.pitch = data.pitch != null ? data.pitch : 0;
        this.pan = data.pan != null ? data.pan : 0;
        this.looping = data.looping != null ? data.looping : false;
        this._originalConfig = data;

        this._startingTime = 0;
        this._endingTime = null;
        this.timePosition = data.timePosition != null ? data.timePosition : 0;
        this.resumeSpot = 0;
        this.paused = false;
        this.notPlaying = true;
        this._pauseTime = null;
        this._pauseTimeOffset = null;
        this.parent = parent;

        this._audioNode = null;
        this._audioContext = audioContext;
        this._audioGroup = audioGroup;

        this._audioPanner = this._audioContext.createPanner();
        this._audioGainNode = this._audioContext.createGain();
        this._audioAnalyzerNode = this._audioContext.createAnalyser();
        
        this._audioPanner.panningModel = 'equalpower';
        this._audioGainNode.gain.value = 1;

        this._audioGainNode.connect(this._audioPanner);
        this._audioPanner.connect(this._audioAnalyzerNode);
        this._audioAnalyzerNode.connect(parent.audioGlobalVolumeNode);

        this.duration = source.duration;

        this.originAudioName = "";
    }

    play() {
        try {
            if (this._audioNode) {
                this._audioNode.onended = null;
                this._audioNode.stop();
            }
        } catch {
            // do nothing
        }
        this._audioNode = this._audioContext.createBufferSource();
        AudioNodeStorage.push(this._audioNode);
        const source = this._audioNode;
        this.update();
        source.buffer = this.src;
        source.connect(this._audioGainNode);
        this._endingTime = null;
        if (this.paused) {
            this.paused = false;
            source.start(0, this.resumeSpot);
            this._startingTime = this._pauseTime - this._pauseTimeOffset;
            this._pauseTime = null;
            this._pauseTimeOffset = null;
        } else {
            source.start(0, this.timePosition);
            this._startingTime = Date.now();
        }
        this.notPlaying = false;
        source.onended = () => {
            if (this.paused) return;
            this._endingTime = Date.now();
            source.onended = null;
            this.notPlaying = true;
        }
    }
    stop() {
        try {
            if (this._audioNode) {
                this._audioNode.stop();
                this._audioNode = null;
                this.notPlaying = true;
            }
            this.paused = false;
        } catch {
            // do nothing
        }
    }
    pause() {
        if (!this._audioNode) return;
        this.paused = true;
        this.resumeSpot = MathOver((Date.now() - this._startingTime) * this.speed, this.duration * 1000) / 1000;
        this._audioNode.stop();
        this._audioNode = null;
        this._pauseTime = Date.now();
        this._pauseTimeOffset = (Date.now() - this._startingTime);
        this.notPlaying = true;
    }

    update() {
        if (!this._audioNode) return;
        const audioNode = this._audioNode;
        const audioGroup = this._audioGroup;
        const audioGainNode = this._audioGainNode;
        const audioPanner = this._audioPanner;

        audioNode.loop = this.looping;
        audioNode.detune.value = this.pitch;
        audioNode.playbackRate.value = this.speed;
        audioGainNode.gain.value = this.volume;

        audioNode.detune.value += audioGroup.globalPitch;
        audioNode.playbackRate.value *= audioGroup.globalSpeed;
        audioGainNode.gain.value *= audioGroup.globalVolume;

        const position = this.calculatePannerPosition(Clamp(this.pan + audioGroup.globalPan, -1, 1));
        audioPanner.setPosition(position.x, position.y, position.z);
    }
    clone() {
        const newSource = new AudioSource(this._audioContext, this._audioGroup, this.src, this._originalConfig, this.parent);
        return newSource;
    }

    getVolume() {
        const analyserNode = this._audioAnalyzerNode;

        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserNode.getByteTimeDomainData(dataArray);

        let sumSquares = 0.0;
        for (let i = 0; i < bufferLength; i++) {
          const sample = (dataArray[i] / 128.0) - 1.0;
          sumSquares += sample * sample;
        }
        const volume = Math.sqrt(sumSquares / bufferLength);
        return volume;
    }
    calculateTimePosition() {
        if (this._endingTime != null) return (this._endingTime - this._startingTime) * this.speed;
        return MathOver((Date.now() - this._startingTime) * this.speed, this.duration * 1000);
    }
    calculatePannerPosition(pan) {
        return {
            x: pan,
            y: 0,
            z: 1 - Math.abs(pan)
        };
    }
}
class AudioExtensionHelper {
    constructor(runtime) {
        /**
            * The runtime that the helper will use for all functions.
            * @type {runtime}
        */
        this.runtime = runtime;
        this.audioGroups = {};
        this.audioContext = new AudioContext();
        this.audioGlobalVolumeNode = this.audioContext.createGain();

        this.audioGlobalVolumeNode.gain.value = 1;
        this.audioGlobalVolumeNode.connect(this.audioContext.destination);
    }
    
    /**
        * Creates a new AudioGroup.
        * @type {string} AudioGroup name
        * @type {object} AudioGroup settings (optional)
        * @type {object[]} AudioGroup sources (optional)
    */
    AddAudioGroup(name, data, sources) {
        if (data == null) data = {};
        this.audioGroups[name] = {
            id: name,
            sources: (sources == null ? {} : sources),
            globalVolume: (data.globalVolume == null ? 1 : data.globalVolume),
            globalSpeed: (data.globalSpeed == null ? 1 : data.globalSpeed),
            globalPitch: (data.globalPitch == null ? 0 : data.globalPitch),
            globalPan: (data.globalPan == null ? 0 : data.globalPan)
        };
        return this.audioGroups[name];
    }
    /**
        * Deletes an AudioGroup by name.
        * @type {string}
    */
    DeleteAudioGroup(name) {
        if (this.audioGroups[name] == null) return;
        delete this.audioGroups[name];
    }
    /**
        * Gets an AudioGroup by name.
        * @type {string}
    */
    GetAudioGroup(name) {
        return this.audioGroups[name];
    }
    /**
        * Gets all AudioGroups and returns them in an array.
    */
    GetAllAudioGroups() {
        return Object.values(this.audioGroups);
    }
    /**
        * Gets all AudioSources in an AudioGroup and updates them.
        * @type {AudioGroup}
    */
    UpdateAudioGroupSources(audioGroup) {
        const audioSources = this.GrabAllGrabAudioSources(audioGroup);
        for (let i = 0; i < audioSources.length; i++) {
            const source = audioSources[i];
            source.update();
        }
    }

    /**
        * Creates a new AudioSource inside of an AudioGroup.
        * @type {AudioGroup} AudioSource parent
        * @type {string} AudioSource name
        * @type {string} AudioSource source (optional)
        * @type {object} AudioSource settings (optional)
    */
    AppendAudioSource(parent, name, src, settings) {
        const group = typeof parent == "string" ? this.GetAudioGroup(parent) : parent;
        if (!group) return;
        group.sources[name] = new AudioSource(this.audioContext, group, src, settings, this);
        return group.sources[name];
    }
    /**
        * Deletes an AudioSource by name.
        * @type {AudioGroup} AudioSource parent
        * @type {string}
    */
    RemoveAudioSource(parent, name) {
        const group = typeof parent == "string" ? this.GetAudioGroup(parent) : parent;
        if (!group) return;
        if (group.sources[name] == null) return;
        delete group.sources[name];
    }
    /**
        * Gets an AudioSource by name.
        * @type {AudioGroup} AudioSource parent
        * @type {string}
    */
    GrabAudioSource(audioGroup, name) {
        const group = typeof audioGroup == "string" ? this.GetAudioGroup(audioGroup) : audioGroup;
        if (!group) return;
        return group.sources[name];
    }
    /**
        * Gets all AudioSources and returns them in an array.
        * @type {AudioGroup} AudioSource parent
    */
    GrabAllGrabAudioSources(audioGroup) {
        const group = typeof audioGroup == "string" ? this.GetAudioGroup(audioGroup) : audioGroup;
        if (!group) return [];
        return Object.values(group.sources);
    }

    /**
        * Finds a sound with the specified ID in the sound list.
        * @type {Array} soundList
        * @type {string} Sound ID
    */
    FindSoundBySoundId(soundList, id) {
        for (let i = 0; i < soundList.length; i++) {
            const sound = soundList[i];
            if (sound.soundId == id) return sound;
        }
        return null;
    }
    /**
        * Finds a sound with the specified name in the sound list.
        * @type {Array} soundList
        * @type {string} Sound name
    */
    FindSoundByName(soundList, name) {
        for (let i = 0; i < soundList.length; i++) {
            const sound = soundList[i];
            if (sound.name == name) return sound;
        }
        return null;
    }
    /**
        * Clamps numbers to stay inbetween 2 values.
        * @type {number}
    */
    Clamp(number, min, max) {
        return Math.min(Math.max(number, min), max);
    }

    /**
        * Kills all sounds and other things. For use when the stop button is clicked or a stop all block is used.
    */
    KillAllProcesses() {
        function PCall(func, catc) {
            try {
                func();
            } catch (err) {
                if (catc) catc(err);
            }
        }

        console.info("Attempting to kill", AudioNodeStorage.length, "audio nodes");
        AudioNodeStorage.forEach(node => {
            PCall(() => {
                node.stop();
            })
        });
        AudioNodeStorage.splice(0, AudioNodeStorage.length);
    }
}

module.exports.Helper = AudioExtensionHelper
module.exports.AudioSource = AudioSource