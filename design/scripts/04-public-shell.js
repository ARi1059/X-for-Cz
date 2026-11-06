const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
const frames={};const columns={};
for(const [name,w,h,x] of [['Public/360',360,940,100],['Public/390',390,940,520],['Public/Desktop',1440,1100,1000]]){
const screen=artboard(page,name,w,h,x,100);const col=box(screen,'Content · identity → links → gallery → footer',w===1440?600:w-40,'VERTICAL',24,0);col.x=w===1440?420:20;col.y=w===1440?64:32;col.layoutPositioning='ABSOLUTE';screen.appendChild(col);frames[name]=screen.id;columns[name]=col.id;
}
note(page,'公开页布局标注','手机左右20px；桌面内容600px居中。五入口56px高、12px间距。\n这里展示初始占位状态：真实URL为空，所有入口禁用。名称暂定，公开仅显示顾清棠。',1000,100,1150);
return {createdNodeIds,publicFrames:frames,publicColumns:columns};
