function externalLink(value){
 try{const url=new URL(value);return ['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
module.exports={externalLink};
