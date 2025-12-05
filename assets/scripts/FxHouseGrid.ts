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
    Color,
} from 'cc';
import { sp } from 'cc';
import { EndingPopup } from './EndingPopup';
import { AudioManager } from './core/AudioManager';   // 🔹 新增：引入音频管理器

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

    @property(EndingPopup)
    endingPopup: EndingPopup | null = null;

    /** 调试：不等 FireSaw，直接在 start 播放一遍 */
    @property
    debugPlayOnStart: boolean = false;

    /** 🔹 使用 FireSaw 的逐格触发模式 */
    @property({
        tooltip: '为 true 时：由 FxFireSaw 的 FIRESAW_CELL_TRIGGER 逐格触发；为 false 时：仍然在 FIRESAW_FINISHED 里整盘播放 _playAllCells()'
    })
    useFireSawCellTrigger: boolean = true;

    /** 🔊 每个格子「盖房子」时播放的音效路径（resources/audio/sfx_frame） */
    @property({
        tooltip: 'resources 目录下的音效路径，例如：audio/sfx_frame'
    })
    FrameSfxPath: string = 'audio/sfx_frame';

    private _cfg: HouseConfig | null = null;
    private _goldSet: Set<number> = new Set();
    private _grandSet: Set<number> = new Set();

    onLoad () {
        this._loadConfigFromTxt();
        this._initAllCellsVisual();

        // 监听 FxFireSaw 的事件
        director.on('FIRESAW_FINISHED', this._onFireSawFinished, this);
        director.on('FIRESAW_CELL_TRIGGER', this._onCellTriggered, this);
    }

    start () {
        if (this.debugPlayOnStart) {
            this._playAllCells();
        }
    }

    onDestroy () {
        director.off('FIRESAW_FINISHED', this._onFireSawFinished, this);
        director.off('FIRESAW_CELL_TRIGGER', this._onCellTriggered, this);
    }

    //======================
    // 事件入口
    //======================

    /** 收到 FireSaw 行全部结束事件 */
    private _onFireSawFinished () {
        console.log('[FxHouseGrid] receive FIRESAW_FINISHED');

        // 老逻辑：整盘一次性播放
        if (!this.useFireSawCellTrigger) {
            this._playAllCells();
        }
        // 新逻辑：逐格触发时，这里什么也不做
    }

    /** 🔹 某一行/某一格的 ANM_frame 播完后触发 (row, col, extraDelay) */
    private _onCellTriggered (row: number, col: number, extraDelay: number = 0) {
        if (!this._cfg || !this.gridLayout) {
            console.warn('[FxHouseGrid] _onCellTriggered but cfg or gridLayout not ready');
            return;
        }
        const cols = this._cfg.cols || 0;
        const index = row * cols + col;

        this._playOneCellWithBaseDelay(index, extraDelay);
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
    // 主流程：按配置播放整个 Grid（老逻辑）
    //======================

    private _playAllCells () {
        if (!this._cfg || !this.gridLayout) {
            console.warn('[FxHouseGrid] _cfg 或 gridLayout 未就绪');
            return;
        }

        const cfg = this._cfg;
        const startDelay = cfg.startDelay ?? 0;
        const cellOffset = cfg.cellOffset ?? 0.08;

        const totalCells = this.gridLayout.children.length;

        for (let index = 0; index < totalCells; index++) {
            const baseDelay = startDelay + cellOffset * index;
            this._playOneCellWithBaseDelay(index, baseDelay);
        }
    }

    /** 🔹 单个格子完整播放逻辑，baseDelay 由外部决定 */
    private _playOneCellWithBaseDelay (index: number, baseDelay: number) {
        if (!this._cfg || !this.gridLayout) return;

        const cfg = this._cfg;
        const numbers = cfg.rewardNumbers || [];
        const totalCells = this.gridLayout.children.length;

        if (index < 0 || index >= totalCells) {
            console.warn('[FxHouseGrid] _playOneCellWithBaseDelay invalid index =', index);
            return;
        }

        const bonusNode = this.gridLayout.children[index];
        const reward = numbers[index] ?? 0;
        const isGold  = this._goldSet.has(index);
        const isGrand = this._grandSet.has(index);

        const houseRoot = bonusNode.getChildByName('house');
        const numRoot   = bonusNode.getChildByName('num');
        if (!houseRoot || !numRoot) return;

        const spineNode = houseRoot.getChildByName('house');
        const spine = spineNode?.getComponent(sp.Skeleton) ?? null;
        if (!spine) return;

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
            return;
        }

        const useGold = isGold || isGrand;
        const showAnim    = useGold ? 'gold_show'    : 'silver_show';
        const destroyAnim = useGold ? 'gold_destory' : 'sliver_destory';
        const bgTarget    = useGold ? bgGold : bgSilver;

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

            // 🔊 每个格子开始“盖房子”时 播一次 sfx_frame
            if (AudioManager.instance && this.FrameSfxPath) {
                AudioManager.instance.playOneShot(this.FrameSfxPath,0.6);
            }

            // 1）播放 show → destory（通过 Spine 队列）
            spine.clearTracks();
            spine.timeScale = 1;
            spine.setAnimation(0, showAnim, false);
            spine.addAnimation(0, destroyAnim, false, 0);

            // 2）destory 播放期间，让背景从 0 渐变到 255
            if (bgTarget) {
                bgTarget.active = true;
                const op = this._ensureOpacity(bgTarget, 0);
                op.opacity = 0;
                tween(op)
                    .delay(this.showDuration)
                    .to(this.destroyDuration, { opacity: 255 })
                    .start();
            }

            // 3）等 show + destory 完成后，再显示 num / grand
            const totalDelay = this.showDuration + this.destroyDuration;
            this.scheduleOnce(() => {
                // 显示 num
                numRoot.active = true;
                const numOp = this._ensureOpacity(numRoot, 0);

                // 设置金银颜色
                if (label) {
                    if (isGold) {
                        // #fcd817
                        label.color = new Color(252, 216, 23, 255);
                    } else {
                        // #f3f9ff
                        label.color = new Color(243, 249, 255, 255);
                    }
                }

                // 初始缩放
                numRoot.setScale(0.85, 0.85, 1);

                // 缩放动画
                tween(numRoot)
                    .to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                    .start();

                // 透明度动画
                tween(numOp)
                    .to(0.25, { opacity: 255 })
                    .start();

                // 显示 grand + 呼吸动画
                if (isGrand && grandNode) {
                    grandNode.active = true;
                    const gOp = this._ensureOpacity(grandNode, 0);
                    tween(gOp).to(1.5, { opacity: 255 }).start();
                    this._startGrandBreath(grandNode);
                    AudioManager.instance?.playOneShot('audio/sfx_house_boom', 0.6);

                    // ★ Grand 出现后 2 秒弹出 EndingPopup
                    if (this.endingPopup) {
                        this.endingPopup.showAfterGrand(2);
                    }
                }

            }, totalDelay);

        }, baseDelay);
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
