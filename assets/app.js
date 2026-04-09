
(function(){
  const PUZZLE_APP = {};
  PUZZLE_APP.readFileAsDataURL = function(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  PUZZLE_APP.downloadBlob = function(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 3000);
  };
  PUZZLE_APP.downloadJSON = function(data, filename){
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    PUZZLE_APP.downloadBlob(blob, filename);
  };
  PUZZLE_APP.readJSON = async function(url){
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('讀取失敗：' + url);
    return await res.json();
  };
  PUZZLE_APP.parseGithubUrl = function(owner, repo, branch, path){
    const cleanPath = (path || '').replace(/^\/+|\/+$/g, '');
    return `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`;
  };
  PUZZLE_APP.loadRemoteList = async function(owner, repo, branch, path){
    const apiUrl = PUZZLE_APP.parseGithubUrl(owner, repo, branch, path);
    const res = await fetch(apiUrl, {headers:{'Accept':'application/vnd.github+json'}});
    if(!res.ok) throw new Error('GitHub 讀取失敗');
    const files = await res.json();
    const jsonFiles = Array.isArray(files) ? files.filter(f => f.name.endsWith('.json')) : [];
    const out = [];
    for(const f of jsonFiles){
      const json = await PUZZLE_APP.readJSON(f.download_url);
      json.__sourceUrl = f.download_url;
      out.push(json);
    }
    return out;
  };
  PUZZLE_APP.loadManifestList = async function(){
    const manifest = await PUZZLE_APP.readJSON('data/manifest.json');
    const items = [];
    for(const item of manifest.items || []){
      const json = await PUZZLE_APP.readJSON(item.json);
      items.push(json);
    }
    return items;
  };
  PUZZLE_APP.saveSelectedPuzzle = function(data){ sessionStorage.setItem('selectedPuzzle', JSON.stringify(data)); };
  PUZZLE_APP.getSelectedPuzzle = function(){ const raw = sessionStorage.getItem('selectedPuzzle'); return raw ? JSON.parse(raw) : null; };
  PUZZLE_APP.sliceImageToPieces = function(image, cols, rows){
    const pieces = [];
    const pieceW = image.width / cols;
    const pieceH = image.height / rows;
    for(let r=0;r<rows;r++){ for(let c=0;c<cols;c++){
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(pieceW); canvas.height = Math.round(pieceH);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, c * pieceW, r * pieceH, pieceW, pieceH, 0, 0, canvas.width, canvas.height);
      pieces.push({ id:`${r}-${c}`, row:r, col:c, dataUrl: canvas.toDataURL('image/png') });
    }}
    return pieces;
  };
  PUZZLE_APP.shuffle = function(arr){
    const a = [...arr];
    for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i],a[j]] = [a[j],a[i]]; }
    return a;
  };
  window.PUZZLE_APP = PUZZLE_APP;
})();
