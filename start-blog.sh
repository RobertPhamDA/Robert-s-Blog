#!/bin/bash
docker start blog-db
node server.js & 
cloudflared tunnel --url http://localhost:3000