import { _decorator, Component, Node, Tween, tween, Animation } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('WheelController')
export class WheelController extends Component {

    @property(Node)
    wheel: Node | null = null;

    @property(Node)
    cat: Node | null = null;

    @property
    idleSpeed: number = 30;

    private idleTween: Tween<Node> | null = null;
    private isSpinning: boolean = false;
    private catAnim: Animation | null = null;

    start() {
        this.setupCatIdle();
        this.startIdleSpin();
    }

    private setupCatIdle() {
        if (!this.cat) return;

        this.catAnim = this.cat.getComponent(Animation);
        if (!this.catAnim) return;

        // 在动画资源里把 ANM_cat_idle 设置成 Loop，这里只负责播放
        this.catAnim.play('ANM_cat_idle');
    }

    startIdleSpin() {
        if (!this.wheel || this.idleTween) return;

        this.idleTween = tween(this.wheel)
            .by(1, { angle: -this.idleSpeed })
            .repeatForever()
            .start();
    }

    stopIdleSpin() {
        if (this.idleTween) {
            this.idleTween.stop();
            this.idleTween = null;
        }
    }

    playSpin(duration: number = 2.2, rounds: number = 3, finalAngle: number = 0) {
        if (!this.wheel || this.isSpinning) return;

        this.isSpinning = true;
        this.stopIdleSpin();

        const startAngle = this.wheel.angle;
        const totalRotation = 360 * rounds + finalAngle;

        tween(this.wheel)
            .to(duration, { angle: startAngle - totalRotation }, { easing: 'cubicOut' })
            .call(() => {
                this.isSpinning = false;
                this.startIdleSpin();
            })
            .start();
    }
}
