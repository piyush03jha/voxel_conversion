#!/usr/bin/env python3
"""Turn a validated self-contained GLB into a single embedded .gltf.
Blender 4.x removed embedded glTF export. Stream base64 from the BIN chunk.
"""
import base64
import json
import struct
import sys

def convert(source, target):
    with open(source, "rb") as src:
        magic, version, total = struct.unpack("<4sII", src.read(12))
        if magic != b"glTF" or version != 2:
            raise ValueError("GLB header")
        length, kind = struct.unpack("<I4s", src.read(8))
        if kind != b"JSON" or length > 4 * 1024 * 1024:
            raise ValueError("GLB JSON")
        doc = json.loads(src.read(length))
        binary, kind = struct.unpack("<I4s", src.read(8))
        if kind != b"BIN\x00" or len(doc["buffers"]) != 1:
            raise ValueError("GLB BIN")
        remaining = doc["buffers"][0]["byteLength"]
        if not 0 < remaining <= binary or binary - remaining > 3:
            raise ValueError("GLB buffer")
        marker = "__FORMSHIFT_EMBEDDED_BUFFER__"
        doc["buffers"][0]["uri"] = marker
        encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=True)
        if encoded.count(marker) != 1:
            raise ValueError("Invalid embedded marker")
        before, after = encoded.split(marker)
        with open(target, "wb") as out:
            out.write(before.encode())
            out.write(b"data:application/octet-stream;base64,")
            while remaining:
                chunk = src.read(min(3 * 256 * 1024, remaining))
                if not chunk:
                    raise ValueError("truncated GLB")
                out.write(base64.b64encode(chunk))
                remaining -= len(chunk)
            out.write(after.encode())

if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2])
