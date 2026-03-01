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
            background-color: #FFFFFF00;
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
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    isPinching = false;
    
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    disconnectedCallback() {
        window.removeEventListener('resize', this.handleResize.bind(this));
        super.disconnectedCallback();
    }

    handleResize() {
        this.canvasWidth = window.innerWidth;
        this.canvasHeight = window.innerHeight;
        if (this.p5Instance) {
            this.p5Instance.resizeCanvas(this.canvasWidth, this.canvasHeight);
            if (this.painting) {
                this.painting.resizeCanvas(this.canvasWidth, this.canvasHeight);
            }
        }
    }

    firstUpdated() {
        const container = this.renderRoot.getElementById('interaction-canvas-container');
        this.p5Instance = new p5((sketch) => {
            let videoWidth = 640;
            let videoHeight = 480;
            sketch.setup = () => {
                sketch.createCanvas(this.canvasWidth, this.canvasHeight).parent(container);
                this.painting = sketch.createGraphics(this.canvasWidth, this.canvasHeight);
                this.video = sketch.createCapture(sketch.VIDEO, { flipped: true });
                this.video.size(videoWidth, videoHeight);
                this.video.hide();
                this.video.elt.onloadeddata = () => {
                    this.handPose = ml5.handPose({ flipped: true }, () => {
                        this.handPose.detectStart(this.video, (result) => {
                            this.hands = result;
                        });
                    });
                };
            };
            sketch.windowResized = () => {
                this.handleResize();
            };
            sketch.draw = () => {
                sketch.clear();
                this.painting.clear();
                sketch.image(this.video, 
                    this.canvasWidth / 2 - videoWidth / 2, 
                    this.canvasHeight / 2 - videoHeight / 2, 
                    videoWidth, 
                    videoHeight);
                if (this.hands.length > 0) {
                    let hand = this.hands[0];
                    let index = hand.index_finger_tip;
                    let thumb = hand.thumb_tip;

                    let paddingX = 800;
                    let paddingY = 500;
                    let x = (index.x + thumb.x) * 0.5;
                    let y = (index.y + thumb.y) * 0.5;
                    let ratioX = x / (videoWidth);
                    let ratioY = y / (videoHeight);
                    let transformedX = (this.canvasWidth) * ratioX;
                    let transformedY = (this.canvasHeight) * ratioY;
                    
                    let paddingXRatio = (x - videoWidth / 2) / (videoWidth / 2);
                    let paddingYRatio = (y - videoHeight / 2) / (videoHeight / 2);
                    
                    let d = sketch.dist(index.x, index.y, thumb.x, thumb.y);
                    let domX = (this.canvasWidth - transformedX) - paddingX * paddingXRatio;
                    let domY = (transformedY) + paddingY * paddingYRatio;
                    
                    if (d < 20) {
                        alert("click");
                        if ( !this.isPinching) {
                            this.isPinching = true;
                            const target = document.elementFromPoint(domX, domY);
                            if (target) {
                                const evt = new MouseEvent('click', {
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: domX,
                                    clientY: domY
                                });
                                target.dispatchEvent(evt);
                            }
                        }
                    } else {
                        this.isPinching = false;
                    }
                    this.painting.noStroke();
                    this.painting.fill(255, 0, 0);
                    this.painting.ellipse(domX, domY, 10, 10);
                    this.px = x;
                    this.py = y;
                }
                sketch.image(this.painting, 0, 0, this.canvasWidth, this.canvasHeight);
            };
        }, container);
    }

    render() {
        return html`
            <div id="interaction-canvas-container"></div>
        `;
    }
}

customElements.define('interaction-layer', InteractionLayer);
