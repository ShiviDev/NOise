const ffmpeg = require('child_process').exec;

try {
    ffmpeg('ffmpeg -i "vid.mp4" -af "highpass=f=200 lowpass=f=3000,afftdn=nf=-25" output-video.mp4');
    console.log('done processing');
} catch (e) {
    console.log(e);
}