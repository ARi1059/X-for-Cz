const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const rows=page.findAll(n=>n.type==='FRAME'&&n.layoutMode==='HORIZONTAL'&&n.height<44&&n.children.some(c=>c.height>n.height));
for(const n of rows){const width=n.name==='Assets'?992:n.name==='Draft actions'?1040:n.name==='Visibility and emphasis'||n.name==='Asset actions'?992:992;n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='AUTO';n.resize(width,Math.max(n.height,1));mutatedNodeIds.push(n.id)}
const frames=page.children.filter(n=>n.type==='FRAME'&&n.name.startsWith('Admin/'));
return {mutatedNodeIds,correctedRows:rows.map(n=>({name:n.name,height:n.height})),fieldWidths:page.findAll(n=>n.type==='INSTANCE'&&n.name==='照片说明').map(n=>({width:n.width,children:n.children.map(c=>c.width)}))};
