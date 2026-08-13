# Voxtral transcription worker

Produces the diarized, timestamped transcript ANUMA needs from a model that does
not natively provide one.

Voxtral-Mini-3B matched Sarvam on ANUMA's own test pack — 81 of 84 spoken facts
against Sarvam's 80, across thirteen scripts in English, Hinglish and Hindi — at
roughly a twentieth of the cost. What it returns is prose: no timestamps, no
speakers. The product cannot use prose, because every claim it makes has to cite
a segment with a speaker and a time range.

So this service does what Sarvam does, in two stages:

    pyannote  ->  who spoke when
    Voxtral   ->  what was said in each turn

and answers in the shape `normalize-sarvam.ts` already parses, so the
application's contract does not change with the provider.

Speaker labels stay as the model emitted them. Deciding which one is the
representative is the application's job, and assuming the first speaker is the
representative is a rule the product explicitly forbids.

## Running it

Serverless, which is what makes the economics work — it scales to zero between
recordings:

    docker build -t anuma-voxtral .
    # push, then create a RunPod Serverless endpoint from the image

Always-on, for load testing or a busy deployment:

    docker run --gpus all -e HF_TOKEN=... -p 8000:8000 anuma-voxtral python server.py
    curl -X POST --data-binary @clip.wav localhost:8000/transcribe

## Configuration

| Variable | Default | Why |
|---|---|---|
| `HF_TOKEN` | — | Required. pyannote's weights are gated |
| `VOXTRAL_MODEL` | `mistralai/Voxtral-Mini-3B-2507` | The measured winner |
| `DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | Found exactly two speakers in all thirteen scripts |
| `MERGE_GAP_SECONDS` | `0.8` | Diarization splits a sentence across pauses; a model given half a clause writes a worse sentence |
| `MIN_TURN_SECONDS` | `0.4` | Below this a turn is a backchannel, and transcribing it costs a full model call for nothing |
