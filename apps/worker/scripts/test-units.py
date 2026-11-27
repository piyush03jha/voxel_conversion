#!/usr/bin/env python3
"""Integration regression: run with the worker's actual Blender + 3MF add-on."""
import os,pathlib,struct,subprocess,tempfile,unittest,zipfile
SCRIPTS=pathlib.Path(__file__).resolve().parent
def convert(source,target):
    subprocess.run([os.environ.get('BLENDER_BIN','blender'),'--background','--factory-startup','--disable-autoexec','--threads','1','--python-exit-code','1','--python',str(SCRIPTS/'blender-convert.py'),'--','--input',str(source),'--output',str(target),'--ext',source.suffix,'--target',target.suffix[1:].upper()],check=True,timeout=180)
def bounds(path):
    with open(path,'rb') as f:
        header=f.read(84)
        n=struct.unpack_from('<I',header,80)[0]
        lo=[float('inf')]*3;hi=[-float('inf')]*3
        for i in range(n):
            t=struct.unpack('<12fH',f.read(50))
            for j,v in enumerate(t[3:12]):
                axis=j%3;lo[axis]=min(lo[axis],v);hi[axis]=max(hi[axis],v)
        if f.read(1):raise ValueError('Trailing bytes')
    return n,[hi[i]-lo[i] for i in range(3)]
def fixture(path,unit):
    model=f'''<?xml version="1.0" encoding="UTF-8"?><model unit="{unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="20" z="0"/><vertex x="0" y="0" z="30"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles></mesh></object></resources><build><item objectid="1" transform="2 0 0 0 2 0 0 0 2 5 6 7"/></build></model>'''
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
        z.writestr('3D/3dmodel.model',model)
class Units(unittest.TestCase):
    def test_3mf_stl_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            for unit,factor in [('millimeter',1),('inch',25.4),('meter',1000)]:
                with self.subTest(unit=unit):
                    source=root/'source.3mf';stl=root/'out.stl';mf=root/'round.3mf';again=root/'round.stl'
                    fixture(source,unit)
                    convert(source,stl)
                    n,dims=bounds(stl)
                    self.assertEqual(n,4)
                    for actual,expected in zip(dims,[20*factor,40*factor,60*factor]):
                        self.assertAlmostEqual(actual/expected,1,places=5)
                    convert(stl,mf);convert(mf,again)
                    m,rounddims=bounds(again)
                    self.assertEqual(m,n)
                    for actual,expected in zip(rounddims,dims):self.assertAlmostEqual(actual/expected,1,places=5)
if __name__=='__main__':unittest.main()
