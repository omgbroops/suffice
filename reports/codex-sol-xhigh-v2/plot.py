"""Render the measured cohort, without mixing external leaderboard scores."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.suffice/chart-runtime'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter,MaxNLocator
HERE=Path(__file__).resolve().parent
d=json.loads((HERE/'metrics.json').read_text());summaries=d['summaries']
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'figure.facecolor':'#080a0d','axes.facecolor':'#080a0d','text.color':'#eceff3','axes.labelcolor':'#eceff3','xtick.color':'#bac2cc','ytick.color':'#bac2cc','axes.edgecolor':'#59616d','svg.fonttype':'none'})
fig,ax=plt.subplots(figsize=(10.7,6.5),dpi=180);fig.subplots_adjust(left=.11,right=.96,top=.79,bottom=.26)
fig.text(.11,.945,'Quality vs cost',fontsize=20,weight='medium')
fig.text(.11,.895,'Suffice vs native Codex · GPT-6.1 Sol · Extra High',fontsize=12,color='#bac2cc')
fig.text(.96,.84,'Higher and farther right is better',ha='right',fontsize=10,color='#bac2cc')
colors={'suffice':'#6cbbff','codex':'#e8e9eb'};points=[]
for arm in ['suffice','codex']:
 s=summaries[arm]
 if not s['attempts']:continue
 x=s['meanCostPerAttemptUsd'];lower=False
 if x is None:x=s['knownTotalApiEquivalentUsd']/s['attempts'];lower=True
 y=100*s['accepted']/s['attempts'];points.append((arm,x,y,lower))
maxx=max(x for _,x,_,_ in points)*1.3 if points else .1
ax.set_xlim(maxx,0);ax.set_ylim(0,110);ax.set_yticks([0,20,40,60,80,100]);ax.xaxis.set_major_locator(MaxNLocator(6));ax.xaxis.set_major_formatter(FuncFormatter(lambda x,_:f'${x:.2f}'))
ax.set_xlabel('Mean API-equivalent cost per attempted task (USD) · Cheaper →',labelpad=14)
ax.set_ylabel('Accepted on frozen issue checks (%)',labelpad=12)
ax.grid(axis='y',color='#29313b',linewidth=.65);ax.spines[['top','right']].set_visible(False)
for idx,(arm,x,y,lower)in enumerate(points):
 s=summaries[arm];color=colors[arm]
 ax.scatter([x],[y],s=190 if arm=='suffice'else 80,marker='*'if arm=='suffice'else 'o',color=color,zorder=4)
 name='Suffice'if arm=='suffice'else'Native Codex'
 label=f"{name}\n{s['accepted']}/{s['attempts']} · {'≥'if lower else''}${x:.4f}/attempt"
 offset=(12,-24 if idx==0 else -60);ha='left'
 if x<maxx*.28:offset=(-12,-24 if idx==0 else -60);ha='right'
 ax.annotate(label,(x,y),xytext=offset,textcoords='offset points',ha=ha,va='top',fontsize=11,color=color)
 if lower:ax.annotate('',xy=(min(maxx,x+maxx*.16),y),xytext=(x,y),arrowprops={'arrowstyle':'->','color':color,'linewidth':1})
fig.text(.11,.13,'10 shared historical issues · one new attempt per harness per issue · development cohort',fontsize=10,color='#bac2cc')
fig.text(.11,.087,'All scored attempt costs included, including coding failures; setup interruptions are reported separately.',fontsize=9,color='#bac2cc')
fig.text(.11,.047,'Small sample and frozen-check coverage limits apply. This is not the Coding Agent Index or a validated global frontier.',fontsize=9,color='#bac2cc')
for ext in ['png','svg','pdf']:fig.savefig(HERE/f'quality-vs-cost.{ext}',facecolor=fig.get_facecolor())
plt.close(fig)
print(json.dumps({'rendered':'quality-vs-cost','attempts':d['recordedAttempts'],'source':'metrics.json'}))
