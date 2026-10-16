from pathlib import Path
import json,sys
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'.suffice/chart-runtime'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
O=Path(__file__).resolve().parent;d=json.loads((O/'metrics.json').read_text());g=d['groups']
if len(d['rows'])!=30 or any(v['unknownCosts'] for v in g.values()):raise SystemExit('Require thirty complete costs before plotting')
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'figure.facecolor':'#0b0d12','axes.facecolor':'#0b0d12','text.color':'#e9edf5','axes.labelcolor':'#e9edf5','xtick.color':'#bac2cc','ytick.color':'#bac2cc','axes.edgecolor':'#586174','svg.fonttype':'none'})
fig,axes=plt.subplots(1,2,figsize=(11.5,5.5),dpi=170);fig.subplots_adjust(top=.77,bottom=.25,wspace=.3)
names=['suffice','stock-pi','codex'];colors=['#64b5ff','#b4a2ff','#e4e8ee'];x=range(3)
for j,effort in enumerate(['low','xhigh']):
 vals=[g[a+'-'+effort] for a in names];pos=[i+(j-.5)*.34 for i in x]
 axes[0].bar(pos,[v['mean'] for v in vals],width=.32,color=colors,alpha=1 if j==0 else .45,hatch=None if j==0 else '//')
 axes[1].bar(pos,[100*v['success']/v['attempts'] for v in vals],width=.32,color=colors,alpha=1 if j==0 else .45,hatch=None if j==0 else '//')
 for i,v in enumerate(vals):
  axes[0].annotate(f'${v["mean"]:.3f}',(pos[i],v['mean']),xytext=(0,5),textcoords='offset points',ha='center',fontsize=8)
  axes[1].annotate(f'{v["success"]}/{v["attempts"]}',(pos[i],100*v['success']/v['attempts']),xytext=(0,5),textcoords='offset points',ha='center',fontsize=8)
for ax in axes:
 ax.set_xticks(list(x),['Suffice','Stock Pi','Native Codex']);ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',color='#27303c',alpha=.5);ax.set_axisbelow(True)
axes[0].set_title('Mean cost per attempted task · lower is better',loc='left');axes[0].set_ylabel('API-equivalent USD');axes[0].set_ylim(0,max(v['mean'] for v in g.values())*1.3)
axes[1].set_title('Budget-eligible acceptance · higher is better',loc='left');axes[1].set_ylabel('Accepted (%)');axes[1].set_ylim(0,119)
fig.text(.125,.93,'Suffice vs stock Pi vs native Codex',fontsize=19);fig.text(.125,.865,'GPT-6.1 Sol · low (solid) and xhigh (hatched)',fontsize=12,color='#bac2cc')
fig.text(.125,.12,'Five fresh historical issues · one attempt per configuration · concurrent Sonion execution',fontsize=10,color='#bac2cc');fig.text(.125,.065,'Small async-library cohort; includes solution hints; six invalid attempts separately retained. Not the Coding Agent Index.',fontsize=9,color='#bac2cc')
for ext in ['png','svg','pdf']:fig.savefig(O/('comparison.'+ext),facecolor=fig.get_facecolor())
plt.close(fig)
