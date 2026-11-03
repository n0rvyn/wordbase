#!/usr/bin/env python3
"""Inventory app_promos; create web derivatives without modifying originals.

New or changed assets remain unassigned until their exact SHA is reviewed in
content/app-promo-associations.json. No network, uploads or production writes.
"""
import argparse,hashlib,json,subprocess
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'app_promos'
INVENTORY=ROOT/'content/app-promos-inventory.json'
ASSOCIATIONS=ROOT/'content/app-promo-associations.json'
OUTPUT=ROOT/'.preview/prepared-promos'

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def probe(path):
 d=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
 v=next(s for s in d['streams'] if s['codec_type']=='video')
 return {'width':v['width'],'height':v['height'],'duration':float(d['format'].get('duration',v.get('duration',0))),'codec':v['codec_name'],'hasAudio':any(s['codec_type']=='audio' for s in d['streams'])}
def write(data):
 INVENTORY.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 published=data.get('lastPublication',{})
 when=datetime.fromtimestamp(published['verifiedAt']/1000,timezone.utc).isoformat() if published.get('verifiedAt') else 'Not yet verified'
 rows=['# App promo inventory','',f'Last publication verification (UTC): {when}.','',
       'Incoming originals: `app_promos/`. Originals are preserved. Full source/delivery hashes and media IDs are in [the machine-readable inventory](../../content/app-promos-inventory.json). Scanning files does not change the live site.','',
       '| Original file | App | Used / unused | Prepared copy | Source SHA-256 |','|---|---|---|---|---|']
 for asset in data['assets']:
  a=asset['association'];d=asset['deployment'];name=Path(asset['source']['path']).name.replace('|','\\|')
  app=a.get('appName') or a.get('appSlug') or 'Unassigned'
  if d['status']=='deployed':status='[Used / live](https://norvyn.com'+d['url']+')'
  elif a.get('catalogStatus')=='draft':status='Unused — draft app'
  elif a['status']=='needs-confirmation':status='Unused — awaiting app confirmation'
  else:status=d['status']
  prepared='MP4 + poster' if asset.get('delivery') else '—'
  rows.append(f"| {name} | {app} | {status} | {prepared} | `{asset['source']['sha256'][:12]}` |")
 rows+=['','See [the intake, preparation and publishing workflow](app-promos.md).','']
 (ROOT/'docs/design/app-promos-inventory.md').write_text('\n'.join(rows))

def scan():
 prior=json.loads(INVENTORY.read_text()) if INVENTORY.exists() else {'assets':[]}
 by_hash={a['source']['sha256']:a for a in prior['assets']}
 associations=json.loads(ASSOCIATIONS.read_text())
 assets=[]
 for path in sorted(SOURCE.iterdir()):
  if path.name.startswith('.') or path.is_symlink() or not path.is_file():continue
  sha=digest(path);old=by_hash.pop(sha,{})
  association=associations.get(sha,{'status':'unassigned','appSlug':None,'reason':'New or changed asset needs content review.'})
  item={**old,'id':'p_'+sha[:24],'source':{'path':str(path.relative_to(ROOT)),'sha256':sha,'bytes':path.stat().st_size,**probe(path)},'association':association,'originalPresent':True}
  item.setdefault('deployment',{'status':'not-deployed','mediaId':None,'url':None,'posterMediaId':None,'posterUrl':None})
  assets.append(item)
 for old in by_hash.values():assets.append({**old,'originalPresent':False})
 result={**{k:v for k,v in prior.items() if k not in ('assets',)},'schemaVersion':1,'sourceDirectory':'app_promos','originalsPolicy':'Never rename, transcode in place or delete originals. Hidden OS metadata is ignored.','assets':assets}
 write(result);return result

