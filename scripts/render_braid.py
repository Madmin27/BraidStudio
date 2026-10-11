"""Production output adapter: same build_geometry as interactive preview.

Each carrier is rendered as its envelope core plus physically laid filaments:
ends are ~equivalentEndDiameter twisted bundles stacked in layers, so only
widthMm / endDiameterMm bundles are exposed across the carrier face. Filaments
spiral around their bundle axis with the configured twist pitch.
"""
import bpy, math, sys, time, json, random, hashlib
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from braid_geometry import build_geometry
args=sys.argv[sys.argv.index('--')+1:]
request_path=Path(args[0]); OUT=Path(args[1]); OUT.mkdir(parents=True,exist_ok=True)
request=json.loads(request_path.read_text()); recipe=request['recipe']; opt=request['material']['render']
t0=time.time(); g=build_geometry(recipe); scene_scale=16/recipe['diameterMm']
CORE=Path(__file__).with_name('braid_geometry.py')
radius=math.sqrt((recipe['denier']*recipe['denierScale']/opt['assumedFilamentsPerEnd']/9000/1000)/1380/math.pi)*1000*scene_scale
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s=bpy.context.scene; s.render.engine='CYCLES'; s.cycles.samples=opt['samples']
s.cycles.use_denoising=True; s.cycles.denoiser='OPENIMAGEDENOISE'; s.cycles.seed=23; s.cycles.max_bounces=6
s.render.threads_mode='FIXED'; s.render.threads=12
s.cycles_curves.shape='THICK'; s.cycles_curves.subdivisions=2
s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=opt['worldStrength']
s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.9,.92,.95,1)
s.view_settings.view_transform=opt['viewTransform']; s.view_settings.look='None'; s.view_settings.exposure=opt['exposure']
s.render.image_settings.file_format='PNG'
def linear(c):
    return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def mat(name,c,rough,spec=.5):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*c,1); n.inputs['Roughness'].default_value=rough
    n.inputs['IOR'].default_value=opt['ior']; n.inputs['Specular IOR Level'].default_value=spec
    return m
def filament_mat(name,c):
    m=mat(name,c,opt['roughness'],opt['specular'])
    n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Anisotropic'].default_value=opt['anisotropy']
    n.inputs['Sheen Weight'].default_value=opt['sheen']
    return m
palette=list(dict.fromkeys(y['color'].lower() for y in g['yarns']))
colors=[opt['referenceColors'].get(c,tuple(linear(int(c[i:i+2],16)/255) for i in (1,3,5))) for c in palette]
mats=[filament_mat('Filament '+c,color) for c,color in zip(palette,colors)]
cores=[mat('Interior '+c,tuple(x*.25 for x in color),.9,0) for c,color in zip(palette,colors)]
def aim(ob,pt): ob.rotation_euler=(Vector(pt)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,size_y):
    L=opt['lightScale']
    d=bpy.data.lights.new(name,'AREA'); d.energy=power*L*L; d.shape='RECTANGLE'; d.size=size*L; d.size_y=size_y*L
    ob=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(ob)
    ob.location=Vector(loc)*L; aim(ob,(0,0,7))
area('Key',(-10,14,26),2600*opt['keyStrength'],2.5,9)   # narrow key: directional filament highlights
area('Fill',(14,-8,20),500,16,16)
area('Rim',(4,16,8),400,14,3)
bpy.ops.mesh.primitive_plane_add(size=400,location=(0,0,-8.2))
bpy.context.object.data.materials.append(mat('Neutral background',(.62,.64,.66),.9,0))
camd=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',camd)
bpy.context.collection.objects.link(cam); s.camera=cam
camd.type='ORTHO'; camd.clip_end=400

def sink(v,amount):
    n=Vector((0,v.y,v.z)).normalized()
    return v-n*amount
