const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const main=await figma.getNodeByIdAsync('33:72');
const I=await figma.getNodeByIdAsync('28:2'),B=await figma.getNodeByIdAsync('27:26');
const table=box(main,'Five separate destinations',1040,'VERTICAL',12,24,'surface');radius(table,12);
text(table,'入口配置','heading','text',992);caption(table,'未配置真实URL时禁用。排序、显示、启用状态与唯一主强调项各自维护。',992);
for(const [i,[key,label]] of [['x_profile','X主页'],['tg_personal','Telegram个人账号'],['tg_preview','Telegram预览频道'],['onlyfans','OnlyFans主页'],['membership','会员购买入口']].entries()){
const row=box(table,key,992,'HORIZONTAL',16,12,'bg');radius(row,8);row.counterAxisAlignItems='CENTER';text(row,String(i+1),'label','accent',24);text(row,label+'\n'+key,'body','text',230);text(row,'待配置 · 禁用\n{{'+key.toUpperCase()+'_URL}}','caption','muted',430);const edit=instance(row,B,200,'Edit '+key);override(edit,'编辑／排序');}
const detail=box(main,'Entry detail · tg_preview example',1040,'VERTICAL',12,24,'surface');radius(detail,12);text(detail,'单入口编辑 · Telegram预览频道','heading','text',992);
for(const [label,value] of [['显示文字','{{TG_PREVIEW_LABEL}}'],['辅助说明','{{LINK_DESCRIPTION}}'],['目标地址','真实URL留空；占位值不作为URL提交']]){
const n=instance(detail,I,992,label);override(n,label,'Field label');override(n,value,'Value');const c=n.findOne(x=>x.name==='Control');c.resize(992,48);c.children[0].resize(968,22);for(const t of n.children.filter(x=>x.type==='TEXT'))t.resize(992,t.height)}
const opts=box(detail,'Visibility and emphasis',992,'HORIZONTAL',12,0);for(const label of ['显示：开','启用：关','轻强调：当前入口'])override(instance(opts,B,280),label);
caption(detail,'轻强调最多一个；选择新入口替换旧项。会员购买仅外跳，Telegram个人账号与Bot入口分开配置。',992);
return {createdNodeIds};
