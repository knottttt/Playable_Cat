// assets/scripts/FxHouseGrid.ts
import {
    _decorator,
    Component,
    Node,
    Label,
    UIOpacity,
    tween,
    Vec3,
    TextAsset,
    director,
} from 'cc';
import { sp } from 'cc';

const { ccclass, property } = _decorator;

interface HouseConfig {
    rows: number;
    cols: number;
    rewardNumbers: number[];   // 每个格子的数值（长度 >= rows * cols）
    goldIndexList: number[];   // gold 格子的 index
    grandIndexList?: number[]; // grand 图标的 index
    startDelay?: number;       // 整体延迟（秒）
    cellOffset?: number;       // 每个格子的偏移（秒）
}

@ccclass('FxHouseGrid')
export class FxHouseGrid extends Component {

    @property(Node)
    gridLayout: Node | null = null;

    /** house_config.txt（已改成 txt 的那个） */
    @property(TextAsset)
    configAsset: TextAsset | null = null;

    /** show 动画时长（秒） */
    @property
    showDuration: number = 0.8;

    /** destory 动画时长（秒） */
    @property
    destroyDuration: number = 1.5;

    /** grand 呼吸动画参数 */
    @property
    grandBreathScale: number = 1.12;

    @property
    grandBreathTime: number = 0.35;

    /** 调试：不等 FireSaw，直接在 start 播放一遍 */
    @property
    debugPlayOnStart: boolean = false;

    private _cfg: HouseConfig | null = null;
    private _goldSet: Set<number> = new Set();
    private _grandSet: Set<number> = new Set();

    onLoad () {
        this._loadConfigFromTxt();
        this._initAllCellsVisual();

        // 监听 FxFireSaw 发出来的事件
        director.on('FIRESAW_FINISHED', this._onFireSawFinished, this);
    }

    start () {
        if (this.debugPlayOnStart) {
            this._playAllCells();
        }
    }

    onDestroy () {
        director.off('FIRESAW_FINISHED', this._onFireSawFinished, this);
    }

    //======================
    // 事件入口
    //======================

    /** 收到 FireSaw 完成事件 → 正式开始 house grid */
    private _onFireSawFinished () {
        console.log('[FxHouseGrid] receive FIRESAW_FINISHED, start grid');
        this._playAllCells();
    }

    //======================
    // 配置加载 & 初始化
    //======================

    private _loadConfigFromTxt () {
        if (!this.configAsset) {
            console.warn('[FxHouseGrid] configAsset 未设置');
            return;
        }

        try {
            const json = JSON.parse(this.configAsset.text) as HouseConfig;
            this._cfg = json;
            this._goldSet = new Set(json.goldIndexList || []);
            this._grandSet = new Set(json.grandIndexList || []);
            console.log('[FxHouseGrid] config loaded:', json);
        } catch (e) {
            console.error('[FxHouseGrid] 解析 house_config 失败:', e);
        }
    }

    /** 初始化：所有格子背景透明、num / grand 隐藏 */
    private _initAllCellsVisual () {
        if (!this.gridLayout) return;

        for (const bonusNode of this.gridLayout.children) {
            const houseRoot = bonusNode.getChildByName('house');
            const numRoot   = bonusNode.getChildByName('num');
            if (!houseRoot || !numRoot) continue;

            const bgSilver = houseRoot.getChildByName('bg_silver');
            const bgGold   = houseRoot.getChildByName('bg_gold');
            const spineNode = houseRoot.getChildByName('house');
            const spine    = spineNode?.getComponent(sp.Skeleton) ?? null;

            if (bgSilver) {
                const op = this._ensureOpacity(bgSilver, 0);
                op.opacity = 0;
                bgSilver.active = false;
            }
            if (bgGold) {
                const op = this._ensureOpacity(bgGold, 0);
                op.opacity = 0;
                bgGold.active = false;
            }

            numRoot.active = false;
            this._ensureOpacity(numRoot, 0);

            const grandNode = numRoot.getChildByName('grand');
            if (grandNode) {
                grandNode.active = false;
                this._ensureOpacity(grandNode, 0);
                grandNode.setScale(new Vec3(1, 1, 1));
            }

            const labelNode = numRoot.getChildByName('Label');
            const label     = labelNode?.getComponent(Label);
            if (label) {
                label.string = '';
            }

            if (spine) {
                spine.clearTracks();
            }
        }
    }

    //======================
    // 主流程：按配置播放整个 Grid
    //======================

