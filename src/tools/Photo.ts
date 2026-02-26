import NodeWebcam from 'node-webcam';
import fs from "fs-extra";
import {fileURLToPath} from "url";
import path from "node:path";

const webcam = NodeWebcam.create({
    width: 1280,
    height: 720,
    quality: 100,
    saveShots: true,
    output: "jpeg",
    device: false,
    callbackReturn: "location"
});
fs.ensureDirSync("assets/photos");
webcam.capture("assets/photos/" + Date.now(), (err: any, data: any) => {
    if (err) {
        return console.error(err);
    }
    console.log(data);
});
