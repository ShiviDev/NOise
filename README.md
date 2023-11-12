# NOise

- It is a web app to remove noise from the videos.

## Implementaions

- Google APIs
- Redis
- Bull
- ffmpeg
- MongoDB

## Description/Explanation

- When the user submits the url, the post method is invoked, which sends the link as an object over the BULL producer function.
- The consumer function is invoked which calls the Google Drive access function.
- I have made use of Google Drive APIs, to allow access to the videos stored in the google drive link provided by the user.
- The video is streamed from source and the stream object is passed through ffmpeg function, which perfroms noise reduction command on the object.
- The output is downloaded on the loacal machine.
