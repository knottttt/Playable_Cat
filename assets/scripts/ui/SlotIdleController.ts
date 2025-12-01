import { _decorator, Component, Node, tween, Vec3, Tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SlotIdleController')
export class SlotIdleController extends Component {

    // slotPanel 下面的 slotLayout
    @property(Node)
    public slotLayout: Node | null = null;

    // slotPanel 下面的 blackMask
    @property(Node)
    public blackMask: Node | null = null;

    // MainScene 里的 SpinBtn
    @property(Node)
    public spinButton: Node | null = null;

    private _spinTween: Tween<Node> | null = null;
    private _spinBtnOriginalScale: Vec3 | null = null;

    start() {
        // 进入主界面时做三件事：
        this._initRandomIcons();      // 1）每个 cell_ 的 base 随机一个 icon
        this._initBlackMask();        // 2）blackMask 保持显示
        this._startSpinButtonIdle();  // 3）SpinBtn 做呼吸动画等待点击
    }

    /**
     * 在 slotLayout 下找到所有名字以“cell_”开头的节点，
     * 对每个 cell：找到 base → 在 base.children 中随机显示一个 icon
     */
    private _initRandomIcons() {
        if (!this.slotLayout) {
            console.warn('[SlotIdleController] slotLayout 未绑定');
            return;
        }

        const allCells: Node[] = [];

        // 简单遍历 slotLayout 的所有子节点，找 name 以 cell_ 开头的
        const children = this.slotLayout.children;
        for (const child of children) {
            if (child.name.startsWith('cell_')) {
                allCells.push(child);
            }
            // 有的结构可能是 icon_1 下面再套 cell_0，这里可以按需要再加一层判断
            const grandChildren = child.children;
            for (const gc of grandChildren) {
                if (gc.name.startsWith('cell_')) {
                    allCells.push(gc);
                }
            }
        }

        if (allCells.length === 0) {
            console.warn('[SlotIdleController] 在 slotLayout 下没有找到任何 cell_* 节点');
            return;
        }

        for (const cell of allCells) {
            const base = cell.getChildByName('base');
            if (!base) {
                console.warn(`[SlotIdleController] ${cell.name} 下没有 base 节点`);
                continue;
            }

            const icons = base.children;
            if (!icons || icons.length === 0) {
                console.warn(`[SlotIdleController] ${cell.name}/base 下没有 icon 子节点`);
                continue;
            }

            // 随机选择一个索引
            const randomIndex = Math.floor(Math.random() * icons.length);

            icons.forEach((iconNode, index) => {
                iconNode.active = index === randomIndex;
            });
        }
    }

    /** 初始化 blackMask：保持显示即可，alpha 用你在编辑器设置的 200 */
    private _initBlackMask() {
        if (!this.blackMask) {
            console.warn('[SlotIdleController] blackMask 未绑定');
            return;
        }
        this.blackMask.active = true;
    }

    /** 让 SpinBtn 进入呼吸放大缩小动画 */
    private _startSpinButtonIdle() {
        if (!this.spinButton) {
            console.warn('[SlotIdleController] spinButton 未绑定');
            return;
        }

        if (this._spinTween) {
            return; // 已经在播放
        }

        this._spinBtnOriginalScale = this.spinButton.scale.clone();
        const origin = this._spinBtnOriginalScale;
        const bigger = new Vec3(origin.x * 1.08, origin.y * 1.08, origin.z);

        this._spinTween = tween(this.spinButton)
            .to(0.5, { scale: bigger })
            .to(0.5, { scale: origin })
            .union()
            .repeatForever()
            .start();
    }

    /** 之后开始真正滚轴 spin 时，可以调用这个方法停掉呼吸动画 */
    public stopSpinButtonIdle() {
        if (this._spinTween) {
            this._spinTween.stop();
            this._spinTween = null;
        }

        if (this.spinButton && this._spinBtnOriginalScale) {
            this.spinButton.setScale(this._spinBtnOriginalScale);
        }
    }

    onDestroy() {
        this.stopSpinButtonIdle();
    }
}
