// assets/scripts/FeatureFiresawController.ts
import {
    _decorator,
    Component,
    Node,
    tween,
    Vec3,
    UIOpacity,
    Tween,
    Animation,
    director,
} from 'cc';

import { TapHintManager } from './TapHintManager';
import { AudioManager } from './core/AudioManager';

const { ccclass, property } = _decorator;

/** 近似 cubic-bezier(.22,1,.36,1) 的 easing 函数 */
const easeBezier_22_1_36_1 = (t: number): number => {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    const p0y = 0, p1y = 1, p2y = 1, p3y = 1;
    return (
        uuu * p0y +
        3 * uu * t * p1y +
        3 * u * tt * p2y +
        ttt * p3y
    );
};

/** 把角度归一化到 0~360 区间 */
const normalizeAngle = (angle: number): number => {
    let a = angle % 360;
    if (a < 0) a += 360;
    return a;
};

@ccclass('FeatureFiresawController')
export class FeatureFiresawController extends Component {

    /** 盖在 slotPanel 上的黑幕（Canvas/blackMask） */
    @property(Node)
    public blackMask: Node = null;

    /** 上方大轮盘本体（只负责旋转） */
    @property(Node)
    public wheel: Node = null;

    /** 轮盘整体的 panel（需要上移 + 提到 slotPanel 前面） */
    @property(Node)
    public wheelPanel: Node = null;

    /** 下面的 slotPanel（用于计算层级：wheelPanel 放在它前面） */
    @property(Node)
    public slotPanel: Node = null;

    /** 轮盘上方指针（只做 0 ~ -12 度摆动，不跟着盘子转） */
    @property(Node)
    public wheelArrow: Node = null;

    /** Feature 弹窗根节点（Canvas/featurePopup） */
    @property(Node)
    public featurePopup: Node = null;

    /** featurePopup 下的警报 icon（alarm） */
    @property(Node)
    public alarm: Node = null;

    /** alarm 播完呼吸动画后额外停留的时间（秒） */
    @property
    public alarmStayDuration: number = 0.6;

    /** 当前 feature 模式的根节点（现在拖 firesaw 节点） */
    @property(Node)
    public modeRoot: Node = null;

    /** 当前 feature 模式要播放的动画名（默认 ANM_ScatterBtn） */
    @property
    public modeAnimationName: string = 'ANM_ScatterBtn';

    /** 最后出现，让玩家点击进入 Scatter0 的按钮 */
    @property(Node)
    public scatterBtn: Node = null;

    /** 转动完成后淡入的 mask（wheelpanel/wheel/wheel/wheel_mask） */
    @property(Node)
    public wheelMask: Node = null;

    /** wheel 旋转时间（秒） */
    @property
    public wheelSpinDuration: number = 2.0;

    /** 旋转额外圈数（例如 3 = 多转 3 圈再停） */
    @property
    public wheelExtraRounds: number = 3;

    /** wheelPanel 在开始转动前上移的距离（Y 方向） */
    @property
    public wheelPanelMoveUpDistance: number = 100;

    /** wheelPanel 上移动画时间 */
    @property
    public wheelPanelMoveUpDuration: number = 0.2;

    /** wheelMask 从 0 → 1（0 → 255）的淡入时间 */
    @property
    public wheelMaskFadeDuration: number = 0.3;

    /** wheelMask 在轮盘停止后延迟多久再淡入（秒），可在 Inspector 填 2 */
    @property
    public wheelMaskDelay: number = 0.0;

    /** wheel 停下时的目标角度集合（单位：度，绝对角度） */
    private _targetAngles: number[] = [30, 180];

    /** wheel 当前旋转角度状态（内部用，可能 >360） */
    private _wheelState: { angle: number } = { angle: 0 };

    /** 指针摆动偏移（0 ~ -12 度） */
    private _arrowState: { angle: number } = { angle: 0 };

    /** Tween 句柄 */
    private _arrowWobbleTween: Tween<{ angle: number }> | null = null;
    private _wheelTween: Tween<{ angle: number }> | null = null;

    /** 是否正在做 feature 旋转，避免重复调用 */
    private _isWheelSpinning = false;

    /** 可选：wheel 的 idle 旋转脚本（比如 WheelController），仅用于 disabled 防止它再启 tween */
    @property(Component)
    public wheelIdleController: Component | null = null;

    /** 记录 wheelPanel 的初始位置，避免多次上移叠加 */
    private _wheelPanelOriginPos: Vec3 | null = null;

