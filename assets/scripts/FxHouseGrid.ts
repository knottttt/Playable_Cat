// assets/scripts/FxHouseGrid.ts
import {
    _decorator,
    Component,
    Node,
    TextAsset,
    UIOpacity,
    tween,
    Vec3,
    Label,
    sp,
} from 'cc';
import { FxFireSaw } from './FxFireSaw';

const { ccclass, property } = _decorator;

type UnitType = 'M' | 'B';

interface CellConfig {
    value: number;
    unit: UnitType;
    grand?: boolean;
}

interface HouseConfig {
    cols: number;
    rows: number;
    cells: CellConfig[];
}

interface CellView {
    root: Node;
    houseSkel: sp.Skeleton | null;
    bgSilver: Node | null;
    bgGold: Node | null;
    numLabel: Label | null;
    grandNode: Node | null;
}

@ccclass('FxHouseGrid')
export class FxHouseGrid extends Component {

    @property(Node)
    gridLayout: Node | null = null;

    @property(TextAsset)
    configAsset: TextAsset | null = null;

    /** 是否等待 FireSaw 完成再开始 */
    @property
    waitFireSaw: boolean = true;

    /** FireSaw 的根节点（包含所有 FxFireSaw 的父节点） */
    @property(Node)
    fireSawRoot: Node | null = null;

    /** 格子依次播放的时间间隔（秒），按照 bonus_00, bonus_01, ... 的顺序偏移 */
    @property
    cellOffset: number = 0.15;

    /** destory 动画结束后，再延迟多少秒显示数字 */
    @property
    numDelayAfterDestroy: number = 0.05;

    private _config: HouseConfig | null = null;
    private _cells: CellView[] = [];

    onLoad () {
        this._scanGrid();
        this._applyConfig();
    }

    start () {
        if (this.waitFireSaw && this.fireSawRoot) {
            const delay = this._calcFireSawEndTime();
            console.log('[FxHouseGrid] wait fire saw, delay =', delay);
            this.scheduleOnce(() => {
                this._playAllCells();
            }, delay);
        } else {
            this._playAllCells();
        }
    }

    //================  初始化 & 配置  ===================

    private _scanGrid () {
        if (!this.gridLayout) {
            this.gridLayout = this.node.getChildByName('gridLayout') ?? null;
        }
        if (!this.gridLayout) {
            console.warn('[FxHouseGrid] gridLayout not assigned');
            return;
        }

        const children = this.gridLayout.children
            .filter(n => n.name.startsWith('bonus_'))
            .sort((a, b) => a.name.localeCompare(b.name));

        this._cells.length = 0;

        for (const bonus of children) {
            const houseRoot = bonus.getChildByName('house');
            const numRoot   = bonus.getChildByName('num');

            const bgSilver  = houseRoot?.getChildByName('bg_silver') ?? null;
            const bgGold    = houseRoot?.getChildByName('bg_gold') ?? null;
            const houseSkel = houseRoot?.getComponent(sp.Skeleton) ?? null;

            const labelNode = numRoot?.getChildByName('Label') ?? null;
            const numLabel  = labelNode?.getComponent(Label) ?? null;

            const grandNode = numRoot?.getChildByName('grand') ?? null;

            // 默认全部隐藏
            if (bgSilver) {
                const op = bgSilver.getComponent(UIOpacity) ?? bgSilver.addComponent(UIOpacity);
                op.opacity = 0;
            }
            if (bgGold) {
                const op = bgGold.getComponent(UIOpacity) ?? bgGold.addComponent(UIOpacity);
                op.opacity = 0;
            }
            if (numLabel) {
                numLabel.node.active = false;
            }
            if (grandNode) {
                grandNode.active = false;
            }

            this._cells.push({
                root: bonus,
                houseSkel,
                bgSilver,
                bgGold,
                numLabel,
                grandNode,
            });
        }

        console.log('[FxHouseGrid] cells scanned =', this._cells.length);
    }

