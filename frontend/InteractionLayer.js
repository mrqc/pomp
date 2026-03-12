import ml5 from 'ml5';
import {html, LitElement, css} from "lit";
import p5 from 'p5';
import {ClientServerSynchronization} from "./service/ClientServerSynchronization.js";

export class InteractionLayer extends LitElement {
    static styles = css`
        :host {
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            z-index: 99999;
            background-color: #FFFFFF00;
            display: block;
            pointer-events: none;
        }
        #interaction-canvas-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            pointer-events: none;
        }
        #dom-pointer {
            position: absolute;
            width: 5px;
            height: 5px;
            background: red;
            z-index: 100000;
            border-radius: 50%;
            left: 0px;
            top: 0px;
            transition: left 0.05s linear, top 0.05s linear;
            pointer-events: auto;
        }
    `;
    handPose;
    hands = [];
    video;
    pxs = [];
    pys = [];
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
        }
    }

    firstUpdated() {
        const container = this.renderRoot.getElementById('interaction-canvas-container');
        const domPointer = this.renderRoot.getElementById('dom-pointer');
        this.p5Instance = new p5((sketch) => {
            let videoWidth = 640;
            let videoHeight = 480;
            sketch.setup = () => {
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
            sketch.draw = async () => {
                sketch.clear();
                sketch.image(this.video,
                    this.canvasWidth / 2 - videoWidth / 2,
                    this.canvasHeight / 2 - videoHeight / 2,
                    videoWidth,
                    videoHeight);
                if (this.hands.length > 0) {
                    let hand = this.hands[0];
                    let index = hand.index_finger_tip;
                    let thumb = hand.thumb_tip;
                    let middle = hand.middle_finger_tip;
                    let ring = hand.ring_finger_tip;
                    let pinky = hand.pinky_finger_tip;

                    let paddingX = 800;
                    let paddingY = 500;
                    let sumPxs = this.pxs.reduce((acc, val) => acc + val, 0);
                    let sumPys = this.pys.reduce((acc, val) => acc + val, 0);
                    let x = (index.x + thumb.x + sumPxs) * 1.0 / (2.0 + this.pxs.length);
                    let y = (index.y + thumb.y + sumPys) * 1.0 / (2.0 + this.pys.length);
                    let ratioX = x / (videoWidth);
                    let ratioY = y / (videoHeight);
                    let transformedX = (this.canvasWidth) * ratioX;
                    let transformedY = (this.canvasHeight) * ratioY;

                    let paddingXRatio = (x - videoWidth / 2) / (videoWidth / 2);
                    let paddingYRatio = (y - videoHeight / 2) / (videoHeight / 2);

                    let d1 = sketch.dist(index.x, index.y, thumb.x, thumb.y);
                    let d2 = sketch.dist(middle.x, middle.y, thumb.x, thumb.y);
                    let d3 = sketch.dist(ring.x, ring.y, thumb.x, thumb.y);
                    let d4 = sketch.dist(pinky.x, pinky.y, thumb.x, thumb.y);

                    let domX = (this.canvasWidth - transformedX) - paddingX * paddingXRatio;
                    let domY = (transformedY) + paddingY * paddingYRatio;

                    function getDeepestElementFromPoint(x, y) {
                        let el = document.elementFromPoint(x, y);
                        let deepest = el;
                        while (el && el.shadowRoot) {
                            // elementFromPoint in shadowRoot uses coordinates relative to the viewport
                            const inner = el.shadowRoot.elementFromPoint(x, y);
                            if (!inner || inner === el) break;
                            deepest = inner;
                            el = inner;
                        }
                        return deepest;
                    }

                    if (d1 < 25 && d2 < 25 && d3 < 25 && d4 < 25) {
                        console.log(d1 + " " + d2 + " " + d3 + " " + d4)
                        if (!this.isPinching) {
                            const clientServerSync = await ClientServerSynchronization.getInstance();
                            clientServerSync.setValue("SpeechContext", "content", "");
                            return
                        }
                    }

                    if (d1 < 20) {
                        if (!this.isPinching) {
                            this.isPinching = true;
                            const target = getDeepestElementFromPoint(domX, domY);
                            if (target) {
                                console.log(target.id + " " + target.tagName);
                                let event = {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    composed: true,
                                    clientX: domX,
                                    clientY: domY
                                };
                                target.dispatchEvent(new MouseEvent('mousedown', event));
                                target.dispatchEvent(new MouseEvent('mouseup', event));
                                target.dispatchEvent(new MouseEvent('click', event));
                                const tag = target.tagName.toLowerCase();
                                if (tag === "input" || tag === "textarea") {
                                    target.focus();
                                    if (target.type === "checkbox" || target.type === "radio") {
                                        target.checked = !target.checked;
                                        target.dispatchEvent(new Event('change', {bubbles: true}));
                                    }
                                } else if (tag === "select") {
                                    target.focus();
                                    target.dispatchEvent(new MouseEvent('mousedown', event));
                                    target.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
                                }
                            }
                        }
                    } else {
                        this.isPinching = false;
                    }
                    if (domPointer) {
                        domPointer.style.left = `${domX - 2.5}px`;
                        domPointer.style.top = `${domY - 2.5}px`;
                    }
                    this.pxs.push(x);
                    this.pys.push(y);
                    let maxElements = 3;
                    if (this.pxs.length > maxElements) {
                        this.pxs = this.pxs.slice(-maxElements);
                    }
                    if (this.pys.length > maxElements) {
                        this.pys = this.pys.slice(-maxElements);
                    }
                }
            };
        }, container);
    }

    render() {
        return html`
            <div id="interaction-canvas-container"></div>
            <div id="dom-pointer"></div>
        `;
    }
}

customElements.define('interaction-layer', InteractionLayer);
