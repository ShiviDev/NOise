const express = require("express");
const bodyParser = require("body-parser");
const fluent = require('fluent-ffmpeg');
const Queue = require('bull');

//////////////////////////google rquires///////////////////////////////////////

const fs = require('fs').promises;
const fsnormal = require('fs');
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

let url = "https://drive.google.com/file/d/1RK5S_q89u5SL426NEzHKXE8AazF9Znzi/view?usp=share_link";


//////////////////////////////////////////////BULL-REDIS/////////////////////////////////////////////////////

const videoQueue = new Queue('video-queue');

videoQueue.process((job, done) => {
  console.log("reached");
  url = job.data.vidurl;
  return authorize().then(downloadFile).catch(console.error);
})

////////////////////////////////////////////////EXPRESS SETUP///////////////////////////////////////////////////

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


app.listen(3000, function () {
  console.log("Running on port 3k");
})
app.get("/", function (req, res) {
  res.sendFile(__dirname + "/front-end.html");
})

app.post("/", async function (req, res) {
  let url = req.body.url;
  console.log(url);
  await videoQueue.add({
    vidurl: url
  });
});

////////////////////////////////////////////GOOGLE DRIVE ACCESS SCRIPT///////////////////////////////////////////////////////

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function downloadFile(authClient) {

  const id = url.substring(url.indexOf('/d/') + 3, url.indexOf('/', url.indexOf('/d/') + 3))
  const drive = google.drive({ version: 'v3', auth: authClient });

  console.log(id);


  console.log("reached downloadfile");
  try {

    const file = await drive.files.get({
      fileId: id,
      alt: 'media',
    }, { responseType: 'stream' });

    const type = file.headers['content-type'];
    console.log(type);
    const extension = type.substring(type.indexOf("/") + 1);

    // use the below lines to use streams
    const writer = fsnormal.createWriteStream("./dummy." + extension);
    console.log("got streamObj");

    const streamObj = file.data;
    streamObj.pipe(writer);
    console.log(streamObj);
    // pass this stream obj to func
    handleffmpeg(streamObj);



  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}


//////////////////////////////////////////// FFMPEG ///////////////////////////////////////////////////////


function handleffmpeg(streamObj) {
  console.log("handleffmpeg reached");

  // setup execffmpeg
  const executeFfmpeg = args => {
    let command = fluent().output(' '); // pass "Invalid output" validation
    command._outputs[0].isFile = false; // disable adding "-y" argument
    command._outputs[0].target = ""; // bypass "Unable to find a suitable output format for ' '"
    command._global.get = () => { // append custom arguments
      return typeof args === "string" ? args.split(' ') : args;
    };
    return command;
  };

  try {
    executeFfmpeg('-i dummy.mp4 -af highpass=f=200,lowpass=f=3000,afftdn=nf=-25 output.mp4')
      .on('start', commandLine => console.log('start', commandLine))
      .on('codecData', codecData => console.log('codecData', codecData))
      .on('error', error => console.log('error', error))
      .on('stderr', stderr => console.log('stderr', stderr))
      .run();
    // var command = ffmpeg("./dummy.mp4").noAudio().output('outputfile.mp4');
  } catch (err) {
    console.log(err);
  }
}

