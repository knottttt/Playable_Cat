// assets/scripts/AudioManager.ts
import {
    _decorator,
    Component,
    Node,
    AudioSource,
    AudioClip,
    director,
    resources,
} from 'cc';

const { ccclass } = _decorator;

/**
 * AudioManager
 * 参考：
 * - 单例 + 常驻节点
 * - 双通道：一个播 BGM，一个播 SFX
 * - 支持传 AudioClip 或 资源路径('audio/main_bgm')
 */
@ccclass('AudioManager')
export class AudioManager extends Component {

    private static _instance: AudioManager | null = null;

    /** 全局唯一实例（第一次调用时自动创建节点 + 常驻） */
    public static get instance(): AudioManager | null {
        if (this._instance) {
            return this._instance;
        }

        const scene = director.getScene();
        if (!scene) {
            console.warn('[AudioManager] get instance 时 scene 还没准备好');
            return null;
        }

        const node = new Node('__AudioManager__');
        scene.addChild(node);
        director.addPersistRootNode(node);

        this._instance = node.addComponent(AudioManager);
        console.log('[AudioManager] 创建并持久化节点 __AudioManager__');
        return this._instance;
    }

    /** 音效通道 */
    private _sfxSource: AudioSource | null = null;
    /** 背景音乐通道（loop） */
    private _bgmSource: AudioSource | null = null;

    /** 当前 BGM clip（方便 pause/resume） */
    private _currentBgm: AudioClip | null = null;

    /** 全局音量（0~1） */
    private _bgmVolume: number = 0.6;
    private _sfxVolume: number = 1.0;

    /** 简单缓存：路径 -> AudioClip，避免重复加载 */
    private _clipCache: Map<string, AudioClip> = new Map();

    onLoad() {
        // 双通道 AudioSource
        this._sfxSource = this.node.addComponent(AudioSource);
        this._bgmSource = this.node.addComponent(AudioSource);
        this._bgmSource.loop = true;

        this._bgmSource.volume = this._bgmVolume;
        this._sfxSource.volume = this._sfxVolume;
    }

    // ===================== 工具：加载音频 =====================

    /** 统一入口：支持 AudioClip 或 资源路径（resources/audio/...） */
    private _loadClip(
        sound: AudioClip | string,
        cb: (clip: AudioClip | null) => void,
    ) {
        if (sound instanceof AudioClip) {
            cb(sound);
            return;
        }

        // string：当作 resources 目录下的路径，例如 'audio/main_bgm'
        const path = sound;

        // 先看缓存
        const cached = this._clipCache.get(path);
        if (cached) {
            cb(cached);
            return;
        }

        resources.load(path, AudioClip, (err, clip) => {
            if (err) {
                console.error('[AudioManager] 载入音频失败:', path, err);
                cb(null);
                return;
            }
            this._clipCache.set(path, clip as AudioClip);
            cb(clip as AudioClip);
        });
    }

    // ===================== 音效（短音频） =====================

    /**
     * 播放一次音效（爆炸、点击等）
     * @param sound AudioClip 或 'audio/click' 路径
     */
    public playOneShot(sound: AudioClip | string, volume: number = 1.0) {
        if (!this._sfxSource) return;

        this._loadClip(sound, (clip) => {
            if (!clip) return;
            const v = this._sfxVolume * volume;
            this._sfxSource!.playOneShot(clip, v);
        });
    }

    public setSfxVolume(v: number) {
        this._sfxVolume = Math.max(0, Math.min(1, v));
        if (this._sfxSource) this._sfxSource.volume = this._sfxVolume;
    }

    public getSfxVolume() {
        return this._sfxVolume;
    }

    // ===================== 背景音乐 =====================

    /**
     * 播放 / 切换 BGM（会自动 loop）
     * @param sound AudioClip 或 'audio/main_bgm'
     */
    public playBgm(sound: AudioClip | string, volume: number = 0.6) {
        if (!this._bgmSource) return;

        this._bgmVolume = volume;
        this._bgmSource.volume = this._bgmVolume;

        this._loadClip(sound, (clip) => {
            if (!clip) return;

            this._currentBgm = clip;
            this._bgmSource!.stop();
            this._bgmSource!.clip = clip;
            this._bgmSource!.loop = true;
            this._bgmSource!.play();

            console.log('[AudioManager] playBgm:', clip.name);
        });
    }

    public stopBgm() {
        if (this._bgmSource) {
            this._bgmSource.stop();
        }
        this._currentBgm = null;
    }

    public pauseBgm() {
        if (this._bgmSource && this._bgmSource.playing) {
            this._bgmSource.pause();
        }
    }

    public resumeBgm() {
        if (this._bgmSource && this._currentBgm && !this._bgmSource.playing) {
            this._bgmSource.play();
        }
    }

    public setBgmVolume(v: number) {
        this._bgmVolume = Math.max(0, Math.min(1, v));
        if (this._bgmSource) this._bgmSource.volume = this._bgmVolume;
    }

    public getBgmVolume() {
        return this._bgmVolume;
    }

    // ===================== 全局静音辅助 =====================

    public muteAll() {
        this.setBgmVolume(0);
        this.setSfxVolume(0);
    }

    public unmuteAll() {
        this.setBgmVolume(0.6);
        this.setSfxVolume(1.0);
    }
}
