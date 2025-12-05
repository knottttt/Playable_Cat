// assets/scripts/SlotIdleController.ts

import {
    _decorator,
    Component,
    Node,
    tween,
    Vec3,
    UIOpacity,
    Tween,
} from 'cc';
import { FeatureFiresawController } from './FeatureFiresawController';
import { TapHintManager } from './TapHintManager';
import { AudioManager } from '../scripts/core/AudioManager'; 

const { ccclass, property } = _decorator;

type CellData = {
    cell: Node;
    icons: Node[];
    index: number;
};

type HighlightData = {
    node: Node;
    tween: Tween<Node>;
    originalScale: Vec3;
};

@ccclass('SlotIdleController')
export class SlotIdleController extends Component {

    /** 滚轴布局根节点（用于收集 cell_xx） */
    @property(Node)
    slotLayout: Node = null;

    /** 开局盖在 reel 上的黑幕（200 → 0） */
    @property(Node)
    blackMask: Node = null;

    /** 结果结算后，用于转场到 wheel 的黑幕数组（全部 0 → 155） */
    @property([Node])
    transitionBlackMasks: Node[] = [];

    @property(Node)
    spinButton: Node = null;

    @property
    reelSpinDuration: number = 1.5;

    @property([Node])
    resultScatterCells: Node[] = [];

    @property([Node])
    resultFeatureCells: Node[] = [];

    /** 上方 wheel feature（firesaw）的控制器 */
    @property(FeatureFiresawController)
    featureController: FeatureFiresawController = null;

    /** 结果 cell 呼吸后，延迟多久再进入 feature（秒） */
    @property
    featureDelay: number = 2.0;

    private spinTween: Tween<Node> = null;
    private originalScale: Vec3 | null = null;
    private isReelSpinning: boolean = false;

    private cells: CellData[] = [];
    private spinElapsed: number = 0;

    private highlightInfos: HighlightData[] = [];
    private hasTriggeredFeature: boolean = false;

    start() {
        this.collectCells();
        this.randomizeIconsForIdle();
        AudioManager.instance?.playBgm('audio/main_bgm', 0.8);

        // 开局主黑幕盖在转轴上
        if (this.blackMask) {
            this.blackMask.active = true;
        }

        // 初始化多个转场 blackMask：先隐藏 & 透明度 0
        if (this.transitionBlackMasks && this.transitionBlackMasks.length > 0) {
            for (let i = 0; i < this.transitionBlackMasks.length; i++) {
                const mask = this.transitionBlackMasks[i];
                if (!mask || !mask.isValid) continue;

                let op = mask.getComponent(UIOpacity);
                if (!op) op = mask.addComponent(UIOpacity);
                op.opacity = 0;
                mask.active = false;
            }
        }

        this.startSpinButtonIdle();

        
    // ✅ 一开始在 Spin 按钮附近显示 tap 提示
    if (TapHintManager.instance && this.spinButton) {
        TapHintManager.instance.showTap(
            this.spinButton,
            new Vec3(16, -25, 0),   // 往上 80，可自己调
            this.spinButton        // 点击 Spin 后自动隐藏 tap
            );
        }   
    }

    /* 收集 cell 结构 */

    private collectCells() {
        this.cells.length = 0;
        if (!this.slotLayout) return;

        const children = this.slotLayout.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            if (child.name.indexOf('cell_') === 0) {
                this.pushCell(child);
            }

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
            if (n.name === 'frame') continue;
            icons.push(n);
        }

        if (!icons.length) return;

