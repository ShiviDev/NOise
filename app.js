const express = require("express");
const bodyParser = require("body-parser");
const fluent = require('fluent-ffmpeg');
const Queue = require('bull');
const generateUniqueId = require('generate-unique-id');
var Minio = require('minio')
const { File } = require('megajs')
const { MongoClient } = require("mongodb");

const fs = require('fs').promises;
const fsnormal = require('fs');
const path = require('path');
const process = require('process');

let url = "";

//////////////////////////////////////////////MINIO/////////////////////////////////////////////////////
var minioClient = new Minio.Client({
  endPoint: '127.0.0.1',
  port: 9010,
  useSSL: false,
  accessKey: 'root',
  secretKey: 'root123456',
})
const BUCKET_NAME = "videos"

function addFileToStorageBucket(fileStream, size, id, status, done) {
  const videoName = status === "" ? id : id.concat("_" + status)

  minioClient.putObject(BUCKET_NAME, videoName, fileStream, size, function (err, objInfo) {
    if (err) {
      return console.log(err) // err should be null
    }
    console.log('Success', objInfo)
    downloadFileFromStorageBucket(videoName, done)
  })

}

function downloadFileFromStorageBucket(id, done) {
  minioClient.fGetObject(BUCKET_NAME, id, `/tmp/videos/${id}.mp4`, function (err) {
    if (err) {
      return console.log(err)
    }
    console.log('success')
    handleffmpeg(id, done);
  })

}
async function uploadProcessedFileToStorageBucket(videoId, done) {
  var metaData = {}
  const videoName = videoId.concat("_processed")
  const PATH_TO_PROCESSED_VIDEO = `/tmp/videos/${videoName}.mp4`
  await minioClient.fPutObject(BUCKET_NAME, videoName, PATH_TO_PROCESSED_VIDEO, metaData)
  await updateDB(videoId)
  done()
}
//////////////////////////////////////////////BULL-REDIS/////////////////////////////////////////////////////

const videoQueue = new Queue('video-queue');

videoQueue.process(async (job, done) => {
  console.log("reached");
  url = job.data.vidurl;
  id = job.data.id;
  try {
    await writeDB(id, url)
  }
  catch (err) {
    console.log("Write Error: ", err);
  }
  const file = File.fromURL(url)
  await downloadFile(file, id, done)
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

app.get("/query", function (req, res) {
  res.sendFile(__dirname + "/query.html")
})

app.post("/", async function (req, res) {
  let url = req.body.url;
  const id = generateUniqueId();
  // .concat("_unprocessed");
  console.log(url);
  await videoQueue.add({
    vidurl: url,
    id: id
  });

  res.send(`<p>The video is stored under id ${id}</p>`)
});

app.post("/query", async function (req, res) {
  let query_id = req.body.queryText;
  console.log("Received query: ", query_id);
  let status = await readDB(query_id);
  if (status === null) {
    res.send("ID doesn't exist. Please check again.")
  }
  if (!status) {
    res.send("Video is still being processed")
  }
  else {
    const presignedUrl = await minioClient.presignedGetObject(BUCKET_NAME, query_id + '_processed', 24 * 60 * 60)
    res.send("Video is processed " + `<a href="${presignedUrl}" target="_blank" rel="noopener noreferrer">Click here</a>`)

  }
})

async function downloadFile(file, id, done) {

  console.log("reached downloadfile");
  try {

    file.loadAttributes(error => {
      if (error) return console.error(error)
      console.log(file.size)
      // Then finally download the file like usual
      file.download((error, data) => {
        if (error) {
          console.error(error)
          return
        }

        // data is a Buffer containing the file contents
        console.log(data)
        addFileToStorageBucket(data, file.size, id, "", done)
      })

    })

  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}
//////////////////////////////////////////// MongoDB ///////////////////////////////////////////////////////

const uri = "mongodb://root:root@localhost:27017";


async function readDB(id) {
  const client = new MongoClient(uri);
  try {
    const database = client.db('videosDB');
    const userData = database.collection('userData');
    // Query for a movie that has the title 'Back to the Future'
    const query = { _id: id };
    const data = await userData.findOne(query);
    if (!data) {
      return null
    }
    console.log(data.status);
    return data.status
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function writeDB(id, url) {
  const client = new MongoClient(uri);
  try {
    const database = client.db('videosDB');
    const userData = database.collection('userData');
    // Query for a movie that has the title 'Back to the Future'
    const query = { _id: id, url: url, status: false };
    await userData.insertOne(query);
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function updateDB(id) {
  const client = new MongoClient(uri);
  try {
    const database = client.db('videosDB');
    const userData = database.collection('userData');
    const filter = { _id: id };
    const options = { upsert: false };
    const updateDoc = {
      $set: {
        status: true
      },
    };
    await userData.updateOne(filter, updateDoc, options);
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

//////////////////////////////////////////// FFMPEG ///////////////////////////////////////////////////////


function handleffmpeg(inputFile, done) {
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

  const PATH_TO_INPUT_VIDEO = `/tmp/videos/${inputFile}.mp4`
  const PATH_TO_OUTPUT_VIDEO = `/tmp/videos/${inputFile}_processed.mp4`

  try {
    console.log("processing video.....");
    executeFfmpeg(`-i ${PATH_TO_INPUT_VIDEO} -af highpass=f=200,lowpass=f=3000,afftdn=nf=-25 ${PATH_TO_OUTPUT_VIDEO}`)
      .on('start', commandLine => console.log('start', commandLine))
      .on('codecData', codecData => console.log('codecData', codecData))
      .on('end', function () {
        console.log('Finished processing')
        uploadProcessedFileToStorageBucket(inputFile, done);
      })
      .on('error', error => console.log('error', error))
      .on('stdout', stdout => console.log('stdout', stdout))
      //.on('stderr', stderr => console.log('stderr', stderr))
      .run();
    // var command = ffmpeg("./dummy.mp4").noAudio().output('outputfile.mp4');
  } catch (err) {
    console.log(err);
  }
}

