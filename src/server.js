const express=require('express');
const multer=require('multer');
const path=require('path');
const {extractDocument,analyzeDocuments}=require('./analyzer');
const {projects}=require('./data');
const {search}=require('./similarity');
const {EphemeralStubAdapter}=require('./external-adapter');
const {htmlReport,docxReport,pdfReport}=require('./report');
const {demoReview,rfpSummary,safeInventory}=require('./eval-materials');

function decodeOriginalName(name='') {
  const source=String(name);
  const repaired=Buffer.from(source,'latin1').toString('utf8');
  const score=value=>(value.match(/[가-힣]/g)||[]).length*3-(value.match(/�/g)||[]).length*10-(value.match(/[ÃÂìíîï]/g)||[]).length*2;
  return score(repaired)>score(source)?repaired:source;
}

const app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:12}});
app.disable('x-powered-by');
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'../public')));
app.use('/samples',express.static(path.join(__dirname,'../samples'),{fallthrough:false}));
app.get('/api/health',(req,res)=>res.json({ok:true,mode:'deterministic-local',records:projects.length}));
app.get('/api/projects',(req,res)=>res.json(projects));
app.get('/api/eval-materials',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({files:safeInventory(),rfpSummary,demo:demoReview()});
});
app.post('/api/analyze',upload.array('documents',12),async(req,res,next)=>{
  try {
    if(!req.files?.length)return res.status(400).json({error:'분석할 파일을 선택하세요.'});
    const documents=[];
    for(const file of req.files){
      file.originalname=decodeOriginalName(file.originalname);
      documents.push({name:file.originalname,...await extractDocument(file)});
    }
    res.json(analyzeDocuments(documents));
  } catch(e){next(e);}
});
app.post('/api/search',(req,res)=>{const {proposal={},query='',manualInput=''}=req.body||{};res.json({query,candidates:search(proposal,query,manualInput),seedCount:projects.length});});
app.post('/api/external/research',async(req,res)=>{const {url,id,password,query}=req.body||{};try{const out=await new EphemeralStubAdapter().search({url,id,password,query});res.json(out);}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/report/:format',async(req,res,next)=>{try{const f=req.params.format;if(f==='html'){res.type('html').attachment('ICT_RnD_사전검토보고서.html').send(htmlReport(req.body));}else if(f==='docx'){res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment('ICT_RnD_사전검토보고서.docx').send(await docxReport(req.body));}else if(f==='pdf'){res.type('application/pdf').attachment('ICT_RnD_사전검토보고서.pdf').send(await pdfReport(req.body));}else res.status(400).json({error:'지원 형식: docx, pdf, html'});}catch(e){next(e);}});
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError)return res.status(400).json({error:`업로드 오류: ${err.message}`});console.error('Request failed without sensitive payload:',err.message);res.status(500).json({error:'처리 중 오류가 발생했습니다.'});});
if(require.main===module){const port=Number(process.env.PORT)||3000;app.listen(port,()=>console.log(`ICT R&D pre-review listening on http://localhost:${port}`));}
module.exports=app;