        this.cells.push({
            cell,
            icons,
            index: 0,
        });
    }

    /* 待机：随机一帧 */

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

    /* 滚轴单步 */

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

    /* Spin 按钮呼吸 */

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

    private stopSpinButtonIdle(resetScale: boolean = true) {
        if (this.spinTween) {
            this.spinTween.stop();
            this.spinTween = null;
        }

        if (
            resetScale &&
            this.spinButton &&
            this.spinButton.isValid &&
            this.originalScale
        ) {
            this.spinButton.setScale(this.originalScale);
        }
    }

    /* 点击 Spin */

    public onClickSpin() {
        if (this.isReelSpinning) return;
        this.isReelSpinning = true;

        AudioManager.instance?.playOneShot('audio/sfx_spin');

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
        if (!op) op = this.blackMask.addComponent(UIOpacity);

        tween(op)
            .to(0.4, { opacity: 0 })
            .call(() => {
                this.blackMask.active = false;
                this.startReelSpin();
            })
            .start();
    }

    /* 滚轴主逻辑 */

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
            this.applyFinalResult();

            // ✳️ 开始结果高亮（呼吸）
            this.startResultHighlight();

            // ✳️ 等待 featureDelay 秒：停止 cell 呼吸 → 渐显多个 blackMask → 进入 wheelOnly
            if (!this.hasTriggeredFeature && this.featureController) {
                this.hasTriggeredFeature = true;
                this.scheduleOnce(() => {
                    // 1）停掉呼吸动画
                    this.stopResultHighlight();

                    // 2）渐显转场黑幕，再进入 wheel（跳过警铃）
                    this.fadeInTransitionMaskAndEnterFeature();
                }, this.featureDelay);
            }
        }
    }

    /** 结算后渐显多个 blackMask（0 → 155）再进入 wheel feature */
    private fadeInTransitionMaskAndEnterFeature() {
        if (!this.featureController) return;

        // 若数组为空，则直接进入 wheel
        if (!this.transitionBlackMasks || this.transitionBlackMasks.length === 0) {
            this.featureController.startWheelOnly();
            return;
        }

        // 每个 blackMask 都从 0 → 155
        for (let i = 0; i < this.transitionBlackMasks.length; i++) {
            const mask = this.transitionBlackMasks[i];
            if (!mask || !mask.isValid) continue;

            let op = mask.getComponent(UIOpacity);
            if (!op) op = mask.addComponent(UIOpacity);

            // 保证从 0 开始
            op.opacity = 0;
            mask.active = true;

            tween(op)
                .to(0.4, { opacity: 155 })   // 可按手感调整时间和目标值
                .start();
        }

        // 0.4 秒后进入 wheel 动画（与 tween 时间保持一致）
        this.scheduleOnce(() => {
            this.featureController.startWheelOnly();
        }, 0.4);
    }

    /* 最终结果：scatter/feature + 其他随机 */

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

    /* 结果高亮：scatter×3 + feature×1 呼吸动画 */

    private startResultHighlight() {
        this.stopResultHighlight();

        const targets: Node[] = [];
        if (this.resultScatterCells) {
            for (let i = 0; i < this.resultScatterCells.length; i++) {
                const n = this.resultScatterCells[i];
                if (n && targets.indexOf(n) === -1) targets.push(n);
            }
        }
        if (this.resultFeatureCells) {
            for (let i = 0; i < this.resultFeatureCells.length; i++) {
                const n = this.resultFeatureCells[i];
                if (n && targets.indexOf(n) === -1) targets.push(n);
            }
        }

        for (let i = 0; i < targets.length; i++) {
            const node = targets[i];
            const origin = node.scale.clone();
            const bigger = new Vec3(origin.x * 1.12, origin.y * 1.12, origin.z);

            const tw = tween(node)
                .to(0.4, { scale: bigger })
                .to(0.4, { scale: origin })
                .union()
                .repeatForever()
                .start();

            this.highlightInfos.push({
                node,
                tween: tw,
                originalScale: origin,
            });
        }
    }

    public stopResultHighlight() {
        for (let i = 0; i < this.highlightInfos.length; i++) {
            const info = this.highlightInfos[i];
            if (info.tween) info.tween.stop();
            if (info.node) info.node.setScale(info.originalScale);
        }
        this.highlightInfos.length = 0;
    }

    onDestroy() {
        try {
            this.stopSpinButtonIdle();
        } catch (e) {
            console.warn("[SlotIdleController] onDestroy skipped, node already destroyed");
        }
    }
}
