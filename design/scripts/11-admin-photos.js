const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const main=await figma.getNodeByIdAsync('33:96');
const I=await figma.getNodeByIdAsync('28:2'),B=await figma.getNodeByIdAsync('27:26');
const grid=box(main,'Current photos · one avatar and five gallery assets',1040,'VERTICAL',16,24,'surface');radius(grid,12);
text(grid,'头像与照片条','heading','text',992);caption(grid,'当前六张不同照片；原始色调保留。照片条固定在五入口之后。',992);
const row=box(grid,'Assets',992,'HORIZONTAL',16,0);for(const [i,id] of ['26:79','26:80','26:81','26:82','26:83','26:84'].entries()){const cell=box(row,'Asset '+i,144,'VERTICAL',8,0);const source=await figma.getNodeByIdAsync(id);const n=rect(cell,i===0?'Avatar':'Gallery '+i,144,i===0?144:180);n.fills=source.fills;text(cell,i===0?'头像 · 上传2':'照片 '+i,'caption','muted',144)}
const actions=box(grid,'Asset actions',992,'HORIZONTAL',12,0);for(const label of ['上传／替换照片','调整顺序','显示／隐藏'])override(instance(actions,B,280),label);
const props=box(main,'Selected photo properties',1040,'VERTICAL',12,24,'surface');radius(props,12);text(props,'选中照片 · 1 / 5','heading','text',992);
for(const [label,value] of [['照片说明','{{PHOTO_CAPTION}}'],['替代文本','{{PHOTO_ALT}}'],['裁切焦点','X 50% · Y 50%；保持比例，按图调整']]){const n=instance(props,I,992,label);override(n,label,'Field label');override(n,value,'Value');const c=n.findOne(x=>x.name==='Control');c.resize(992,48);c.children[0].resize(968,22);for(const t of n.children.filter(x=>x.type==='TEXT'))t.resize(992,t.height)}
const del=instance(props,B,260,'Delete selected photo');override(del,'删除选中照片');
caption(props,'发布中使用的图片删除前确认；草稿删除不破坏上一公开版本。上传格式／大小错误保留其他已编辑内容。',992);
return {createdNodeIds,photoDeleteAction:del.id};
