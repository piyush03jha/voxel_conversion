#!/usr/bin/env python3
"""Run the actual vendored native converter under the same resource limits."""
import json
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parent
ASCII = b"solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n"
BINARY = b"\x00" * 80 + struct.pack("<I12fH", 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0)

def run(script, *args):
    return subprocess.run(["prlimit", "--as=805306368", "--fsize=209715200", "--cpu=30", "--core=0", "--", sys.executable, "-I", str(SCRIPTS / script), *map(str, args)], env={**os.environ, "WORKER_MAX_TRIANGLES": "4000000", "VOXEL3D_GLTF_MAX_FACES": "0", "VOXEL3D_DENSE_MAX_TRIANGLES": "4000000", "VOXEL3D_DENSE_MAX_CELLS": "1500000"}, capture_output=True, timeout=30)

class NativeTests(unittest.TestCase):
    def test_binary_and_ascii(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = pathlib.Path(tmp) / "input.stl", pathlib.Path(tmp) / "output.glb"
            for fixture in [ASCII, BINARY]:
                with self.subTest(fixture=fixture[:10]):
                    src.write_bytes(fixture)
                    preflight = run("validate-stl.py", src)
                    self.assertEqual(preflight.returncode, 0, preflight.stderr)
                    result = run("dense-mesh-to-glb.py", "--input", src, "--output", dst, "--ext", ".stl")
                    self.assertEqual(result.returncode, 0, result.stderr)
                    data = dst.read_bytes()
                    self.assertEqual(struct.unpack_from("<4sII", data), (b"glTF", 2, len(data)))
                    length, kind = struct.unpack_from("<I4s", data, 12)
                    self.assertEqual(kind, b"JSON")
                    doc = json.loads(data[20:20+length])
                    self.assertEqual(doc["accessors"][0]["count"], 3)
                    self.assertEqual(doc["accessors"][1]["count"], 3)
                    self.assertEqual(len(doc["meshes"]), 1)

    def test_reject_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "input.stl"
            for fixture in [b"", b"%PDF-1.7", BINARY[:-1], ASCII.replace(b"vertex 1 0 0", b"vertex nan 0 0"), ASCII.replace(b"endfacet", b""), b"solid " + b"x" * 5000]:
                with self.subTest(fixture=fixture[:10]):
                    src.write_bytes(fixture)
                    self.assertNotEqual(run("validate-stl.py", src).returncode, 0)

if __name__ == "__main__":
    unittest.main()
