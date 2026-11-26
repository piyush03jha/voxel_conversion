#!/usr/bin/env python3
"""Regression tests for bounded binary STL and 3MF package compression."""
import json
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE=pathlib.Path(__file__).resolve().parent
def run(script,*args):
    return subprocess.run(["prlimit","--as=134217728","--",sys.executable,"-I",str(HERE/script),*map(str,args)],capture_output=True,timeout=180)

class LargeFileTests(unittest.TestCase):
    def test_stream(self):
        with tempfile.TemporaryDirectory() as temp:
            src=pathlib.Path(temp)/"input.stl"
            dst=pathlib.Path(temp)/"output.glb"
            n=(200*1024*1024-84)//50 if os.getenv("LARGE_STL_TEST")=="1" else 700000
            record=struct.pack("<12fH",0,0,1,0,0,0,1,0,0,0,1,0,0)
            with src.open("wb") as f:
                f.write(bytes(80)+struct.pack("<I",n))
                for i in range(0,n,4096):
                    f.write(record*min(4096,n-i))
            result=run("stream-stl-glb.py",src,dst)
            self.assertEqual(result.returncode,0,result.stderr)
            with dst.open("rb") as f:
                magic,version,total=struct.unpack("<4sII",f.read(12))
                size,kind=struct.unpack("<I4s",f.read(8))
                doc=json.loads(f.read(size))
                binary,bin_kind=struct.unpack("<I4s",f.read(8))
                self.assertEqual((magic,version,kind,bin_kind),(b"glTF",2,b"JSON",b"BIN\0"))
                self.assertEqual(total,dst.stat().st_size)
                self.assertEqual(doc["accessors"][0]["count"],n*3)
                self.assertEqual(binary,n*36)
                self.assertEqual(f.read(36),record[12:48])
            with src.open("r+b") as f:
                f.truncate(100)
            self.assertNotEqual(run("stream-stl-glb.py",src,dst).returncode,0)
    def test_repack(self):
        with tempfile.TemporaryDirectory() as temp:
            src=pathlib.Path(temp)/"input.3mf"
            dst=pathlib.Path(temp)/"output.3mf"
            with zipfile.ZipFile(src,"w") as z:
                z.writestr("3D/3dmodel.model",b"<model>"+b"geometry "*10000+b"</model>")
                z.writestr("Metadata/settings.config",b"original settings")
            result=run("repack-3mf.py",src,dst,9)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertLess(dst.stat().st_size,src.stat().st_size)
            with zipfile.ZipFile(src) as a,zipfile.ZipFile(dst) as b:
                self.assertEqual(a.namelist(),b.namelist())
                for name in a.namelist():
                    self.assertEqual(a.read(name),b.read(name))
if __name__=="__main__":
    unittest.main()
