#!/bin/bash
docker container rm redis -f || true
docker run -p 6379:6379 --name=redis -d redis