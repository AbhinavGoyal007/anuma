"""
RunPod Serverless entry point.

Separate from `server.py` so the same code can run either as a pay-per-second
worker that scales to zero or as an always-on HTTP service, without the
application knowing which one it is talking to.
"""

import runpod

from server import handler, load_models

# Loaded before the first request rather than during it: a cold start already
# costs the caller the model load, and doing it here keeps that cost out of the
# request timeout.
load_models()

runpod.serverless.start({"handler": handler})