def prepare(data):
 OUTPUT.mkdir(parents=True,exist_ok=True)
 version=subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0]
 for asset in data['assets']:
  if not asset['originalPresent'] or asset['association']['status']!='confirmed':continue
  source=asset['source'];path=ROOT/source['path'];assert digest(path)==source['sha256']
  w=min(source['width'],1200 if source['width']>=source['height'] else 720);h=round(source['height']*w/source['width'])
  filters=f'scale={w}:{h},pad=ceil(iw/2)*2:ceil(ih/2)*2'
  encoding=['-map','0:v:0','-map','0:a:0?','-vf',filters,'-r','30','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-map_metadata','-1']
  recipe={'tool':version,'encoding':encoding,'posterTime':round(source['duration']*asset['association'].get('posterFraction',.1),3),'posterWidth':min(w,720)}
  recipe_hash=hashlib.sha256(json.dumps(recipe,sort_keys=True).encode()).hexdigest()
  stem='promo-'+source['sha256'][:16]+'-'+recipe_hash[:10]
  video=OUTPUT/(stem+'.mp4');poster=OUTPUT/(stem+'.jpg');old=asset.get('delivery',{})
  verified=old.get('recipeSHA256')==recipe_hash and video.exists() and poster.exists() and old.get('sha256')==digest(video) and old.get('posterSHA256')==digest(poster)
  if not verified:
   print('Preparing',source['path'],flush=True)
   temp=video.with_suffix('.working.mp4')
   subprocess.run(['ffmpeg','-v','error','-nostdin','-i',str(path),*encoding,'-y',str(temp)],check=True);temp.replace(video)
   subprocess.run(['ffmpeg','-v','error','-nostdin','-ss',str(recipe['posterTime']),'-i',str(video),'-frames:v','1','-vf',f'scale={recipe["posterWidth"]}:-1','-update','1','-y',str(poster)],check=True)
  info=probe(video);assert abs(info['duration']-source['duration'])<.2,(source['path'],'duration changed')
  assert digest(path)==source['sha256'],'Original changed during preparation'
  asset['delivery']={'file':str(video.relative_to(ROOT)),'posterFile':str(poster.relative_to(ROOT)),'sha256':digest(video),'posterSHA256':digest(poster),'bytes':video.stat().st_size,'posterBytes':poster.stat().st_size,'recipeSHA256':recipe_hash,'recipe':recipe,**info}
  write(data)
 print('Prepared derivatives; no uploads or catalog writes performed.',flush=True)

def preview(data):
 target=ROOT/'.preview/promos-review';target.mkdir(parents=True,exist_ok=True)
 assignments={};assets={}
 for asset in data['assets']:
  a=asset['association'];d=asset.get('delivery')
  if not d or a['status']!='confirmed' or a.get('catalogStatus')!='published':continue
  url='/__promos__/assets/'+Path(d['file']).name;poster='/__promos__/assets/'+Path(d['posterFile']).name
  assets[url]=d['file'];assets[poster]=d['posterFile']
  item={'type':'video','id':asset['id'],'src':url,'poster':poster,'alt':a['alt'],'label':a['label'],'width':d['width'],'height':d['height']}
  assignments.setdefault(a['appSlug'],[]).append((a.get('order',0),item))
 assignments={slug:{'items':[item for _,item in sorted(items,key=lambda x:x[0])]} for slug,items in assignments.items()}
 (target/'assignments.json').write_text(json.dumps(assignments,ensure_ascii=False,indent=2)+'\n');(target/'assets.json').write_text(json.dumps(assets,indent=2)+'\n')
 print('Local preview assignments:',{k:len(v['items']) for k,v in assignments.items()})

def record(data, receipt_file):
 receipt=json.loads(receipt_file.read_text())
 assert receipt['origin']=='https://norvyn.com' and len(receipt['revision'])==40
 by_id={a['id']:a for a in data['assets']}
 for used in receipt['assets']:
  asset=by_id[used['id']]
  assert asset['source']['sha256']==used['sourceSHA256'] and asset['association']['appSlug']==used['appSlug']
  assert asset['association']['status']=='confirmed' and asset['association']['catalogStatus']=='published'
  assert used['status']=='deployed' and used['url'].startswith('/uploads/') and used['posterUrl'].startswith('/uploads/')
  asset['deployment']={k:used[k] for k in ['status','appSlug','mediaId','url','posterMediaId','posterUrl']}
  asset['deployment']['revision']=receipt['revision']
  asset['deployment']['verifiedAt']=receipt['verifiedAt']
 data['lastPublication']={'origin':receipt['origin'],'revision':receipt['revision'],'receiptSHA256':digest(receipt_file),'assets':len(receipt['assets']),'verifiedAt':receipt['verifiedAt']}
 write(data);print('Recorded verified deployed assets:',len(receipt['assets']))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['scan','prepare','preview','record']);parser.add_argument('--receipt',type=Path);args=parser.parse_args()
 data=scan()
 if args.command in ('prepare','preview'):prepare(data)
 if args.command=='preview':preview(data)
 if args.command=='record':
  assert args.receipt and args.receipt.is_file(),'Provide the verified publication receipt'
  record(data,args.receipt)
 if args.command=='scan':
  for a in data['assets']:print(a['source']['path'],a['association']['status'],a['association'].get('appSlug'),a['deployment']['status'])
