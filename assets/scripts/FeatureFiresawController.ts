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

    /** 上方大轮盘 */
    @property(Node)
    public wheel: Node = null;

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

    /** 当前 feature 模式要播放的动画名（默认 ANM_feature_firesaw） */
    @property
    public modeAnimationName: string = 'ANM_feature_firesaw';

    /** 最后出现，让玩家点击进入 Scatter0 的按钮 */
    @property(Node)
    public scatterBtn: Node = null;

    /** wheel 旋转时间（秒） */
    @property
    public wheelSpinDuration: number = 2.0;

    /** 旋转额外圈数（例如 3 = 多转 3 圈再停） */
    @property
    public wheelExtraRounds: number = 3;

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

    start() {
        if (this.featurePopup) this.featurePopup.active = false;
        if (this.alarm) this.alarm.active = false;
        if (this.modeRoot) this.modeRoot.active = false;
        if (this.scatterBtn) this.scatterBtn.active = false;

        if (this.wheelArrow) {
            this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);
        }
    }

    /* ============ 对外入口：开始当前 feature mode ============ */

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

        // 开始指针摆动
        this.startArrowWobble();

        this._wheelTween = tween(this._wheelState)
            .to(this.wheelSpinDuration, { angle: targetRaw }, {
                easing: easeBezier_22_1_36_1,
                onUpdate: () => {
                    this.wheel.eulerAngles = new Vec3(
                        euler.x,
                        euler.y,
                        this._wheelState.angle
                    );
                },
            })
            .call(() => {
                // tween 结束时强制写死在 targetRaw，保证停住
                this._wheelState.angle = targetRaw;
                this.wheel.eulerAngles = new Vec3(
                    euler.x,
                    euler.y,
                    targetRaw
                );

                this.onWheelSpinFinished();
            })
            .start();
    }

    /* ============ Arrow 只做 0 ~ -12 度小幅摆动 ============ */

    private startArrowWobble() {
        if (!this.wheelArrow) return;

        this.stopArrowWobble();
        this._arrowState.angle = 0;
        this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);

        const playOne = () => {
            if (!this._isWheelSpinning || !this.wheelArrow) return;

            const target = -Math.random() * 36;           // 0 ~ -12 度
            const dur = 0.12 + Math.random() * 0.08;      // 0.12~0.2 秒

            this._arrowWobbleTween = tween(this._arrowState)
                .to(dur, { angle: target }, {
                    easing: easeBezier_22_1_36_1,
                    onUpdate: () => {
                        this.wheelArrow.eulerAngles = new Vec3(0, 0, this._arrowState.angle);
                    }
                })
                .to(dur, { angle: 0 }, {
                    easing: easeBezier_22_1_36_1,
                    onUpdate: () => {
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

    private stopArrowWobble() {
        if (this._arrowWobbleTween) {
            this._arrowWobbleTween.stop();
            this._arrowWobbleTween = null;
        }
        this._arrowState.angle = 0;

        if (this.wheelArrow) {
            this.wheelArrow.eulerAngles = new Vec3(0, 0, 0);
        }
    }

    private onWheelSpinFinished() {
        this._isWheelSpinning = false;
        this.stopArrowWobble();
        this.playModeFeature();
    }

    /* ============ 通用 Feature Mode 动画（现在是 firesaw） ============ */

    private playModeFeature() {
        if (this.featurePopup) this.featurePopup.active = true;

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
    }

    private onModeFinished() {
        if (this.scatterBtn) {
            this.scatterBtn.active = true;
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
        this.stopArrowWobble();
    }
}
