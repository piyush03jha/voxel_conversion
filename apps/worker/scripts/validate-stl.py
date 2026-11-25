#!/usr/bin/env python3
"""Bounded STL content preflight. Only binary STL or strict ASCII STL is accepted."""
import math
import os
import struct
import sys

MAX_TRIANGLES = int(os.environ.get("WORKER_MAX_TRIANGLES", "4000000"))
MAX_LINE = 4096

def numbers(parts):
    if len(parts) != 3:
        raise ValueError("invalid coordinates")
    values = [float(x) for x in parts]
    if not all(math.isfinite(x) and abs(x) <= 1e30 for x in values):
        raise ValueError("invalid coordinates")

def validate(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        header = f.read(84)
        if len(header) == 84:
            count = struct.unpack_from("<I", header, 80)[0]
            if size == 84 + count * 50:
                if not 1 <= count <= MAX_TRIANGLES:
                    raise ValueError("triangle limit")
                for _ in range(count):
                    record = f.read(50)
                    vals = struct.unpack("<12fH", record)
                    if not all(math.isfinite(x) and abs(x) <= 1e30 for x in vals[:12]):
                        raise ValueError("invalid coordinates")
                return
        f.seek(0)
        state = "solid"
        vertices = triangles = 0
        while True:
            line = f.readline(MAX_LINE + 1)
            if not line:
                break
            if len(line) > MAX_LINE or b"\x00" in line:
                raise ValueError("invalid ASCII line")
            words = line.decode("ascii").strip().split()
            if not words:
                continue
            # Native ADVFX parser expects lowercase vertex keyword.
            if state == "solid" and words[0] == "solid":
                state = "facet"
            elif state == "facet" and words[:2] == ["facet", "normal"]:
                numbers(words[2:])
                state = "loop"
            elif state == "loop" and words == ["outer", "loop"]:
                vertices = 0
                state = "vertex"
            elif state == "vertex" and words[0] == "vertex":
                numbers(words[1:])
                vertices += 1
                if vertices == 3:
                    state = "endloop"
            elif state == "endloop" and words == ["endloop"]:
                state = "endfacet"
            elif state == "endfacet" and words == ["endfacet"]:
                triangles += 1
                if triangles > MAX_TRIANGLES:
                    raise ValueError("triangle limit")
                state = "facet"
            elif state == "facet" and words[0] == "endsolid":
                state = "done"
            else:
                raise ValueError("invalid STL structure")
        if state != "done" or triangles == 0:
            raise ValueError("empty or truncated STL")

if __name__ == "__main__":
    try:
        validate(sys.argv[1])
    except (OSError, ValueError, OverflowError, struct.error, UnicodeError):
        sys.exit(2)
