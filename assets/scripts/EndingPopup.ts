// assets/scripts/EndingPopup.ts
import { _decorator, Component, Node, sp, Label, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('EndingPopup')
export class EndingPopup extends Component {

    /** Grand 后延迟多少秒出现弹窗 */
    @property
    delayAfterGrand: number = 2.0;

    /** excellentwin 根节点 */
    @property(Node)
    excellentwin: Node | null = null;

    /** 出现时播放的动画（默认 birth） */
    @property({
        tooltip: "弹窗第一次出现时播放的 Spine 动画名称（非循环）"
    })
    birthAnimation: string = 'birth';

    /** 随后循环播放的动画（默认 loop） */
    @property({
        tooltip: "birth 播完后接着循环播放的 Spine 动画名称（循环）"
    })
    loopAnimation: string = 'loop';

    // ---------- 数字滚动相关 ----------

    /** 显示中奖金额的 Label（截图里的黄色数字那一个） */
    @property(Label)
    winLabel: Label | null = null;

    /** 数字滚动起始值 */
    @property
    startValue: number = 0;

    /** 数字滚动结束值（最终显示的数值） */
    @property
    endValue: number = 999999999999;

    /** 数字滚动时长（秒） */
    @property
    rollDuration: number = 1.2;

    // ----------------------------------

    onLoad () {
        // 默认隐藏
        this.node.active = false;

        // 自动查找 excellentwin
        if (!this.excellentwin) {
            this.excellentwin =
                this.node.getChildByName('excillentwin') ||
                this.node.getChildByName('excellentwin');
        }

        // 自动查找 Label（如果没在属性里手动拖）
        if (!this.winLabel && this.excellentwin) {
            const labelNode = this.excellentwin.getChildByName('Label');
            this.winLabel = labelNode?.getComponent(Label) ?? null;
        }
    }

    /** Grand 触发后延迟显示 */
    public showAfterGrand (delay?: number) {
        const d = delay ?? this.delayAfterGrand;
        this.scheduleOnce(() => {
            this.showAndPlay();
        }, d);
    }

    /** 显示并播放动画 + 数字滚动 */
    public showAndPlay () {
        this.node.active = true;

        const root = this.excellentwin;
        if (!root) {
            console.warn('[EndingPopup] excellentwin 节点未找到');
            return;
        }

        // 播放所有 Spine：birth -> loop
        for (const child of root.children) {
            const ske = child.getComponent(sp.Skeleton);
            if (!ske) continue;

            if (this.birthAnimation && ske.findAnimation(this.birthAnimation)) {
                ske.setAnimation(0, this.birthAnimation, false);
            } else {
                console.warn(`[EndingPopup] birthAnimation "${this.birthAnimation}" not found on ${child.name}`);
            }

            if (this.loopAnimation && ske.findAnimation(this.loopAnimation)) {
                ske.addAnimation(0, this.loopAnimation, true, 0);
            } else {
                console.warn(`[EndingPopup] loopAnimation "${this.loopAnimation}" not found on ${child.name}`);
            }
        }

        // 开始数字滚动
        this._playRollNumber();
    }

    /** 数字从 startValue 滚到 endValue，类似 jackpotPanel 的效果 */
    private _playRollNumber () {
        if (!this.winLabel) return;

        const start = this.startValue;
        const end   = this.endValue;

        // 先显示起始值
        this.winLabel.string = this._formatNumber(start);

        const data = { value: start };

        tween(data)
            .to(this.rollDuration, { value: end }, {
                onUpdate: () => {
                    // 每一帧更新 Label 文本
                    const v = Math.round(data.value);
                    this.winLabel!.string = this._formatNumber(v);
                },
            })
            .start();
    }

    /** 格式化成 99,999,999,999,999 这种形式 */
    private _formatNumber (value: number): string {
        const str = Math.max(0, Math.floor(value)).toString();
        // 插入千位分隔符
        return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
}
