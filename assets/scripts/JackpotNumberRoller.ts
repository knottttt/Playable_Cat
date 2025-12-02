// assets/scripts/JackpotPanelRoller.ts
import {
    _decorator,
    Component,
    Label,
    Color,
    CCInteger,
    CCFloat,
} from 'cc';

const { ccclass, property } = _decorator;

type LevelState = {
    label: Label;
    digitLength: number;
    baseColor: Color;
    overlayColor: Color;
    overlayBlend: number;
    timer: number;
    mixedColor: Color;
    currentValue: number;
};

@ccclass('JackpotPanelRoller')
export class JackpotPanelRoller extends Component {

    /** 各等级的 Label（按顺序拖：Grand, Major, Minor, Mini ...） */
    @property([Label])
    public levelLabels: Label[] = [];

    /** 对应的数字长度（位数），长度不足会用最后一个值顶上 */
    @property([CCInteger])
    public digitLengths: number[] = [];

    /** 基础颜色（通常是当前数值的主色） */
    @property([Color])
    public baseColors: Color[] = [];

    /** 叠加颜色（高亮色） */
    @property([Color])
    public overlayColors: Color[] = [];

    /** 叠加比例 0~1（0=原色，1=全高亮），长度不足用最后一个值顶上 */
    @property([CCFloat])
    public overlayBlends: number[] = [];

    /** 每个 level 的基础值（单位：整数），例如 [5000000000, 2000000000, ...] */
    @property([CCFloat])
    public baseValues: number[] = [];

    /** 每次刷新增加的最小步长（单位：整数） */
    @property
    public minStep: number = 1000;

    /** 每次刷新增加的最大步长（单位：整数） */
    @property
    public maxStep: number = 50000;

    /** 所有 level 共用的滚动间隔（秒） */
    @property
    public updateInterval: number = 0.05;

    private _levels: LevelState[] = [];

    start() {
        this._initLevels();
    }

    update(dt: number) {
        for (let i = 0; i < this._levels.length; i++) {
            const lv = this._levels[i];
            lv.timer += dt;
            if (lv.timer >= this.updateInterval) {
                lv.timer -= this.updateInterval;
                this._stepAndUpdateNumber(lv);
            }
        }
    }

    /* ================= 初始化 ================= */

    private _initLevels() {
        this._levels.length = 0;

        for (let i = 0; i < this.levelLabels.length; i++) {
            const label = this.levelLabels[i];
            if (!label) continue;

            const len = (this._getFromArray(this.digitLengths, i, 12) as number) | 0;
            const baseValNum = Number(this._getFromArray(this.baseValues, i, 0));
            const base = this._getFromArray(this.baseColors, i, label.color) as Color;
            const over = this._getFromArray(this.overlayColors, i, label.color) as Color;
            const blendRaw = Number(this._getFromArray(this.overlayBlends, i, 0.4));
            const blend = this._clamp01(blendRaw);

            const mixed = new Color();
            this._mixColor(base, over, blend, mixed);
            label.color = mixed;

            const state: LevelState = {
                label,
                digitLength: Math.max(1, len),
                baseColor: base.clone ? (base.clone() as Color) : new Color(base),
                overlayColor: over.clone ? (over.clone() as Color) : new Color(over),
                overlayBlend: blend,
                timer: 0,
                mixedColor: mixed,
                currentValue: baseValNum,
            };

            this._levels.push(state);
            this._updateLabelString(state);
        }
    }

    private _getFromArray<T>(arr: T[], index: number, fallback: T): T {
        if (!arr || arr.length === 0) return fallback;
        if (index < arr.length) return arr[index];
        return arr[arr.length - 1];
    }

    private _clamp01(v: number): number {
        if (v < 0) return 0;
        if (v > 1) return 1;
        return v;
    }

    private _mixColor(base: Color, over: Color, blend: number, out: Color) {
        const t = this._clamp01(blend);
        out.r = base.r + (over.r - base.r) * t;
        out.g = base.g + (over.g - base.g) * t;
        out.b = base.b + (over.b - base.b) * t;
        out.a = base.a + (over.a - base.a) * t;
    }

    /* ================= 数值增长 + 显示 ================= */

    /** 每次 tick：数值 + 随机步长，然后刷新 Label */
    private _stepAndUpdateNumber(lv: LevelState) {
        const min = Math.max(0, Math.floor(this.minStep));
        const max = Math.max(min, Math.floor(this.maxStep));
        const step = min + Math.random() * (max - min);

        lv.currentValue += step;
        this._updateLabelString(lv);
    }

    private _updateLabelString(lv: LevelState) {
        const label = lv.label;
        if (!label) return;

        let v = Math.floor(lv.currentValue);
        if (v < 0) v = 0;

        let raw = v.toString();
        const targetLen = lv.digitLength;

        if (raw.length > targetLen) {
            raw = raw.slice(raw.length - targetLen);
        } else if (raw.length < targetLen) {
            raw = this._leftPadZeros(raw, targetLen);
        }

        label.string = this._formatThousand(raw);
    }

    /** 用 0 补到指定长度（替代 padStart） */
    private _leftPadZeros(str: string, targetLen: number): string {
        let result = str;
        while (result.length < targetLen) {
            result = '0' + result;
        }
        return result;
    }

    /** 千位分隔符 */
    private _formatThousand(numStr: string): string {
        let result = '';
        let count = 0;

        for (let i = numStr.length - 1; i >= 0; i--) {
            result = numStr[i] + result;
            count++;
            if (count === 3 && i > 0) {
                result = ',' + result;
                count = 0;
            }
        }

        return result;
    }
}