    private _applyConfig () {
        if (!this.configAsset) {
            console.warn('[FxHouseGrid] configAsset not set');
            return;
        }

        const raw = (this.configAsset.text ?? (this.configAsset as any).string) as string;
        if (!raw) {
            console.warn('[FxHouseGrid] config text empty');
            return;
        }

        let cfg: HouseConfig;
        try {
            cfg = JSON.parse(raw) as HouseConfig;
        } catch (e) {
            console.error('[FxHouseGrid] JSON parse error:', e);
            return;
        }

        if (!cfg.cells || !Array.isArray(cfg.cells)) {
            console.warn('[FxHouseGrid] config.cells invalid');
            return;
        }

        if (cfg.cols * cfg.rows !== cfg.cells.length) {
            console.warn(
                `[FxHouseGrid] config size mismatch, rows*cols=${cfg.rows * cfg.cols}, cells=${cfg.cells.length}`,
            );
        }

        this._config = cfg;
        console.log('[FxHouseGrid] config loaded, cells =', cfg.cells.length);
    }

    //================  FireSaw 同步  ===================

    private _calcFireSawEndTime (): number {
        if (!this.fireSawRoot) return 0;

        const all = this.fireSawRoot.getComponentsInChildren(FxFireSaw);
        if (!all.length) {
            console.warn('[FxHouseGrid] no FxFireSaw found under fireSawRoot');
            return 0;
        }

        let max = 0;
        for (const saw of all) {
            const t = saw.getTotalDuration();
            if (t > max) max = t;
        }
        return max;
    }

    //================  播放逻辑  ===================

    private _playAllCells () {
        if (!this._config || !this._config.cells || !this._cells.length) {
            console.warn('[FxHouseGrid] cannot play, config or cells missing');
            return;
        }

        const total = Math.min(this._config.cells.length, this._cells.length);

        for (let i = 0; i < total; i++) {
            const cfg = this._config.cells[i];
            const view = this._cells[i];
            if (!cfg || !view) continue;
            this._scheduleCell(i, cfg, view);
        }
    }

    private _scheduleCell (index: number, cfg: CellConfig, view: CellView) {
        if (!view.houseSkel) {
            console.warn('[FxHouseGrid] cell has no skeleton, index =', index);
            return;
        }

        const isGold = cfg.unit === 'B';
        const showName    = isGold ? 'gold_show'   : 'silver_show';
        const destroyName = isGold ? 'gold_destory' : 'sliver_destory'; // 注意：你的动画名就是 sliver_destory

        const showDuration    = this._getAnimDuration(view.houseSkel, showName) || 0.8;
        const destroyDuration = this._getAnimDuration(view.houseSkel, destroyName) || 1.5;

        const startTime = index * this.cellOffset;

        // 1）播放 show
        this.scheduleOnce(() => {
            view.houseSkel!.setAnimation(0, showName, false);
        }, startTime);

        // 2）接着播放 destroy，同时把背景淡入
        this.scheduleOnce(() => {
            view.houseSkel!.setAnimation(0, destroyName, false);

            const bgNode = isGold ? view.bgGold : view.bgSilver;
            if (bgNode) {
                const op = bgNode.getComponent(UIOpacity) ?? bgNode.addComponent(UIOpacity);
                op.opacity = 0;
                tween(op).to(destroyDuration, { opacity: 255 }).start();
            }

            // 3）destory 播完后再显示数字 & grand
            this.scheduleOnce(() => {
                this._showNumber(cfg, view);
            }, this.numDelayAfterDestroy);

        }, startTime + showDuration);
    }

    /** 从 skeleton 里查某个动画片段的时长 */
    private _getAnimDuration (skeleton: sp.Skeleton, clipName: string): number {
        const data = skeleton.skeletonData?.getRuntimeData();
        const anim = data?.animations?.find(a => a.name === clipName);
        return anim ? anim.duration : 0;
    }

    private _showNumber (cfg: CellConfig, view: CellView) {
        if (!view.numLabel) return;

        // 文字：你可以按自己需要格式化
        view.numLabel.node.active = true;
        view.numLabel.string = cfg.grand ? 'GRAND' : `${cfg.value}${cfg.unit}`;

        let op = view.numLabel.node.getComponent(UIOpacity);
        if (!op) op = view.numLabel.node.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.2, { opacity: 255 }).start();

        // Grand 图标 + 呼吸动画
        if (cfg.grand && view.grandNode) {
            view.grandNode.active = true;
            const baseScale = view.grandNode.scale.clone();
            tween(view.grandNode)
                .repeatForever(
                    tween()
                        .to(0.4, { scale: new Vec3(baseScale.x * 1.1, baseScale.y * 1.1, baseScale.z) })
                        .to(0.4, { scale: baseScale }),
                )
                .start();
        }
    }
}
