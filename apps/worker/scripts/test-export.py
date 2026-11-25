#!/usr/bin/env python3
"""Stdlib-only regression tests for embedded glTF and output signatures."""
import base64
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
SCRIPTS = pathlib.Path(__file__).resolve().parent

def run(script, *args):
    return subprocess.run([sys.executable, "-I", str(SCRIPTS / script), *map(str, args)], capture_output=True, timeout=10)

class ExportTests(unittest.TestCase):
    def test_embedded_glb(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = pathlib.Path(tmp)/"in.glb", pathlib.Path(tmp)/"out.gltf"
            raw = b"\x00\x01\xff" * 300000 + b"x"
            padded = raw + b"\0" * ((-len(raw)) % 4)
            doc = json.dumps({"asset":{"version":"2.0"},"buffers":[{"byteLength":len(raw)}]}).encode()
            doc += b" " * ((-len(doc)) % 4)
            src.write_bytes(struct.pack("<4sII",b"glTF",2,28+len(doc)+len(padded))+struct.pack("<I4s",len(doc),b"JSON")+doc+struct.pack("<I4s",len(padded),b"BIN\0")+padded)
            result = run("embed-gltf.py", src, dst)
            self.assertEqual(result.returncode, 0, result.stderr)
            out = json.loads(dst.read_bytes())
            self.assertEqual(base64.b64decode(out["buffers"][0]["uri"].split(",")[1]),raw)
    def test_signatures(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp)/"output"
            for ext, content in [("STL", b"\0"*80+struct.pack("<I",1)+b"\0"*50), ("OBJ", b"v 0 0 0\nf 1 2 3\n"), ("PLY",b"ply\n"), ("FBX",b"Kaydara FBX Binary"), ("USDA",b"#usda 1.0"), ("USDC",b"PXR-USDC"), ("ABC",b"Ogawa"), ("BVH",b"HIERARCHY"), ("SVG",b'<svg xmlns="http://www.w3.org/2000/svg"/>'), ("PDF",b"%PDF-1.7")]:
                with self.subTest(ext=ext):
                    path.write_bytes(content)
                    self.assertEqual(run("verify-output.py", path, ext).returncode,0)
                    path.write_bytes(b"invalid")
                    self.assertNotEqual(run("verify-output.py",path,ext).returncode,0)
            with zipfile.ZipFile(path, "w") as z:
                for name in ["[Content_Types].xml","_rels/.rels","3D/3dmodel.model"]:
                    z.writestr(name,"fixture")
            self.assertEqual(run("verify-output.py",path,"3MF").returncode,0)
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("model.usdc","fixture")
            self.assertEqual(run("verify-output.py",path,"USDZ").returncode,0)

if __name__ == "__main__":
    unittest.main()
