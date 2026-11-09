export const CONFIGURATIONS=Object.freeze([
  {id:'A',name:'Luna baseline',model:'gpt-6-luna',effort:'xhigh',mode:'off'},
  {id:'B',name:'Luna always-guided',model:'gpt-6-luna',effort:'xhigh',mode:'guided'},
  {id:'C',name:'Luna on-demand',model:'gpt-6-luna',effort:'xhigh',mode:'on-demand'},
  {id:'D',name:'Sol baseline',model:'gpt-6.1-sol',effort:'xhigh',mode:'off'}
]);
export const CATEGORIES={'simple':4,'cross-file':12,'complex':8};
export const COMPARISONS=[['B','A'],['C','A'],['C','B'],['C','D']];
