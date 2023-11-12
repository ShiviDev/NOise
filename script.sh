#!/bin/bash
docker container rm redis -f || true
docker run -p 6379:6379 --name=redis -d redis
rm dummy.mp4 || true
rm output.mp4 || true

# mongodb, redis, backend
# 