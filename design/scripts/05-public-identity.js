const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
const cols={"Public/360":"29:3","Public/390":"29:5","Public/Desktop":"29:7"},buttons={"Link/Default":"27:2","Link/Hover":"27:4","Link/Focus":"27:6","Link/Pressed":"27:8","Link/Disabled":"27:10","Link/Loading":"27:12","Primary/Default":"27:14","Primary/Hover":"27:16","Primary/Focus":"27:18","Primary/Pressed":"27:20","Primary/Disabled":"27:22","Primary/Loading":"27:24","Secondary/Default":"27:26","Secondary/Hover":"27:28","Secondary/Focus":"27:30","Secondary/Pressed":"27:32","Secondary/Disabled":"27:34","Secondary/Loading":"27:36"};
const av=await figma.getNodeByIdAsync('26:79');const nodes={};
for(const [name,id] of Object.entries(cols)){
const col=await figma.getNodeByIdAsync(id);const w=col.width;
const identity=box(col,'01 Identity',w,'VERTICAL',8,0);identity.counterAxisAlignItems='CENTER';
const avatar=track(figma.createEllipse());avatar.name='Avatar · user upload 2';avatar.resize(80,80);avatar.fills=av.fills;identity.appendChild(avatar);
text(identity,'顾清棠','title','text',w,'CENTER');text(identity,'{{SITE_TAGLINE}}','body','muted',w,'CENTER');
const links=box(col,'02 Links · five independent destinations',w,'VERTICAL',12,0);
for(const [i,label] of ['X_PROFILE','TG_PERSONAL','TG_PREVIEW','ONLYFANS','MEMBERSHIP'].entries()){
const c=await figma.getNodeByIdAsync(buttons[i===2?'Secondary/Disabled':'Link/Disabled']);const n=instance(links,c,w,['x_profile','tg_personal','tg_preview','onlyfans','membership'][i]);override(n,'{{'+label+'_LABEL}}');
}
nodes[name]={identity:identity.id,links:links.id};
}
return {createdNodeIds,publicSections:nodes};
