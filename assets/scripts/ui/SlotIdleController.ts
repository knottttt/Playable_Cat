// assets/scripts/ui/SlotIdleController.ts
import { _decorator, Component, Node, tween, Vec3, UIOpacity, Tween } from 'cc';
const { ccclass, property } = _decorator;

type CellData = {
    cell: Node;
    icons: Node[];
    index: number;
};

@ccclass('SlotIdleController')
export class SlotIdleController extends Component {

    @property(Node)
    slotLayout: Node = null;

    @property(Node)
    blackMask: Node = null;

    @property(Node)
    spinButton: Node = null;

    @property
    reelSpinDuration: number = 1.5;

    // 最终：哪些 cell 要是 scatter（第一行的 1、2、3）
    @property([Node])
    resultScatterCells: Node[] = [];

    // 最终：哪些 cell 要是 feature（第一行的 4）
    @property([Node])
    resultFeatureCells: Node[] = [];

    private spinTween: Tween<Node> = null;
    private originalScale: Vec3 = new Vec3(1, 1, 1);
    private isReelSpinning: boolean = false;

    private cells: CellData[] = [];
    private spinElapsed: number = 0;

    start() {
        this.collectCells();
        this.randomizeIconsForIdle();

        if (this.blackMask) {
            this.blackMask.active = true;
        }

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

        const children = base.children;
        if (!children || children.length === 0) return;

        const icons: Node[] = [];
        for (let i = 0; i < children.length; i++) {
            const n = children[i];

            // frame 不参与滚动
            if (n.name === 'frame') {
                continue;
            }
            icons.push(n);
        }

        if (icons.length === 0) return;

        const data: CellData = {
            cell: cell,
            icons: icons,
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

    /* ---------------- 点击 Spin ---------------- */

    public onClickSpin() {
        if (this.isReelSpinning) return;
        this.isReelSpinning = true;

        this.stopSpinButtonIdle();

        if (this.spinButton) {
            this.spinButton.active = false;
        }

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
            .to(0.4, { opacity: 0 })
            .call(() => {
                this.blackMask.active = false;
                this.startReelSpin();
            })
            .start();
    }

    /* ---------------- 滚轴逻辑 ---------------- */

    private startReelSpin() {
        this.spinElapsed = 0;
        const stepInterval = 0.05;

        this.schedule(this.reelSpinTick, stepInterval);
    }

    private reelSpinTick(dt: number) {
        this.spinElapsed += dt;

        this.stepIconsOnce();

        if (this.spinElapsed >= this.reelSpinDuration) {
            this.unschedule(this.reelSpinTick);
            this.isReelSpinning = false;

            this.stepIconsOnce();

            // 最终结果：强制落位
            this.applyFinalResult();
        }
    }

    /* ---------------- 最终结果：只让第一行变 scatter/feature ---------------- */

    private applyFinalResult() {
    for (let c = 0; c < this.cells.length; c++) {
        const data = this.cells[c];
        const cellNode = data.cell;
        const icons = data.icons;
        if (!icons.length) continue;

        const isScatterCell =
            this.resultScatterCells &&
            this.resultScatterCells.indexOf(cellNode) !== -1;

        const isFeatureCell =
            this.resultFeatureCells &&
            this.resultFeatureCells.indexOf(cellNode) !== -1;

        if (isScatterCell || isFeatureCell) {
            const targetType = isFeatureCell ? 'feature' : 'scatter';
            const lowerType = targetType.toLowerCase();
            let targetIndex = -1;

            for (let i = 0; i < icons.length; i++) {
                const name = icons[i].name.toLowerCase();
                if (name.indexOf(lowerType) !== -1) {
                    targetIndex = i;
                    break;
                }
            }

            if (targetIndex >= 0) {
                data.index = targetIndex;
                for (let i = 0; i < icons.length; i++) {
                    icons[i].active = (i === data.index);
                }
            }
        } else {
            // 非目标格子：在所有“普通符号”里随机一个（排除 scatter / feature）
            const normalIndices: number[] = [];

            for (let i = 0; i < icons.length; i++) {
                const name = icons[i].name.toLowerCase();
                if (
                    name.indexOf('scatter') === -1 &&
                    name.indexOf('feature') === -1
                ) {
                    normalIndices.push(i);
                }
            }

            if (normalIndices.length > 0) {
                const rand = Math.floor(Math.random() * normalIndices.length);
                const targetIndex = normalIndices[rand];

                data.index = targetIndex;
                for (let i = 0; i < icons.length; i++) {
                    icons[i].active = (i === data.index);
                }
            }
        }
    }
}


    onDestroy() {
        this.stopSpinButtonIdle();
        this.unschedule(this.reelSpinTick);
    }
}
