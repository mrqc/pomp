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
    hands = [];
    painting;
    video;
    px;
    py;
    p5Instance;

    connectedCallback() {
        super.connectedCallback();
        this.handPose = ml5.handPose({ flipped: true });
    }

    firstUpdated() {
        // Attach p5 sketch to the container
        const container = this.renderRoot.getElementById('interaction-canvas-container');
        this.p5Instance = new p5((sketch) => {
            sketch.setup = () => {
                sketch.createCanvas(640, 480).parent(container);
                this.painting = sketch.createGraphics(640, 480);
                this.painting.clear();
                this.video = sketch.createCapture(sketch.VIDEO, { flipped: true });
                this.video.hide();
                this.handPose.detectStart(this.video.elt, this.gotHands.bind(this));
            };
            sketch.draw = () => {
                sketch.image(this.video, 0, 0);
                if (this.hands && this.hands.length > 0) {
                    let hand = this.hands[0];
                    let index = hand.index_finger_tip;
                    let thumb = hand.thumb_tip;
                    let x = (index.x + thumb.x) * 0.5;
                    let y = (index.y + thumb.y) * 0.5;
                    let d = sketch.dist(index.x, index.y, thumb.x, thumb.y);
                    if (d < 20) {
                        this.painting.stroke(255, 255, 0);
                        this.painting.strokeWeight(8);
                        this.painting.line(this.px, this.py, x, y);
                    }
                    this.px = x;
                    this.py = y;
                }
                sketch.image(this.painting, 0, 0);
            };
        }, container);
    }

    gotHands(results) {
        console.log("gotHands")
        this.hands = results;
    }

    render() {
        return html`
            <div id="interaction-canvas-container"></div>
        `;
    }
}

customElements.define('interaction-layer', InteractionLayer);
