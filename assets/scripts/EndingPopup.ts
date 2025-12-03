// assets/scripts/EndingPopup.ts
import { _decorator, Component, Node, sp } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('EndingPopup')
export class EndingPopup extends Component {

    /** Grand 后延迟多少秒出现弹窗 */
    @property
    delayAfterGrand: number = 2.0;

    /** excellentwin 节点，不拖的话会自动按名字查找 */
    @property(Node)
    excellentwin: Node | null = null;

    onLoad () {
        // 默认先隐藏
        this.node.active = false;

        if (!this.excellentwin) {
            // 注意拼写，按你的层级是 "excillentwin" 还是 "excellentwin" 自己改
            this.excellentwin =
                this.node.getChildByName('excillentwin') ||
                this.node.getChildByName('excellentwin');
        }
    }

    /** Grand 出现后调用这个方法，delay 不传就用 delayAfterGrand */
    public showAfterGrand (delay?: number) {
        const d = delay ?? this.delayAfterGrand;
        this.scheduleOnce(() => {
            this.showAndPlay();
        }, d);
    }

    /** 立刻显示弹窗，并播放 excellentwin 下所有 spine 的 birth->loop */
    public showAndPlay () {
        this.node.active = true;

        const root = this.excellentwin;
        if (!root) {
            console.warn('[EndingPopup] excellentwin 节点未找到');
            return;
        }

        for (const child of root.children) {
            const ske = child.getComponent(sp.Skeleton);
            if (!ske) continue;

            // 先播 birth（不循环），再接一个 loop（循环）
            ske.setAnimation(0, 'birth', false);
            ske.addAnimation(0, 'loop', true, 0);
        }
    }
}
