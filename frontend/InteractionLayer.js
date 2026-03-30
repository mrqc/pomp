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
    smootherXPoints = [];
    smootherYPoints = [];
    historyXPoints = [];
    historyYPoints = [];
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
                    let paddingX = 800;
                    let paddingY = 500;
                    let sumPxs = this.smootherXPoints.reduce((acc, val) => acc + val, 0);
                    let sumPys = this.smootherYPoints.reduce((acc, val) => acc + val, 0);
                    let x = (index.x + thumb.x + sumPxs) * 1.0 / (2.0 + this.smootherXPoints.length);
                    let y = (index.y + thumb.y + sumPys) * 1.0 / (2.0 + this.smootherYPoints.length);
                    let ratioX = x / (videoWidth);
                    let ratioY = y / (videoHeight);
                    let transformedX = (this.canvasWidth) * ratioX;
                    let transformedY = (this.canvasHeight) * ratioY;

                    let paddingXRatio = (x - videoWidth / 2) / (videoWidth / 2);
                    let paddingYRatio = (y - videoHeight / 2) / (videoHeight / 2);

                    let domX = (this.canvasWidth - transformedX) - paddingX * paddingXRatio;
                    let domY = (transformedY) + paddingY * paddingYRatio;

                    if (this.isHandPoseClosing(sketch, this.hands[0])) {
                        if ( !this.isPinching) {
                            const clientServerSync = await ClientServerSynchronization.getInstance();
                            clientServerSync.setRecordVariableValue("SpeechContext", "content", "");
                            return
                        }
                    }
                    
                    if (this.isScrollingMoveHorizontal(sketch, this.hands[0])) {
                        return;
                    }
                    
                    if (this.isScrollingMoveVertical(sketch, this.hands[0])) {
                        return;
                    }

                    if (this.isClicking(sketch, this.hands[0])) {
                        if (!this.isPinching) {
                            this.isPinching = true;
                            const target = this.getDeepestElementFromPoint(domX, domY);
                            if (target) {
                                this.simulateClickOnElement(domX, domY, target);
                            }
                        }
                    } else {
                        this.isPinching = false;
                    }
                    this.handleHandPointer(domPointer, domX, domY, x, y);
                    this.handleCoordinatesHistory(x, y);
                }
            };
        }, container);
    }
    
    isClicking(sketch, hand) {
        let index = hand.index_finger_tip;
        let thumb = hand.thumb_tip;
        let distanceIndexToThumb = sketch.dist(index.x, index.y, thumb.x, thumb.y);
        return distanceIndexToThumb < 20;
    }

    isScrollingMoveHorizontal(sketch, hand) {
        let index = hand.index_finger_tip;
        let middle = hand.middle_finger_tip;
        let ring = hand.ring_finger_tip;
        let pinky = hand.pinky_finger_tip;
        let distanceIndexToMiddle = sketch.dist(index.x, index.y, middle.x, middle.y);
        let distanceMiddleToRing = sketch.dist(middle.x, middle.y, ring.x, ring.y);
        let distanceRingToPinky = sketch.dist(ring.x, ring.y, pinky.x, pinky.y);
        console.log(distanceIndexToMiddle + " " + distanceMiddleToRing + " " + distanceRingToPinky);
        let isCloseDistances = distanceIndexToMiddle < 25 && distanceMiddleToRing < 25 && distanceRingToPinky < 25;
        let isHorizontal = Math.abs(index.y - middle.y) < 10 && Math.abs(middle.y - ring.y) < 10 && Math.abs(ring.y - pinky.y) < 10;
        return isCloseDistances && isHorizontal;
    }
    
    getScrollingMoveHorizontalDistance() {
        if (this.historyYPoints.length > 1) {
            return this.historyYPoints.at(-1) - this.historyYPoints.at(-2);
        }
        return 0;
    }

    getScrollingMoveVerticalDistance() {
        if (this.historyXPoints.length > 1) {
            return this.historyXPoints.at(-1) - this.historyXPoints.at(-2);
        }
        return 0;
    }

    isScrollingMoveVertical(sketch, hand) {
        let index = hand.index_finger_tip;
        let middle = hand.middle_finger_tip;
        let ring = hand.ring_finger_tip;
        let pinky = hand.pinky_finger_tip;
        let distanceIndexToMiddle = sketch.dist(index.x, index.y, middle.x, middle.y);
        let distanceMiddleToRing = sketch.dist(middle.x, middle.y, ring.x, ring.y);
        let distanceRingToPinky = sketch.dist(ring.x, ring.y, pinky.x, pinky.y);
        console.log(distanceIndexToMiddle + " " + distanceMiddleToRing + " " + distanceRingToPinky);
        let isCloseDistances = distanceIndexToMiddle < 25 && distanceMiddleToRing < 25 && distanceRingToPinky < 25;
        let isVertical = Math.abs(index.x - middle.x) < 10 && Math.abs(middle.x - ring.x) < 10 && Math.abs(ring.x - pinky.x) < 10;
        return isCloseDistances && isVertical;
    }

    isHandPoseClosing(sketch, hand) {
        let index = hand.index_finger_tip;
        let thumb = hand.thumb_tip;
        let middle = hand.middle_finger_tip;
        let ring = hand.ring_finger_tip;
        let pinky = hand.pinky_finger_tip;
        let distanceIndexToThumb = sketch.dist(index.x, index.y, thumb.x, thumb.y);
        let distanceMiddleToThumb = sketch.dist(middle.x, middle.y, thumb.x, thumb.y);
        let distanceRingToThumb = sketch.dist(ring.x, ring.y, thumb.x, thumb.y);
        let distancePinkyToThumb = sketch.dist(pinky.x, pinky.y, thumb.x, thumb.y);
        console.log(distanceIndexToThumb + " " + distanceMiddleToThumb + " " + distanceRingToThumb + " " + distancePinkyToThumb);
        return distanceIndexToThumb < 25 && distanceMiddleToThumb < 25 && distanceRingToThumb < 25 && distancePinkyToThumb < 25;
    }

    handleCoordinatesHistory(x, y) {
        this.historyXPoints.push(x);
        this.historyYPoints.push(y);
        let maxElements = 20;
        if (this.historyXPoints.length > maxElements) {
            this.historyXPoints = this.historyXPoints.slice(-maxElements);
        }
        if (this.historyYPoints.length > maxElements) {
            this.historyYPoints = this.historyYPoints.slice(-maxElements);
        }
    }

    handleHandPointer(domPointer, domX, domY, x, y) {
        if (domPointer) {
            domPointer.style.left = `${domX - 2.5}px`;
            domPointer.style.top = `${domY - 2.5}px`;
        }
        this.smootherXPoints.push(x);
        this.smootherYPoints.push(y);
        let maxElements = 3;
        if (this.smootherXPoints.length > maxElements) {
            this.smootherXPoints = this.smootherXPoints.slice(-maxElements);
        }
        if (this.smootherYPoints.length > maxElements) {
            this.smootherYPoints = this.smootherYPoints.slice(-maxElements);
        }
    }

    simulateClickOnElement(domX, domY, target) {
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

    getDeepestElementFromPoint(x, y) {
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

    render() {
        return html`
            <div id="interaction-canvas-container"></div>
            <div id="dom-pointer"></div>
        `;
    }
}

customElements.define('interaction-layer', InteractionLayer);
