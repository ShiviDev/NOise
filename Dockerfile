FROM node:lts-buster-slim

RUN apt update
RUN apt install ffmpeg -y

WORKDIR /home/node/app

COPY package.json .

RUN npm install

COPY . .

CMD ["node", "app.js"]