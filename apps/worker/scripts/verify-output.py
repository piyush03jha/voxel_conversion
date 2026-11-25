#!/usr/bin/env python3
"""Basic format checks, not full semantic validation."""
import os
import struct
import sys
import zipfile
import xml.etree.ElementTree as ET

def check(path, ext):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(4096)
    if not size:
        raise ValueError("empty output")
    if ext == "STL":
        if len(head) < 84 or size != 84 + 50 * struct.unpack_from("<I", head, 80)[0] or size == 84:
            raise ValueError("bad binary STL")
    elif ext == "PLY":
        if not head.startswith(b"ply"):
            raise ValueError("bad PLY")
    elif ext == "OBJ":
        with open(path, "rb") as f:
            found = False
            for line in f:
                line = line.lstrip()
                if line.startswith(b"mtllib "):
                    raise ValueError("external OBJ material")
                if line.startswith(b"f "):
                    found = True
            if not found:
                raise ValueError("empty OBJ")
    elif ext == "FBX":
        if not head.startswith(b"Kaydara FBX Binary"):
            raise ValueError("bad FBX")
    elif ext in ("USD", "USDA", "USDC"):
        if not head.startswith((b"#usda", b"PXR-USDC")):
            raise ValueError("bad USD")
        if ext == "USDA" and not head.startswith(b"#usda") or ext == "USDC" and not head.startswith(b"PXR-USDC"):
            raise ValueError("incorrect USD encoding")
    elif ext in ("3MF", "USDZ"):
        with zipfile.ZipFile(path) as z:
            entries = z.infolist()
            if not entries or len(entries) > 10000 or sum(e.file_size for e in entries) > 512 * 1024 * 1024:
                raise ValueError("archive limits")
            if ext == "3MF" and not {"[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"}.issubset(z.namelist()):
                raise ValueError("bad 3MF")
            if ext == "USDZ" and (not entries[0].filename.lower().endswith((".usd", ".usda", ".usdc")) or any(e.compress_type != zipfile.ZIP_STORED for e in entries)):
                raise ValueError("bad USDZ")
    elif ext == "ABC":
        if not head.startswith((b"Ogawa", b"\x89HDF\r\n\x1a\n")):
            raise ValueError("bad Alembic")
    elif ext == "BVH":
        if not head.lstrip().startswith(b"HIERARCHY"):
            raise ValueError("bad BVH")
    elif ext == "SVG":
        if ET.parse(path).getroot().tag not in ("svg", "{http://www.w3.org/2000/svg}svg"):
            raise ValueError("bad SVG")
    elif ext == "PDF":
        if not head.startswith(b"%PDF-"):
            raise ValueError("bad PDF")
    else:
        raise ValueError("unsupported output")

if __name__ == "__main__":
    check(sys.argv[1], sys.argv[2])
