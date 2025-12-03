// assets/resouces/CTABtn.ts
import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CTABtn')
export class CTABtn extends Component {

    /** 点击跳转地址，可以在 Inspector 里改 */
    @property
    url: string = 'https://apps.apple.com/us/app/hello-jackpot/id6535655150';

    /**
     * 按钮点击事件（在 Button 的 Click Events 里绑定这个函数）
     */
    public onClickCTA () {
        const w: any = window;
        const targetUrl = this.url;

        try {
            // 1. 如果页面里有 playable 的统一函数，就统一走那一个
            if (typeof w.openPlayableStore === 'function') {
                w.openPlayableStore();
                return;
            }
            if (typeof w.install === 'function') {       // 兼容老项目
                w.install();
                return;
            }

            // 2. 常见广告 SDK 兜底（可留可不留）
            if (w.FbPlayableAd && typeof w.FbPlayableAd.onCTAClick === 'function') {
                w.FbPlayableAd.onCTAClick();
                return;
            }
            if (w.mraid && typeof w.mraid.open === 'function') {
                w.mraid.open(targetUrl);
                return;
            }
            if (w.dapi && typeof w.dapi.openStoreUrl === 'function') {
                w.dapi.openStoreUrl(targetUrl);
                return;
            }
            if (w.ExitApi && typeof w.ExitApi.exit === 'function') {
                w.ExitApi.exit();
                return;
            }

            // 3. 最终兜底：普通 H5
            window.open(targetUrl, '_blank');
        } catch (e) {
            console.warn('[CTABtn] open store failed:', e);
            window.open(targetUrl, '_blank');
        }
    }
}