    start() {
        if (this.featurePopup) this.featurePopup.active = false;
        if (this.alarm) this.alarm.active = false;
        if (this.modeRoot) this.modeRoot.active = false;
        if (this.scatterBtn) this.scatterBtn.active = false;

        if (this.wheelArrow && this.wheelArrow.isValid) {
            this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);
        }

        if (this.wheelPanel && this.wheelPanel.isValid) {
            this._wheelPanelOriginPos = this.wheelPanel.position.clone();
        }

        // 初始化 wheelMask：不显示，透明度 0
        if (this.wheelMask && this.wheelMask.isValid) {
            let op = this.wheelMask.getComponent(UIOpacity);
            if (!op) op = this.wheelMask.addComponent(UIOpacity);
            op.opacity = 0;
            this.wheelMask.active = false;
        }
    }

    /* ============ 对外入口：开始当前 feature mode（带警铃） ============ */

    public startWheelFeature() {
        // 0）先停掉 wheel 上所有 tween（包括 WheelController 做的待机旋转）
        if (this.wheel) {
            Tween.stopAllByTarget(this.wheel);
        }
        // 可选：顺手把 idle 脚本关掉，避免它后面再创建 tween
        if (this.wheelIdleController) {
            this.wheelIdleController.enabled = false;
        }

        // 1）alarm 出现的同时，blackMask 直接恢复到 200 透明度
        if (this.blackMask) {
            this.blackMask.active = true;
            let op = this.blackMask.getComponent(UIOpacity);
            if (!op) op = this.blackMask.addComponent(UIOpacity);
            op.opacity = 200;
        }

        // 2）打开弹窗，只显示 alarm
        if (this.featurePopup) this.featurePopup.active = true;
        if (this.alarm) this.alarm.active = true;
        if (this.modeRoot) this.modeRoot.active = false;
        if (this.scatterBtn) this.scatterBtn.active = false;

        // 播 alarm 动画（但不隐藏 alarm）
        this.playAlarmIntro();
    }

    /**
     * 对外入口：不播放警铃，直接显示轮盘并开始旋转
     */
    public startWheelOnly() {
        // 0）先停掉 wheel 上所有 tween（包括待机旋转）
        if (this.wheel) {
            Tween.stopAllByTarget(this.wheel);
        }
        if (this.wheelIdleController) {
            this.wheelIdleController.enabled = false;
        }

        // 1）黑幕拉起来（和有警铃时保持一致）
        if (this.blackMask) {
            this.blackMask.active = true;
            let op = this.blackMask.getComponent(UIOpacity);
            if (!op) op = this.blackMask.addComponent(UIOpacity);
            op.opacity = 200;
        }

        // 2）直接打开轮盘界面，但不显示 alarm
        if (this.featurePopup) this.featurePopup.active = true;
        if (this.alarm) this.alarm.active = false;
        if (this.modeRoot) this.modeRoot.active = false;
        if (this.scatterBtn) this.scatterBtn.active = false;

        // 3）指针角度归零
        if (this.wheelArrow && this.wheelArrow.isValid) {
            this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);
        }

        // 4）直接开始轮盘旋转（内部会先上移 + 提层级）
        this.startWheelSpin();
    }

    /* ============ Alarm 呼吸动画 + 停留时间 ============ */

    private playAlarmIntro() {
        if (!this.alarm) {
            this.onAlarmFinished();
            return;
        }

        // 12 帧 @30fps ≈ 0.4s 呼吸动画
        const breatheDuration = 12 / 30;
        const origin = this.alarm.scale.clone();
        const bigger = new Vec3(origin.x * 1.12, origin.y * 1.12, origin.z);

        tween(this.alarm)
            .to(breatheDuration / 2, { scale: bigger }, { easing: easeBezier_22_1_36_1 })
            .to(breatheDuration / 2, { scale: origin }, { easing: easeBezier_22_1_36_1 })
            // 额外停留 alarmStayDuration 秒
            .delay(this.alarmStayDuration)
            .call(() => {
                // 不隐藏 alarm，让它在 wheel 旋转过程中一直存在
                this.onAlarmFinished();
            })
            .start();
    }

    private onAlarmFinished() {
        this.startWheelSpin();
    }

    /* ============ Wheel 旋转（严格停在 30 或 180） ============ */

    private startWheelSpin() {
        if (!this.wheel) {
            this.onWheelSpinFinished();
            return;
        }

        for (let i = 0; i < 21; i++) {
        this.scheduleOnce(() => {
            AudioManager.instance?.playOneShot('audio/sfx_spin', 1.0);
        }, i * 0.08); 
    }


        if (this._isWheelSpinning) return;
        this._isWheelSpinning = true;

        if (this._wheelTween) {
            this._wheelTween.stop();
            this._wheelTween = null;
        }

        // 当前轮盘角度（本地 z）
        const euler = this.wheel.eulerAngles;
        const startRaw = euler.z;
        const startNorm = normalizeAngle(startRaw);

        // 随机选择 30 或 180 作为最终“绝对角度”
        const pickIndex = Math.random() < 0.5 ? 0 : 1;
        const targetBase = this._targetAngles[pickIndex]; // 30 or 180

        // 正方向最小增量：startNorm → targetBase
        const deltaForward = (targetBase - startNorm + 360) % 360;

        // 多转 wheelExtraRounds 圈后，再顺着转到 targetBase
        const totalDelta = 360 * this.wheelExtraRounds + deltaForward;
        const targetRaw = startRaw + totalDelta;   // 这个会 >360，没问题

        this._wheelState.angle = startRaw;

        // 把「上移 + 提层级」和「开始旋转」串起来
        this.moveWheelPanelBeforeSpin(() => {
            // 开始指针摆动
            this.startArrowWobble();

            this._wheelTween = tween(this._wheelState)
                .to(this.wheelSpinDuration, { angle: targetRaw }, {
                    easing: easeBezier_22_1_36_1,
                    onUpdate: () => {
                        if (this.wheel && this.wheel.isValid) {
                            this.wheel.eulerAngles = new Vec3(
                                euler.x,
                                euler.y,
                                this._wheelState.angle
                            );
                        }
                    },
                })
                .call(() => {
                    // tween 结束时强制写死在 targetRaw，保证停住
                    this._wheelState.angle = targetRaw;
                    if (this.wheel && this.wheel.isValid) {
                        this.wheel.eulerAngles = new Vec3(
                            euler.x,
                            euler.y,
                            targetRaw
                        );
                    }

                    this.onWheelSpinFinished();
                })
                .start();
        });
    }

    /** 轮盘开始旋转前：wheelPanel 上移 + 放到 slotPanel 前面 */
    private moveWheelPanelBeforeSpin(onComplete: () => void) {
        if (!this.wheelPanel || !this.wheelPanel.isValid) {
            onComplete && onComplete();
            return;
        }

        // 调整层级：如果和 slotPanel 同一个父节点，则放到它前面
        const parent = this.wheelPanel.parent;
        if (parent && this.slotPanel && this.slotPanel.isValid && this.slotPanel.parent === parent) {
            const children = parent.children;
            const slotIndex = children.indexOf(this.slotPanel);
            if (slotIndex >= 0) {
                this.wheelPanel.setSiblingIndex(slotIndex + 1);
            }
        }

        // 计算目标位置：在初始位置基础上 Y+distance，避免多次叠加
        const basePos = this._wheelPanelOriginPos
            ? this._wheelPanelOriginPos
            : this.wheelPanel.position.clone();

        const targetPos = new Vec3(
            basePos.x,
            basePos.y + this.wheelPanelMoveUpDistance,
            basePos.z
        );

        // 如果距离或时间为 0，就直接设置并回调
        if (this.wheelPanelMoveUpDuration <= 0 || this.wheelPanelMoveUpDistance === 0) {
            this.wheelPanel.setPosition(targetPos);
            onComplete && onComplete();
            return;
        }

        tween(this.wheelPanel)
            .to(this.wheelPanelMoveUpDuration, { position: targetPos }, { easing: easeBezier_22_1_36_1 })
            .call(() => {
                onComplete && onComplete();
            })
            .start();
    }

    /* ============ Arrow 只做 0 ~ -12 度小幅摆动 ============ */

    private startArrowWobble() {
        if (!this.wheelArrow || !this.wheelArrow.isValid) return;

        this.stopArrowWobble();          // 这里默认会重置指针角度
        this._arrowState.angle = 0;

        if (this.wheelArrow && this.wheelArrow.isValid) {
            this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);
        }

        const playOne = () => {
            if (!this._isWheelSpinning || !this.wheelArrow || !this.wheelArrow.isValid) return;

            const target = -Math.random() * 36;           // 0 ~ -36 度
            const dur = 0.12 + Math.random() * 0.08;      // 0.12~0.2 秒

            this._arrowWobbleTween = tween(this._arrowState)
                .to(dur, { angle: target }, {
                    easing: easeBezier_22_1_36_1,
                    onUpdate: () => {
                        if (!this.wheelArrow || !this.wheelArrow.isValid) return;
                        this.wheelArrow.eulerAngles = new Vec3(0, 0, this._arrowState.angle);
                    }
                })
                .to(dur, { angle: 0 }, {
                    easing: easeBezier_22_1_36_1,
                    onUpdate: () => {
                        if (!this.wheelArrow || !this.wheelArrow.isValid) return;
                        this.wheelArrow.eulerAngles = new Vec3(0, 0, this._arrowState.angle);
                    }
                })
                .call(() => {
                    playOne();
                })
                .start();
        };

        playOne();
    }

    /** 
     * 停止指针摆动
     * @param resetNodeEuler 是否顺便把指针角度重置为 0（销毁时就不要重置了，避免访问无效节点）
     */
    private stopArrowWobble(resetNodeEuler: boolean = true) {
        if (this._arrowWobbleTween) {
            this._arrowWobbleTween.stop();
            this._arrowWobbleTween = null;
        }
        this._arrowState.angle = 0;

        if (resetNodeEuler && this.wheelArrow && this.wheelArrow.isValid) {
            this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);
        }
    }

    private onWheelSpinFinished() {
        this._isWheelSpinning = false;
        this.stopArrowWobble();

        // 先让 wheelMask 延迟一段时间后从 0 → 1（0 → 255），再进入 firesaw 动画
        if (this.wheelMask && this.wheelMask.isValid) {
            let op = this.wheelMask.getComponent(UIOpacity);
            if (!op) op = this.wheelMask.addComponent(UIOpacity);

            this.wheelMask.active = true;
            op.opacity = 0;

            const fadeDur = Math.max(this.wheelMaskFadeDuration, 0.01);
            const delayDur = Math.max(this.wheelMaskDelay, 0);

            tween(op)
                .delay(delayDur) // 等待 wheelMaskDelay 秒（比如 2s）
                .to(fadeDur, { opacity: 255 }, { easing: easeBezier_22_1_36_1 })
                .call(() => {
                    this.playModeFeature();
                })
                .start();
        } else {
            // 没配 mask 就直接进 firesaw 动画
            this.playModeFeature();
        }
    }

    /* ============ 通用 Feature Mode 动画（现在是 firesaw） ============ */

    private playModeFeature() {
        if (this.featurePopup) this.featurePopup.active = true;
        if (this.scatterBtn) this.scatterBtn.active = true;

        // 切换到 feature 时再隐藏 alarm
        if (this.alarm) {
            this.alarm.active = false;
        }

        if (!this.modeRoot) {
            this.onModeFinished();
            return;
        }

        this.modeRoot.active = true;

        const anim = this.modeRoot.getComponent(Animation);
        if (!anim || !this.modeAnimationName) {
            this.onModeFinished();
            return;
        }

        anim.once(Animation.EventType.FINISHED, this.onModeFinished, this);
        anim.play(this.modeAnimationName);

        for (let i = 0; i < 3; i++) {
                this.scheduleOnce(() => {
                    
                    AudioManager.instance?.playOneShot('audio/sfx_saw_show', 0.6);
                    }, i * 2); 
                }
                    
        
            }

    private onModeFinished() {
    if (this.scatterBtn) {
        this.scatterBtn.active = true;

        // ✅ ScatterBtn 出现 1 秒后显示 tap 提示
        this.scheduleOnce(() => {
            if (TapHintManager.instance && this.scatterBtn && this.scatterBtn.isValid) {
                TapHintManager.instance.showTap(
                    this.scatterBtn,
                    new Vec3(0, -90, 0),   // 按钮上方 80
                    this.scatterBtn        // 点击 scatterBtn 后自动隐藏
                );
            }
        }, 1.0);
    }
}


    /** ScatterBtn 点击后进入 Scatter0 */
    public onClickScatterBtn() {
        director.loadScene('Scatter0');
    }

    onDestroy() {
        this._isWheelSpinning = false;

        if (this._wheelTween) {
            this._wheelTween.stop();
            this._wheelTween = null;
        }

        // 销毁阶段只停止 tween，不再去改指针节点的欧拉角，避免 Vec3.set 访问到已释放的数据
        this.stopArrowWobble(false);
    }
} 
