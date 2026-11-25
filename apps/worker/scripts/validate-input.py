#!/usr/bin/env python3
"""Bounded preflight for existing ADVFX formats. Not a full format validator."""
import json
import pathlib
import re
import stat
import sys
import zipfile
import os

MAX_UNPACKED = 512 * 1024 * 1024
MAX_FILES = 5000

def archive(path):
    with zipfile.ZipFile(path) as z:
        entries = z.infolist()
        if not 1 <= len(entries) <= MAX_FILES:
            raise ValueError("archive entry count")
        total = 0
        seen = set()
        for entry in entries:
            name = entry.filename
            p = pathlib.PurePosixPath(name)
            if not name or name.startswith("/") or "\\" in name or ":" in name or ".." in p.parts or name in seen:
                raise ValueError("unsafe archive path")
            seen.add(name)
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode) or entry.flag_bits & 1:
                raise ValueError("unsupported archive entry")
            total += entry.file_size
            if total > MAX_UNPACKED or entry.file_size > MAX_UNPACKED:
                raise ValueError("archive size limit")
            if entry.file_size > 8 * 1024 * 1024 and entry.file_size > 200 * max(1, entry.compress_size):
                raise ValueError("archive expansion ratio")
        # Do not extract; stream every entry to verify actual expansion and CRC.
        actual = 0
        for entry in entries:
            if entry.is_dir():
                continue
            with z.open(entry) as stream:
                while True:
                    block = stream.read(1024 * 1024)
                    if not block:
                        break
                    actual += len(block)
                    if actual > MAX_UNPACKED:
                        raise ValueError("archive expansion limit")

def no_external_gltf(path):
    # JSON decoding is bounded by the Python process limit. Single-file inputs only.
    with open(path, "rb") as f:
        doc = json.load(f)
    if not isinstance(doc, dict) or doc.get("asset", {}).get("version") != "2.0":
        raise ValueError("invalid glTF")
    stack = [doc]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "uri" and (not isinstance(child, str) or not child.startswith("data:")):
                    raise ValueError("external glTF resources unsupported")
                if isinstance(child, (dict, list)):
                    stack.append(child)
        elif isinstance(value, list):
            stack.extend(x for x in value if isinstance(x, (dict, list)))

def validate(path, ext):
    with open(path, "rb") as f:
        head = f.read(4096)
    if not head:
        raise ValueError("empty file")
    if ext in (".3mf", ".usdz"):
        archive(path)
    elif ext == ".gltf":
        no_external_gltf(path)
    elif ext == ".glb" and head[:4] != b"glTF":
        raise ValueError("invalid GLB")
    elif ext == ".pdf" and not head.startswith(b"%PDF-"):
        raise ValueError("invalid PDF")
    elif ext == ".ply" and not head.startswith(b"ply"):
        raise ValueError("invalid PLY")
    elif ext == ".svg":
        # Reject DTD/entity declarations anywhere; external references still require sandbox.
        with open(path, "rb") as f:
            tail = b""
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                block = (tail + chunk).lower()
                if b"<!doctype" in block or b"<!entity" in block:
                    raise ValueError("SVG DTD forbidden")
                tail = block[-32:]
    elif ext not in (".obj", ".fbx", ".usd", ".usda", ".usdc", ".abc", ".bvh", ".glb", ".pdf", ".ply"):
        raise ValueError("unsupported format")

if __name__ == "__main__":
    try:
        validate(sys.argv[1], sys.argv[2])
    except (OSError, ValueError, TypeError, AttributeError, UnicodeError, MemoryError, zipfile.BadZipFile, RuntimeError):
        sys.exit(2)
