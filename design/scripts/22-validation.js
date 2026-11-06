const page=await figma.getNodeByIdAsync(PAGE_ID);await figma.setCurrentPageAsync(page);
const nodes=page.findAll(()=>true);const texts=nodes.filter(n=>n.type==='TEXT');
const wrongFonts=texts.filter(n=>n.fontName.family!=='Noto Sans SC').map(n=>({id:n.id,font:n.fontName}));
const frames=page.children.filter(n=>n.type==='FRAME');
const clippedScreens=[];
for(const f of frames.filter(n=>/^(Public|Gate|Admin|State|Flow)\//.test(n.name))){
for(const c of f.children.filter(n=>n.visible)){if(c.x<-0.5||c.y<-0.5||c.x+c.width>f.width+0.5||c.y+c.height>f.height+0.5)clippedScreens.push({frame:f.name,id:c.id,name:c.name,x:c.x,y:c.y,width:c.width,height:c.height,frameSize:[f.width,f.height]})}
}
return {pageId:page.id,pageName:page.name,nodeCount:nodes.length,textCount:texts.length,instanceCount:nodes.filter(n=>n.type==='INSTANCE').length,componentCount:nodes.filter(n=>n.type==='COMPONENT').length,fontFamilies:[...new Set(texts.map(n=>n.fontName.family))],wrongFonts,clippedScreens,prototypeEdges:nodes.filter(n=>n.reactions?.length).length,frames:frames.map(n=>({id:n.id,name:n.name,width:n.width,height:n.height}))};
