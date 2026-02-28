import ml5 from 'ml5';
import {html, LitElement, css} from "lit";
import p5 from 'p5';

export class InteractionLayer extends LitElement {
    static styles = css`
        :host {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            pointer-events: none;
            background-color: #2563eb;
            display: block;
        }
        #interaction-canvas-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            pointer-events: none;
        }
    `;
    handPose;
    hands;
    painting;
    video;
    px;
    py;
    
    connectedCallback() {
        super.connectedCallback();
        this.handPose = ml5.handPose({ flipped: true });
        this.setup();
    }

    gotHands(results) {
        this.hands = results;
    }

    setup() {
        createCanvas(640, 480);
        this.painting = createGraphics(640, 480);
        this.painting.clear();
        this.video = createCapture(VIDEO, { flipped: true });
        this.video.hide();
        this.handPose.detectStart(video, this.gotHands);
    }

    draw() {
        image(this.video, 0, 0);
        if (this.hands.length > 0) {
            let hand = (this.hands)[0];
            let index = hand.index_finger_tip;
            let thumb = hand.thumb_tip;
            let x = (index.x + thumb.x) * 0.5;
            let y = (index.y + thumb.y) * 0.5;
            let d = dist(index.x, index.y, thumb.x, thumb.y);
            if (d < 20) {
                this.painting.stroke(255, 255, 0);
                this.painting.strokeWeight(8);
                this.painting.line(this.px, this.py, x, y);
            }
            this.px = x;
            this.py = y;
        }
        image(this.painting, 0, 0);
    }

    render() {
        return html`
            <div id="interaction-canvas-container"></div>
        `;
    }
}

customElements.define('interaction-layer', InteractionLayer);
