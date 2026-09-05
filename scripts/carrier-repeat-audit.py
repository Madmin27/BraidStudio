"""Read the production mesh; do not generate a second braid geometry."""
import json
import math
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from braid_geometry import build_geometry

out = Path('proofs/carrier-repeat-16')
out.mkdir(parents=True, exist_ok=True)
params = dict(mode='rope', carrierCount=16, diameterMm=16, braidAngle=45,
              filamentCount=12, denier=1000, denierScale=1, visibleRows=30,
              crossingMode='diamond', carriers=[dict(color='#e11912' if i in (0, 2) else '#f6f5ee') for i in range(16)])
mesh = build_geometry(params)
traces = {}
hits = {'S': [], 'Z': []}
for yarn in mesh['yarns']:
    verts = np.array(yarn['mesh']['vertices']).reshape(-1, mesh['ringSegments'], 3)
    crown = verts[:, mesh['ringSegments'] // 2, :]
    theta = np.unwrap(np.arctan2(crown[:, 2], crown[:, 1]))
    radius = np.hypot(crown[:, 1], crown[:, 2])
    traces[yarn['carrierNo']] = dict(x=crown[:, 0], theta=theta, radius=radius, yarn=yarn)
    assert np.sign(theta[-1] - theta[0]) == (1 if yarn['direction'] == 'S' else -1)
    for a, b, xa, xb in zip(theta[:-1], theta[1:], crown[:-1, 0], crown[1:, 0]):
        for k in range(math.ceil(min(a, b)/math.tau), math.floor(max(a,b)/math.tau)+1):
            t = (k*math.tau-a)/(b-a)
            if 0 <= t < 1:
                hits[yarn['direction']].append(dict(x=float(xa+t*(xb-xa)), carrierNo=yarn['carrierNo']))

checked_crossings = 0
minimum_over_crown_separation = float('inf')
for number, trace in traces.items():
    if trace['yarn']['direction'] != 'S':
        continue
    for event in trace['yarn']['crossingEvents'][1:-1]:
        x = event['x']
        theta = np.interp(x, trace['x'], trace['theta'])
        opposite = []
        for other in traces.values():
            if other['yarn']['direction'] != 'Z':
                continue
            angle = np.interp(x, other['x'], other['theta'])
            delta = abs(math.atan2(math.sin(theta-angle), math.cos(theta-angle)))
            opposite.append((delta, other))
        delta, other = min(opposite, key=lambda item:item[0])
        assert delta < .002, delta
        partner_event = min(other['yarn']['crossingEvents'], key=lambda e:abs(e['x']-x))
        assert abs(partner_event['x']-x) < 1e-8
        assert partner_event['order'] == -event['order']
        radial_difference = np.interp(x, trace['x'], trace['radius']) - np.interp(x, other['x'], other['radius'])
        assert radial_difference * event['order'] > 0
        minimum_over_crown_separation = min(minimum_over_crown_separation, abs(float(radial_difference)))
        checked_crossings += 1

sequences = {}
for direction, entries in hits.items():
    entries.sort(key=lambda h:h['x'])
    for i in range(len(entries)-8):
        assert len({h['carrierNo'] for h in entries[i:i+8]}) == 8
        assert entries[i]['carrierNo'] == entries[i+8]['carrierNo']
        assert abs(entries[i+8]['x']-entries[i]['x']-mesh['derivedDimensions']['helicalPitchAxialMm']) < 1e-4
    desired = 1 if direction == 'S' else 2
    start = next((i for i,e in enumerate(entries[:-8]) if e['carrierNo']==desired),0)
    sequences[direction] = entries[start:start+9]
report = dict(parameters=params, source='swept mesh crown vertices, polar ray intersections',
              directionCounts={d:sum(y['direction']==d for y in mesh['yarns']) for d in ['S','Z']},
              sameCarrierBlockIntervals=8, measuredSequences=sequences,
              carrierReturnAxialMm=mesh['derivedDimensions']['helicalPitchAxialMm'],
              checkedReciprocalCrossings=checked_crossings,
              minimumOverCrownSeparationMm=minimum_over_crown_separation,
              accepted=False, deployed=False)
(out/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
fig, ax = plt.subplots(figsize=(11.6,4.3),dpi=150)
fig.patch.set_facecolor('#f5f7f6');ax.set_facecolor('#f5f7f6')
for direction, y in [('S',1),('Z',0)]:
    sequence = sequences[direction]
    for i, entry in enumerate(sequence):
        number=entry['carrierNo']; color=params['carriers'][number-1]['color']
        ax.scatter(i,y,s=1150,marker='s',color=color,edgecolor='#168154' if i in (0,8) else '#9baba4',linewidth=2.5,zorder=3)
        ax.text(i,y,str(number),ha='center',va='center',fontsize=13,color='white' if number in (1,3) else '#23382e',zorder=4)
        if i<8: ax.annotate('',xy=(i+.72,y),xytext=(i+.28,y),arrowprops=dict(arrowstyle='->',color='#6c7b74'))
    ax.text(-.65,y,direction,ha='right',va='center',fontsize=17,fontweight='bold',color='#23382e')
    period=sequence[8]['x']-sequence[0]['x']
    ax.text(4,y-.33,f'8 blok aralığı = {period:.2f} mm → aynı kukla',ha='center',fontsize=11,color='#23633f')
ax.set_title('16 kukla · 8 S / 8 Z\nSabit çevre doğrultusunda, gerçek mesh üzerinden kukla sırası',fontsize=14,pad=25,color='#23382e')
ax.text(4,-.85,f'{checked_crossings} kesişimde karşılıklı üst-alt sırası doğrulandı.\nKutular renk lekesini değil kukla numarasını gösterir.',ha='center',fontsize=10,color='#51645a')
ax.set_xlim(-1,8.6);ax.set_ylim(-1.1,1.7);ax.axis('off');fig.tight_layout();fig.savefig(out/'identity-repeat.png',facecolor=fig.get_facecolor());plt.close(fig)
print(json.dumps({k:v for k,v in report.items() if k not in ['parameters','measuredSequences']},indent=2))
