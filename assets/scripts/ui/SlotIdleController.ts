// assets/scripts/ui/SlotIdleController.ts
import { _decorator, Component, Node, tween, Vec3, UIOpacity, Tween } from 'cc';
const { ccclass, property } = _decorator;

// 每个格子的缓存数据
type CellData = {
    cell: Node;
    icons: Node[];
    index: number;
};

@ccclass('SlotIdleController')
export class SlotIdleController extends Component {

    // slotPanel/slotLayout
    @property(Node)
    slotLayout: Node = null;

    // slotPanel/blackMask
    @property(Node)
    blackMask: Node = null;

    // MainScene 里的 SpinBtn
    @property(Node)
    spinButton: Node = null;

    // 滚轴 spin 的持续时间（秒）
    @property
    reelSpinDuration: number = 1.5;

    // 最终结果：哪些 cell 停成 scatter
    @property([Node])
    resultScatterCells: Node[] = [];

    // 最终结果：哪些 cell 停成 feature
    @property([Node])
    resultFeatureCells: Node[] = [];

    private spinTween: Tween<Node> = null;
    private originalScale: Vec3 = new Vec3(1, 1, 1);
    private isReelSpinning: boolean = false;

    private cells: CellData[] = [];
    private spinElapsed: number = 0;

    start() {
        // 收集所有 cell_* 与其 icons
        this.collectCells();

        // 待机：随机一帧
        this.randomizeIconsForIdle();

        // 显示黑幕
        if (this.blackMask) {
            this.blackMask.active = true;
        }

        // 按钮呼吸动画
        this.startSpinButtonIdle();
    }

    /* ---------------- 收集 cell 结构 ---------------- */

    private collectCells() {
        this.cells.length = 0;
        if (!this.slotLayout) return;

        const children = this.slotLayout.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            // 直接是 cell_*
            if (child.name.indexOf('cell_') === 0) {
                this.pushCell(child);
            }

            // 兼容 icon_0/cell_0 这种结构
            const grandChildren = child.children;
            for (let j = 0; j < grandChildren.length; j++) {
                const gc = grandChildren[j];
                if (gc.name.indexOf('cell_') === 0) {
                    this.pushCell(gc);
                }
            }
        }
    }

    private pushCell(cell: Node) {
        const base = cell.getChildByName('base');
        if (!base) return;

        const icons = base.children;
        if (!icons || icons.length === 0) return;

        const data: CellData = {
            cell: cell,
            icons: icons.slice(), // 拷贝一份数组
            index: 0
        };

        this.cells.push(data);
    }

    /* ---------------- 待机：随机一帧 ---------------- */

    private randomizeIconsForIdle() {
        for (let c = 0; c < this.cells.length; c++) {
            const data = this.cells[c];
            const icons = data.icons;
            if (!icons.length) continue;

            const r = Math.floor(Math.random() * icons.length);
            data.index = r;

            for (let i = 0; i < icons.length; i++) {
                icons[i].active = (i === r);
            }
        }
    }

    /* ---------------- 滚轴单步：顺序循环 ---------------- */

    private stepIconsOnce() {
        for (let c = 0; c < this.cells.length; c++) {
            const data = this.cells[c];
            const icons = data.icons;
            if (!icons.length) continue;

            data.index = (data.index + 1) % icons.length;

            for (let i = 0; i < icons.length; i++) {
                icons[i].active = (i === data.index);
            }
        }
    }

    /* ---------------- Spin 按钮呼吸动画 ---------------- */

    private startSpinButtonIdle() {
        if (!this.spinButton || this.spinTween) return;

        this.originalScale = this.spinButton.scale.clone();
        const origin = this.originalScale;
        const bigger = new Vec3(origin.x * 1.08, origin.y * 1.08, origin.z);

        this.spinTween = tween(this.spinButton)
            .to(0.5, { scale: bigger })
            .to(0.5, { scale: origin })
            .union()
            .repeatForever()
            .start();
    }

    private stopSpinButtonIdle() {
        if (this.spinTween) {
            this.spinTween.stop();
            this.spinTween = null;
        }
        if (this.spinButton) {
            this.spinButton.setScale(this.originalScale);
        }
    }

    /* ---------------- 点击 Spin：按钮隐藏 + 黑幕淡出 + 滚轴 spin ---------------- */

    // 按钮 Click 事件绑定这个函数
    public onClickSpin() {
        if (this.isReelSpinning) return;
        this.isReelSpinning = true;

        // 停掉按钮呼吸动画
        this.stopSpinButtonIdle();

        // 👉 点击后按钮隐藏
        if (this.spinButton) {
            this.spinButton.active = false;
        }

        // 黑幕淡出 → 开始滚轴 spin
        this.fadeOutBlackMaskAndSpin();
    }

    private fadeOutBlackMaskAndSpin() {
        if (!this.blackMask) {
            this.startReelSpin();
            return;
        }

        let op = this.blackMask.getComponent(UIOpacity);
        if (!op) {
            op = this.blackMask.addComponent(UIOpacity);
        }

        tween(op)
            .to(0.4, { opacity: 0 })  // 0.4 秒淡出
            .call(() => {
                this.blackMask.active = false;
                this.startReelSpin();
            })
            .start();
    }

    /* ---------------- 滚轴逻辑：顺序转动 + 精准停结果 ---------------- */

    private startReelSpin() {
        this.spinElapsed = 0;
        const stepInterval = 0.05; // 每 0.05 秒切一格

        this.schedule(this.reelSpinTick, stepInterval);
    }

    private reelSpinTick(dt: number) {
        this.spinElapsed += dt;

        // 每一 tick 顺序前进一步
        this.stepIconsOnce();

        if (this.spinElapsed >= this.reelSpinDuration) {
            this.unschedule(this.reelSpinTick);
            this.isReelSpinning = false;

            // 再小走一步
            this.stepIconsOnce();

            // 👉 最终结果：指定 scatter / feature
            this.applyFinalResult();
        }
    }

    // 最终停下来的结果：scatter / feature 强制落位
    private applyFinalResult() {
        for (let c = 0; c < this.cells.length; c++) {
            const data = this.cells[c];
            const cellNode = data.cell;
            const icons = data.icons;
            if (!icons.length) continue;

            let targetType = ""; // "scatter" | "feature" | ""

            // 看这个 cell 是否在 scatter 列表里
            if (this.resultScatterCells && this.resultScatterCells.indexOf(cellNode) !== -1) {
                targetType = "scatter";
            }

            // 看这个 cell 是否在 feature 列表里（如果同时配置，以 feature 优先）
            if (this.resultFeatureCells && this.resultFeatureCells.indexOf(cellNode) !== -1) {
                targetType = "feature";
            }

            if (targetType === "") {
                // 没有特别指定，就保持当前 index 不动
                continue;
            }

            const lowerType = targetType.toLowerCase();
            let targetIndex = -1;

            // 在 icons 中找到名字包含 scatter/feature 的那个
            for (let i = 0; i < icons.length; i++) {
                const name = icons[i].name.toLowerCase();
                if (name.indexOf(lowerType) !== -1) {
                    targetIndex = i;
                    break;
                }
            }

            // 如果找到了对应 icon，就强制切到该图标
            if (targetIndex >= 0) {
                data.index = targetIndex;
                for (let i = 0; i < icons.length; i++) {
                    icons[i].active = (i === data.index);
                }
            }
        }
    }

    onDestroy() {
        this.stopSpinButtonIdle();
        this.unschedule(this.reelSpinTick);
    }
}
