"""Measured cost/quality panels; keep the contract-sensitive case visible."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.suffice/chart-runtime'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter,MaxNLocator
HERE=Path(__file__).resolve().parent
d=json.loads((HERE/'metrics.json').read_text())
if not d['complete']:raise SystemExit('Wait for all twenty independent grades before plotting.')
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'figure.facecolor':'#080a0d','axes.facecolor':'#080a0d','text.color':'#eceff3','axes.labelcolor':'#eceff3','xtick.color':'#bac2cc','ytick.color':'#bac2cc','axes.edgecolor':'#59616d','svg.fonttype':'none'})
panels=[('Frozen checks · all 10 issues',d['summaries']),('Contract sensitivity · 9 issues, excluding q02',d['ninePairContractSensitivity'])]
fig,axes=plt.subplots(2,1,figsize=(9.2,10.4),dpi=180)
fig.subplots_adjust(left=.13,right=.96,top=.865,bottom=.23,hspace=.58)
fig.text(.13,.966,'Quality vs cost',fontsize=20)
fig.text(.13,.932,'Suffice vs native Codex · GPT-6.1 Sol · Extra High',fontsize=12,color='#bac2cc')
fig.text(.96,.9,'Higher and farther right is better',ha='right',fontsize=10,color='#bac2cc')
colors={'suffice':'#6cbbff','codex':'#e8e9eb'}
maxx=max(s['meanCostPerAttemptUsd']or s['knownTotalApiEquivalentUsd']/s['attempts']for _,summary in panels for s in summary.values())*1.35
for ax,(title,summary)in zip(axes,panels):
 ax.set_title(title,loc='left',fontsize=12,pad=14)
 ax.set_xlim(maxx,0);ax.set_ylim(0,110);ax.set_yticks([0,25,50,75,100])
 ax.xaxis.set_major_locator(MaxNLocator(5));ax.xaxis.set_major_formatter(FuncFormatter(lambda x,_:f'${x:.2f}'))
 ax.set_xlabel('Mean API-equivalent cost per attempted task (USD) · Cheaper →',labelpad=10)
 ax.set_ylabel('Frozen-check acceptance (%)',labelpad=12)
 ax.grid(axis='y',color='#29313b',linewidth=.65);ax.spines[['top','right']].set_visible(False)
 for idx,arm in enumerate(['suffice','codex']):
  s=summary[arm];lower=s['meanCostPerAttemptUsd']is None
  x=s['knownTotalApiEquivalentUsd']/s['attempts']if lower else s['meanCostPerAttemptUsd'];y=100*s['accepted']/s['attempts'];color=colors[arm]
  ax.scatter([x],[y],s=190 if arm=='suffice'else 75,marker='*'if arm=='suffice'else'o',color=color,zorder=4)
  name='Suffice'if arm=='suffice'else'Native Codex'
  label=f"{name} · {s['accepted']}/{s['attempts']}\n{'≥'if lower else''}${x:.4f} / attempt"
  ax.annotate(label,(x,y),xytext=(12 if idx==0 else-12,-16),textcoords='offset points',ha='left'if idx==0 else'right',va='top',fontsize=11,color=color)
  if lower:ax.annotate('',xy=(min(maxx,x+maxx*.16),y),xytext=(x,y),arrowprops={'arrowstyle':'->','color':color,'linewidth':1})
fig.text(.13,.135,'q02: the issue’s suggested event change conflicts with an older test contract.',fontsize=10,color='#bac2cc')
fig.text(.13,.105,'Raw grades stay unchanged; the nine-issue view is a post-hoc sensitivity.',fontsize=10,color='#bac2cc')
fig.text(.13,.075,'Interrupted-run and setup costs are preserved in a separate inclusive ledger.',fontsize=10,color='#bac2cc')
fig.text(.13,.045,'Small development cohort · Not a fresh holdout · Not the Coding Agent Index',fontsize=10,color='#bac2cc')
for ext in ['png','svg','pdf']:fig.savefig(HERE/f'quality-vs-cost.{ext}',facecolor=fig.get_facecolor())
(HERE/'plot-provenance.json').write_text(json.dumps({'matplotlib':matplotlib.__version__,'input':'metrics.json','attempts':d['recordedAttempts'],'quality':'Frozen-check acceptance; separately labeled contract sensitivity'},indent=2)+'\n')
plt.close(fig)
print(json.dumps({'rendered':'quality-vs-cost','attempts':d['recordedAttempts'],'panels':2}))
