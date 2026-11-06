const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
for(const [name,id] of Object.entries({"Public/360":"29:3","Public/390":"29:5","Public/Desktop":"29:7"})){const c=await figma.getNodeByIdAsync(id);c.layoutPositioning='ABSOLUTE';c.x=name==='Public/Desktop'?420:20;c.y=name==='Public/Desktop'?64:32;mutatedNodeIds.push(c.id)}
const primary=await figma.getNodeByIdAsync('27:14');
const secondary=await figma.getNodeByIdAsync('27:26');
const loading=await figma.getNodeByIdAsync('27:24');
const gates={},actions={};
const data=[
['Gate/First','', ''],['Gate/Expired','成年声明已到期','请重新确认；首次确认起固定30天，再次访问不续期。'],
['Gate/Reset','已清除成年声明','请再次确认后继续浏览。'],['Gate/Storage','浏览器存储受限','本次标签页可继续；关闭或刷新后需重新确认。'],
['Gate/Leaving','正在离开','仅跳转管理员已配置的中性目标。'],['Gate/ExitEmpty','{{EXIT_NOTICE}}','离开目标尚未配置，停留在此页。'],
['Gate/Loading','正在确认','处理中，避免重复提交。']];
for(const [i,[name,title,detail]] of data.entries()){
const screen=artboard(page,name,390,844,100+(i%4)*450,1540+Math.floor(i/4)*1020);const c=box(screen,'Age content · no media or homepage links',350,'VERTICAL',20,0);c.layoutPositioning='ABSOLUTE';c.x=20;c.y=160;
text(c,'顾清棠','heading','text',350,'CENTER');text(c,'18+','title','accent',350,'CENTER');text(c,'{{AGE_TITLE}}','heading','text',350,'CENTER');text(c,'{{AGE_NOTICE}}','body','muted',350,'CENTER');
if(title){const feedback=box(c,'State feedback',350,'VERTICAL',8,16,'surface');radius(feedback,8);text(feedback,title,'label','text',318);text(feedback,detail,'caption','muted',318);}
if(!['Gate/Leaving','Gate/ExitEmpty'].includes(name)){
const confirm=instance(c,name==='Gate/Loading'?loading:primary,350,'Confirm adult');if(name!=='Gate/Loading')override(confirm,'{{AGE_CONFIRM_LABEL}}');
const exit=instance(c,secondary,350,'Leave');override(exit,'{{AGE_EXIT_LABEL}}');actions[name]={confirm:confirm.id,exit:exit.id};}
gates[name]=screen.id;
}
const desktop=artboard(page,'Gate/Desktop',1440,1000,100,3660);const dc=box(desktop,'Age content · desktop',440,'VERTICAL',20,0);dc.layoutPositioning='ABSOLUTE';dc.x=500;dc.y=230;
for(const [v,s,color] of [['顾清棠','heading','text'],['18+','title','accent'],['{{AGE_TITLE}}','heading','text'],['{{AGE_NOTICE}}','body','muted']])text(dc,v,s,color,440,'CENTER');
override(instance(dc,primary,440,'Confirm adult'),'{{AGE_CONFIRM_LABEL}}');override(instance(dc,secondary,440,'Leave'),'{{AGE_EXIT_LABEL}}');gates['Gate/Desktop']=desktop.id;
note(page,'成年声明规则','首次／到期／重置／存储受限／确认中／离开／未配置退出目标均有独立状态。\n实现：确认前无照片与主页入口数据；确认语义为本人年满18岁。固定2592000秒，不续期。\n这是自主声明；不收集证件。状态提示为设计建议；公开正式文字仍由管理员确认。',900,1600,3660);
return {createdNodeIds,mutatedNodeIds,gates,gateActions:actions};
