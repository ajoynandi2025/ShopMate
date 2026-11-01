import { inflateRawSync } from 'node:zlib';

export type ImportedProductRow = { rowNumber: number; values: Record<string,string> };
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 1000;

function decodeXml(value: string): string {
  return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function parseCsv(text: string): string[][] {
  const rows: string[][]=[]; let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const char=text[i];
    if(quoted) { if(char==='"'&&text[i+1]==='"'){cell+='"';i++;} else if(char==='"')quoted=false; else cell+=char; }
    else if(char==='"'&&cell.length===0) quoted=true;
    else if(char===','){row.push(cell);cell='';}
    else if(char==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(char!=='\r') cell+=char;
  }
  if(quoted) throw new Error('CSV contains an unclosed quoted field.');
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function zipEntries(data: Buffer): Map<string,Buffer> {
  let eocd=-1; for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--) if(data.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  if(eocd<0) throw new Error('This is not a valid .xlsx workbook.');
  const count=data.readUInt16LE(eocd+10),directoryOffset=data.readUInt32LE(eocd+16),entries=new Map<string,Buffer>(); let cursor=directoryOffset,totalUncompressed=0;
  if(count>2000) throw new Error('Workbook contains too many internal files.');
  for(let i=0;i<count;i++) {
    if(data.readUInt32LE(cursor)!==0x02014b50) throw new Error('Workbook archive is invalid.');
    const method=data.readUInt16LE(cursor+10),compressedSize=data.readUInt32LE(cursor+20),uncompressedSize=data.readUInt32LE(cursor+24),nameLength=data.readUInt16LE(cursor+28),extraLength=data.readUInt16LE(cursor+30),commentLength=data.readUInt16LE(cursor+32),localOffset=data.readUInt32LE(cursor+42);
    const name=data.toString('utf8',cursor+46,cursor+46+nameLength); cursor+=46+nameLength+extraLength+commentLength;
    if(name.startsWith('/')||name.split('/').includes('..')) throw new Error('Workbook contains an unsafe internal path.');
    totalUncompressed+=uncompressedSize;if(uncompressedSize>20*1024*1024||totalUncompressed>50*1024*1024)throw new Error('Workbook expands beyond the supported 50 MB limit.');
    if(data.readUInt32LE(localOffset)!==0x04034b50) throw new Error('Workbook archive entry is invalid.');
    const localName=data.readUInt16LE(localOffset+26),localExtra=data.readUInt16LE(localOffset+28),start=localOffset+30+localName+localExtra,compressed=data.subarray(start,start+compressedSize);
    if(method===0) entries.set(name,Buffer.from(compressed)); else if(method===8) entries.set(name,inflateRawSync(compressed)); else throw new Error('This workbook uses an unsupported compression format.');
  }
  return entries;
}
function xmlAttr(tag:string,key:string):string|null { const found=tag.match(new RegExp(`\\b${key}="([^"]*)"`));return found?decodeXml(found[1]):null; }
function parseXlsx(data:Buffer):string[][] {
  const files=zipEntries(data),workbook=files.get('xl/workbook.xml')?.toString('utf8'); if(!workbook)throw new Error('Workbook does not contain a readable sheet.');
  const sheetTag=workbook.match(/<sheet\b[^>]*\/>|<sheet\b[^>]*>/)?.[0];if(!sheetTag)throw new Error('Workbook does not contain a readable sheet.');
  const relId=xmlAttr(sheetTag,'r:id');if(!relId)throw new Error('Workbook sheet reference is missing.');
  const rels=files.get('xl/_rels/workbook.xml.rels')?.toString('utf8')||'';
  const relation=rels.match(/<Relationship\b[^>]*\/>|<Relationship\b[^>]*>/g)?.find(tag=>xmlAttr(tag,'Id')===relId);
  const target=relation&&xmlAttr(relation,'Target');if(!target)throw new Error('Could not locate the first worksheet.');
  const sheetPath=target.startsWith('/')?target.slice(1):`xl/${target.replace(/^\.\//,'')}`;
  const sheet=files.get(sheetPath)?.toString('utf8');if(!sheet)throw new Error('Could not read the first worksheet.');
  const sharedXml=files.get('xl/sharedStrings.xml')?.toString('utf8')||'';
  const shared=[...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>decodeXml(t[1])).join(''));
  const rows:string[][]=[];
  for(const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row:string[]=[];
    for(const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs=cellMatch[1],body=cellMatch[2],ref=xmlAttr(attrs,'r')||'',letters=ref.match(/^[A-Z]+/)?.[0]||'';
      let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;col-=1;
      const type=xmlAttr(attrs,'t'),value=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      const inline=[...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>decodeXml(m[1])).join('');
      const cell=type==='s'&&value!=null?shared[Number(value)]||'':type==='inlineStr'?inline:value==null?'':decodeXml(value);
      if(col>=0)row[col]=cell;
    }
    rows.push(row.map(x=>x||''));
    if(rows.length>MAX_ROWS+1)throw new Error(`Import is limited to ${MAX_ROWS} data rows.`);
  }
  return rows;
}
const headerAliases:Record<string,string>={name:'productName',product:'productName',productname:'productName',sku:'sku',category:'category',categoryname:'category',brand:'brand',description:'description',unit:'unit',purchaseprice:'purchasePrice',sellingprice:'sellingPrice',gst:'gstPercentage',gstpercent:'gstPercentage',gstpercentage:'gstPercentage',taxpercentage:'gstPercentage',minimumstock:'minimumStock',openingstock:'openingStock',status:'status',isactive:'status',producttype:'productType',sareetype:'sareeType',designnumber:'designNumber',fabric:'fabric',color:'color',colour:'color',pattern:'pattern',sleevetype:'sleeveType',fittype:'fitType'};
function keyOf(value:string):string{return value.trim().toLowerCase().replace(/[\s_-]+/g,'');}
export function parseProductImport(fileName:string,input:Uint8Array):ImportedProductRow[] {
  const bytes=Buffer.from(input);if(!bytes.length)throw new Error('The selected file is empty.');if(bytes.length>MAX_FILE_SIZE)throw new Error('Import file must be 10 MB or smaller.');
  const extension=fileName.toLowerCase().split('.').pop();let matrix:string[][];
  if(extension==='csv')matrix=parseCsv(bytes.toString('utf8').replace(/^\uFEFF/,''));else if(extension==='xlsx')matrix=parseXlsx(bytes);else throw new Error('Choose a .csv or .xlsx file.');
  const header=matrix.shift();if(!header?.length)throw new Error('The file does not contain a header row.');
  const columns=header.map(value=>headerAliases[keyOf(value)]||'');
  if(!columns.includes('productName')||!columns.includes('category'))throw new Error('Required columns: Product Name and Category. Download the CSV template to see all supported columns.');
  const rows:ImportedProductRow[]=[];
  matrix.forEach((cells,index)=>{if(!cells.some(value=>value.trim()))return;const values:Record<string,string>={};columns.forEach((key,col)=>{if(key)values[key]=(cells[col]||'').trim();});rows.push({rowNumber:index+2,values});});
  if(rows.length>MAX_ROWS)throw new Error(`Import is limited to ${MAX_ROWS} data rows.`);if(!rows.length)throw new Error('The file does not contain product rows.');return rows;
}