# Flat multifilament tape: parallel, untwisted filaments in a few layers across the
# full carrier width; only slow, sub-filament lateral drift breaks perfect regularity.
nfib=opt['filamentsPerCarrier']; layers=opt['filamentLayers']; drift=opt['filamentDriftMm']*scene_scale
for yi,yarn in enumerate(g['yarns']):
    raw=yarn['mesh']; vv=raw['vertices']
    verts=[Vector(vv[j:j+3])*scene_scale for j in range(0,len(vv),3)]
    rings=yarn['pathPointCount']; seg=len(verts)//rings
    def sample(r,u):
        st=math.acos(2*u-1)/math.pi*(seg-1)
        j=min(seg-2,int(st)); return verts[r*seg+j].lerp(verts[r*seg+j+1],st-j)
    # Envelope core: production surface sunk by coreInset; only shows between filaments as shadow.
    ncol=121; meshverts=[]
    for r in range(rings):
        for j in range(ncol):
            meshverts.append(tuple(sink(sample(r,j/(ncol-1)),opt['coreInsetMm']*scene_scale)))
    faces=[(r*ncol+j,r*ncol+j+1,(r+1)*ncol+j+1,(r+1)*ncol+j) for r in range(rings-1) for j in range(ncol-1)]
    me=bpy.data.meshes.new('Carrier envelope'); me.from_pydata(meshverts,[],faces); me.update()
    mi=palette.index(yarn['color'].lower()); me.materials.append(cores[mi])
    for p in me.polygons: p.use_smooth=True
    ob=bpy.data.objects.new('Carrier '+str(yarn['carrierNo']),me); bpy.context.collection.objects.link(ob)
    centre=[sample(r,.5) for r in range(rings)]
    arc=[0.0]
    for r in range(1,rings): arc.append(arc[-1]+(centre[r]-centre[r-1]).length)
    rng=random.Random(31+yi)
    cv=bpy.data.hair_curves.new('Filaments '+str(yarn['carrierNo'])); cv.add_curves([rings]*nfib)
    pos=[]; rad=[]
    width_units=(sample(0,0)-sample(0,1)).length
    for f in range(nfib):
        u0=rng.uniform(.004,.996); rr=rng.uniform(.85,1.15)
        layer=rng.uniform(0,layers-1)*2*radius*.9
        ph=rng.uniform(0,math.tau); wl=rng.uniform(40,90)*scene_scale
        for r in range(rings):
            du=drift*math.sin(math.tau*arc[r]/wl+ph)/max(width_units,1e-6)
            u=max(.002,min(.998,u0+du))
            v=sink(sample(r,u),-(layer+radius*rr))
            pos.extend(v); rad.append(radius*rr)
    cv.points.foreach_set('position',pos)
    cv.attributes.new('radius','FLOAT','POINT').data.foreach_set('value',rad)
    cv.materials.append(mats[mi])
    ob=bpy.data.objects.new('Filaments '+str(yarn['carrierNo']),cv); bpy.context.collection.objects.link(ob)
stats=[]
length=g['length']*scene_scale
for name,width,target,res in [('rope.png',min(length*.88,90),(0,0,0),(1400,650)),('close.png',24,(-min(19,length*.22),0,7.6),(1100,850))]:
    cam.location=Vector(target)+Vector((0,-2,35)); aim(cam,target); camd.ortho_scale=width
    s.render.resolution_x=res[0]; s.render.resolution_y=res[1]; s.render.resolution_percentage=100
    s.render.filepath=str(OUT/name); started=time.time(); bpy.ops.render.render(write_still=True)
    stats.append(dict(file=name,seconds=time.time()-started))
(OUT/'report.json').write_text(json.dumps(dict(recipe=recipe,profileVersion=opt['version'],geometrySha256=hashlib.sha256(CORE.read_bytes()).hexdigest(),carrierCount=g['carrierCount'],directions=g['directionCounts'],denoising=True,blender=bpy.app.version_string,assumedFilamentsPerEnd=opt['assumedFilamentsPerEnd'],filamentsPerCarrier=nfib,filamentLayers=layers,renders=stats,seconds=time.time()-t0),indent=2))
