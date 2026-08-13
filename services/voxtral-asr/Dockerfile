# The transcription worker.
#
# Weights are not baked in: Voxtral and pyannote together are several gigabytes,
# and an image that carries them is slow to push and slow to cold-start. They are
# fetched on first use into HF_HOME, which on RunPod is a network volume that
# survives the worker — so the download happens once per deployment rather than
# once per request.
FROM runpod/pytorch:0.7.0-cu1281-torch271-ubuntu2204

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/runpod-volume/hf \
    HF_HUB_ENABLE_HF_TRANSFER=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py rp_handler.py ./

# Serverless runs the handler; an always-on pod overrides this with
# `python server.py` to get the HTTP interface instead.
CMD ["python", "-u", "rp_handler.py"]
