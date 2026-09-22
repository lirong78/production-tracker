#!/bin/bash
cd /root/hermes_data/wanjh38/output/deploy
python3 -m http.server 9090 --bind 0.0.0.0
