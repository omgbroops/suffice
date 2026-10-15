import pathlib,json
R=pathlib.Path('C:/Users/Mohammed/Documents/GitHub/suffice-experiments/field-campaign-v1')
for tid,deps in [('s01',{'ava':'4.3.3','delay':'5.0.0','p-event':'6.0.1'}),('s02',{'@sinonjs/fake-timers':'15.3.2'})]:
 p=R/'.suffice/field-campaign-v1/tasks'/tid/'dependencies';p.mkdir(exist_ok=True)
 (p/'package.json').write_text(json.dumps({'name':f'field-{tid}-native-test-dependencies','version':'1.0.0','private':True,'type':'module','dependencies':deps},indent=2))
