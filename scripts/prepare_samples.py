"""Prepare a small CC0 drum set using Python 3 and macOS afconvert.

Run from any directory. Downloads only the selected recordings, not the full
library. The application uses the prepared WAV files; this tool is optional.
"""

from __future__ import annotations

from array import array
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from io import BytesIO
import struct
import json
import subprocess
import sys
import tempfile
from urllib.request import urlopen
import wave

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "drums"
REVISION = "f07ce00df34a46b6b08375be56fe116cf15782bc"
BASE_URL = f"https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/{REVISION}/"
SOURCES = {
    "kick": ("Samples/kick_24/kick/kick/k_vl3_rr1.flac", 1.0),
    "snare": ("Samples/snare_14/center/top/sn_center_vl3_rr1.flac", 1.0),
    "hi_hat_closed": ("Samples/hihat_14/cl/cl/ht_cl_vl3_rr1.flac", 0.4),
    "hi_hat_open": ("Samples/hihat_14/open/cl/ht_open_vl3_rr1.flac", 2.5),
    "hi_hat_pedal": ("Samples/hihat_14/chik/cl/ht_chik_vl3_rr1.flac", 0.4),
    "tom_1": ("Samples/tom_14/center/cl/t14_vl3_rr1.flac", 1.2),
    "tom_2": ("Samples/tom_15/center/cl/t15_vl3_rr1.flac", 1.2),
    "tom_3": ("Samples/tom_18/center/cl/t18_vl3_rr1.flac", 1.2),
    "tom_4": ("Samples/tom_22/center/cl/t22_vl3_rr1.flac", 1.2),
    "crash_1": ("Samples/crash_17/cr/oh/cr_vl3_rr1.flac", 4.0),
    "crash_2": ("Samples/crash_sizzle_17/cr/oh/crs_vl3_rr1.flac", 4.0),
    "ride": ("Samples/ride_22/rd/oh/rd_vl3_rr1.flac", 3.2),
}


def download(path: str) -> bytes:
    """Download one file from the pinned upstream revision."""
    with urlopen(BASE_URL + path, timeout=30) as response:
        return response.read()


def prepare(item: tuple[str, tuple[str, float]]) -> dict[str, str | float]:
    """Convert one recording and trim silence/tail without delaying its attack."""
    instrument, (source, maximum_seconds) = item
    with tempfile.TemporaryDirectory(prefix="rhythm-sample-") as directory:
        original = Path(directory) / "source.flac"
        converted = Path(directory) / "converted.wav"
        original.write_bytes(download(source))
        subprocess.run([
            "/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16@44100", "-c", "1",
            str(original), str(converted),
        ], check=True, capture_output=True)
        # afconvert writes an extensible PCM header; Python <3.12 needs its
        # equivalent ordinary PCM tag. Audio bytes and channel data are unchanged.
        data = bytearray(converted.read_bytes())
        offset = 12
        while offset + 8 <= len(data):
            chunk = data[offset:offset + 4]
            length = struct.unpack_from("<I", data, offset + 4)[0]
            body = offset + 8
            if chunk == b"fmt " and struct.unpack_from("<H", data, body)[0] == 65534:
                pcm_guid = bytes.fromhex("0100000000001000800000aa00389b71")
                if data[body + 24:body + 40] != pcm_guid:
                    raise ValueError("Expected integer PCM from afconvert")
                struct.pack_into("<H", data, body, 1)
                break
            offset = body + length + length % 2
        with wave.open(BytesIO(data), "rb") as audio:
            rate = audio.getframerate()
            assert audio.getsampwidth() == 2 and audio.getnchannels() == 1
            samples = array("h", audio.readframes(audio.getnframes()))
        if sys.byteorder != "little":
            samples.byteswap()
        peak = max(map(abs, samples))
        if peak == 0:
            raise ValueError(f"Silent source: {instrument}")
        onset = next(index for index, value in enumerate(samples) if abs(value) >= peak * 0.005)
        start = max(0, onset - round(rate * 0.002))
        samples = samples[start:start + round(maximum_seconds * rate)]
        gain = 0.75 * 32767 / max(map(abs, samples))
        fade = min(len(samples), round(rate * 0.04))
        for index, value in enumerate(samples):
            tail = min(1.0, (len(samples) - 1 - index) / fade)
            samples[index] = round(value * gain * tail)
        if sys.byteorder != "little":
            samples.byteswap()
        with wave.open(str(OUTPUT / f"{instrument}.wav"), "wb") as audio:
            audio.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            audio.writeframes(samples.tobytes())
    return {"instrument": instrument, "source": source, "maximum_seconds": maximum_seconds,
            "trimmed_leading_seconds": start / rate}


def main() -> None:
    """Build the recordings and retain upstream license and source provenance."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as executor:
        sources = list(executor.map(prepare, SOURCES.items()))
    (OUTPUT / "LICENSE-CC0.txt").write_bytes(download("LICENSE"))
    (OUTPUT / "sources.json").write_text(json.dumps({
        "author": "Karoryfer Samples", "library": "Big Rusty Drums", "license": "CC0-1.0",
        "repository": "https://github.com/sfzinstruments/karoryfer.big-rusty-drums",
        "revision": REVISION, "format": "44100 Hz mono 16-bit PCM WAV",
        "processing": "Trim leading silence with 2 ms attack padding; limit tail; normalize peak to 0.75; fade last 40 ms.",
        "samples": sources,
    }, indent=2) + "\n")
    print(f"Prepared {len(sources)} recordings in {OUTPUT}")


if __name__ == "__main__":
    main()
