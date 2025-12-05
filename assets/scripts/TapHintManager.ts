// assets/scripts/TapHintManager.ts
import {
    _decorator,
    Component,
    Node,
    Prefab,
    instantiate,
    Vec3,
    Animation,
} from 'cc';
import { sp } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('TapHintManager')
export class TapHintManager extends Component {

    /** 你的 tap 动画 prefab */
    @property(Prefab)
    tapPrefab: Prefab = null;

    /** 如果 tap 是 Spine，指定要播放的动画名；留空则用 Skeleton 自己的 animation 字段 */
    @property
    tapSpineAnimationName: string = '';

    /** 单例（方便别的脚本直接调用） */
    public static instance: TapHintManager | null = null;

    private _currentTapNode: Node | null = null;

    onLoad() {
        TapHintManager.instance = this;
    }

    onDestroy() {
        if (TapHintManager.instance === this) {
            TapHintManager.instance = null;
        }
    }

    /**
     * 在 target 附近显示 tap 提示
     * @param target 要指示点击的节点
     * @param offset 相对 target 的偏移（本地坐标）
     * @param bindClickNode 绑定点击事件的节点（点击这个节点后隐藏提示）
     */
    public showTap(
        target: Node,
        offset: Vec3 = new Vec3(0, 0, 0),
        bindClickNode?: Node,
    ) {
        if (!this.tapPrefab || !target || !target.isValid) return;

        // 先清掉旧的
        this.hideTap();

        const tapNode = instantiate(this.tapPrefab);
        this._currentTapNode = tapNode;

        // 放在和 target 相同的父节点下（保证在同一 UI 层级）
        tapNode.parent = target.parent;
        tapNode.setPosition(target.position.clone().add(offset));
        tapNode.active = true;

        // ✅ 自动播放 tap prefab 内的动画
        this._playTapAnimations(tapNode);

        // 点击目标节点后，自动隐藏 tap
        const listenNode = bindClickNode ?? tapNode;
        listenNode.once(Node.EventType.TOUCH_END, () => {
            this.hideTap();
        }, this);
    }

    /** 主动隐藏当前 tap 提示 */
    public hideTap() {
        if (this._currentTapNode && this._currentTapNode.isValid) {
            this._currentTapNode.destroy();
        }
        this._currentTapNode = null;
    }

    /** 自动播放 tap prefab 内的 Animation / Spine 动画 */
    private _playTapAnimations(root: Node) {
        if (!root || !root.isValid) return;

        // 1. 播放所有 Animation 组件（含子节点）
        const anims = root.getComponentsInChildren(Animation);
        for (const anim of anims) {
            if (!anim) continue;
            // 有默认动画就直接 play（默认 clip 或当前状态）
            if (anim.defaultClip) {
                anim.play(anim.defaultClip.name);
            } else {
                // 没默认 clip 就直接 play() 让它自己决定
                anim.play();
            }
        }

        // 2. 播放所有 Spine Skeleton（含子节点）
        const skes = root.getComponentsInChildren(sp.Skeleton);
        for (const ske of skes) {
            if (!ske) continue;

            let animName = this.tapSpineAnimationName.trim();
            if (!animName) {
                // 如果没有手动指定，就用 Skeleton 自己的 animation 字段
                animName = ske.animation || '';
            }

            if (animName) {
                ske.setAnimation(0, animName, true);
            }
        }
    }
}
