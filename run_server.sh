#!/bin/bash
python3 -c "
import http.server, os
os.chdir('/root/hermes_data/wanjh38/output/deploy')
server = http.server.HTTPServer(('0.0.0.0', 9090), http.server.SimpleHTTPRequestHandler)
print('Server running on 9090', flush=True)
server.serve_forever()
"
