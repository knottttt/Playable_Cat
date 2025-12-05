// assets/scripts/EndingPopup.ts
import { _decorator, Component, Node, sp, Label, tween, Vec3, Tween } from 'cc';
const { ccclass, property } = _decorator;
import { TapHintManager } from './TapHintManager';
import { AudioManager } from './core/AudioManager';

@ccclass('EndingPopup')
export class EndingPopup extends Component {

    @property
    delayAfterGrand: number = 2.0;

    @property
    tapHintDelay: number = 2.0;

    @property(Node)
    excellentwin: Node | null = null;

    /** 原底部 CTA（要隐藏） */
    @property(Node)
    bottomCtaBtn: Node | null = null;

    /** 弹窗 CTA（要显示 + 呼吸动画） */
    @property(Node)
    popupCtaBtn: Node | null = null;

    @property
    birthAnimation: string = 'birth';

    @property
    loopAnimation: string = 'loop';

    @property(Label)
    winLabel: Label | null = null;

    @property
    startValue: number = 0;

    @property
    endValue: number = 999999999999;

    @property
    rollDuration: number = 1.2;

    /** ⭐ CTA 呼吸动画 Tween 句柄 */
    private _ctaBreathTween: Tween<Node> | null = null;

    onLoad () {
        this.node.active = false;

        if (!this.excellentwin) {
            this.excellentwin =
                this.node.getChildByName('excillentwin') ||
                this.node.getChildByName('excellentwin');
        }

        if (!this.winLabel && this.excellentwin) {
            const labelNode = this.excellentwin.getChildByName('Label');
            this.winLabel = labelNode?.getComponent(Label) ?? null;
        }

        if (this.popupCtaBtn) {
            this.popupCtaBtn.active = false;
        }
    }

    public showAfterGrand (delay?: number) {
        const d = delay ?? this.delayAfterGrand;
        this.scheduleOnce(() => this.showAndPlay(), d);
    }

    public showAndPlay () {
        this.node.active = true;

        const root = this.excellentwin;
        if (!root) {
            console.warn('[EndingPopup] excellentwin 节点未找到');
            return;
        }
        AudioManager.instance?.playOneShot('audio/sfx_end_win', 1.0);
        AudioManager.instance?.playOneShot('audio/sfx_coin', 0.6);

        // 播 Spine birth → loop
        for (const child of root.children) {
            const ske = child.getComponent(sp.Skeleton);
            if (!ske) continue;

            if (this.birthAnimation && ske.findAnimation(this.birthAnimation)) {
                ske.setAnimation(0, this.birthAnimation, false);
            }
            if (this.loopAnimation && ske.findAnimation(this.loopAnimation)) {
                ske.addAnimation(0, this.loopAnimation, true, 0);
            }
        }

        this._playRollNumber();

        // 隐藏底部 CTA
        if (this.bottomCtaBtn) this.bottomCtaBtn.active = false;

        // 显示弹窗 CTA 并播放呼吸动画
        if (this.popupCtaBtn) {
            this.popupCtaBtn.active = true;
            this._startCtaBreath(this.popupCtaBtn); 
        }

        // Tap 提示
        if (TapHintManager.instance) {
            const delay = Math.max(this.tapHintDelay, 0);

            this.scheduleOnce(() => {
                if (!this.popupCtaBtn || !this.popupCtaBtn.isValid) return;

                TapHintManager.instance.showTap(
                    this.popupCtaBtn,
                    new Vec3(0, -40, 0),
                    this.popupCtaBtn
                );
            }, delay);
        }
    }

    /** CTA 呼吸动画 */
    private _startCtaBreath(btn: Node) {
        if (!btn || !btn.isValid) return;

        // 停掉旧的
        if (this._ctaBreathTween) {
            this._ctaBreathTween.stop();
            this._ctaBreathTween = null;
        }

        const origin = btn.scale.clone();
        const big = new Vec3(origin.x * 1.08, origin.y * 1.08, origin.z);

        this._ctaBreathTween = tween(btn)
            .to(0.5, { scale: big })
            .to(0.5, { scale: origin })
            .union()
            .repeatForever()
            .start();

        // 点击 CTA 时停止呼吸动画
        btn.once(Node.EventType.TOUCH_END, () => {
            this._stopCtaBreath();
        });
    }

    private _stopCtaBreath() {
        if (this._ctaBreathTween) {
            this._ctaBreathTween.stop();
            this._ctaBreathTween = null;
        }
        if (this.popupCtaBtn && this.popupCtaBtn.isValid) {
            // 恢复原缩放
            this.popupCtaBtn.setScale(1, 1, 1);
        }
    }

    /** 数字滚动 */
    private _playRollNumber () {
        if (!this.winLabel) return;

        const data = { value: this.startValue };
        this.winLabel.string = this._formatNumber(this.startValue);

        tween(data)
            .to(this.rollDuration, { value: this.endValue }, {
                onUpdate: () => {
                    this.winLabel!.string = this._formatNumber(Math.round(data.value));
                },
            })
            .start();
    }

    private _formatNumber (value: number): string {
        const str = Math.max(0, Math.floor(value)).toString();
        return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
}
