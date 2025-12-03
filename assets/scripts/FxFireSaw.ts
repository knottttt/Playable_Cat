// assets/scripts/FxFireSaw.ts
import {
    _decorator,
    Component,
    Node,
    Animation,
    UIOpacity,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('FxFireSaw')
export class FxFireSaw extends Component {

    /**
     * 对应这一行 5 个格子的 frame0 节点
    
     */
    @property([Node])
    frameAnimNodes: Node[] = [];

    /** ANM_frame clip 名称 */
    @property
    frameClipName: string = 'ANM_frame';

    /** 这一行锯子移动动画（ANM_firesaw_row）的开始延迟（秒） */
    @property({ tooltip: '该行锯子移动动画的开始延迟（秒）' })
    startDelay: number = 0;

    /** 调试：运行时在 Inspector 里修改，会立刻播放对应格子的黄框动画 */
    @property
    debugIndex: number = -1;

    private _lastDebugIndex: number = -1;

    onLoad () {
        // 初始化：所有 frame0 保持 active，只是透明 & 停止自己的 ANM_frame
        for (const node of this.frameAnimNodes) {
            if (!node) continue;

            let opacity = node.getComponent(UIOpacity);
            if (!opacity) {
                opacity = node.addComponent(UIOpacity);
            }
            opacity.opacity = 0;   // 隐藏但不关 active

            const anim = node.getComponent(Animation);
            if (anim) {
                anim.stop();       // 停止可能的自动播放
            }
        }
    }

    start () {
        // 按每行单独设定的延迟去播放这一行的 ANM_firesaw_row
        this.scheduleOnce(() => {
            const rowAnim = this.getComponent(Animation);
            if (!rowAnim) {
                console.warn('[FxFireSaw] row Animation not found on', this.node.name);
                return;
            }
            const clip = rowAnim.defaultClip ?? rowAnim.clips[0];
            if (!clip) {
                console.warn('[FxFireSaw] row Animation has no clip on', this.node.name);
                return;
            }
            rowAnim.play(clip.name);
        }, this.startDelay);
    }

    update (dt: number) {
        // Inspector 里修改 debugIndex 时自动触发一次
        if (this.debugIndex !== this._lastDebugIndex) {
            this._lastDebugIndex = this.debugIndex;
            if (this.debugIndex >= 0) {
                this.onFrameEvent(this.debugIndex);
            }
        }
    }

    /**
     * 在 ANM_firesaw_row 的帧事件里调用
     * 参数 index = 0~4，对应本行的 5 个格子
     */
    public onFrameEvent (index: number) {
        if (index < 0 || index >= this.frameAnimNodes.length) {
            console.warn('[FxFireSaw] onFrameEvent invalid index =', index);
            return;
        }

        const node = this.frameAnimNodes[index];
        if (!node) {
            console.warn('[FxFireSaw] frameAnimNodes[%d] is null', index);
            return;
        }

        const anim = node.getComponent(Animation);
        if (!anim) {
            console.warn('[FxFireSaw] node has no Animation:', node.name);
            return;
        }

        // 找到要播的 clip
        let clipName = this.frameClipName;
        let state = anim.getState(clipName);

        if (!state) {
            const def = anim.defaultClip ?? anim.clips[0];
            if (!def) {
                console.warn('[FxFireSaw] no clip on Animation of', node.name);
                return;
            }
            clipName = def.name;
            state = anim.getState(clipName);
        }

        if (!state) {
            console.warn('[FxFireSaw] cannot get state for clip', clipName);
            return;
        }

        // 1）先把动画重置到第 0 帧（在透明状态下完成）
        anim.stop();
        state.time = 0;
        state.sample();   // 立刻把节点状态更新到第 0 帧

        // 2）再把透明度调回来，避免“先裸露一帧”
        const opacity = node.getComponent(UIOpacity);
        if (opacity) {
            opacity.opacity = 255;
        }

        // 3）开始播放黄框动画（从 0 帧起播）
        anim.play(clipName);
    }

    /** 提供给 FxHouseGrid 使用：这一行锯子整体播放完的大致时长（秒） */
    public getTotalDuration (): number {
        const rowAnim = this.getComponent(Animation);
        const clip = rowAnim?.defaultClip ?? rowAnim?.clips[0];
        const clipDuration = clip ? clip.duration : 0;
        // 加一点缓冲，避免拼接处有一帧空档
        return this.startDelay + clipDuration + 0.1;
    }
}
