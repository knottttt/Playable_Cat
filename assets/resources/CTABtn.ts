// assets/scripts/PlayDownload.ts
import { _decorator, Component } from 'cc';
import playable from './super_html_playable';

const { ccclass } = _decorator;

@ccclass('PlayDownload')
export class PlayDownload extends Component {

    public onClickDownload() {
        playable.download();   // 👈 调用 super_html 逻辑
    }
}