    private _playAllCells () {
        if (!this._cfg || !this.gridLayout) {
            console.warn('[FxHouseGrid] _cfg 或 gridLayout 未就绪');
            return;
        }

        const cfg = this._cfg;
        const numbers = cfg.rewardNumbers || [];
        const startDelay = cfg.startDelay ?? 0;
        const cellOffset = cfg.cellOffset ?? 0.08;

        const totalCells = this.gridLayout.children.length;

        for (let index = 0; index < totalCells; index++) {
            const bonusNode = this.gridLayout.children[index];
            const reward = numbers[index] ?? 0;
            const isGold  = this._goldSet.has(index);
            const isGrand = this._grandSet.has(index);

            const houseRoot = bonusNode.getChildByName('house');
            const numRoot   = bonusNode.getChildByName('num');
            if (!houseRoot || !numRoot) continue;

            const spineNode = houseRoot.getChildByName('house');
            const spine = spineNode?.getComponent(sp.Skeleton) ?? null;
            if (!spine) continue;

            const bgSilver = houseRoot.getChildByName('bg_silver');
            const bgGold   = houseRoot.getChildByName('bg_gold');

            const labelNode = numRoot.getChildByName('Label');
            const label     = labelNode?.getComponent(Label) ?? null;
            const grandNode = numRoot.getChildByName('grand') ?? null;

            // 先决定这个格子的显示内容
            if (label) {
                if (!isGrand) {
                    label.string = this._formatReward(reward);
                } else {
                    label.string = ''; // grand 只显示图标，不显示数字
                }
            }
            if (grandNode) {
                grandNode.active = false;
                this._ensureOpacity(grandNode, 0);
                tween(grandNode).stop();
                grandNode.setScale(new Vec3(1, 1, 1));
            }

            // 空格子（既不是 grand 又没有数值）直接跳过
            if (reward <= 0 && !isGrand) {
                continue;
            }

            const useGold = isGold || isGrand;

            const showAnim    = useGold ? 'gold_show'    : 'silver_show';
            const destroyAnim = useGold ? 'gold_destory' : 'sliver_destory';
            const bgTarget    = useGold ? bgGold : bgSilver;

            // 每个格子自己的时间偏移
            const baseDelay = startDelay + cellOffset * index;

            // 把初始状态重置一下
            if (bgSilver) {
                const op = this._ensureOpacity(bgSilver, 0);
                op.opacity = 0;
                bgSilver.active = false;
            }
            if (bgGold) {
                const op = this._ensureOpacity(bgGold, 0);
                op.opacity = 0;
                bgGold.active = false;
            }
            numRoot.active = false;
            this._ensureOpacity(numRoot, 0);

            // === 时间轴：baseDelay → show → destory → 显示 num / grand ===

            this.scheduleOnce(() => {
                // 1）播放 show → destory（通过 Spine 队列）
                spine.clearTracks();
                spine.timeScale = 1;
                spine.setAnimation(0, showAnim, false);
                // delay = 0 表示“紧接上一条动画播放完后”
                spine.addAnimation(0, destroyAnim, false, 0);

                // 2）destory 播放期间，让背景从 0 渐变到 255
                if (bgTarget) {
                    bgTarget.active = true;
                    const op = this._ensureOpacity(bgTarget, 0);
                    op.opacity = 0;
                    tween(op).to(this.destroyDuration, { opacity: 255 }).delay(this.showDuration).start();
                }

                // 3）等 show + destory 完成后，再显示 num / grand
                const totalDelay = this.showDuration + this.destroyDuration;
                this.scheduleOnce(() => {
                    // 显示 num
                    numRoot.active = true;
                    const numOp = this._ensureOpacity(numRoot, 0);
                    tween(numOp).to(0.25, { opacity: 255 }).start();

                    // 显示 grand + 呼吸动画
                    if (isGrand && grandNode) {
                        grandNode.active = true;
                        const gOp = this._ensureOpacity(grandNode, 0);
                        tween(gOp).to(0.25, { opacity: 255 }).start();
                        this._startGrandBreath(grandNode);
                    }

                }, totalDelay);

            }, baseDelay);
        }
    }

    //======================
    // 小工具函数
    //======================

    /** 确保节点有 UIOpacity 组件，并返回它 */
    private _ensureOpacity (node: Node, defaultValue: number): UIOpacity {
        let op = node.getComponent(UIOpacity);
        if (!op) {
            op = node.addComponent(UIOpacity);
        }
        // defaultValue 只在初始化阶段用，这里不强行覆盖
        return op;
    }

    /** grand 呼吸动画 */
    private _startGrandBreath (node: Node) {
        const base = node.scale.clone();
        const up   = new Vec3(
            base.x * this.grandBreathScale,
            base.y * this.grandBreathScale,
            base.z
        );

        tween(node)
            .repeatForever(
                tween()
                    .to(this.grandBreathTime, { scale: up })
                    .to(this.grandBreathTime, { scale: base }),
            )
            .start();
    }

    /** 数值格式：M 用 silver，B 用 gold（简化版） */
    private _formatReward (value: number): string {
        if (value >= 1000) {
            // 这里按 B 处理（你可以根据需要再精细化）
            return (value / 1000) + 'B';
        }
        return value + 'M';
    }
}
