// assets/scripts/RandomBaseIcons.ts
import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 *  面板用：随机显示每个 cell/base 下的一个 icon
 *
 * 层级约定：
 * Panel
 *  └─ slot_bg
 *      └─ slotLayout
 *          ├─ icon_0
 *          │    ├─ cell_0
 *          │    │    └─ base (high3/high2/.../scatter)
 *          │    ├─ cell_1
 *          │    ├─ ...
 *          │    └─ cell_5
 *          ├─ icon_1
 *          └─ ...
 */
@ccclass('RandomBaseIcons')
export class RandomBaseIcons extends Component {

    /** 也可以在编辑器里手动拖 slotLayout 进来，不拖的话会自动查找 */
    @property(Node)
    slotLayout: Node | null = null;

    /** 是否把 scatter 也作为随机候选之一 */
    @property
    includeScatter: boolean = true;

    onLoad () {
        // 如果没在编辑器里绑定 slotLayout，就按约定路径自动查找
        if (!this.slotLayout) {
            const slotBg = this.node.getChildByName('slot_bg');
            this.slotLayout = slotBg?.getChildByName('slotLayout') ?? null;
        }
    }

    start () {
        // 面板打开时先随机一遍
        this.randomAllCells();
    }

    /**
     * 对所有列（icon_*）的所有 cell_* 做一遍随机
     */
    public randomAllCells () {
        if (!this.slotLayout) {
            console.warn('[RandomBaseIcons] slotLayout 未找到');
            return;
        }

        // 遍历每一列：icon_0 / icon_1 / ...
        for (const iconNode of this.slotLayout.children) {
            if (!iconNode.name.startsWith('icon_')) {
                continue;
            }

            // 遍历这一列里的 cell_0 ~ cell_5
            for (const cellNode of iconNode.children) {
                if (!cellNode.name.startsWith('cell_')) {
                    continue;
                }
                this.randomOneCell(cellNode);
            }
        }
    }

    /**
     * 对一个 cell 节点：在 base 下随机显示一个 icon
     */
    private randomOneCell (cellNode: Node) {
        const base = cellNode.getChildByName('base');
        if (!base) {
            console.warn('[RandomBaseIcons] 找不到 base 节点：', cellNode.name);
            return;
        }

        // 先把 base 里的所有图标都关掉
        for (const child of base.children) {
            child.active = false;
        }

        // 挑选可用的随机候选
        const candidates: Node[] = [];
        for (const child of base.children) {
            // 如果不想把 scatter 加进随机，就在这里过滤掉
            if (!this.includeScatter && child.name === 'scatter') {
                continue;
            }
            candidates.push(child);
        }

        if (candidates.length === 0) {
            console.warn('[RandomBaseIcons] base 下没有可用 icon：', base.name);
            return;
        }

        // 随机开启一个
        const idx = Math.floor(Math.random() * candidates.length);
        candidates[idx].active = true;
    }
}
