const page=await figma.getNodeByIdAsync('25:7');await figma.setCurrentPageAsync(page);
const board=box(page,'Gallery states · multiple single zero loading error',1620,'HORIZONTAL',24,24,'bg');board.x=100;board.y=2500;
const source=await figma.getNodeByIdAsync('26:80');
for(const [key,title,detail] of [['Multiple','多张照片','横向滑动；前后按钮与键盘切换。'],['Single','仅一张','保留照片；隐藏分页和切换控件。'],['Zero','零张照片','公开模块隐藏；后台显示上传引导。'],['Loading','加载中','等比例占位；链接保持可用。'],['Error','加载失败','显示可配置提示；链接不受影响。']]){
const card=box(board,'Gallery/'+key,280,'VERTICAL',16,16,'surface');radius(card,12);text(card,title,'heading','text',248);
if(['Multiple','Single'].includes(key)){const photo=rect(card,'Photo preview',key==='Multiple'?80:128,key==='Multiple'?100:160);photo.fills=source.fills;if(key==='Multiple')text(card,'‹     1 / 5     ›','body','accent',248)}
else if(key==='Loading')rect(card,'Loading placeholder',128,160,'hover',8);
else if(key==='Error'){const p=box(card,'Photo error',248,'VERTICAL',12,16,'bg');radius(p,8);text(p,'{{ERROR_TEXT}}','body','muted',216)}
text(card,detail,'body','muted',248);
}
return {createdNodeIds,galleryStatesBoard:board.id};
