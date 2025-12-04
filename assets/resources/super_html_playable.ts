/**
 * super-html playable adapter
 * @help https://store.cocos.com/app/detail/3657
 * @home https://github.com/magician-f/cocos-playable-demo
 * @author https://github.com/magician-f
 */
export class super_html_playable {

    /** 默认的 iOS App Store 地址（Hello Jackpot） */
    private readonly default_app_store_url: string = 'https://apps.apple.com/us/app/hello-jackpot/id6535655150';

    constructor () {
        // 可选：暴露一个全局函数，方便在任意地方调用
        // 在 Cocos 或 HTML 里直接用 window.playable_download()
        // 来触发下载，无需额外 CTA 脚本。
        // @ts-ignore
        if (typeof window !== 'undefined') {
            // @ts-ignore
            window.playable_download = this.download.bind(this);
        }
    }

    download() {
        console.log("download");

        // @ts-ignore
        if (typeof window !== 'undefined' && window.super_html) {
            // 确保 super_html.appstore_url 有值，没有的话用默认地址
            // @ts-ignore
            if (!super_html.appstore_url) {
                // @ts-ignore
                super_html.appstore_url = this.default_app_store_url;
            }
            // @ts-ignore
            super_html.download();
        } else {
            // 如果在普通浏览器环境（没 super_html），直接打开 App Store
            // @ts-ignore
            if (typeof window !== 'undefined' && window.open) {
                // @ts-ignore
                window.open(this.default_app_store_url, "_blank");
            }
        }
    }

    game_end() {
        console.log("game end");
        //@ts-ignore
        window.super_html && super_html.game_end();
    }

    /**
     * 是否隐藏下载按钮，意味着使用平台注入的下载按钮
     * channel : google
     */
    is_hide_download() {
        //@ts-ignore
        if (window.super_html && super_html.is_hide_download) {
            //@ts-ignore
            return super_html.is_hide_download();
        }
        return false
    }

    /**
     * 设置商店地址
     * channel : unity
     * @param url https://play.google.com/store/apps/details?id=com.unity3d.auicreativetestapp
     */
    set_google_play_url(url: string) {
        //@ts-ignore
        window.super_html && (super_html.google_play_url = url);
    }

    /**
    * 设置商店地址
    * channel : unity
    * @param url https://apps.apple.com/us/app/ad-testing/id1463016906
    */
    set_app_store_url(url: string) {
        // 如果传空，就回退到默认 Hello Jackpot 地址
        if (!url) {
            url = this.default_app_store_url;
        }
        //@ts-ignore
        window.super_html && (super_html.appstore_url = url);
    }

    /**
    * 是否开启声音
    * channel : ironsource
    */
    is_audio() {
        //@ts-ignore
        return (window.super_html && super_html.is_audio()) || true;
    }
}

export default new super_html_playable();
